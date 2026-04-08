import type { RoomSubmission } from '@/lib/room';
import { trackEvent } from '@/lib/instrumentation';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type {
  AiActionNegotiationMode,
  AiOperationMeta,
  AiActionResponse,
  AiIntakeResponse,
  AiRescueResponse,
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
} from '@/lib/orchestrator/task-machine';
import {
  classifyScaffoldRefineResult,
  getVisibleScaffoldStep,
  SCAFFOLD_REFINE_FAILURE_COPY,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';
import {
  requestAction,
  requestIntake,
  requestLegacySynthesis,
  requestReentry,
  requestRescue,
  requestScaffold,
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
  recordAiOpsEntry: (entry: AiOpsDebugEntry) => void;
  persistSession?: (session: AppSession) => Promise<void>;
  persistActionSave?: (action: Action) => Promise<void>;
  persistActionUpdate?: (id: string, modifications: Partial<Action>) => Promise<void>;
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

export function createTaskController(bindings: TaskControllerBindings) {
  const getBaseSession = () => bindings.sessionRef.current ?? bindings.session;
  const persistSession = bindings.persistSession ?? saveSession;
  const persistActionSave = bindings.persistActionSave ?? saveAction;
  const persistActionUpdate = bindings.persistActionUpdate ?? updateAction;

  const clearScaffoldRefineState = (preserveFeedback = false) => {
    bindings.setIsScaffoldRefining(false);
    if (!preserveFeedback) {
      bindings.setScaffoldRefineFeedback(null);
    }
  };

  const setScaffoldRefineError = (message = SCAFFOLD_REFINE_FAILURE_COPY) => {
    bindings.setScaffoldRefineFeedback({
      kind: 'error',
      message,
    });
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

  const applyActionOperationSuccess = async (options: {
    task: TaskContext;
    intake: AiIntakeResponse;
    actionResponse: AiActionResponse;
    fromRetry?: boolean;
    existingAction?: Action | null;
    persistedNegotiationMode?: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'>;
  }) => {
    const { task, intake, actionResponse, fromRetry = false, existingAction, persistedNegotiationMode } = options;
    const artifacts = buildActionSuccessArtifacts({
      task,
      intake,
      actionResponse,
      existingAction,
      persistedNegotiationMode,
    });

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
    }, artifacts.nextTask);
  };

  const handleLegacySynthesisSuccess = async (data: AiSynthesisResponse, fromRetry = false) => {
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
    trackEvent('synthesis_completed', { source: 'ollama' });
    trackEvent('workflow_classified', { workflow_type: workflowType });
    trackEvent(workflowType === 'client_response' ? 'client_response_submitted' : 'client_resume_submitted');
    rememberWorkflow(workflowType);

    const actionDraft: Action = {
      id: Date.now().toString(),
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
      currentPlan: {
        actionTitle: normalizedData.recommended_action.title,
        steps: normalizedData.recommended_action.micro_steps.map((step, index) => ({
          id: `step-${index + 1}`,
          text: step,
        })),
      },
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

  const runAiLifecycle = async (task: TaskContext, fromRetry = false) => {
    try {
      const intake = await requestIntake(task);
      recordSuccess('intake', intake);
      const intakeTask: TaskContext = {
        ...task,
        workflowType: intake.workflowType,
        blockerSignals: intake.blockers,
        taskFrame: intake.taskFrame,
        assistantMode: 'intake_review',
        lastAiOperation: 'intake',
      };

      if (intake.requiresClarification) {
        bindings.setClarificationPrompt(intake.clarificationQuestion || 'ช่วยบอกอีกนิดว่าตอนนี้ต้องตอบหรือขยับส่วนไหนก่อน');
        bindings.setCurrentWhyThisNow('');
        await updateStatus('CLARIFICATION', {
          currentActionId: null,
          currentPayload: undefined,
          lastWorkflowType: intake.workflowType,
          lastFailureReason: undefined,
        }, {
          ...intakeTask,
          lifecycleState: 'clarification_needed',
          currentActionId: null,
          currentStepIndex: 0,
          lastFailureReason: undefined,
        });
        return;
      }

      const actionResponse = await requestAction({
        task: intakeTask,
        preferredCandidate: intake.candidateActions[0],
      });
      recordSuccess('action', actionResponse);
      await applyActionOperationSuccess({
        task: intakeTask,
        intake,
        actionResponse,
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
    bindings.setIsReentryLoading(true);
    try {
      const reentry = await requestReentry(currentTask, bindings.currentActionState, scope);
      recordSuccess('reentry', reentry);
      const { nextTask } = buildReentryTaskArtifacts(currentTask, reentry);
      const updated = normalizeSession({
        ...base,
        status: base.uiRoute,
        uiRoute: base.uiRoute,
        task: nextTask,
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
      const actionResponse = await requestAction({
        task: trackedTask,
        negotiation: { mode: input.mode, userNote: input.userNote },
      });
      recordSuccess('action', actionResponse);
      const fallbackWorkflowType =
        trackedTask.workflowType ??
        (bindings.currentPayload ? resolveWorkflowType(bindings.currentPayload) : 'client_resume');
      const intake: AiIntakeResponse = {
        workflowType: fallbackWorkflowType,
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
    const currentTask = getSessionTask(base);
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
    const previousVisibleStep = getVisibleScaffoldStep(
      bindings.currentPayload.recommended_action.micro_steps,
      taskForScaffold.currentStepIndex,
    );

    bindings.setScaffoldRefineFeedback(null);
    bindings.setIsScaffoldRefining(true);

    try {
      const scaffold = await requestScaffold(taskForScaffold, currentAction, taskForScaffold.currentStepIndex);
      recordSuccess('scaffold', scaffold);
      const { nextPayload, nextActionState, nextTask } = buildScaffoldSuccessArtifacts({
        task: taskForScaffold,
        action: currentAction,
        payload: bindings.currentPayload,
        scaffold,
      });
      const nextVisibleStep = getVisibleScaffoldStep(
        nextPayload.recommended_action.micro_steps,
        nextTask.currentStepIndex,
      );
      const refineResult = classifyScaffoldRefineResult(previousVisibleStep, nextVisibleStep);

      if (refineResult !== 'success') {
        setScaffoldRefineError();
        return;
      }

      bindings.setCurrentPayload(nextPayload);
      bindings.setCurrentRescueState(null);
      if (bindings.currentActionState) {
        bindings.setCurrentActionState(nextActionState);
        await persistActionUpdate(bindings.currentActionState.id, {
          title: nextActionState.title,
          microSteps: nextActionState.microSteps,
        });
      }
      await updateStatus('SCAFFOLD', {
        currentActionId: currentAction.id || base.currentActionId,
        currentPayload: nextPayload,
      }, nextTask);
    } catch (error) {
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
      setScaffoldRefineError();
    } finally {
      bindings.setIsScaffoldRefining(false);
    }
  };

  const handleEnterRescue = async () => {
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const nextTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'stalled',
      assistantMode: 'rescue_diagnosis',
    };
    clearScaffoldRefineState();
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(true);
    await updateStatus('RESCUE', {}, nextTask);

    try {
      const rescue = await requestRescue(nextTask, bindings.currentActionState, currentTask.currentStepIndex);
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
      if (error instanceof SynthesisFailure) {
        recordFailure(error);
      }
      bindings.setCurrentRescueState({
        diagnosis: {
          primaryReason: 'unknown',
          explanation: 'MIND ยังวินิจฉัยไม่สำเร็จในรอบนี้ แต่บริบทงานและข้อความเดิมของคุณยังอยู่ครบ ลองย่อยให้เล็กลงอีก หรือพักไว้แล้วกลับมาลอง rescue ใหม่ได้',
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
    } finally {
      bindings.setIsRescueLoading(false);
    }
  };

  const handleDump = async (submission: RoomSubmission) => {
    bindings.setDumpStartTime(Date.now());
    const createdAt = Date.now();
    const task: TaskContext = {
      id: `${createdAt}`,
      workflowType: undefined,
      sourceText: submission.sourceText,
      sourceFiles: submission.sourceFiles,
      extractedText: submission.extractedText,
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
      try {
        const data = await requestLegacySynthesis(task);
        recordSuccess('legacy_synthesis', data as unknown as { meta?: never });
        await handleLegacySynthesisSuccess(data);
      } catch {
        const failure = err instanceof SynthesisFailure
          ? err
          : new SynthesisFailure('unknown', 'ไม่สามารถเชื่อมต่อกับ AI endpoint ได้');
        await enterManualFallback(failure.reason, failure.message, failure.actions, failure.retryable);
      }
    }
  };

  const handleManualRescue = async (actionTitle: string) => {
    const base = getBaseSession();
    if (!base) return;
    const steps = [
      `เปิดสิ่งที่ต้องใช้เพื่อเริ่ม "${actionTitle}"`,
      'โฟกัสแค่ 2 นาทีแรกของงานนี้พอ',
      'ขยับก้าวเล็กถัดไปให้เริ่มเดินจริง',
    ];
    const actionDraft: Action = {
      id: Date.now().toString(),
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
    const task = getSessionTask(base);
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

    await updateStatus('SYNTHESIZING', {
      currentActionId: currentTask.currentActionId,
      currentPayload: currentTask.lastSynthesis,
      lastFailureReason: currentTask.lastFailureReason,
      lastWorkflowType: currentTask.workflowType ?? base.lastWorkflowType,
    }, retriedTask);

    try {
      await runAiLifecycle(retriedTask, true);
    } catch (err) {
      try {
        const data = await requestLegacySynthesis(retriedTask);
        recordSuccess('legacy_synthesis', data as unknown as { meta?: never });
        await handleLegacySynthesisSuccess(data, true);
      } catch {
        const failure = err instanceof SynthesisFailure
          ? err
          : new SynthesisFailure('unknown', 'ลองให้ AI ใหม่ไม่สำเร็จ');
        await enterManualFallback(failure.reason, failure.message, failure.actions, failure.retryable);
        throw failure;
      }
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
    await resumeTaskFromRoute(routeFromResumeTarget(suggested.resumeTarget));
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
    await updateStatus('SYNTHESIZING', {
      currentActionId: null,
      currentPayload: undefined,
      lastFailureReason: undefined,
    }, nextTask);
    try {
      await runAiLifecycle(nextTask);
    } catch (err) {
      try {
        const data = await requestLegacySynthesis(nextTask);
        recordSuccess('legacy_synthesis', data as unknown as { meta?: never });
        await handleLegacySynthesisSuccess(data);
      } catch {
        const failure = err instanceof SynthesisFailure
          ? err
          : new SynthesisFailure('unknown', 'ไม่สามารถเชื่อมต่อกับ AI endpoint ได้');
        await enterManualFallback(failure.reason, failure.message, failure.actions, failure.retryable);
      }
    }
  };

  const handleAcceptAction = async () => {
    if (bindings.currentActionState) {
      await persistActionUpdate(bindings.currentActionState.id, { state: 'IN_PROGRESS' });
      trackEvent('action_accepted');
    }
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
    const nextTask: TaskContext = {
      ...currentTask,
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_refinement',
      currentActionId: bindings.currentActionState?.id || base.currentActionId,
      currentStepIndex: 0,
      lastSynthesis: bindings.currentPayload,
    };
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
    const actionDraft: Action = {
      id: Date.now().toString(),
      createdAt: Date.now(),
      title: alt.title,
      rationale: alt.rationale,
      microSteps: buildBootstrapMicroSteps({
        title: alt.title,
      }),
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
    const base = getBaseSession();
    if (!base) return;
    const currentTask = getSessionTask(base);
    const nextTask: TaskContext = {
      ...currentTask,
      workflowType,
      lifecycleState: 'in_scaffold',
      currentActionId: actionDraft.id,
      currentStepIndex: 0,
      actionExplanation: undefined,
      lastSynthesis: newPayload,
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
    if (bindings.currentActionState) {
      await persistActionUpdate(bindings.currentActionState.id, { state: 'COMPLETED' });
    }
    bindings.setCurrentActionState(null);
    bindings.setCurrentPayload(null);
    bindings.setClarificationPrompt('');
    bindings.setCurrentWhyThisNow('');
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();
    await updateStatus('DUMP_ENTRY', {
      currentActionId: null,
      currentPayload: undefined,
      activeDumpContext: undefined,
      lastFailureReason: undefined,
    }, null);
  };

  const handleWalkAwayFromRescue = async () => {
    bindings.setCurrentRescueState(null);
    bindings.setIsRescueLoading(false);
    bindings.setCurrentWhyThisNow('');
    bindings.setIsNegotiatingAction(false);
    bindings.setIsReentryLoading(false);
    clearScaffoldRefineState();
    await updateStatus('DUMP_ENTRY', {
      currentActionId: null,
      currentPayload: undefined,
      activeDumpContext: undefined,
      lastFailureReason: undefined,
    }, null);
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
    handleWalkAwayFromRescue,
    deriveResumeRoute: () => {
      const base = getBaseSession();
      return base ? deriveBounceBackRoute(base.task, bindings.currentActionState) : 'DUMP_ENTRY';
    },
  };
}
