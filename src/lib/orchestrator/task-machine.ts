import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type { TaskShape } from '@/lib/ai/task-shape';
import type {
  AiActionNegotiationMode,
  AiActionResponse,
  AiIntakeResponse,
  AiReentryResponse,
  AiScaffoldResponse,
} from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import { summarizeRoomFile, truncateRoomText } from '@/lib/room';
import type {
  Action,
  AppSession,
  TaskContext,
  UIRoute,
  WorkflowType,
  ReentryResumeTarget,
} from '@/lib/store/idb';
import {
  createDraftPlanFromCurrentPlan,
  enrichPlanWithProvenance,
} from '@/lib/orchestrator/plan-provenance';
import { createTaskContext } from '@/lib/store/idb';

let sessionWorkflowHistory: WorkflowType[] = [];

export function buildPayloadFromAction(action: Action): AiSynthesisResponse {
  return {
    workflow_type: action.workflowType,
    requires_clarification: false,
    situation_summary: action.situationSummary,
    reply_draft: action.replyDraft,
    recommended_action: {
      title: action.title,
      rationale: action.rationale,
      micro_steps: action.microSteps,
      micro_steps_source: action.microStepsSource ?? 'fallback',
    },
    alternative_actions: [],
    detected_blockers: action.detectedBlockers ?? [],
  };
}

/**
 * Extract room-relevant anchor words from sourceText for grounding checks.
 * Returns short noun phrases that identify the real work context:
 * company/client names, system nouns, incident keywords, etc.
 */
export function extractRoomAnchors(sourceText: string): string[] {
  if (!sourceText) return [];
  const anchors: string[] = [];
  // Company / client name patterns (English proper nouns, Thai ลูกค้า-prefixed names)
  const companyMatches = sourceText.match(/[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2}(?:\s+(?:Corp|Inc|Ltd|Co\.))?/g);
  if (companyMatches) {
    for (const m of companyMatches) {
      const trimmed = m.trim();
      if (trimmed.length >= 3 && trimmed.length <= 40) anchors.push(trimmed);
    }
  }
  // Thai/English work-context nouns
  const contextPatterns = [
    /เซิร์ฟเวอร์/g, /server/gi, /CPU/g, /RCA/g,
    /prod(?:uction)?/gi, /Dashboard/gi, /payment/gi, /API/gi,
    /แชต/g, /ไลน์/g, /อีเมล/g, /สไลด์/g,
    /ลูกค้า/g, /ทวง/g, /ล่ม/g, /spike/gi,
    /proposal/gi, /timeline/gi, /estimate/gi,
    /requirement/gi, /scope/gi,
  ];
  for (const pattern of contextPatterns) {
    if (pattern.test(sourceText)) {
      const word = pattern.source.replace(/\\s\+/g, ' ').replace(/[/\\gi]/g, '');
      if (!anchors.includes(word)) anchors.push(word);
    }
    pattern.lastIndex = 0; // reset global regex
  }
  return [...new Set(anchors)].slice(0, 8);
}

/** Self-care / reset keywords that indicate a generic energy step. */
const SELF_CARE_PATTERN = /กิน|พัก|พลัง|เติม|หายใจ|น้ำ|สายตา|ง่วง|หิว|เบา\s*ๆ|สมอง|ฟื้น|reset|ผ่อน/;

/**
 * Soft semantic guard: reject AI micro-steps that are fully anchorless/template-like
 * when room anchors are available. Returns the steps unchanged if they pass,
 * or undefined to signal that fallback should be used.
 *
 * Rules:
 * - If no room anchors exist, always pass (nothing to ground against).
 * - At least 2 of 3 steps must mention at least one room anchor.
 * - One self-care/reset step is allowed but not three.
 * - All 3 steps being generic/self-care is rejected.
 */
