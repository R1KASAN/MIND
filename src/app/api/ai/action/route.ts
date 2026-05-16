import type { TaskContext } from '@/lib/store/idb';
import { AiActionNegotiationModeSchema } from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import { parseAiActionResponse } from '@/lib/ai/operation-contract';
import type { AiIntakeResponse } from '@/lib/ai/operations';
import {
  buildActionFallbackCopy,
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
  shouldGenerateReplyDraft,
} from '@/lib/ai/task-shape';
import {
  ACTION_SYSTEM_PROMPT,
  AI_OPERATION_REPAIR_PROMPT,
  buildActionUserPrompt,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
} from '@/lib/ai/operation-prompts';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_ACTION || 360) || 360;
const ACTION_REPAIR_NUM_PREDICT =
  Number(process.env.AI_NUM_PREDICT_ACTION_REPAIR || Math.max(420, ACTION_NUM_PREDICT)) ||
  Math.max(420, ACTION_NUM_PREDICT);
const ACTION_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_ACTION_QWEN_MS || process.env.AI_TIMEOUT_QWEN_MS || 60000) || 60000;
const ACTION_REPAIR_TIMEOUT_MS =
  Number(process.env.AI_REPAIR_TIMEOUT_ACTION_QWEN_MS || process.env.AI_REPAIR_TIMEOUT_QWEN_MS || 30000) ||
  30000;
const ACTION_FALLBACK_TIMEOUT_MS =
  Number(process.env.AI_TIMEOUT_ACTION_FALLBACK_MS || process.env.AI_TIMEOUT_FALLBACK_MS || 20000) ||
  20000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const preferredCandidate = body?.preferredCandidate as AiIntakeResponse['candidateActions'][number] | undefined;
  const evidenceContext = body?.evidenceContext as ActionEvidenceContext | undefined;
  const negotiationParsed = AiActionNegotiationModeSchema.safeParse(body?.negotiation?.mode ?? 'default');
  const negotiation = negotiationParsed.success
    ? {
        mode: negotiationParsed.data,
        userNote: typeof body?.negotiation?.userNote === 'string' ? body.negotiation.userNote : undefined,
      }
    : undefined;

  if (!task?.sourceText || typeof task.sourceText !== 'string') {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_task',
        reason: 'unknown',
        message: 'task context ไม่ถูกต้อง',
        detail: 'sourceText is required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  const fallbackTaskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
  const fallbackWorkflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
  const fallbackActionCopy = buildActionFallbackCopy(fallbackWorkflowType, fallbackTaskShape);
  const preferredTitle = preferredCandidate?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective ?? fallbackActionCopy.chosenTitle;
  const preferredRationale = preferredCandidate?.rationale ?? fallbackActionCopy.chosenRationale;
  const fallbackSuccessSignal = task.currentPlan?.successSignal ?? fallbackActionCopy.successSignal;
  const fallbackWhyThisNow = negotiation?.mode && negotiation.mode !== 'default'
    ? `ตอนนี้กำลังปรับ action ให้ ${negotiation.mode} ขึ้น โดยยังยึดงานเดิมและข้อจำกัดปัจจุบัน`
    : fallbackActionCopy.whyThisNow;
  const fallbackSituationSummary = fallbackActionCopy.situationSummary;
  const fallbackReplyDraft = shouldGenerateReplyDraft(fallbackWorkflowType, fallbackTaskShape)
    ? fallbackActionCopy.replyDraft
    : undefined;
  return runAiOperation({
    operationName: 'action',
    systemPrompt: ACTION_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildActionUserPrompt(task, preferredCandidate ?? null, negotiation ?? null, evidenceContext ?? null),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('action', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiActionResponse(raw, {
      fallbackChosenTitle: preferredTitle,
      fallbackChosenRationale: preferredRationale,
      fallbackSuccessSignal,
      fallbackWhyThisNow,
      fallbackSituationSummary,
      fallbackReplyDraft,
      fallbackWorkflowType,
      fallbackTaskShape,
    }),
    numPredict: ACTION_NUM_PREDICT,
    repairNumPredict: ACTION_REPAIR_NUM_PREDICT,
    primaryTimeoutMs: ACTION_TIMEOUT_MS,
    repairTimeoutMs: ACTION_REPAIR_TIMEOUT_MS,
    fallbackTimeoutMs: ACTION_FALLBACK_TIMEOUT_MS,
  });
}
