import type { Action, TaskContext } from '@/lib/store/idb';
import { parseAiRescueResponse } from '@/lib/ai/operation-contract';
import { resolveRescueRouteBudget } from '@/lib/ai/rescue-runtime';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  buildRescueUserPrompt,
  RESCUE_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESCUE_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_RESCUE || 160) || 160;
const RESCUE_REPAIR_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_RESCUE_REPAIR || 220) || 220;
const RESCUE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_MS || 20000) || 20000;
const RESCUE_REPAIR_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_REPAIR_MS || 14000) || 14000;
const RESCUE_FALLBACK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_FALLBACK_MS || 14000) || 14000;
const RESCUE_OVERALL_BUDGET_MS = Number(process.env.AI_OVERALL_TIMEOUT_RESCUE_MS || 40000) || 40000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const action = body?.action as Action | undefined;
  const currentStepIndex = typeof body?.currentStepIndex === 'number' ? body.currentStepIndex : 0;
  const retryContext = body?.retryContext && typeof body.retryContext === 'object' ? body.retryContext : undefined;

  if (!task?.sourceText || typeof task.sourceText !== 'string') {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_rescue_input',
        reason: 'unknown',
        message: 'ข้อมูลสำหรับ rescue ไม่ครบ',
        detail: 'task is required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  const fallbackReason =
    task.blockerSignals.includes('missing_file_or_context')
      ? 'missing_context'
      : task.lifecycleState === 'stalled'
        ? 'too_big'
        : 'unknown';
  const fallbackActionTitle = action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective;
  const fallbackCurrentStep =
    action?.microSteps[currentStepIndex] ??
    action?.microSteps[0] ??
    task.currentPlan?.steps[currentStepIndex]?.text ??
    task.currentPlan?.steps[0]?.text ??
    fallbackActionTitle;
  const rescueBudget = resolveRescueRouteBudget({
    primaryTimeoutMs: RESCUE_TIMEOUT_MS,
    repairTimeoutMs: RESCUE_REPAIR_TIMEOUT_MS,
    fallbackTimeoutMs: RESCUE_FALLBACK_TIMEOUT_MS,
    overallBudgetMs: RESCUE_OVERALL_BUDGET_MS,
  }, retryContext);

  return runAiOperation({
    operationName: 'rescue',
    systemPrompt: RESCUE_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildRescueUserPrompt(task, action ?? null, currentStepIndex),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('rescue', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiRescueResponse(raw, {
      fallbackReason,
      fallbackActionTitle,
      fallbackCurrentStep,
    }),
    numPredict: RESCUE_NUM_PREDICT,
    repairNumPredict: RESCUE_REPAIR_NUM_PREDICT,
    primaryTimeoutMs: rescueBudget.primaryTimeoutMs,
    repairTimeoutMs: rescueBudget.repairTimeoutMs,
    fallbackTimeoutMs: rescueBudget.fallbackTimeoutMs,
    overallBudgetMs: rescueBudget.overallBudgetMs,
    limitToPrimaryModel: true,
  });
}
