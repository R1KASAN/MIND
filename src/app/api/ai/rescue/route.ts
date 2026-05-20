import type { Action, TaskContext } from '@/lib/store/idb';
import { parseAiRescueResponse } from '@/lib/ai/operation-contract';
import { buildManualRescueResponse, inferRescueFallbackReason, resolveRescueRouteBudget } from '@/lib/ai/rescue-runtime';
import { getAiClient } from '@/lib/ai/client';
import { handleAiRouteError } from '@/lib/ai/operation-route-helpers';
import { buildOperationTaskContext } from '@/lib/ai/operation-prompts';
import { logAiOperationTelemetry } from '@/lib/ai/operation-telemetry';

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
  const fallbackReason = inferRescueFallbackReason(task);
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

  try {
    const aiResponse = await getAiClient().runRescue(task, { action, currentStepIndex, retryContext });
    return Response.json(aiResponse);
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AiRouteError') {
      const durationMs = (error as any).telemetry?.durationMs ?? Date.now() - routeStartedAt;
      const model = (error as any).model;
      const detail = (error as any).detail;
      const repairUsed = (error as any).telemetry?.repairUsed ?? false;

      logAiOperationTelemetry({
        operationName: 'rescue',
        passType: 'fallback_pass',
        model: model ? `manual_rescue_after_${model}` : 'manual_rescue',
        modelTier: 'fallback',
        attemptStage: 'fallback',
        repairUsed,
        durationMs,
        detail: detail ? `manual rescue returned after AI failure: ${detail}` : 'manual rescue returned after AI failure',
      });

      return Response.json(
        buildManualRescueResponse({
          task,
          action,
          currentStepIndex,
          durationMs,
          failedModel: model,
          failureDetail: detail,
        }),
        { status: 200, headers: { 'x-mind-ai-fallback': 'manual_rescue' } },
      );
    }
    return handleAiRouteError(error);
  }
}