export function guardMicroStepsGrounding(
  steps: string[],
  sourceText: string,
): string[] | undefined {
  if (steps.length !== 3) return undefined;
  const anchors = extractRoomAnchors(sourceText);
  if (anchors.length === 0) return steps; // no anchors => nothing to enforce

  const lower = (s: string) => s.toLowerCase();
  let groundedCount = 0;
  let selfCareCount = 0;

  for (const step of steps) {
    const stepLower = lower(step);
    const isGrounded = anchors.some((anchor) => stepLower.includes(lower(anchor)));
    const isSelfCare = SELF_CARE_PATTERN.test(step);
    if (isGrounded) groundedCount++;
    if (isSelfCare && !isGrounded) selfCareCount++;
  }

  // All 3 self-care => reject
  if (selfCareCount >= 3) {
    console.info('[MIND][micro_steps_guard_rejected]', {
      reason: 'all_self_care',
      anchors,
      steps,
    });
    return undefined;
  }

  // Fewer than 2 grounded when anchors exist => reject
  if (groundedCount < 2) {
    console.info('[MIND][micro_steps_guard_rejected]', {
      reason: 'insufficient_grounding',
      groundedCount,
      anchors,
      steps,
    });
    return undefined;
  }

  return steps;
}

export function buildBootstrapMicroSteps(action: {
  title: string;
  successSignal?: string;
}, taskShape?: TaskShape, sourceText?: string) {
  if (taskShape?.behaviorIntent === 'personal_friction') {
    // If source text has real work anchors, ground the fallback in context
    const anchors = extractRoomAnchors(sourceText ?? '');
    if (anchors.length >= 2) {
      const topAnchor = anchors[0];
      const secondAnchor = anchors[1];
      return [
        `พักหายใจ 2 นาทีแล้วกลับมาเรื่อง ${topAnchor}`,
        `เปิดแค่หน้าจอเดียวที่เกี่ยวกับ ${topAnchor} / ${secondAnchor}`,
        `ทำก้าวเล็กชิ้นเดียวของ "${action.title}" ให้จบก่อน`,
      ];
    }

    // Pure overload, no work anchors — keep gentle generic
    return [
      'เช็กก่อนว่าตอนนี้ต้องเติมอะไรที่สุด: กิน พัก หรือเริ่มงานเบา ๆ',
      'เลือกงานก้าวแรกที่เล็กพอทำได้ โดยไม่ต้องเปิดทุกอย่างพร้อมกัน',
      'ทำแค่ก้าวแรก แล้วดูว่าพลังพอกลับไปต่อไหม',
    ];
  }

  const signal = action.successSignal?.trim() || 'เห็นความคืบหน้าหนึ่งจุดที่ตรวจได้';
  return [
    `ทวนข้อมูลที่มีอยู่ตอนนี้เกี่ยวกับ "${action.title}"`,
    `เริ่มจากส่วนที่เล็กที่สุดของ "${action.title}"`,
    `เช็กผลว่าตอนนี้ ${signal}`,
  ];
}

export function buildPayloadFromAiActionResponse(
  workflowType: WorkflowType,
  response: AiActionResponse,
  blockers: string[],
  taskShape?: TaskShape,
  sourceText?: string,
): AiSynthesisResponse {
  const aiSteps = response.starterMicroSteps;
  const rawValid = aiSteps && aiSteps.length === 3 && aiSteps.every((s) => s.trim().length > 0);
  // Apply soft grounding guard when sourceText is available
  const guardedSteps = rawValid && sourceText
    ? guardMicroStepsGrounding([...aiSteps], sourceText)
    : rawValid ? [...aiSteps] : undefined;
  const microSteps = guardedSteps ?? buildBootstrapMicroSteps(response.chosenAction, taskShape, sourceText);
  const microStepsSource: 'ai' | 'fallback' = guardedSteps ? 'ai' : 'fallback';

  return {
    workflow_type: workflowType,
    requires_clarification: false,
    clarification_nudge: undefined,
    situation_summary: response.situationSummary,
    reply_draft: workflowType === 'client_response' ? response.replyDraft ?? undefined : undefined,
    recommended_action: {
      title: response.chosenAction.title,
      rationale: response.chosenAction.rationale,
      micro_steps: microSteps,
      micro_steps_source: microStepsSource,
    },
    alternative_actions: response.alternatives.slice(0, 2).map((alternative) => ({
      title: alternative.title,
      rationale: alternative.rationale,
    })),
    detected_blockers: blockers,
    task_shape: taskShape,
  };
}

export function resolveWorkflowType(data: AiSynthesisResponse): WorkflowType {
  if (data.workflow_type === 'client_response' || data.workflow_type === 'client_resume') {
    return data.workflow_type;
  }
  return data.reply_draft ? 'client_response' : 'client_resume';
}

