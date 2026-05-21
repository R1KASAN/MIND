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

export function buildBootstrapMicroSteps(action: {
  title: string;
  successSignal?: string;
}, taskShape?: TaskShape, task?: TaskContext) {
  const grounded = buildGroundedArtifactMicroSteps(action, taskShape, task);
  if (grounded) return grounded;

  if (taskShape?.behaviorIntent === 'personal_friction') {
    return [
      'เช็กก่อนว่าตอนนี้ต้องเติมอะไรที่สุด: กิน พัก หรือเริ่มงานเบา ๆ',
      'เลือกงานก้าวแรกที่เล็กพอทำได้ โดยไม่ต้องเปิดทุกอย่างพร้อมกัน',
      'ทำแค่ก้าวแรก แล้วดูว่าพลังพอกลับไปต่อไหม',
    ];
  }

  const signal = action.successSignal?.trim() || 'เห็นความคืบหน้าหนึ่งจุดของงานนี้';
  return [
    `ดูข้อมูลที่คุณมีตอนนี้เกี่ยวกับ "${action.title}"`,
    `ทำก้าวหลักนี้ทันที: ${action.title}`,
    `เช็กผลว่าตอนนี้ ${signal}`,
  ];
}

function normalizeForStepMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueAnchors(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeForStepMatch(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

export function collectRoomArtifactAnchors(task?: TaskContext, taskShape?: TaskShape, actionTitle?: string) {
  const text = [
    task?.sourceText,
    task?.extractedText,
    task?.taskFrame?.objective,
    task?.taskFrame?.stage,
    task?.taskFrame?.stakeholders?.join(' '),
    taskShape?.workContext,
    taskShape?.missingInputs?.join(' '),
    actionTitle,
  ].filter(Boolean).join(' ');

  const lower = text.toLowerCase();
  const anchors: string[] = [];

  const customerMatches = text.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\s+(?:Corp|Co|Ltd|Inc|LLC|Bank)\b/g) ?? [];
  anchors.push(...customerMatches);

  const keywordAnchors: Array<[RegExp, string]> = [
    [/\bprod(?:uction)?\b|โปรดักชัน/u, 'prod'],
    [/cpu spike/u, 'CPU spike'],
    [/\brca\b/u, 'RCA'],
    [/\bincident\b|อินซิเดนต์/u, 'incident'],
    [/dashboard/u, 'Dashboard'],
    [/payment\s+api|ระบบจ่ายเงิน/u, 'payment API'],
    [/\bapi\b/u, 'API'],
    [/server|เซิร์ฟเวอร์/u, 'server'],
    [/webhook/u, 'webhook'],
    [/jira/u, 'Jira'],
    [/release/u, 'release'],
    [/timeline|ไทม์ไลน์/u, 'timeline'],
    [/สเปก|spec/u, 'สเปก'],
    [/ปุ่ม|button/u, 'ปุ่ม'],
    [/สไลด์|slide/u, 'สไลด์'],
    [/แชต|ไลน์|line|chat/u, 'แชต'],
    [/ลูกค้า|client/u, 'ลูกค้า'],
  ];

  for (const [pattern, label] of keywordAnchors) {
    if (pattern.test(lower)) anchors.push(label);
  }

  return uniqueAnchors(anchors);
}

function hasRoomWorkAnchors(task?: TaskContext, taskShape?: TaskShape, actionTitle?: string) {
  if (!task) return false;
  return collectRoomArtifactAnchors(task, taskShape, actionTitle).length >= 2;
}

export function hasAnchorInStep(step: string, anchors: string[]) {
  const normalizedStep = normalizeForStepMatch(step);
  return anchors.some((anchor) => normalizedStep.includes(normalizeForStepMatch(anchor)));
}

function isResetOnlyStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  const resetWords = ['พัก', 'หายใจ', 'กิน', 'ดื่มน้ำ', 'เติมพลัง', 'สมองตื้อ', 'energy', 'reset'];
  const workWords = ['สรุป', 'ร่าง', 'แยก', 'เช็ก', 'จด', 'ตอบ', 'draft', 'summary', 'checklist', 'status', 'message'];
  return resetWords.some((word) => normalized.includes(word)) &&
    !workWords.some((word) => normalized.includes(word));
}

function isConcreteWorkStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  return [
    'สรุป',
    'ร่าง',
    'แยก',
    'เช็ก',
    'จด',
    'ตอบ',
    'draft',
    'summary',
    'status',
    'checklist',
    'message',
  ].some((token) => normalized.includes(token));
}

function isArtifactStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  return [
    'ร่าง',
    'ข้อความ',
    'สรุป',
    'โน้ต',
    'note',
    'status',
    'checklist',
    'draft',
    'message',
    '3 บรรทัด',
  ].some((token) => normalized.includes(token));
}

export function echoesActionTitle(step: string, actionTitle?: string) {
  if (!actionTitle) return false;
  const normalizedStep = normalizeForStepMatch(step);
  const normalizedTitle = normalizeForStepMatch(actionTitle);
  if (!normalizedStep || !normalizedTitle) return false;
  if (normalizedStep.includes(normalizedTitle)) return true;
  return normalizedStep.includes('ทำก้าวเล็กชิ้นเดียวของ') ||
    normalizedStep.includes('ทำก้าวหลักนี้ทันที');
}

function shouldUseGroundedFallbackSteps(
  steps: string[] | undefined,
  action: { title: string; successSignal?: string },
  taskShape?: TaskShape,
  task?: TaskContext,
) {
  if (!steps || steps.length !== 3) return true;
  if (!hasRoomWorkAnchors(task, taskShape, action.title)) return false;

  const anchors = collectRoomArtifactAnchors(task, taskShape, action.title);
  const anchoredCount = steps.filter((step) => hasAnchorInStep(step, anchors)).length;
  const resetOnlyCount = steps.filter(isResetOnlyStep).length;

  return (
    !isConcreteWorkStep(steps[0]) ||
    isResetOnlyStep(steps[0]) ||
    !isArtifactStep(steps[2]) ||
    anchoredCount < 2 ||
    resetOnlyCount > 1 ||
    steps.some((step) => echoesActionTitle(step, action.title))
  );
}

function buildGroundedArtifactMicroSteps(
  action: { title: string; successSignal?: string },
  taskShape?: TaskShape,
  task?: TaskContext,
) {
  if (!hasRoomWorkAnchors(task, taskShape, action.title)) return undefined;

  const anchors = collectRoomArtifactAnchors(task, taskShape, action.title);
  const customerAnchor = anchors.find((anchor) => /corp|co|ltd|inc|llc|bank/i.test(anchor)) ?? 'ลูกค้า';
  const hasIncident = anchors.some((anchor) => ['prod', 'CPU spike', 'RCA', 'incident', 'server', 'webhook'].includes(anchor));
  const hasDashboard = anchors.includes('Dashboard');
  const hasPayment = anchors.includes('payment API');
  const hasChat = anchors.includes('แชต') || anchors.includes('ลูกค้า');

  if (hasIncident) {
    return [
      anchors.includes('CPU spike')
        ? 'สรุปสถานะ prod/CPU spike เป็น 3 บรรทัด'
        : 'สรุปสถานะ incident เป็น 3 บรรทัด',
      hasDashboard && hasPayment
        ? 'แยก Dashboard กับ payment API ว่าค้างตรงไหน'
        : 'จดสิ่งที่ตรวจแล้วกับสิ่งที่ยังไม่ชัด',
      hasChat
        ? `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลา`
        : 'ร่าง status note ที่ไม่ commit เวลา',
    ];
  }

  if (hasDashboard || hasPayment || anchors.includes('API')) {
    return [
      `แยกงานค้างของ ${customerAnchor} เป็นรายการสั้น`,
      'จดสถานะล่าสุดของแต่ละรายการ',
      `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลา`,
    ];
  }

  return [
    `สรุปสถานะล่าสุดของ ${customerAnchor} เป็น 3 บรรทัด`,
    'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
    `ร่างข้อความตอบ ${customerAnchor} แบบปลอดภัย`,
  ];
}

export function buildPayloadFromAiActionResponse(
  workflowType: WorkflowType,
  response: AiActionResponse,
  blockers: string[],
  taskShape?: TaskShape,
  task?: TaskContext,
): AiSynthesisResponse {
  const aiSteps = response.starterMicroSteps;
  const useAiSteps =
    aiSteps &&
    aiSteps.length === 3 &&
    aiSteps.every((s) => s.trim().length > 0) &&
    !shouldUseGroundedFallbackSteps(aiSteps, response.chosenAction, taskShape, task);
  const microSteps = useAiSteps ? [...aiSteps] : buildBootstrapMicroSteps(response.chosenAction, taskShape, task);
  const microStepsSource: 'ai' | 'fallback' = useAiSteps ? 'ai' : 'fallback';

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
  const payload = buildPayloadFromAiActionResponse(workflowType, actionResponse, intake.blockers, intake.taskShape, task);
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
