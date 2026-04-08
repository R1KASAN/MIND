import type { TaskContext } from '@/lib/store/idb';
import { AiActionNegotiationModeSchema } from '@/lib/ai/operations';
import { parseAiActionResponse } from '@/lib/ai/operation-contract';
import type { AiIntakeResponse } from '@/lib/ai/operations';
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const preferredCandidate = body?.preferredCandidate as AiIntakeResponse['candidateActions'][number] | undefined;
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
  const preferredTitle = preferredCandidate?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective;
  const preferredRationale =
    preferredCandidate?.rationale ??
    (task.workflowType === 'client_response'
      ? 'ช่วยให้ตอบลูกค้าหรือเก็บข้อมูลที่ยังขาดได้เร็วขึ้น'
      : 'ช่วยให้กลับเข้าบริบทของงานค้างและเริ่มขยับได้ทันที');
  const fallbackSuccessSignal =
    task.currentPlan?.successSignal ??
    (task.workflowType === 'client_response'
      ? 'ลูกค้าเห็นความคืบหน้าหรือได้ข้อความตอบกลับที่ชัดขึ้น'
      : 'งานขยับไปหนึ่งจุดและรู้ว่าจะทำอะไรต่อ');
  const fallbackWhyThisNow = negotiation?.mode && negotiation.mode !== 'default'
    ? `ตอนนี้กำลังปรับ action ให้ ${negotiation.mode} ขึ้น โดยยังยึดงานเดิมและข้อจำกัดปัจจุบัน`
    : `ตอนนี้ควรเริ่มจาก action ที่แตะได้จริงและพางานนี้ไปต่อได้ก่อน โดยยึดเวลา ${
        task.constraints?.timeBudgetMin ?? 'ที่มีตอนนี้'
      } และพลังงาน ${task.constraints?.energyLevel ?? 'ปัจจุบัน'}`;
  const fallbackSituationSummary = task.sourceText.trim().slice(0, 220) || 'ตอนนี้ยังมีบริบทพอให้เลือกก้าวถัดไปที่ชัดเจนก่อน';
  const fallbackReplyDraft = task.workflowType === 'client_response'
    ? 'ขอผมสรุปประเด็นหลักจากข้อความนี้ก่อน แล้วจะกลับมาพร้อมคำตอบที่ชัดเจนให้ทันทีครับ'
    : undefined;
  const fallbackWorkflowType = task.workflowType ?? (
    /ลูกค้า|feedback|reply|ตอบ|email|chat/i.test(task.sourceText)
      ? 'client_response'
      : 'client_resume'
  );
  return runAiOperation({
    operationName: 'action',
    systemPrompt: ACTION_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildActionUserPrompt(task, preferredCandidate ?? null, negotiation ?? null),
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
    }),
    numPredict: ACTION_NUM_PREDICT,
    repairNumPredict: ACTION_REPAIR_NUM_PREDICT,
  });
}