export function addressesBlocker(title: string, blockers: string[]) {
  const normalizedTitle = title.toLowerCase();
  return blockers.some((blocker) => {
    const normalizedBlocker = blocker.toLowerCase();
    if (!normalizedBlocker.trim()) return false;
    if (normalizedTitle.includes(normalizedBlocker)) return true;
    return normalizedBlocker
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .some((token) => normalizedTitle.includes(token));
  });
}

function appendWorkflowHint(dump: string) {
  if (sessionWorkflowHistory.length < 3) return dump;
  const lastThree = sessionWorkflowHistory.slice(-3);
  if (!lastThree.every((item) => item === lastThree[0])) return dump;
  return `${dump}\n\n(บริบท: ผู้ใช้มักทำงานประเภท ${lastThree[0]} ใน session นี้)`;
}

export function rememberWorkflow(workflowType: WorkflowType) {
  sessionWorkflowHistory = [...sessionWorkflowHistory, workflowType].slice(-5);
}

export function getSessionTask(base: AppSession): TaskContext {
  if (base.task) return base.task;
  const sourceText = base.activeDumpContext?.text;
  if (!sourceText) {
    throw new Error('ไม่พบ task context');
  }
  return createTaskContext(sourceText, base.lastWorkflowType, base.lastActive);
}

