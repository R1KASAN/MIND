import type { TaskContext } from '@/lib/store/idb';
import { AiActionNegotiationModeSchema } from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import { getAiClient } from '@/lib/ai/client';
import { buildManualActionResponse } from '@/lib/ai/manual-fallbacks';
import { handleAiRouteError } from '@/lib/ai/operation-route-helpers';
import { logAiOperationTelemetry } from '@/lib/ai/operation-telemetry';
import type { AiIntakeResponse } from '@/lib/ai/operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 380 tokens: enough for chosenAction (title/rationale/successSignal) +
// alternatives x3 + whyThisNow + situationSummary + meta.
// Old default of 180 consistently truncated Thai text mid-field.
const ACTION_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_ACTION || 380) || 380;
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
  const routeStartedAt = Date.now();
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

  try {
    const aiResponse = await getAiClient().runAction(task, {
      preferredCandidate,
      evidenceContext,
      negotiation,
    });
    return Response.json(aiResponse);
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AiRouteError') {
      const durationMs = (error as any).telemetry?.durationMs ?? Date.now() - routeStartedAt;
      const model = (error as any).model;
      const detail = (error as any).detail;
      const repairUsed = (error as any).telemetry?.repairUsed ?? false;

      console.warn('[MIND][AI_FALLBACK] Local Gemma failed, using manual response', {
        operation: 'action',
        backend: 'local_gemma',
        nextBackend: 'manual',
        reason: (error as any).reason ?? 'unknown',
      });
      logAiOperationTelemetry({
        operationName: 'action',
        passType: 'fallback_pass',
        model: model ? `manual_action_after_${model}` : 'manual_action',
        modelTier: 'fallback',
        attemptStage: 'fallback',
        repairUsed,
        durationMs,
        detail: detail ? `manual action returned after AI failure: ${detail}` : 'manual action returned after AI failure',
      });

      return Response.json(
        buildManualActionResponse({
          task,
          preferredCandidate,
          durationMs,
          failedModel: model,
          negotiationMode: negotiation?.mode,
        }),
        { status: 200, headers: { 'x-mind-ai-fallback': 'manual_action' } },
      );
    }
    return handleAiRouteError(error);
  }
}
