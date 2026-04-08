import type { Action, TaskContext } from '@/lib/store/idb';
import { parseAiScaffoldResponse } from '@/lib/ai/operation-contract';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  buildScaffoldUserPrompt,
  SCAFFOLD_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCAFFOLD_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_SCAFFOLD || 180) || 180;
const SCAFFOLD_REPAIR_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_SCAFFOLD_REPAIR || 220) || 220;
const SCAFFOLD_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_SCAFFOLD_MS || 32000) || 32000;
const SCAFFOLD_REPAIR_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_SCAFFOLD_REPAIR_MS || 16000) || 16000;
const SCAFFOLD_FALLBACK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_SCAFFOLD_FALLBACK_MS || 18000) || 18000;
const SCAFFOLD_OVERALL_BUDGET_MS = Number(process.env.AI_OVERALL_TIMEOUT_SCAFFOLD_MS || 52000) || 52000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const action = body?.action as Action | undefined;
  const currentStepIndex = typeof body?.currentStepIndex === 'number' ? body.currentStepIndex : 0;

  if (!task?.sourceText || typeof task.sourceText !== 'string' || !action?.title) {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_scaffold_input',
        reason: 'unknown',
        message: 'ข้อมูลสำหรับ scaffold ไม่ครบ',
        detail: 'task and action are required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  return runAiOperation({
    operationName: 'scaffold',
    systemPrompt: SCAFFOLD_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildScaffoldUserPrompt(task, action, currentStepIndex),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('scaffold', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiScaffoldResponse(raw, {
      fallbackPlanTitle: action.title,
      fallbackCurrentStep: action.microSteps[currentStepIndex] ?? action.microSteps[0] ?? action.title,
      fallbackSteps: action.microSteps,
      fallbackCurrentStepIndex: currentStepIndex,
    }),
    numPredict: SCAFFOLD_NUM_PREDICT,
    repairNumPredict: SCAFFOLD_REPAIR_NUM_PREDICT,
    primaryTimeoutMs: SCAFFOLD_TIMEOUT_MS,
    repairTimeoutMs: SCAFFOLD_REPAIR_TIMEOUT_MS,
    fallbackTimeoutMs: SCAFFOLD_FALLBACK_TIMEOUT_MS,
    overallBudgetMs: SCAFFOLD_OVERALL_BUDGET_MS,
    limitToPrimaryModel: true,
  });
}
