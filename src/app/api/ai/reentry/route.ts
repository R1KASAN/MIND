import type { Action, TaskContext } from '@/lib/store/idb';
import { AiReentryScopeSchema } from '@/lib/ai/operations';
import { parseAiReentryResponse } from '@/lib/ai/operation-contract';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  buildReentryUserPrompt,
  REENTRY_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const action = body?.action as Action | undefined;
  const scopeParsed = AiReentryScopeSchema.safeParse(body?.scope ?? 'bounce_back');

  if (!task?.sourceText || typeof task.sourceText !== 'string' || !scopeParsed.success) {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_reentry_input',
        reason: 'unknown',
        message: 'ข้อมูลสำหรับ reentry ไม่ครบ',
        detail: 'task and scope are required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  const fallbackCurrentStep = task.currentPlan?.steps[task.currentStepIndex]?.text ?? action?.microSteps?.[task.currentStepIndex];
  const fallbackResumeTarget =
    task.lifecycleState === 'in_scaffold' || task.currentStepIndex > 0
      ? 'SCAFFOLD'
      : task.lifecycleState === 'has_one_action'
        ? 'ONE_ACTION'
        : 'DUMP_ENTRY';
  return runAiOperation({
    operationName: 'reentry',
    systemPrompt: REENTRY_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildReentryUserPrompt(task, action ?? null, scopeParsed.data),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('reentry', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiReentryResponse(raw, {
      fallbackRoomId: task.id,
      fallbackActionTitle: action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective,
      fallbackCurrentStep,
      fallbackResumeTarget,
    }),
    numPredict: 420,
  });
}
