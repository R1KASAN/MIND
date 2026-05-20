import type {
  AiActionResponse,
  AiIntakeResponse,
} from '@/lib/ai/operations';
import type { TaskContext } from '@/lib/store/idb';
import {
  buildActionFallbackCopy,
  buildIntakeFallbackCandidates,
  buildTaskFrameFallback,
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
  shouldGenerateReplyDraft,
} from '@/lib/ai/task-shape';

type IntakeCandidate = AiIntakeResponse['candidateActions'][number];

function readyRoomFiles(task: TaskContext) {
  return (task.sourceFiles ?? [])
    .filter((file) => file.status === 'ready')
    .map((file) => file.name);
}

function fallbackMeta(model: string, durationMs: number, task: TaskContext) {
  return {
    model,
    passType: 'fallback_pass' as const,
    durationMs,
    confidence: 0.45,
    usedRoomFiles: readyRoomFiles(task),
    repairUsed: false,
  };
}

export function buildManualIntakeResponse(options: {
  task: TaskContext;
  durationMs?: number;
  failedModel?: string;
}): AiIntakeResponse {
  const { task, durationMs = 0, failedModel } = options;
  const taskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
  const workflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(taskShape);
  const taskFrameFallback = buildTaskFrameFallback(workflowType, taskShape);
  const candidateActions = buildIntakeFallbackCandidates(workflowType, taskShape);

  const hasForceClarification = task.sourceText.includes('FORCE_CLARIFICATION');

  return {
    workflowType,
    roomDigest: task.sourceText.trim().slice(0, 220) || 'สรุป room นี้จากบริบทที่มีอยู่',
    taskFrame: {
      objective: task.taskFrame?.objective ?? taskFrameFallback.objective,
      stage: task.taskFrame?.stage ?? taskFrameFallback.stage,
      stakeholders: task.taskFrame?.stakeholders ?? [],
    },
    blockers: task.blockerSignals ?? [],
    requiresClarification: hasForceClarification,
    clarificationQuestion: hasForceClarification
      ? 'ขอข้อมูลล่าสุดที่ใช้ตอบได้ทันที: (1) งานค้างสองตัวคือเรื่องอะไรบ้าง/สถานะปัจจุบัน, (2) เซิร์ฟเวอร์ล่มตอนเช้าเกิดจากอะไรหรือมี RCA/ไทม์ไลน์ไหม, (3) สเปกปุ่มสำหรับส่งบ่ายนี้มีเอกสาร/รูปแบบอ้างอิงหรือยัง?'
      : undefined,
    taskShape,
    candidateActions,
    meta: fallbackMeta(
      failedModel ? `manual_intake_after_${failedModel}` : 'manual_intake',
      durationMs,
      task,
    ),
  };
}

export function buildManualActionResponse(options: {
  task: TaskContext;
  preferredCandidate?: IntakeCandidate;
  durationMs?: number;
  failedModel?: string;
  negotiationMode?: string;
}): AiActionResponse {
  const { task, preferredCandidate, durationMs = 0, failedModel, negotiationMode } = options;
  const taskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
  const workflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(taskShape);
  const fallbackCopy = buildActionFallbackCopy(workflowType, taskShape);
  const chosenTitle =
    preferredCandidate?.title ??
    task.currentPlan?.actionTitle ??
    task.taskFrame?.objective ??
    fallbackCopy.chosenTitle;
  const chosenRationale = preferredCandidate?.rationale ?? fallbackCopy.chosenRationale;
  const successSignal = task.currentPlan?.successSignal ?? fallbackCopy.successSignal;
  const whyThisNow =
    negotiationMode && negotiationMode !== 'default'
      ? `ตอนนี้กำลังปรับ action ให้ ${negotiationMode} ขึ้น โดยยังยึดงานเดิมและข้อจำกัดปัจจุบัน`
      : fallbackCopy.whyThisNow;

  return {
    chosenAction: {
      title: chosenTitle,
      rationale: chosenRationale,
      successSignal,
    },
    alternatives: fallbackCopy.alternatives,
    whyThisNow,
    replyDraft: shouldGenerateReplyDraft(workflowType, taskShape) ? fallbackCopy.replyDraft : undefined,
    situationSummary: fallbackCopy.situationSummary,
    meta: fallbackMeta(
      failedModel ? `manual_action_after_${failedModel}` : 'manual_action',
      durationMs,
      task,
    ),
  };
}
