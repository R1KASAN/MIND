import type { Action, TaskContext } from '@/lib/store/idb';
import { parseAiRescueResponse } from '@/lib/ai/operation-contract';
import { buildManualRescueResponse, resolveRescueRouteBudget } from '@/lib/ai/rescue-runtime';
import { logAiOperationTelemetry } from '@/lib/ai/operation-telemetry';
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

const RESCUE_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_RESCUE || 120) || 120;
const RESCUE_REPAIR_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_RESCUE_REPAIR || 160) || 160;
const RESCUE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_MS || 10000) || 10000;
const RESCUE_REPAIR_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_REPAIR_MS || 6000) || 6000;
const RESCUE_FALLBACK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_RESCUE_FALLBACK_MS || 6000) || 6000;
const RESCUE_OVERALL_BUDGET_MS = Number(process.env.AI_OVERALL_TIMEOUT_RESCUE_MS || 18000) || 18000;

function buildDeterministicMissingContextRescue(task: TaskContext, action: Action | undefined, currentStepIndex: number) {
  const currentStep =
    action?.microSteps[currentStepIndex] ??
    action?.microSteps[0] ??
    task.currentPlan?.steps[currentStepIndex]?.text ??
    task.currentPlan?.steps[0]?.text ??
    action?.title ??
    task.currentPlan?.actionTitle ??
    'ก้าวนี้';

  return {
    diagnosis: {
      primaryReason: 'missing_context' as const,
      explanation: 'ตอนนี้บริบทยังไม่พอจะขยับก้าวนี้ต่อได้อย่างมั่นใจ จึงต้องกู้ข้อมูลที่ขาดก่อน',
    },
    rescuePlan: {
      mode: 'clarify' as const,
      steps: [
        'ระบุให้ชัดว่าตอนนี้ยังขาดไฟล์หรือข้อมูลชิ้นไหน',
        `เปิดหรือแนบสิ่งที่ต้องใช้กับ "${currentStep}" ก่อน`,
        'ถ้ายังไม่มีไฟล์ ให้พิมพ์สรุปสิ่งที่รู้ตอนนี้ 2-3 บรรทัดเพื่อให้ MIND ไปต่อได้',
      ],
    },
    suggestedMessage: 'ตอนนี้ยังขาดไฟล์หรือบริบทบางส่วน ช่วยแนบสิ่งที่เกี่ยวข้องหรือพิมพ์สรุปสั้น ๆ เพิ่มอีกนิด แล้ว MIND จะช่วยต่อจากตรงนั้นได้ทันที',
    meta: {
      model: 'deterministic_missing_context',
      usedRoomFiles: task.sourceFiles.filter((file) => file.status === 'ready').map((file) => file.name),
      repairUsed: false,
      passType: 'fallback_pass' as const,
      durationMs: 0,
    },
  };
}

async function readAiFailure(response: Response) {
  const body = await response.json().catch(() => null) as {
    error?: {
      detail?: string;
      message?: string;
      model?: string;
      telemetry?: {
        durationMs?: number;
        repairUsed?: boolean;
      };
    };
  } | null;

  return {
    detail: body?.error?.detail ?? body?.error?.message,
    model: body?.error?.model,
    durationMs: body?.error?.telemetry?.durationMs,
    repairUsed: body?.error?.telemetry?.repairUsed ?? false,
  };
}

export async function POST(req: Request) {
  const routeStartedAt = Date.now();
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
      : task.blockerSignals.includes('dependency')
        ? 'dependency'
        : task.blockerSignals.includes('unclear_scope')
          ? 'unclear_scope'
          : task.blockerSignals.includes('low_energy')
            ? 'low_energy'
            : task.blockerSignals.includes('too_big') || task.lifecycleState === 'stalled'
              ? 'too_big'
              : 'unknown';
  const fallbackActionTitle = action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective;
  const fallbackCurrentStep =
    action?.microSteps[currentStepIndex] ??
    action?.microSteps[0] ??
    task.currentPlan?.steps[currentStepIndex]?.text ??
    task.currentPlan?.steps[0]?.text ??
    fallbackActionTitle;
  const missingContextOnly =
    task.blockerSignals.includes('missing_file_or_context') &&
    task.blockerSignals.every((signal) => signal === 'missing_file_or_context');

  if (missingContextOnly) {
    return Response.json(buildDeterministicMissingContextRescue(task, action, currentStepIndex));
  }

  const rescueBudget = resolveRescueRouteBudget({
    primaryTimeoutMs: RESCUE_TIMEOUT_MS,
    repairTimeoutMs: RESCUE_REPAIR_TIMEOUT_MS,
    fallbackTimeoutMs: RESCUE_FALLBACK_TIMEOUT_MS,
    overallBudgetMs: RESCUE_OVERALL_BUDGET_MS,
  }, retryContext);

  const aiResponse = await runAiOperation({
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
  });

  if (aiResponse.ok) return aiResponse;

  const failure = await readAiFailure(aiResponse);
  const durationMs = failure.durationMs ?? Date.now() - routeStartedAt;
  logAiOperationTelemetry({
    operationName: 'rescue',
    passType: 'fallback_pass',
    model: failure.model ? `manual_rescue_after_${failure.model}` : 'manual_rescue',
    modelTier: 'fallback',
    attemptStage: 'fallback',
    repairUsed: failure.repairUsed,
    durationMs,
    detail: failure.detail ? `manual rescue returned after AI failure: ${failure.detail}` : 'manual rescue returned after AI failure',
  });

  return Response.json(
    buildManualRescueResponse({
      task,
      action,
      currentStepIndex,
      durationMs,
      failedModel: failure.model,
      failureDetail: failure.detail,
    }),
    { status: 200, headers: { 'x-mind-ai-fallback': 'manual_rescue' } },
  );
}
