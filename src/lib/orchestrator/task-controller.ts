import {
  buildPreferredRoomSourceContext,
  createAutoRoomSourcePreference,
  type RoomSubmission,
} from '@/lib/room';
import { trackEvent } from '@/lib/instrumentation';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type {
  AiActionNegotiationMode,
  AiOperationMeta,
  AiActionResponse,
  AiIntakeResponse,
  AiRescueResponse,
  AiScaffoldResponse,
} from '@/lib/ai/operations';
import {
  buildAiOpsFailureEntry,
  buildAiOpsSuccessEntry,
  type AiOpsDebugEntry,
} from '@/lib/ai/ai-ops-debug';
import type {
  Action,
  AiFailureReason,
  AppSession,
  TaskConstraints,
  TaskContext,
  UIRoute,
} from '@/lib/store/idb';
import {
  normalizeSession,
  saveAction,
  saveSession,
  updateAction,
} from '@/lib/store/idb';
import {
  addressesBlocker,
  buildActionSuccessArtifacts,
  buildBootstrapMicroSteps,
  buildPayloadFromAction,
  buildReentryTaskArtifacts,
  buildScaffoldSuccessArtifacts,
  deriveBounceBackRoute,
  deriveRoomBlockers,
  getSessionTask,
  hasResumableTask,
  rememberWorkflow,
  resolveWorkflowType,
  routeFromResumeTarget,
  collectRoomArtifactAnchors,
  hasAnchorInStep,
  echoesActionTitle,
} from '@/lib/orchestrator/task-machine';
import { synthesizeLocally } from '@/lib/ai/local-synthesis';
import type { AnalyticsEventProperties } from '@/lib/analytics/local-analytics';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import type { IcpTag } from '@/lib/business/monetization';
import type { TaskShape } from '@/lib/ai/task-shape';
import {
  buildScaffoldRefineFeedback,
  inferScaffoldRefineFallback,
  classifyScaffoldRefineResult,
  getVisibleScaffoldSteps,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';
import {
  createDraftPlanFromCurrentPlan,
  enrichPlanWithProvenance,
  markCurrentStepNotLikeThis,
  markPlanConfirmed,
  markStepEdited,
} from '@/lib/orchestrator/plan-provenance';
import {
  requestAction,
  requestIntake,
  requestReentry,
  requestRescue,
  requestScaffold,
  recordCompletedCycleInRoomMemory,
  SynthesisFailure,
} from '@/lib/orchestrator/task-events';

type Setter<T> = (value: T) => void;

export interface ActionNegotiationInput {
  mode: AiActionNegotiationMode;
  userNote?: string;
  constraintPatch?: Partial<TaskConstraints>;
}

export interface TaskControllerBindings {
  session: AppSession | null;
  sessionRef: { current: AppSession | null };
  currentPayload: AiSynthesisResponse | null;
  currentActionState: Action | null;
  clarificationPrompt: string;
  dumpStartTime: number | null;
  aiModel: string;
  setSession: Setter<AppSession | null>;
  setCurrentPayload: Setter<AiSynthesisResponse | null>;
  setCurrentActionState: Setter<Action | null>;
  setManualFallbackSuggestedActions: Setter<string[]>;
  setManualFallbackRetryable: Setter<boolean>;
  setClarificationPrompt: Setter<string>;
  setCurrentWhyThisNow: Setter<string>;
  setCurrentRescueState: Setter<AiRescueResponse | null>;
  setIsRescueLoading: Setter<boolean>;
  setIsNegotiatingAction: Setter<boolean>;
  setIsReentryLoading: Setter<boolean>;
  isScaffoldRefining: boolean;
  setIsScaffoldRefining: Setter<boolean>;
  setScaffoldRefineFeedback: Setter<ScaffoldRefineFeedback | null>;
  setDumpStartTime: Setter<number | null>;
  isDumpPending?: boolean;
  setIsDumpPending?: Setter<boolean>;
  recordAiOpsEntry: (entry: AiOpsDebugEntry) => void;
  persistSession?: (session: AppSession) => Promise<void>;
  persistActionSave?: (action: Action) => Promise<void>;
  persistActionUpdate?: (id: string, modifications: Partial<Action>) => Promise<void>;
  businessContext?: {
    scenarioId?: string;
    icpTag?: IcpTag;
  };
}

function trimAiOpsFeed(entry: AiOpsDebugEntry, record: (entry: AiOpsDebugEntry) => void) {
  record(entry);
}

export function mergeTaskConstraints(
  task: TaskContext,
  input?: ActionNegotiationInput,
): {
  nextTask: TaskContext;
  persistedNegotiationMode?: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'>;
} {
  const nextTask: TaskContext = {
    ...task,
    constraints: task.constraints ? { ...task.constraints } : undefined,
  };

  if (input?.constraintPatch) {
    nextTask.constraints = {
      ...(nextTask.constraints ?? {}),
      ...input.constraintPatch,
    };
  }

  let persistedNegotiationMode: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'> | undefined;

  if (input?.mode === 'reply_first') {
    nextTask.constraints = {
      ...(nextTask.constraints ?? {}),
      preferReplyFirst: true,
    };
    persistedNegotiationMode = 'reply_first';
  } else if (input?.mode === 'resume_first') {
    nextTask.constraints = {
      ...(nextTask.constraints ?? {}),
      preferReplyFirst: false,
    };
    persistedNegotiationMode = 'resume_first';
  }

  return { nextTask, persistedNegotiationMode };
}

function validateScaffold(
  scaffold: AiScaffoldResponse,
  task: TaskContext,
  payload: AiSynthesisResponse,
  action: Action,
): boolean {
  const hasThai = (text: string) => /[\u0E00-\u0E7F]/.test(text);
  if (hasThai(task.sourceText)) {
    if (!hasThai(scaffold.planTitle) || !scaffold.steps.every((s) => hasThai(s.text))) {
      return false;
    }
  }
  const anchors = collectRoomArtifactAnchors(task, payload.task_shape, action.title);
  if (anchors.length > 0) {
    const hasAnyAnchor = scaffold.steps.some((s) => hasAnchorInStep(s.text, anchors));
    if (!hasAnyAnchor) return false;
  }
  const echoesTitle = scaffold.steps.some((s) => echoesActionTitle(s.text, action.title));
  if (echoesTitle) return false;
  return true;
}

export function createTaskController(bindings: TaskControllerBindings) {
  const getBaseSession = () => bindings.sessionRef.current ?? bindings.session;
  const persistSession = bindings.persistSession ?? saveSession;
  const persistActionSave = bindings.persistActionSave ?? saveAction;
  const persistActionUpdate = bindings.persistActionUpdate ?? updateAction;
  let isDumpHandling = false;
  let rescueGeneration = 0;
  let rescueAbortController: AbortController | null = null;

  const clearScaffoldRefineState = (preserveFeedback = false) => {
    bindings.setIsScaffoldRefining(false);
    if (!preserveFeedback) {
      bindings.setScaffoldRefineFeedback(null);
    }
  };

  /** Bump rescue generation and abort in-flight request so stale results are discarded. */
  const invalidateRescue = () => {
    rescueGeneration += 1;
    if (rescueAbortController) {
      try { rescueAbortController.abort(); } catch { /* user navigated away */ }
      rescueAbortController = null;
    }
  };

  const buildAnalyticsBase = (
    task?: TaskContext,
    extra: AnalyticsEventProperties = {},
  ): AnalyticsEventProperties => {
    const base = getBaseSession();
    const activeTask = task ?? (base ? getSessionTask(base) : undefined);
    const sourceContextCount = activeTask
      ? activeTask.sourceFiles.length + (activeTask.sourceText.trim().length > 0 ? 1 : 0)
      : base?.activeDumpContext
        ? 1
        : 0;

    return {
      room_id: activeTask?.roomId ?? base?.roomId,
      room_title: base?.roomTitle,
      room_scenario_type: base?.roomScenarioType,
      session_id: String(base?.task?.id ?? base?.activeDumpContext?.createdAt ?? base?.lastActive ?? Date.now()),
      task_id: activeTask?.id ?? base?.task?.id,
      ui_route: base?.uiRoute,
      assistant_mode: activeTask?.assistantMode ?? base?.task?.assistantMode,
      scenario_id: bindings.businessContext?.scenarioId,
      icp_tag: bindings.businessContext?.icpTag,
      source_context_count: sourceContextCount,
      action_id: activeTask?.currentActionId ?? bindings.currentActionState?.id ?? base?.currentActionId ?? undefined,
      ...extra,
    };
  };

  const getScaffoldStepTexts = (task: TaskContext, payload: AiSynthesisResponse | null) =>
    task.currentPlan?.steps.map((step) => step.text)
      ?? payload?.recommended_action.micro_steps
      ?? [];

  const setScaffoldRefineFeedback = (feedback: ScaffoldRefineFeedback) => {
    bindings.setScaffoldRefineFeedback(feedback);
  };

  const recordSuccess = (
    operationName: string,
    response:
      | AiIntakeResponse
      | AiActionResponse
      | AiRescueResponse
      | { meta?: Partial<AiOperationMeta> },
  ) => {
    trimAiOpsFeed(
      buildAiOpsSuccessEntry(operationName, response.meta as AiOperationMeta | undefined),
      bindings.recordAiOpsEntry,
    );
  };

  const recordFailure = (failure: SynthesisFailure) => {
    trimAiOpsFeed(
      buildAiOpsFailureEntry({
        operationName: failure.operationName ?? 'unknown',
        reason: failure.reason,
        detail: failure.message,
        telemetry: failure.telemetry,
      }),
      bindings.recordAiOpsEntry,
    );
  };

  const updateStatus = async (
    newStatus: UIRoute,
    updates: Partial<AppSession> = {},
    task?: TaskContext | null,
  ) => {
    const base = getBaseSession();
    if (!base) return;
    const nextTask = task === undefined ? base.task : task ?? undefined;
    const updated = normalizeSession({
      ...base,
      ...updates,
      status: newStatus,
      uiRoute: newStatus,
      task: nextTask,
      lastActive: Date.now(),
    });
    bindings.sessionRef.current = updated;
    bindings.setSession(updated);
    await persistSession(updated);
  };

  const enterManualFallback = async (
    failureReason: AiFailureReason,
    detail?: string,
    actions: string[] = [],
    retryable = true,
  ) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);

    const nextTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'failed',
      lastFailureReason: failureReason,
    };

    trackEvent('synthesis_failed', detail ? { reason: failureReason, detail } : { reason: failureReason });
    bindings.setManualFallbackSuggestedActions(actions);
    bindings.setManualFallbackRetryable(retryable);
    await updateStatus('MANUAL_FALLBACK', {
      currentActionId: null,
      currentPayload: undefined,
      lastFailureReason: failureReason,
    }, nextTask);
  };

  const buildStableSummary = (task: TaskContext, summaryCandidates: Array<string | undefined>) => {
    for (const candidate of summaryCandidates) {
      const normalized = candidate?.replace(/\s+/g, ' ').trim();
      if (normalized) return normalized;
    }

    const sourceFallback = task.sourceText.replace(/\s+/g, ' ').trim();
    return sourceFallback ? sourceFallback.slice(0, 220) : undefined;
  };

  const applyActionOperationSuccess = async (options: {
    task: TaskContext;
    intake: AiIntakeResponse;
    actionResponse: AiActionResponse;
    evidenceContext?: ActionEvidenceContext;
    fromRetry?: boolean;
    existingAction?: Action | null;
    persistedNegotiationMode?: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'>;
  }) => {
    const {
      task,
      intake,
      actionResponse,
      evidenceContext,
      fromRetry = false,
      existingAction,
      persistedNegotiationMode,
    } = options;
    console.info('[MIND][AI_PUTER] Raw Action Response:', JSON.stringify(actionResponse, null, 2));
    const artifacts = buildActionSuccessArtifacts({
      task,
      intake,
      actionResponse,
      evidenceContext,
      existingAction,
      persistedNegotiationMode,
    });
    console.info('[MIND][AI_PUTER] Normalized Action Response:', JSON.stringify(artifacts.payload, null, 2));
    const stableSummary = buildStableSummary(task, [
      actionResponse.situationSummary,
      intake.roomDigest,
      artifacts.payload.situation_summary,
      task.lastStableSummary,
    ]);
    const nextTask: TaskContext = {
      ...artifacts.nextTask,
      lastStableSummary: stableSummary,
    };

    bindings.setCurrentPayload(artifacts.payload);
    bindings.setCurrentWhyThisNow(artifacts.whyThisNow);
    bindings.setManualFallbackSuggestedActions([]);
    bindings.setManualFallbackRetryable(true);
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);

    if (existingAction) {
      trackEvent('action_negotiated', persistedNegotiationMode ? { mode: persistedNegotiationMode } : undefined);
      await persistActionUpdate(existingAction.id, {
        title: artifacts.actionState.title,
        rationale: artifacts.actionState.rationale,
        microSteps: artifacts.actionState.microSteps,
        situationSummary: artifacts.actionState.situationSummary,
        replyDraft: artifacts.actionState.replyDraft,
        detectedBlockers: artifacts.actionState.detectedBlockers,
        workflowType: artifacts.actionState.workflowType,
      });
    } else {
      trackEvent('synthesis_completed', { source: 'ollama' });
      trackEvent('workflow_classified', { workflow_type: artifacts.workflowType });
      trackEvent(artifacts.workflowType === 'client_response' ? 'client_response_submitted' : 'client_resume_submitted');
      rememberWorkflow(artifacts.workflowType);
      await persistActionSave(artifacts.actionState);
    }

    bindings.setCurrentActionState(artifacts.actionState);

    if (artifacts.blockerCount > 0) {
      trackEvent('blocker_detected', { count: artifacts.blockerCount });
      if (artifacts.addressesDetectedBlocker) {
        trackEvent('blocker_addressed');
      }
    }

    if (fromRetry) {
      trackEvent('active_context_preserved');
    }

    await updateStatus('ONE_ACTION', {
      currentActionId: artifacts.actionState.id,
      currentPayload: artifacts.payload,
      lastWorkflowType: artifacts.workflowType,
      lastFailureReason: undefined,
      notThisCount: 0,
    }, nextTask);
  };

  const handleLegacySynthesisSuccess = async (
    data: AiSynthesisResponse,
    fromRetry = false,
    source: 'ollama' | 'deterministic_fallback' = 'ollama',
  ) => {
    const workflowType = resolveWorkflowType(data);
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);

    if (data.requires_clarification) {
      bindings.setClarificationPrompt(data.clarification_nudge || 'ช่วยบอกอีกนิดว่าตอนนี้ต้องตอบหรือขยับส่วนไหนก่อน');
      const nextTask: TaskContext = {
        ...currentTask,
        workflowType,
        lifecycleState: 'clarification_needed',
        lastSynthesis: data,
        currentActionId: null,
        currentStepIndex: 0,
        lastFailureReason: undefined,
      };
      await updateStatus('CLARIFICATION', {
        currentActionId: null,
        currentPayload: undefined,
        lastWorkflowType: workflowType,
        lastFailureReason: undefined,
      }, nextTask);
      return;
    }

    const normalizedData: AiSynthesisResponse = {
      ...data,
      workflow_type: workflowType,
    };

    bindings.setCurrentPayload(normalizedData);
    bindings.setCurrentWhyThisNow('');
    bindings.setManualFallbackSuggestedActions([]);
    bindings.setManualFallbackRetryable(true);
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    clearScaffoldRefineState();
    trackEvent('synthesis_completed', { source });
    trackEvent('workflow_classified', { workflow_type: workflowType });
    trackEvent(workflowType === 'client_response' ? 'client_response_submitted' : 'client_resume_submitted');
    rememberWorkflow(workflowType);

      const actionDraft: Action = {
      id: Date.now().toString(),
      roomId: currentTask.roomId,
      createdAt: Date.now(),
      title: normalizedData.recommended_action.title,
      rationale: normalizedData.recommended_action.rationale,
      microSteps: normalizedData.recommended_action.micro_steps,
      isPinned: false,
      state: 'PENDING',
      workflowType,
      situationSummary: normalizedData.situation_summary,
      replyDraft: normalizedData.reply_draft ?? undefined,
      detectedBlockers: normalizedData.detected_blockers ?? [],
    };

    await persistActionSave(actionDraft);
    bindings.setCurrentActionState(actionDraft);

    if (actionDraft.detectedBlockers && actionDraft.detectedBlockers.length > 0) {
      trackEvent('blocker_detected', { count: actionDraft.detectedBlockers.length });
      if (addressesBlocker(actionDraft.title, actionDraft.detectedBlockers)) {
        trackEvent('blocker_addressed');
      }
    }

    if (fromRetry) {
      trackEvent('active_context_preserved');
    }

    const generatedAt = Date.now();
    const currentPlan = enrichPlanWithProvenance({
      actionTitle: normalizedData.recommended_action.title,
      steps: normalizedData.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    }, currentTask, 'action', generatedAt);

    const nextTask: TaskContext = {
      ...currentTask,
      workflowType,
      lifecycleState: 'has_one_action',
      assistantMode: 'action_negotiation',
      currentActionId: actionDraft.id,
      currentStepIndex: 0,
      lastSynthesis: normalizedData,
      lastFailureReason: undefined,
      lastAiOperation: 'action',
      actionExplanation: undefined,
      lastStableSummary: buildStableSummary(currentTask, [
        normalizedData.situation_summary,
        currentTask.lastStableSummary,
      ]),
      currentPlan,
      pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'action', generatedAt),
      planHistory: [
        ...(currentTask.planHistory ?? []),
        {
          id: `revision-${generatedAt}`,
          planId: `draft-${generatedAt}`,
          status: 'draft' as const,
          actionTitle: currentPlan.actionTitle,
          steps: currentPlan.steps,
          createdAt: generatedAt,
        },
      ].slice(-20),
      oneActionTracking: {
        hasViewedAlternative: false,
        hasAdjusted: false,
      },
    };

    await updateStatus('ONE_ACTION', {
      currentActionId: actionDraft.id,
      currentPayload: normalizedData,
      lastWorkflowType: workflowType,
      lastFailureReason: undefined,
      notThisCount: 0,
    }, nextTask);
  };

  const applyDeterministicFallback = async (
    task: TaskContext,
    failure: SynthesisFailure,
    options?: { fromRetry?: boolean },
  ) => {
    try {
      const localFallback = synthesizeLocally(task.sourceText);
      await handleLegacySynthesisSuccess(localFallback, options?.fromRetry, 'deterministic_fallback');
      return true;
    } catch {
      await enterManualFallback(failure.reason, failure.message, failure.actions, failure.retryable);
      return false;
    }
  };

  const runAiLifecycle = async (task: TaskContext, fromRetry = false) => {
    try {
      const intake = await requestIntake(task);
      recordSuccess('intake', intake);
      const intakeTask: TaskContext = {
        ...task,
        workflowType: intake.workflowType,
        taskShape: intake.taskShape,
        blockerSignals: intake.blockers,
        taskFrame: intake.taskFrame,
        assistantMode: 'intake_review',
        lastAiOperation: 'intake',
      };

      const hasClarificationAnswer = task.pendingInputs.some(
        (input) => input.kind === 'clarification'
      );

      if (intake.requiresClarification && !hasClarificationAnswer) {
        bindings.setClarificationPrompt(intake.clarificationQuestion || 'ช่วยบอกอีกนิดว่าตอนนี้ต้องตอบหรือขยับส่วนไหนก่อน');
        bindings.setCurrentWhyThisNow('');
        const clarificationTask: TaskContext = {
          ...intakeTask,
          lifecycleState: 'clarification_needed',
          currentActionId: null,
          currentStepIndex: 0,
          lastFailureReason: undefined,
          lastStableSummary: buildStableSummary(intakeTask, [
            intake.roomDigest,
            intake.taskFrame.objective,
            intakeTask.lastStableSummary,
          ]),
        };
        await updateStatus('CLARIFICATION', {
          currentActionId: null,
          currentPayload: undefined,
          lastWorkflowType: intake.workflowType,
          lastFailureReason: undefined,
        }, clarificationTask);
        return;
      }

      const { actionResponse, evidenceContext } = await requestAction({
        task: intakeTask,
        preferredCandidate: intake.candidateActions[0],
      });
      recordSuccess('action', actionResponse);
      await applyActionOperationSuccess({
        task: intakeTask,
        intake,
        actionResponse,
        evidenceContext,
        fromRetry,
      });
    } catch (err) {
      if (err instanceof SynthesisFailure) {
        recordFailure(err);
        throw err;
      }

      const failure = err instanceof Error
        ? new SynthesisFailure('unknown', err.message, [], true, 'unknown')
        : new SynthesisFailure('unknown', 'ไม่สามารถเชื่อมต่อกับ AI operation ได้', [], true, 'unknown');
      recordFailure(failure);
      throw failure;
    }
  };

  const loadReentryBrief = async (scope: 'bounce_back' | 'morning_ritual') => {
    const base = getBaseSession();
    if (!base || !hasResumableTask(base.task)) return;

    const currentTask = getSessionTask(base);
    const reentryStartedAt = Date.now();
    const reentryGapDays = Math.max(0, (reentryStartedAt - base.lastActive) / (1000 * 60 * 60 * 24));
    trackEvent('reentry_started', buildAnalyticsBase(currentTask, {
      reentry_gap_days: reentryGapDays,
      outcome_label: scope,
    }));
    bindings.setIsReentryLoading(true);
    try {
      const reentry = await requestReentry(currentTask, bindings.currentActionState, scope, currentTask.currentStepIndex);
      recordSuccess('reentry', reentry);
      const { nextTask } = buildReentryTaskArtifacts(currentTask, reentry);
      const persistedReentryTask: TaskContext = {
        ...nextTask,
        lastStableSummary: buildStableSummary(currentTask, [
          reentry.reentrySummary,
          nextTask.reentryBrief?.summary,
          currentTask.lastStableSummary,
        ]),
      };
      const updated = normalizeSession({
        ...base,
        status: base.uiRoute,
        uiRoute: base.uiRoute,
        task: persistedReentryTask,
        lastActive: Date.now(),
      });
      bindings.sessionRef.current = updated;
      bindings.setSession(updated);
      await persistSession(updated);
    } catch (error) {
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
    } finally {
      bindings.setIsReentryLoading(false);
    }
  };

  const handleActionNegotiation = async (input: ActionNegotiationInput) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const { nextTask, persistedNegotiationMode } = mergeTaskConstraints(currentTask, input);
    const trackedTask: TaskContext = {
      ...nextTask,
      oneActionTracking: {
        hasViewedAlternative: currentTask.oneActionTracking?.hasViewedAlternative ?? false,
        hasAdjusted: true,
      },
    };
    clearScaffoldRefineState();
    bindings.setIsNegotiatingAction(true);

    try {
      const { actionResponse, evidenceContext } = await requestAction({
        task: trackedTask,
        negotiation: { mode: input.mode, userNote: input.userNote },
      });
      recordSuccess('action', actionResponse);
      const fallbackWorkflowType =
        trackedTask.workflowType ??
        (bindings.currentPayload ? resolveWorkflowType(bindings.currentPayload) : 'client_resume');
      const intake: AiIntakeResponse = {
        workflowType: fallbackWorkflowType,
        taskShape: trackedTask.taskShape ?? {
          deliverableType: 'unknown',
          immediateNeed: fallbackWorkflowType === 'client_response' ? 'send_reply_now' : 'resume_execution',
          missingInputs: [],
          workContext: trackedTask.lastSynthesis?.situation_summary ?? trackedTask.sourceText.slice(0, 280),
        },
        roomDigest: trackedTask.lastSynthesis?.situation_summary ?? trackedTask.sourceText.slice(0, 280),
        taskFrame: trackedTask.taskFrame ?? {
          objective: bindings.currentActionState?.title ?? 'พางานนี้ไปต่อ',
          stage: trackedTask.lifecycleState,
          stakeholders: [],
        },
        blockers: trackedTask.blockerSignals,
        requiresClarification: false,
        clarificationQuestion: undefined,
        candidateActions: [],
        meta: {
          model: bindings.aiModel,
          repairUsed: false,
          usedRoomFiles: trackedTask.sourceFiles.map((file) => file.name),
        },
      };

      await applyActionOperationSuccess({
        task: {
          ...trackedTask,
          oneActionTracking: {
            hasViewedAlternative: trackedTask.oneActionTracking?.hasViewedAlternative ?? false,
            hasAdjusted: true,
          },
        },
        intake,
        actionResponse,
        evidenceContext,
        existingAction: bindings.currentActionState,
        persistedNegotiationMode,
      });
    } catch (error) {
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
      throw error;
    } finally {
      bindings.setIsNegotiatingAction(false);
    }
  };

  const handleMakeSmaller = async () => {
    if (bindings.isScaffoldRefining) return;
    const base = getBaseSession();
    if (!base || !bindings.currentPayload) return;
    const currentPayload = bindings.currentPayload;
    const currentTask = getSessionTask(base);
    const fromRescue = base.uiRoute === 'RESCUE' || currentTask.lifecycleState === 'stalled';
    const taskForScaffold: TaskContext = {
      ...currentTask,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_refinement',
    };
    const currentAction = bindings.currentActionState ?? {
      id: taskForScaffold.currentActionId ?? `${Date.now()}`,
      createdAt: Date.now(),
      title: bindings.currentPayload.recommended_action.title,
      rationale: bindings.currentPayload.recommended_action.rationale,
      microSteps: bindings.currentPayload.recommended_action.micro_steps,
      isPinned: false,
      state: 'IN_PROGRESS' as const,
      workflowType: taskForScaffold.workflowType,
    };
    const previousVisibleSteps = getVisibleScaffoldSteps(
      getScaffoldStepTexts(currentTask, bindings.currentPayload),
      taskForScaffold.currentStepIndex,
    );

    bindings.setScaffoldRefineFeedback(null);
    bindings.setIsScaffoldRefining(true);

    try {
      const buildRefinedArtifacts = async (strategy: 'default' | 'structural_retry') => {
        const scaffold = await requestScaffold(taskForScaffold, currentAction, taskForScaffold.currentStepIndex, { strategy });
        recordSuccess('scaffold', scaffold);
        const artifacts = buildScaffoldSuccessArtifacts({
          task: taskForScaffold,
          action: currentAction,
          payload: currentPayload,
          scaffold,
        });
        const nextVisibleSteps = getVisibleScaffoldSteps(
          artifacts.nextTask.currentPlan?.steps.map((step) => step.text) ?? artifacts.nextPayload.recommended_action.micro_steps,
          artifacts.nextTask.currentStepIndex,
        );

        return {
          scaffold,
          ...artifacts,
          refineResult: classifyScaffoldRefineResult(previousVisibleSteps, nextVisibleSteps),
        };
      };

      let refined = await buildRefinedArtifacts('default');
      const initialMeta = refined.scaffold.meta;
      let structuralRetryMeta: typeof refined.scaffold.meta | undefined;

      let isValid = validateScaffold(refined.scaffold, taskForScaffold, currentPayload, currentAction);

      if (refined.refineResult !== 'success' || !isValid) {
        refined = await buildRefinedArtifacts('structural_retry')
          .then((result) => {
            structuralRetryMeta = result.scaffold.meta;
            return result;
          })
          .catch(() => refined);
        isValid = validateScaffold(refined.scaffold, taskForScaffold, currentPayload, currentAction);
      }

      if (refined.refineResult !== 'success' || !isValid) {
        if (!isValid) {
          setScaffoldRefineFeedback(buildScaffoldRefineFeedback('failed'));
          return;
        }
        const currentVisibleStep = previousVisibleSteps[0] ?? currentAction.microSteps[taskForScaffold.currentStepIndex] ?? currentAction.title;
        const fallback = inferScaffoldRefineFallback(taskForScaffold.blockerSignals, currentVisibleStep);
        const feedback = buildScaffoldRefineFeedback('no_change', {
          suggestedRoute: fallback.route === 'clarification' ? 'clarification' : 'rescue',
          attemptedStructuralRetry: true,
          suggestedRouteLabel: fallback.routeLabel,
          suggestedReasonLabel: fallback.reasonLabel,
        });
        const baseEventProperties = buildAnalyticsBase(taskForScaffold, {
          outcome_label: fallback.route,
          rescue_reason: fallback.route === 'rescue' ? fallback.rescueReason : undefined,
          initial_scaffold_model: initialMeta.model,
          initial_scaffold_pass_type: initialMeta.passType,
          initial_scaffold_repair_used: initialMeta.repairUsed,
          structural_retry_used: Boolean(structuralRetryMeta),
          structural_retry_model: structuralRetryMeta?.model,
          structural_retry_pass_type: structuralRetryMeta?.passType,
          structural_retry_repair_used: structuralRetryMeta?.repairUsed,
        });

        if (fallback.route === 'clarification') {
          trackEvent('make_smaller_no_change', baseEventProperties);
          bindings.setClarificationPrompt(
            fallback.prompt ?? 'ก่อนย่อยก้าวนี้ต่อ MIND ต้องรู้เพิ่มอีกนิดว่า ตอนนี้ควรตอบหรือขยับส่วนไหนก่อน',
          );
          bindings.setCurrentWhyThisNow('');
          const clarificationTask: TaskContext = {
            ...taskForScaffold,
            lifecycleState: 'clarification_needed',
            currentStepIndex: taskForScaffold.currentStepIndex,
            lastFailureReason: undefined,
          };
          setScaffoldRefineFeedback(feedback);
          bindings.setIsScaffoldRefining(false);
          await updateStatus('CLARIFICATION', {
            currentActionId: taskForScaffold.currentActionId,
            currentPayload: undefined,
            lastFailureReason: undefined,
          }, clarificationTask);
          return;
        }

        setScaffoldRefineFeedback(feedback);
        trackEvent('make_smaller_no_change', baseEventProperties);
        // Stay on SCAFFOLD and show inline feedback — do NOT auto-route to Rescue.
        // The user can explicitly click "ฉันติดขัด" if they want Rescue diagnosis.
        // Auto-routing caused an unintended /api/ai/rescue call on every no_change result.
        return;
      }

      bindings.setCurrentPayload(refined.nextPayload);
      bindings.setCurrentRescueState(null);
      if (bindings.currentActionState) {
        bindings.setCurrentActionState(refined.nextActionState);
        await persistActionUpdate(bindings.currentActionState.id, {
          title: refined.nextActionState.title,
          microSteps: refined.nextActionState.microSteps,
        });
      }
      await updateStatus('SCAFFOLD', {
        currentActionId: currentAction.id || base.currentActionId,
        currentPayload: refined.nextPayload,
      }, refined.nextTask);
      if (fromRescue) {
        const lastRescueReason = currentTask.rescueHistory[currentTask.rescueHistory.length - 1]?.reason ?? 'unknown';
        trackEvent('rescue_resolved', buildAnalyticsBase(refined.nextTask, {
          rescue_reason: lastRescueReason,
          outcome_label: 'make_smaller',
        }));
      }
    } catch (error) {
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
      trackEvent('make_smaller_failed', buildAnalyticsBase(taskForScaffold, {
        outcome_label: 'retry',
        structural_retry_used: false,
        failed_operation: error instanceof SynthesisFailure ? error.operationName : 'scaffold',
        failed_model: error instanceof SynthesisFailure ? error.telemetry?.model : undefined,
        failed_pass_type: error instanceof SynthesisFailure ? error.telemetry?.passType : undefined,
        failed_repair_used: error instanceof SynthesisFailure ? error.telemetry?.repairUsed : undefined,
      }));
      setScaffoldRefineFeedback(buildScaffoldRefineFeedback('failed'));
    } finally {
      bindings.setIsScaffoldRefining(false);
    }
  };

  const handleEnterRescue = async (options?: {
    preserveRefineFeedback?: boolean;
    seedReason?: AiRescueResponse['diagnosis']['primaryReason'];
    outcomeLabel?: string;
  }) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const correctedTask = markCurrentStepNotLikeThis(currentTask, options?.outcomeLabel ?? 'entered rescue');
    const nextTask: TaskContext = {
      ...correctedTask,
      lifecycleState: 'stalled',
      assistantMode: 'rescue_diagnosis',
    };
    const rescueFallbackState: AiRescueResponse = {
      diagnosis: {
        primaryReason: options?.seedReason ?? 'unknown',
        explanation:
          'MIND ยังวินิจฉัยไม่สำเร็จในรอบนี้ แต่บริบทงานและข้อความเดิมของคุณยังอยู่ครบ ลองย่อยให้เล็กลงอีก หรือพักไว้แล้วกลับมาลอง rescue ใหม่ได้',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'กลับไปทำแค่ส่วนเล็กที่สุดของ step นี้ก่อน',
          'ถ้ายังติดอยู่จริง งานนี้ยังถูกเก็บไว้เหมือนเดิม ค่อยกลับมาลองใหม่เมื่อพร้อม',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: bindings.aiModel,
        repairUsed: false,
        usedRoomFiles: [],
      },
    };
    if (options?.preserveRefineFeedback) {
      bindings.setIsScaffoldRefining(false);
    } else {
      clearScaffoldRefineState();
    }
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(true);
    await updateStatus('RESCUE', {}, nextTask);
    trackEvent('rescue_triggered', buildAnalyticsBase(nextTask, {
      rescue_reason: options?.seedReason ?? 'unknown',
      outcome_label: options?.outcomeLabel ?? 'enter_rescue',
    }));
    trackEvent('step_not_like_this', buildAnalyticsBase(nextTask, {
      step_id: nextTask.currentPlan?.steps[nextTask.currentStepIndex]?.id,
      source_ids: nextTask.currentPlan?.steps[nextTask.currentStepIndex]?.evidence?.map((item) => item.sourceId),
      confidence_level: nextTask.currentPlan?.steps[nextTask.currentStepIndex]?.confidence?.level,
      confidence_score: nextTask.currentPlan?.steps[nextTask.currentStepIndex]?.confidence?.score,
      retrieval_enabled: false,
    }));

    // Invalidate any previous in-flight rescue before starting a new one
    invalidateRescue();
    const thisGeneration = rescueGeneration;
    const abortController = new AbortController();
    rescueAbortController = abortController;

    try {
      const rescue = await requestRescue(nextTask, bindings.currentActionState, currentTask.currentStepIndex, { signal: abortController.signal });
      // Guard: discard stale result if user navigated away or a newer rescue started
      if (thisGeneration !== rescueGeneration) return;
      const currentBase = getBaseSession();
      if (currentBase && currentBase.uiRoute !== 'RESCUE') return;
      recordSuccess('rescue', rescue);
      bindings.setCurrentRescueState(rescue);
      const rescuedTask: TaskContext = {
        ...nextTask,
        lastAiOperation: 'rescue',
        rescueHistory: [
          ...nextTask.rescueHistory,
          {
            reason: rescue.diagnosis.primaryReason,
            mode: rescue.rescuePlan.mode,
            createdAt: Date.now(),
          },
        ],
      };
      await updateStatus('RESCUE', {}, rescuedTask);
    } catch (error) {
      // If aborted (user navigated away), silently discard
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (abortController.signal.aborted) return;
      // Guard: discard stale error if generation changed
      if (thisGeneration !== rescueGeneration) return;
      const currentBase = getBaseSession();
      if (currentBase && currentBase.uiRoute !== 'RESCUE') return;
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
      const base = getBaseSession();
      const currentTask = base ? getSessionTask(base) : null;
      const rescueFallbackTask: TaskContext | null = currentTask
        ? {
            ...currentTask,
            lifecycleState: 'stalled',
            assistantMode: 'rescue_diagnosis',
            lastAiOperation: 'rescue',
            rescueHistory: [
              ...currentTask.rescueHistory,
              {
                reason: 'unknown',
                mode: 'shrink',
                createdAt: Date.now(),
              },
            ],
          }
        : null;
      bindings.setCurrentRescueState({
        diagnosis: {
          primaryReason: 'unknown',
          explanation:
            'MIND ยังวินิจฉัยไม่สำเร็จในรอบนี้ แต่บริบทงานและข้อความเดิมของคุณยังอยู่ครบ ลองย่อยให้เล็กลงอีก หรือพักไว้แล้วกลับมาลอง rescue ใหม่ได้',
        },
        rescuePlan: {
          mode: 'shrink',
          steps: [
            'กลับไปทำแค่ส่วนเล็กที่สุดของ step นี้ก่อน',
            'ถ้ายังติดอยู่จริง งานนี้ยังถูกเก็บไว้เหมือนเดิม ค่อยกลับมาลองใหม่เมื่อพร้อม',
          ],
        },
        suggestedMessage: undefined,
        meta: {
          model: bindings.aiModel,
          repairUsed: false,
          usedRoomFiles: [],
        },
      });
      if (rescueFallbackTask) {
        await updateStatus('RESCUE', {}, rescueFallbackTask);
      }
    } finally {
      // Only clear loading if this is still the active rescue request
      if (thisGeneration === rescueGeneration) {
        bindings.setIsRescueLoading(false);
        rescueAbortController = null;
      }
    }
  };

  const handleDump = async (submission: RoomSubmission) => {
    if (isDumpHandling) return;
    isDumpHandling = true;
    const base = getBaseSession();
    try {
      bindings.setDumpStartTime(Date.now());
      const createdAt = Date.now();
      const sourcePreference = createAutoRoomSourcePreference(submission.sourceFiles, createdAt);
      const preferredSourceContext = buildPreferredRoomSourceContext(
        submission.text || submission.sourceText,
        submission.sourceFiles,
        sourcePreference,
      );
      const task: TaskContext = {
        id: `${createdAt}`,
        roomId: base?.roomId,
        workflowType: undefined,
        sourceText: preferredSourceContext.sourceText || submission.sourceText,
        sourceFiles: submission.sourceFiles,
        sourcePreference,
        extractedText: preferredSourceContext.extractedText || (sourcePreference ? submission.extractedText : ''),
        createdAt,
        lastAttemptAt: createdAt,
        pendingInputs: [],
        blockerSignals: [],
        lifecycleState: 'synthesizing',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      };
      task.blockerSignals = deriveRoomBlockers(task);

      await updateStatus('SYNTHESIZING', {
        notThisCount: 0,
        currentActionId: null,
        currentPayload: undefined,
        lastFailureReason: undefined,
      }, task);
      trackEvent('task_opened', buildAnalyticsBase(task, {
        outcome_label: 'dump_submitted',
      }));
      trackEvent('synthesis_started');
      bindings.setManualFallbackSuggestedActions([]);
      bindings.setClarificationPrompt('');
      bindings.setCurrentWhyThisNow('');
      bindings.setCurrentRescueState(null);
      bindings.setIsRescueLoading(false);
      bindings.setIsNegotiatingAction(false);
      bindings.setIsReentryLoading(false);
      clearScaffoldRefineState();
      bindings.setCurrentPayload(null);
      bindings.setCurrentActionState(null);

      try {
        await runAiLifecycle(task);
      } catch (err) {
        const failure = err instanceof SynthesisFailure
          ? err
          : new SynthesisFailure('unknown', 'ไม่สามารถเชื่อมต่อกับ AI endpoint ได้');
        await applyDeterministicFallback(task, failure);
      }
    } finally {
      isDumpHandling = false;
    }
  };

  const handleManualRescue = async (actionTitle: string) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const steps = [
      `เปิดสิ่งที่ต้องใช้เพื่อเริ่ม "${actionTitle}"`,
      'โฟกัสแค่ 2 นาทีแรกของงานนี้พอ',
      'ขยับก้าวเล็กถัดไปให้เริ่มเดินจริง',
    ];
    const actionDraft: Action = {
      id: Date.now().toString(),
      roomId: currentTask.roomId,
      createdAt: Date.now(),
      title: actionTitle,
      rationale: 'ก้าวถัดไปที่ผู้ใช้ระบุเอง',
      microSteps: steps,
      isPinned: false,
      state: 'PENDING',
    };
    await persistActionSave(actionDraft);
    bindings.setCurrentActionState(actionDraft);
    bindings.setCurrentWhyThisNow('');
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    clearScaffoldRefineState();
    const payload = buildPayloadFromAction({ ...actionDraft, microSteps: steps });
    bindings.setCurrentPayload(payload);
    const task = currentTask;
    const nextTask: TaskContext = {
      ...task,
      lifecycleState: 'in_scaffold',
      currentActionId: actionDraft.id,
      currentStepIndex: 0,
      lastSynthesis: payload,
      lastFailureReason: undefined,
      actionExplanation: undefined,
      pendingInputs: [
        ...task.pendingInputs,
        {
          kind: 'manual_rescue',
          answer: actionTitle,
          createdAt: Date.now(),
        },
      ],
    };
    await updateStatus('SCAFFOLD', { currentActionId: actionDraft.id, currentPayload: payload, lastFailureReason: undefined }, nextTask);
  };

  const handleRetry = async () => {
    const base = getBaseSession();
    if (!base) {
      throw new Error('ไม่พบ session สำหรับลองใหม่');
    }

    const currentTask = getSessionTask(base);
    if (!currentTask.sourceText) {
      throw new Error('ไม่พบข้อความเดิมสำหรับลองใหม่');
    }

    const retriedTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'synthesizing',
      lastAttemptAt: Date.now(),
    };

    bindings.setIsDumpPending?.(true);
    await updateStatus('SYNTHESIZING', {
      currentActionId: currentTask.currentActionId,
      currentPayload: currentTask.lastSynthesis,
      lastFailureReason: currentTask.lastFailureReason,
      lastWorkflowType: currentTask.workflowType ?? base.lastWorkflowType,
    }, retriedTask);
    try {
      await runAiLifecycle(retriedTask, true);
    } catch (err) {
      const failure = err instanceof SynthesisFailure
        ? err
        : new SynthesisFailure('unknown', 'ลองให้ AI ใหม่ไม่สำเร็จ');
      const recovered = await applyDeterministicFallback(retriedTask, failure, { fromRetry: true });
      if (!recovered) {
        throw failure;
      }
    } finally {
      bindings.setIsDumpPending?.(false);
    }
  };

  const resumeTaskFromRoute = async (route: UIRoute) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const payload = bindings.currentPayload || (bindings.currentActionState ? buildPayloadFromAction(bindings.currentActionState) : currentTask.lastSynthesis);
    clearScaffoldRefineState();

    if (route === 'DUMP_ENTRY' || !payload || !bindings.currentActionState) {
      bindings.setCurrentActionState(null);
      bindings.setCurrentPayload(null);
      bindings.setClarificationPrompt('');
      bindings.setCurrentWhyThisNow('');
      bindings.setCurrentRescueState(null);
      bindings.setIsRescueLoading(false);
      bindings.setIsNegotiatingAction(false);
      bindings.setIsReentryLoading(false);
      await updateStatus('DUMP_ENTRY', {
        currentActionId: null,
        currentPayload: undefined,
        activeDumpContext: undefined,
      }, null);
      return;
    }

      bindings.setCurrentPayload(payload);
    const nextTask: TaskContext = {
      ...currentTask,
      lifecycleState: route === 'SCAFFOLD' ? 'in_scaffold' : 'has_one_action',
      assistantMode: route === 'SCAFFOLD'
        ? currentTask.assistantMode ?? 'scaffold_refinement'
        : 'action_negotiation',
      currentActionId: bindings.currentActionState.id,
      currentStepIndex: route === 'SCAFFOLD' ? currentTask.currentStepIndex : 0,
      lastSynthesis: payload,
      reentryBrief: currentTask.reentryBrief,
    };

    await updateStatus(route, {
      currentActionId: bindings.currentActionState.id,
      currentPayload: payload,
    }, nextTask);
  };

  const resumeFromSuggestedReentry = async () => {
    const base = getBaseSession();
    if (!base?.task?.reentryBrief) return;
    const suggested = base.task.reentryBrief.topActions[0];
    if (!suggested) return;
    trackEvent('reentry_suggestion_selected', { target: suggested.resumeTarget });
    const targetRoute = routeFromResumeTarget(suggested.resumeTarget);
    const currentTask = getSessionTask(base);
    const existingPayload = bindings.currentPayload
      || (bindings.currentActionState ? buildPayloadFromAction(bindings.currentActionState) : currentTask.lastSynthesis);

    if ((targetRoute === 'ONE_ACTION' || targetRoute === 'SCAFFOLD') && (!existingPayload || !bindings.currentActionState)) {
      const action: Action = {
        id: Date.now().toString(),
        roomId: currentTask.roomId,
        createdAt: Date.now(),
        title: suggested.title,
        rationale: suggested.rationale,
        microSteps: buildBootstrapMicroSteps({ title: suggested.title }, currentTask.taskShape),
        isPinned: false,
        state: 'PENDING',
        workflowType: currentTask.workflowType,
        situationSummary: currentTask.reentryBrief?.summary,
        replyDraft: currentTask.workflowType === 'client_response' ? currentTask.lastSynthesis?.reply_draft : undefined,
        detectedBlockers: currentTask.blockerSignals,
      };
      const payload = buildPayloadFromAction(action);
      const nextTask: TaskContext = {
        ...currentTask,
        lifecycleState: targetRoute === 'SCAFFOLD' ? 'in_scaffold' : 'has_one_action',
        assistantMode: targetRoute === 'SCAFFOLD' ? 'scaffold_refinement' : 'action_negotiation',
        currentActionId: action.id,
        currentStepIndex: targetRoute === 'SCAFFOLD' ? currentTask.currentStepIndex : 0,
        lastSynthesis: payload,
        reentryBrief: currentTask.reentryBrief,
      };

      bindings.setCurrentActionState(action);
      bindings.setCurrentPayload(payload);
      bindings.setCurrentWhyThisNow(suggested.rationale);
      await persistActionSave(action);
      await updateStatus(targetRoute, {
        currentActionId: action.id,
        currentPayload: payload,
      }, nextTask);
      return;
    }

    await resumeTaskFromRoute(targetRoute);
  };

  const openDumpWithCurrentContext = async () => {
    const base = getBaseSession();
    if (!base) return;

    const currentTask = base.task;
    const nextDumpContext = currentTask
      ? {
          text: currentTask.sourceText,
          createdAt: currentTask.createdAt,
          lastAttemptAt: currentTask.lastAttemptAt,
          lastFailureReason: currentTask.lastFailureReason,
        }
      : base.activeDumpContext;

    bindings.setCurrentActionState(null);
    bindings.setCurrentPayload(null);
    bindings.setClarificationPrompt('');
    bindings.setCurrentWhyThisNow('');
    // Invalidate in-flight rescue before clearing state — prevents stale result from routing back
    invalidateRescue();
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();

    const dumpTask = currentTask
      ? {
          ...currentTask,
          lifecycleState: 'dumped' as const,
          currentActionId: null,
          currentStepIndex: 0,
          assistantMode: undefined,
        }
      : null;

    await updateStatus('DUMP_ENTRY', {
      currentActionId: null,
      currentPayload: undefined,
      activeDumpContext: nextDumpContext,
    }, dumpTask);
  };

  const handleClarificationSubmit = async (answer: string) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const trimmedAnswer = answer.trim();
    bindings.setClarificationPrompt('');
    trackEvent('clarification_answered');
    const nextTask: TaskContext = {
      ...currentTask,
      pendingInputs: [
        ...currentTask.pendingInputs,
        {
          kind: 'clarification',
          prompt: bindings.clarificationPrompt || 'ตอนนี้ควรตอบลูกค้าหรือเริ่มงานค้างส่วนไหนก่อน',
          answer: trimmedAnswer,
          createdAt: Date.now(),
        },
      ],
      lifecycleState: 'synthesizing',
      lastAttemptAt: Date.now(),
    };
    bindings.setIsDumpPending?.(true);
    await updateStatus('SYNTHESIZING', {
      currentActionId: null,
      currentPayload: undefined,
      lastFailureReason: undefined,
    }, nextTask);
    try {
      await runAiLifecycle(nextTask);
    } catch (err) {
      const failure = err instanceof SynthesisFailure
        ? err
        : new SynthesisFailure('unknown', 'ไม่สามารถเชื่อมต่อกับ AI endpoint ได้');
      await applyDeterministicFallback(nextTask, failure);
    } finally {
      bindings.setIsDumpPending?.(false);
    }
  };

  const handleAcceptAction = async () => {
    if (bindings.currentActionState) {
      await persistActionUpdate(bindings.currentActionState.id, { state: 'IN_PROGRESS' });
      trackEvent('action_accepted');
    }
    const baseForAction = getBaseSession();
    const currentTaskForAction = baseForAction ? getSessionTask(baseForAction) : null;
    trackEvent('first_action_selected', buildAnalyticsBase(currentTaskForAction ?? undefined, {
      latency_ms: bindings.dumpStartTime ? Date.now() - bindings.dumpStartTime : undefined,
      outcome_label: 'accepted_primary_action',
    }));
    if (bindings.dumpStartTime) {
      trackEvent('time_to_action_ms', { ms: Date.now() - bindings.dumpStartTime });
      bindings.setDumpStartTime(null);
    }
    const base = getBaseSession();
    if (!base || !bindings.currentPayload) return;
    const currentTask = getSessionTask(base);
    const oneActionTracking = currentTask.oneActionTracking;
    if (!oneActionTracking?.hasViewedAlternative && !oneActionTracking?.hasAdjusted) {
      trackEvent('one_action_accepted_first_try');
    }
    const confirmedAt = Date.now();
    const confirmedTask = markPlanConfirmed(currentTask, confirmedAt);
    const nextTask: TaskContext = {
      ...confirmedTask,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_refinement',
      currentActionId: bindings.currentActionState?.id || base.currentActionId,
      currentStepIndex: 0,
      lastSynthesis: bindings.currentPayload,
    };
    const confirmedStep = nextTask.currentPlan?.steps[0];
    const retrievedSourceCount = confirmedStep?.evidence?.filter(
      (item) => item.sourceKindLabel === 'retrieved',
    ).length ?? 0;
    trackEvent('step_confirmed', buildAnalyticsBase(nextTask, {
      step_id: confirmedStep?.id,
      source_ids: confirmedStep?.evidence?.map((item) => item.sourceId),
      confidence_level: confirmedStep?.confidence?.level,
      confidence_score: confirmedStep?.confidence?.score,
      destructive_risk: confirmedStep?.safety?.risk,
      retrieval_enabled: retrievedSourceCount > 0,
      retrieval_selection_method: retrievedSourceCount > 0 ? 'retrieval' : 'none',
      retrieved_source_count: retrievedSourceCount,
    }));
    clearScaffoldRefineState();
    await updateStatus('SCAFFOLD', {
      currentActionId: bindings.currentActionState?.id || base.currentActionId,
      currentPayload: bindings.currentPayload,
    }, nextTask);
  };

  const handleRejectAction = async () => {
    const currentPayload = bindings.currentPayload;
    const base = getBaseSession();
    if (!currentPayload || !base) return;
    const alts = currentPayload.alternative_actions;
    trackEvent('action_rejected');
    bindings.setCurrentWhyThisNow('');

    if (alts.length > 0) {
      const currentTask = getSessionTask(base);
      const nextTask: TaskContext = {
        ...currentTask,
        lifecycleState: 'has_one_action',
        actionExplanation: currentTask.actionExplanation,
        lastSynthesis: currentPayload,
        oneActionTracking: {
          hasViewedAlternative: true,
          hasAdjusted: currentTask.oneActionTracking?.hasAdjusted ?? false,
        },
      };
      await updateStatus('DECISION_BOARD', {
        notThisCount: 1,
        currentPayload: currentPayload,
      }, nextTask);
      clearScaffoldRefineState();
      return;
    }

    bindings.setCurrentPayload(null);
    bindings.setCurrentActionState(null);
    bindings.setIsNegotiatingAction(false);
    clearScaffoldRefineState();
    await updateStatus('DUMP_ENTRY', {
      currentActionId: null,
      currentPayload: undefined,
      notThisCount: 0,
      activeDumpContext: undefined,
    }, null);
  };

  const handleReturnToPrimaryAction = async () => {
    const base = getBaseSession();
    if (!base || !bindings.currentPayload) return;
    const currentTask = getSessionTask(base);
    bindings.setCurrentWhyThisNow(currentTask.actionExplanation ?? '');
    await updateStatus('ONE_ACTION', {
      currentPayload: bindings.currentPayload,
      notThisCount: 0,
    }, {
      ...currentTask,
      lifecycleState: 'has_one_action',
    });
  };

  const handleDecisionBoardSelect = async (index: number) => {
    const currentPayload = bindings.currentPayload;
    if (!currentPayload) return;
    const alt = currentPayload.alternative_actions[index];
    if (!alt) return;
    const workflowType = resolveWorkflowType(currentPayload);
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const actionDraft: Action = {
      id: Date.now().toString(),
      roomId: currentTask.roomId,
      createdAt: Date.now(),
      title: alt.title,
      rationale: alt.rationale,
      microSteps: buildBootstrapMicroSteps({
        title: alt.title,
      }, currentTask.taskShape),
      isPinned: false,
      state: 'PENDING',
      workflowType,
      situationSummary: currentPayload.situation_summary,
      replyDraft: currentPayload.reply_draft ?? undefined,
      detectedBlockers: currentPayload.detected_blockers ?? [],
    };
    await persistActionSave(actionDraft);
    bindings.setCurrentActionState(actionDraft);
    bindings.setCurrentWhyThisNow('');
    const newPayload = buildPayloadFromAction(actionDraft);
    bindings.setCurrentPayload(newPayload);
    const generatedAt = Date.now();
    const currentPlan = enrichPlanWithProvenance({
      actionTitle: actionDraft.title,
      steps: actionDraft.microSteps.map((step, stepIndex) => ({
        id: `step-${stepIndex + 1}`,
        text: step,
      })),
    }, currentTask, 'action', generatedAt);
    const nextTask: TaskContext = {
      ...currentTask,
      workflowType,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_refinement',
      currentActionId: actionDraft.id,
      currentStepIndex: 0,
      actionExplanation: undefined,
      lastSynthesis: newPayload,
      currentPlan,
      pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'action', generatedAt),
      planHistory: [
        ...(currentTask.planHistory ?? []),
        {
          id: `revision-${generatedAt}`,
          planId: `draft-${generatedAt}`,
          status: 'draft' as const,
          actionTitle: currentPlan.actionTitle,
          steps: currentPlan.steps,
          createdAt: generatedAt,
        },
      ].slice(-20),
      oneActionTracking: {
        hasViewedAlternative: true,
        hasAdjusted: currentTask.oneActionTracking?.hasAdjusted ?? false,
      },
    };
    await updateStatus('SCAFFOLD', {
      currentActionId: actionDraft.id,
      currentPayload: newPayload,
      lastWorkflowType: workflowType,
    }, nextTask);
  };

  const handleCompleteScaffold = async () => {
    const base = getBaseSession();
    if (!base || !bindings.currentPayload) return;

    const currentTask = getSessionTask(base);
    const stepTexts = getScaffoldStepTexts(currentTask, bindings.currentPayload);
    const lastStepIndex = Math.max(stepTexts.length - 1, 0);

    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();

    if (currentTask.currentStepIndex < lastStepIndex) {
      const currentStep = currentTask.currentPlan?.steps[currentTask.currentStepIndex];
      if (currentStep) {
        trackEvent('step_confirmed', buildAnalyticsBase(currentTask, {
          step_id: currentStep.id,
          source_ids: currentStep.evidence?.map((item) => item.sourceId),
          confidence_level: currentStep.confidence?.level,
          confidence_score: currentStep.confidence?.score,
          destructive_risk: currentStep.safety?.risk,
          retrieval_enabled: false,
        }));
      }
      const nextTask: TaskContext = {
        ...currentTask,
        lifecycleState: 'in_scaffold',
        assistantMode: 'scaffold_refinement',
        currentStepIndex: currentTask.currentStepIndex + 1,
        lastSynthesis: bindings.currentPayload,
        lastFailureReason: undefined,
      };
      await updateStatus('SCAFFOLD', {
        currentActionId: currentTask.currentActionId,
        currentPayload: bindings.currentPayload,
        lastFailureReason: undefined,
      }, nextTask);
      return;
    }

    const confirmedAt = Date.now();
    const currentStep = currentTask.currentPlan?.steps[currentTask.currentStepIndex];
    if (currentStep) {
      trackEvent('step_confirmed', buildAnalyticsBase(currentTask, {
        step_id: currentStep.id,
        source_ids: currentStep.evidence?.map((item) => item.sourceId),
        confidence_level: currentStep.confidence?.level,
        confidence_score: currentStep.confidence?.score,
        destructive_risk: currentStep.safety?.risk,
        retrieval_enabled: false,
      }));
    }
    const confirmedTask = markPlanConfirmed(currentTask, confirmedAt);
    const completionTask: TaskContext = {
      ...confirmedTask,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_completion',
      currentStepIndex: lastStepIndex,
      lastSynthesis: bindings.currentPayload,
      lastFailureReason: undefined,
    };

    await updateStatus('SCAFFOLD', {
      currentActionId: currentTask.currentActionId,
      currentPayload: bindings.currentPayload,
      lastFailureReason: undefined,
    }, completionTask);
  };

  const handleReturnToScaffoldSteps = async () => {
    const base = getBaseSession();
    if (!base || !bindings.currentPayload) return;

    const currentTask = getSessionTask(base);
    const nextTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_refinement',
      lastSynthesis: bindings.currentPayload,
      lastFailureReason: undefined,
    };

    await updateStatus('SCAFFOLD', {
      currentActionId: currentTask.currentActionId,
      currentPayload: bindings.currentPayload,
      lastFailureReason: undefined,
    }, nextTask);
  };

  const handleEditCurrentPlanStep = async (stepId: string, text: string) => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const nextTask = markStepEdited(currentTask, stepId, text);
    trackEvent('step_edited', buildAnalyticsBase(nextTask, {
      step_id: stepId,
      source_ids: nextTask.currentPlan?.steps.find((step) => step.id === stepId)?.evidence?.map((item) => item.sourceId),
      confidence_level: nextTask.currentPlan?.steps.find((step) => step.id === stepId)?.confidence?.level,
      confidence_score: nextTask.currentPlan?.steps.find((step) => step.id === stepId)?.confidence?.score,
      retrieval_enabled: false,
    }));
    await updateStatus(base.uiRoute, {}, nextTask);
  };

  const handleStartNewFromCompletedScaffold = async () => {
    if (bindings.currentActionState) {
      await persistActionUpdate(bindings.currentActionState.id, { state: 'COMPLETED' });
    }
    const base = getBaseSession();
    const completedTask = base ? getSessionTask(base) : null;
    bindings.setCurrentActionState(null);
    bindings.setCurrentPayload(null);
    bindings.setClarificationPrompt('');
    bindings.setCurrentWhyThisNow('');
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();

    // Preserve completed task context so Studio still has data to display.
    // Without this, both task and activeDumpContext are cleared and Studio
    // shows an empty "ยังไม่มีบริบท" state even though the room has history.
    const preservedDumpContext = completedTask?.sourceText
      ? {
          text: completedTask.sourceText,
          createdAt: completedTask.createdAt,
          lastAttemptAt: completedTask.lastAttemptAt,
          lastFailureReason: completedTask.lastFailureReason,
        }
      : undefined;

    const preservedTask: TaskContext | null = completedTask
      ? {
          ...completedTask,
          lifecycleState: 'done',
          assistantMode: undefined,
          currentActionId: null,
          currentStepIndex: 0,
          lastFailureReason: undefined,
        }
      : null;

    if (completedTask) {
      await recordCompletedCycleInRoomMemory(completedTask);
    }

    await updateStatus('DUMP_ENTRY', {
      currentActionId: null,
      currentPayload: undefined,
      activeDumpContext: preservedDumpContext,
      lastFailureReason: undefined,
    }, preservedTask);
    if (completedTask) {
      trackEvent('task_completed', buildAnalyticsBase(completedTask, {
        outcome_label: 'completed_and_reset',
      }));
    }
  };

  const handleWalkAwayFromRescue = async () => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const actionTitle =
      currentTask.currentPlan?.actionTitle ||
      bindings.currentPayload?.recommended_action.title ||
      bindings.currentActionState?.title ||
      'กลับไปเปิดบริบทล่าสุดของงานนี้';
    const actionRationale =
      bindings.currentPayload?.recommended_action.rationale ||
      bindings.currentActionState?.rationale ||
      'MIND เก็บก้าวล่าสุดไว้ให้กลับมาทำต่อจากจุดเดิม';
    const summary =
      bindings.currentPayload?.situation_summary ||
      currentTask.lastSynthesis?.situation_summary ||
      currentTask.sourceText.replace(/\s+/g, ' ').trim().slice(0, 180) ||
      'MIND เก็บบริบทล่าสุดของห้องนี้ไว้แล้ว';
    const roomId = currentTask.roomId ?? base.roomId ?? 'active-room';
    const pausedTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'dumped',
      assistantMode: 'reentry_brief',
      reentryBrief: currentTask.reentryBrief ?? {
        summary,
        topActions: [
          {
            roomId,
            title: actionTitle,
            rationale: actionRationale,
            resumeTarget: 'SCAFFOLD',
            impact: 'high',
            effort: 'low',
          },
        ],
        ignoredNoise: [],
        createdAt: Date.now(),
      },
    };

    invalidateRescue();
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();
    await updateStatus('DUMP_ENTRY', {
      currentActionId: base.currentActionId,
      currentPayload: base.currentPayload,
      lastFailureReason: undefined,
    }, pausedTask);
  };

  const handleOneActionAdjustmentTouched = async () => {
    const base = getBaseSession();
    if (!base) return;

    const currentTask = getSessionTask(base);
    if (currentTask.oneActionTracking?.hasAdjusted) return;

    const nextTask: TaskContext = {
      ...currentTask,
      oneActionTracking: {
        hasViewedAlternative: currentTask.oneActionTracking?.hasViewedAlternative ?? false,
        hasAdjusted: true,
      },
    };

    const nextSession = normalizeSession({
      ...base,
      status: base.uiRoute,
      uiRoute: base.uiRoute,
      task: nextTask,
      lastActive: Date.now(),
    });

    bindings.sessionRef.current = nextSession;
    bindings.setSession(nextSession);
    await persistSession(nextSession);
  };

  return {
    updateStatus,
    loadReentryBrief,
    handleDump,
    handleClarificationSubmit,
    handleActionNegotiation,
    handleMakeSmaller,
    handleEnterRescue,
    handleManualRescue,
    handleRetry,
    resumeTaskFromRoute,
    resumeFromSuggestedReentry,
    openDumpWithCurrentContext,
    handleReturnToPrimaryAction,
    handleAcceptAction,
    handleRejectAction,
    handleOneActionAdjustmentTouched,
    handleDecisionBoardSelect,
    handleCompleteScaffold,
    handleEditCurrentPlanStep,
    handleReturnToScaffoldSteps,
    handleStartNewFromCompletedScaffold,
    handleWalkAwayFromRescue,
    deriveResumeRoute: () => {
      const base = getBaseSession();
      return base ? deriveBounceBackRoute(base.task, bindings.currentActionState) : 'DUMP_ENTRY';
    },
  };
}