export function buildSynthesisInput(task: TaskContext): string {
  const sections: string[] = [truncateRoomText(task.sourceText)];
  const structuredContext: string[] = [];

  if (task.workflowType) {
    structuredContext.push(`workflow_type: ${task.workflowType}`);
  }
  if (task.taskShape) {
    structuredContext.push(
      [
        'task_shape:',
        `deliverable_type: ${task.taskShape.deliverableType}`,
        `immediate_need: ${task.taskShape.immediateNeed}`,
        `behavior_intent: ${task.taskShape.behaviorIntent ?? 'admin_task'}`,
        `missing_inputs: ${task.taskShape.missingInputs.join(', ') || 'ไม่มี'}`,
        `work_context: ${task.taskShape.workContext}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n'),
    );
  }
  if (task.currentStepIndex > 0) {
    structuredContext.push(`current_step_index: ${task.currentStepIndex}`);
  }
  if (task.lastFailureReason) {
    structuredContext.push(`last_failure_reason: ${task.lastFailureReason}`);
  }
  if (task.blockerSignals.length > 0) {
    structuredContext.push(`blocker_signals:\n- ${task.blockerSignals.join('\n- ')}`);
  }

  if (task.sourceFiles.length > 0) {
    structuredContext.push(`room_files:\n- ${task.sourceFiles.map((file) => summarizeRoomFile(file)).join('\n- ')}`);
  }

  const clarificationAnswers = task.pendingInputs
    .filter((input) => input.kind === 'clarification')
    .map((input) => input.answer.trim())
    .filter((answer) => Boolean(answer));
  if (clarificationAnswers.length > 0) {
    structuredContext.push(`clarification_answers:\n- ${clarificationAnswers.join('\n- ')}`);
  }

  const manualNotes = task.pendingInputs
    .filter((input) => input.kind === 'manual_rescue')
    .map((input) => input.answer.trim())
    .filter((answer) => Boolean(answer));
  if (manualNotes.length > 0) {
    structuredContext.push(`manual_notes:\n- ${manualNotes.join('\n- ')}`);
  }

  if (task.lastSynthesis?.situation_summary) {
    structuredContext.push(`previous_summary: ${task.lastSynthesis.situation_summary}`);
  }

  if (structuredContext.length > 0) {
    sections.push(`\n\nบริบทงาน:\n${structuredContext.join('\n')}`);
  }

  return appendWorkflowHint(sections.join(''));
}

export function deriveRoomBlockers(task: TaskContext): string[] {
  const blockers = new Set(task.blockerSignals);
  if (task.sourceFiles.some((file) => file.status !== 'ready')) {
    blockers.add('missing_file_or_context');
  }
  return [...blockers];
}

export function deriveBounceBackRoute(task: TaskContext | undefined, action: Action | null): UIRoute {
  if (!task) return action ? 'ONE_ACTION' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'in_scaffold') return 'SCAFFOLD';
  if (task.currentStepIndex > 0) return 'SCAFFOLD';
  if (task.lifecycleState === 'clarification_needed') return 'CLARIFICATION';
  if (task.lifecycleState === 'synthesizing') return 'SYNTHESIZING';
  if (task.lifecycleState === 'has_one_action') return action ? 'ONE_ACTION' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'stalled') return action ? 'SCAFFOLD' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'failed') return 'MANUAL_FALLBACK';
  return 'DUMP_ENTRY';
}

export function routeFromResumeTarget(target: ReentryResumeTarget): UIRoute {
  if (target === 'ONE_ACTION' || target === 'SCAFFOLD' || target === 'DUMP_ENTRY') {
    return target;
  }
  return 'DUMP_ENTRY';
}

export function toSmallerMicroStep(step: string): string {
  const normalized = step
    .replace(/^(?:ขยับอีกนิด:\s*)+/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'ขยับอีกนิด: ทำแค่ส่วนแรกที่แตะได้ก่อน';
  }

  return `ขยับอีกนิด: ${normalized}`;
}

function buildActionStateFromPayload(
  workflowType: WorkflowType,
  payload: AiSynthesisResponse,
  roomId?: string,
  existingAction?: Action | null,
): Action {
  if (existingAction) {
    return {
      ...existingAction,
      title: payload.recommended_action.title,
      rationale: payload.recommended_action.rationale,
      microSteps: payload.recommended_action.micro_steps,
      microStepsSource: payload.recommended_action.micro_steps_source ?? 'fallback',
      workflowType,
      situationSummary: payload.situation_summary,
      replyDraft: payload.reply_draft ?? undefined,
      detectedBlockers: payload.detected_blockers ?? [],
    };
  }

  return {
    id: Date.now().toString(),
    roomId,
    createdAt: Date.now(),
    title: payload.recommended_action.title,
    rationale: payload.recommended_action.rationale,
    microSteps: payload.recommended_action.micro_steps,
    microStepsSource: payload.recommended_action.micro_steps_source ?? 'fallback',
    isPinned: false,
    state: 'PENDING',
    workflowType,
    situationSummary: payload.situation_summary,
    replyDraft: payload.reply_draft ?? undefined,
    detectedBlockers: payload.detected_blockers ?? [],
  };
}

export function buildActionSuccessArtifacts(input: {
  task: TaskContext;
  intake: AiIntakeResponse;
  actionResponse: AiActionResponse;
  evidenceContext?: ActionEvidenceContext;
  existingAction?: Action | null;
  persistedNegotiationMode?: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'>;
}) {
  const { task, intake, actionResponse, evidenceContext, existingAction, persistedNegotiationMode } = input;
  const workflowType = intake.workflowType;
  const payload = buildPayloadFromAiActionResponse(workflowType, actionResponse, intake.blockers, intake.taskShape, task.sourceText);
  const actionState = buildActionStateFromPayload(workflowType, payload, task.roomId, existingAction);

  let constraints = task.constraints
    ? { ...task.constraints }
    : undefined;
  if (persistedNegotiationMode === 'reply_first') {
    (constraints ??= {}).preferReplyFirst = true;
  } else if (persistedNegotiationMode === 'resume_first') {
    (constraints ??= {}).preferReplyFirst = false;
  }

  const generatedAt = Date.now();
  const actionEvidence = evidenceContext?.selectionMethod === 'retrieval' && evidenceContext.evidenceChips.length > 0
    ? evidenceContext.evidenceChips
    : undefined;
  const currentPlan = enrichPlanWithProvenance({
    actionTitle: actionResponse.chosenAction.title,
    successSignal: actionResponse.chosenAction.successSignal,
    steps: payload.recommended_action.micro_steps.map((step, index) => ({
      id: `step-${index + 1}`,
      text: step,
      evidence: actionEvidence,
    })),
  }, task, 'action', generatedAt);

  const nextTask: TaskContext = {
    ...task,
    workflowType,
    taskShape: intake.taskShape,
    blockerSignals: intake.blockers,
    taskFrame: intake.taskFrame,
    lifecycleState: 'has_one_action',
    assistantMode: 'action_negotiation',
    lastAiOperation: 'action',
    currentActionId: actionState.id,
    currentStepIndex: 0,
    lastSynthesis: payload,
    lastFailureReason: undefined,
    actionExplanation: actionResponse.whyThisNow,
    currentPlan,
    pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'action', generatedAt),
    planHistory: [
      ...(task.planHistory ?? []),
      {
        id: `revision-${generatedAt}`,
        planId: `draft-${generatedAt}`,
        status: 'draft' as const,
        actionTitle: currentPlan.actionTitle,
        steps: currentPlan.steps,
        createdAt: generatedAt,
      },
    ].slice(-20),
    constraints,
    oneActionTracking: {
      hasViewedAlternative: false,
      hasAdjusted: false,
    },
  };

  return {
    workflowType,
    payload,
    actionState,
    whyThisNow: actionResponse.whyThisNow,
    nextTask,
    blockerCount: actionState.detectedBlockers?.length ?? 0,
    addressesDetectedBlocker: actionState.detectedBlockers
      ? addressesBlocker(actionState.title, actionState.detectedBlockers)
      : false,
  };
}

export function buildScaffoldSuccessArtifacts(input: {
  task: TaskContext;
  action: Action;
  payload: AiSynthesisResponse;
  scaffold: AiScaffoldResponse;
}) {
  const { task, action, payload, scaffold } = input;
  const nextMicroSteps = scaffold.steps.slice(0, 3).map((step) => step.text);
  const nextPayload: AiSynthesisResponse = {
    ...payload,
    recommended_action: {
      ...payload.recommended_action,
      title: scaffold.planTitle,
      micro_steps: [
        nextMicroSteps[0] ?? payload.recommended_action.micro_steps[0],
        nextMicroSteps[1] ?? payload.recommended_action.micro_steps[1],
        nextMicroSteps[2] ?? payload.recommended_action.micro_steps[2],
      ],
    },
  };

  const nextActionState: Action = {
    ...action,
    title: nextPayload.recommended_action.title,
    microSteps: nextPayload.recommended_action.micro_steps,
  };

  const generatedAt = Date.now();
  const currentPlan = enrichPlanWithProvenance({
    actionTitle: nextActionState.title,
    successSignal: task.currentPlan?.successSignal,
    steps: scaffold.steps,
  }, task, 'scaffold', generatedAt);

  const nextTask: TaskContext = {
    ...task,
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_refinement',
    lastAiOperation: 'scaffold',
    currentStepIndex: Math.min(
      scaffold.revisedCurrentStepIndex,
      currentPlan.steps.length - 1,
    ),
    currentPlan,
    pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'scaffold', generatedAt),
    planHistory: [
      ...(task.planHistory ?? []),
      {
        id: `revision-${generatedAt}`,
        planId: `draft-${generatedAt}`,
        status: 'draft' as const,
        actionTitle: currentPlan.actionTitle,
        steps: currentPlan.steps,
        createdAt: generatedAt,
      },
    ].slice(-20),
    lastSynthesis: nextPayload,
  };

  return { nextPayload, nextActionState, nextTask };
}

export function buildReentryTaskArtifacts(task: TaskContext, reentry: AiReentryResponse) {
  const failedFileNames = task.sourceFiles
    .filter((f) => f.status === 'failed_extraction' || f.status === 'unreadable' || f.status === 'failed')
    .map((f) => f.name);

  // Derive used source IDs from the current plan's evidence chips if available
  const usedSourceIds = task.currentPlan?.steps
    ?.flatMap((step) => step.evidence ?? [])
    .map((chip) => chip.sourceId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    ?? [];

  const nextTask: TaskContext = {
    ...task,
    assistantMode: 'reentry_brief',
    lastAiOperation: 'reentry',
    reentryBrief: {
      summary: reentry.reentrySummary,
      topActions: reentry.topActions,
      ignoredNoise: reentry.ignoredNoise,
      createdAt: Date.now(),
      ...(usedSourceIds.length > 0 ? { usedSourceIds } : {}),
      ...(failedFileNames.length > 0 ? { failedFileNames } : {}),
    },
  };

  return { nextTask };
}

export function hasResumableTask(task?: TaskContext) {
  if (!task) return false;
  return task.lifecycleState !== 'dumped' && task.lifecycleState !== 'done';
}
