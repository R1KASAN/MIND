import { createTaskContext, type TaskContext } from '@/lib/store/idb';
import { getAiClient } from '@/lib/ai/client';
import { buildManualIntakeResponse } from '@/lib/ai/manual-fallbacks';
import { handleAiRouteError } from '@/lib/ai/operation-route-helpers';
import { logAiOperationTelemetry } from '@/lib/ai/operation-telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IntakeTaskRequest = Pick<TaskContext, 'sourceText'> & Partial<Pick<
  TaskContext,
  | 'workflowType'
  | 'taskShape'
  | 'taskFrame'
  | 'sourceFiles'
  | 'extractedText'
  | 'pendingInputs'
  | 'blockerSignals'
  | 'constraints'
  | 'assistantMode'
  | 'lastAiOperation'
>>;

function normalizeIntakeTaskRequest(task: IntakeTaskRequest): TaskContext {
  return {
    ...createTaskContext({
      sourceText: task.sourceText,
      workflowType: task.workflowType,
      taskShape: task.taskShape,
      sourceFiles: task.sourceFiles,
      extractedText: task.extractedText,
      pendingInputs: task.pendingInputs,
      blockerSignals: task.blockerSignals,
    }),
    taskFrame: task.taskFrame,
    constraints: task.constraints,
    assistantMode: task.assistantMode,
    lastAiOperation: task.lastAiOperation,
  };
}

export async function POST(req: Request) {
  const routeStartedAt = Date.now();
  const body = await req.json().catch(() => null);
  const taskInput = body?.task as IntakeTaskRequest | undefined;

  if (!taskInput?.sourceText || typeof taskInput.sourceText !== 'string') {
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

  const task = normalizeIntakeTaskRequest(taskInput);

  try {
    const aiResponse = await getAiClient().runIntake(task);
    return Response.json(aiResponse);
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AiRouteError') {
      const durationMs = (error as any).telemetry?.durationMs ?? Date.now() - routeStartedAt;
      const model = (error as any).model;
      const detail = (error as any).detail;
      const repairUsed = (error as any).telemetry?.repairUsed ?? false;

      const isPuterFastManual = (error as any).type === 'puter_timeout_fast_manual';

      console.warn(
        isPuterFastManual
          ? '[MIND][AI_FALLBACK] Puter intake timeout fast-manual response'
          : '[MIND][AI_FALLBACK] Local Gemma failed, using manual response',
        {
          operation: 'intake',
          backend: isPuterFastManual ? 'puter' : 'local_gemma',
          nextBackend: 'manual',
          reason: isPuterFastManual ? 'puter_timeout_fast_manual' : ((error as any).reason ?? 'unknown'),
        },
      );
      logAiOperationTelemetry({
        operationName: 'intake',
        passType: 'fallback_pass',
        model: model ? `manual_intake_after_${model}` : 'manual_intake',
        modelTier: 'fallback',
        attemptStage: 'fallback',
        repairUsed,
        durationMs,
        detail: detail ? `manual intake returned after AI failure: ${detail}` : 'manual intake returned after AI failure',
      });

      return Response.json(
        buildManualIntakeResponse({
          task,
          durationMs,
          failedModel: model,
        }),
        { status: 200, headers: { 'x-mind-ai-fallback': 'manual_intake' } },
      );
    }
    return handleAiRouteError(error);
  }
}
