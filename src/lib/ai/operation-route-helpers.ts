import { NextResponse } from 'next/server';
import {
  DEFAULT_AI_START_ACTION,
  getAiInstallActions,
  getAiHealth,
  getModelTier,
  getSynthesisCandidateModels,
  isPrimaryModel,
  markModelFailure,
  markModelSuccess,
  OLLAMA_CPU_SAFE_OPTIONS,
  OLLAMA_CHAT_ENDPOINT,
} from '@/lib/ai/ollama-runtime';
import type { AiFailureReason } from '@/lib/store/idb';
import { AiOperationContractError } from '@/lib/ai/operation-contract';
import {
  type AiOperationPassType,
  isAiTimeoutDetail,
  logAiOperationTelemetry,
  resolveAiOperationPassType,
} from '@/lib/ai/operation-telemetry';

const PRIMARY_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_QWEN_MS || 60000) || 60000;
const REPAIR_TIMEOUT_MS = Number(process.env.AI_REPAIR_TIMEOUT_QWEN_MS || 30000) || 30000;
const FALLBACK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_FALLBACK_MS || 20000) || 20000;
const OVERALL_AI_BUDGET_MS = Number(process.env.AI_OVERALL_TIMEOUT_MS || 120000) || 120000;

type OllamaMessage = { role: string; content: string };
type OllamaChatResponse = {
  message?: { content?: string };
};

export class AiEndpointUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiEndpointUnavailableError';
  }
}

export function classifyFailureReason(reason?: string | null): AiFailureReason {
  if (!reason) return 'unknown';
  const lower = reason.toLowerCase();
  if (lower.includes('timed out')) return 'request_timeout';
  if (lower.includes('model') && lower.includes('not found')) return 'model_missing';
  if (lower.includes('metal')) return 'metal_init_failed';
  if (lower.includes('runner process has terminated')) return 'runtime_boot_failed';
  if (
    lower.includes('could not be reached') ||
    lower.includes('connection refused') ||
    lower.includes('unavailable') ||
    lower.includes('fetch failed')
  ) {
    return 'service_down';
  }
  return 'unknown';
}

export function failureResponse(
  type: string,
  reason: AiFailureReason,
  message: string,
  detail: string | undefined,
  status: number,
  retryable: boolean,
  model?: string,
  actions?: string[],
  telemetry?: {
    passType?: AiOperationPassType;
    durationMs?: number;
    repairUsed?: boolean;
  },
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        type,
        reason,
        message,
        detail,
        retryable,
        model,
        actions,
        telemetry,
      },
    },
    { status },
  );
}

function remainingBudget(deadline: number) {
  return deadline - Date.now();
}

function resolvePassTimeout(deadline: number, preferredTimeoutMs: number) {
  const remaining = remainingBudget(deadline);
  if (remaining < 1000) {
    throw new AiEndpointUnavailableError(`AI request timed out after ${OVERALL_AI_BUDGET_MS}ms`);
  }
  return Math.min(preferredTimeoutMs, remaining);
}

async function fetchFromModel(options: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  numPredict: number;
}) {
  const { model, systemPrompt, userPrompt, timeoutMs, numPredict } = options;
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OLLAMA_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        format: 'json',
        stream: false,
        keep_alive: '5m',
        options: {
          ...OLLAMA_CPU_SAFE_OPTIONS,
          temperature: 0,
          num_predict: numPredict,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new AiEndpointUnavailableError(`Ollama returned ${res.status} ${res.statusText}`);
    }

    let data: OllamaChatResponse;
    try {
      data = (await res.json()) as OllamaChatResponse;
    } catch {
      throw new AiEndpointUnavailableError('Ollama returned a non-JSON HTTP payload');
    }

    const text = data.message?.content || '';
    if (typeof text !== 'string' || !text.trim()) {
      throw new AiEndpointUnavailableError('Ollama returned an empty synthesis payload');
    }

    return text;
  } catch (error) {
    if (error instanceof AiEndpointUnavailableError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiEndpointUnavailableError(`AI request timed out after ${timeoutMs}ms`);
    }
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      throw new AiEndpointUnavailableError('Ollama endpoint could not be reached');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function describeValidationError(error: AiOperationContractError) {
  return `${error.kind}: ${error.message}`;
}

export async function runAiOperation<T>(options: {
  operationName: string;
  systemPrompt: string;
  repairPrompt: string;
  userPrompt: string;
  buildRepairUserPrompt: (invalidOutput: string, failureDetail?: string) => string;
  parse: (raw: string) => T;
  numPredict?: number;
  repairNumPredict?: number;
  primaryTimeoutMs?: number;
  repairTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  overallBudgetMs?: number;
  limitToPrimaryModel?: boolean;
}) {
  const {
    operationName,
    systemPrompt,
    repairPrompt,
    userPrompt,
    buildRepairUserPrompt,
    parse,
    numPredict = 420,
    repairNumPredict = Math.max(480, numPredict),
    primaryTimeoutMs = PRIMARY_TIMEOUT_MS,
    repairTimeoutMs = REPAIR_TIMEOUT_MS,
    fallbackTimeoutMs = FALLBACK_TIMEOUT_MS,
    overallBudgetMs = OVERALL_AI_BUDGET_MS,
    limitToPrimaryModel = false,
  } = options;

  const deadline = Date.now() + overallBudgetMs;
  const operationStartedAt = Date.now();
  const health = await getAiHealth();

  if (health.status === 'model_missing') {
    return failureResponse(
      'ollama_unavailable',
      'model_missing',
      'ยังไม่พบโมเดลในเครื่อง',
      health.detail ?? health.reason,
      503,
      false,
      health.model,
      health.actions,
    );
  }

  const allCandidates = await getSynthesisCandidateModels();
  const candidates = limitToPrimaryModel
    ? (() => {
        const primaryOnly = allCandidates.filter((model) => isPrimaryModel(model));
        if (primaryOnly.length > 0) return primaryOnly;
        return allCandidates.slice(0, 1);
      })()
    : allCandidates;
  let lastEndpointReason: string | null = null;
  let lastValidationReason = `${operationName}: validation_failed`;
  let lastFailedModel: string | undefined;
  let lastFailurePassType: AiOperationPassType | undefined;
  let lastFailureRepairUsed = false;

  const finalize = (
    value: T,
    model: string,
    repairUsed: boolean,
    passType: 'primary_pass' | 'repair_pass' | 'fallback_pass',
  ) => {
    if (value && typeof value === 'object' && 'meta' in (value as object)) {
      const record = value as Record<string, unknown>;
      const meta = record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
        ? record.meta as Record<string, unknown>
        : {};
      return {
        ...record,
        meta: {
          ...meta,
          model,
          passType,
          durationMs: Date.now() - operationStartedAt,
          repairUsed,
        },
      } as T;
    }

    return value;
  };

  for (const model of candidates) {
    const modelTier = getModelTier(model) === 'primary' ? 'primary' : 'fallback';
    let rawOutput: string;

    try {
      rawOutput = await fetchFromModel({
        model,
        systemPrompt,
        userPrompt,
        timeoutMs: resolvePassTimeout(deadline, isPrimaryModel(model) ? primaryTimeoutMs : fallbackTimeoutMs),
        numPredict,
      });
    } catch (error) {
      if (!(error instanceof AiEndpointUnavailableError)) throw error;
      markModelFailure(model, error.message);
      lastEndpointReason = error.message;
      lastFailedModel = model;
      logAiOperationTelemetry({
        operationName,
        passType: isAiTimeoutDetail(error.message) ? 'timeout' : 'endpoint_failed',
        model,
        modelTier,
        attemptStage: modelTier === 'fallback' ? 'fallback' : 'primary',
        repairUsed: false,
        durationMs: Date.now() - operationStartedAt,
        detail: error.message,
      });
      lastFailurePassType = isAiTimeoutDetail(error.message) ? 'timeout' : 'endpoint_failed';
      lastFailureRepairUsed = false;
      console.warn(`[MIND] ${operationName} endpoint failed for model ${model}.`, error.message);
      continue;
    }

    try {
      const validated = parse(rawOutput);
      markModelSuccess(model);
      const passType = resolveAiOperationPassType({ repairUsed: false, modelTier });
      logAiOperationTelemetry({
        operationName,
        passType,
        model,
        modelTier,
        attemptStage: modelTier === 'fallback' ? 'fallback' : 'primary',
        repairUsed: false,
        durationMs: Date.now() - operationStartedAt,
      });
      return NextResponse.json(finalize(validated, model, false, passType));
    } catch (error) {
      if (!(error instanceof AiOperationContractError)) throw error;

      lastValidationReason = describeValidationError(error);
      lastFailedModel = model;
      console.warn(
        `[MIND] ${operationName} contract-invalid output from model ${model}; attempting repair.`,
        error.kind,
        error.message,
      );

      try {
        const repairedRaw = await fetchFromModel({
          model,
          systemPrompt: repairPrompt,
          userPrompt: buildRepairUserPrompt(rawOutput, lastValidationReason),
          timeoutMs: resolvePassTimeout(deadline, isPrimaryModel(model) ? repairTimeoutMs : fallbackTimeoutMs),
          numPredict: repairNumPredict,
        });
        const repaired = parse(repairedRaw);
        markModelSuccess(model);
        const passType = resolveAiOperationPassType({ repairUsed: true, modelTier });
        logAiOperationTelemetry({
          operationName,
          passType,
          model,
          modelTier,
          attemptStage: modelTier === 'fallback' ? 'fallback' : 'repair',
          repairUsed: true,
          durationMs: Date.now() - operationStartedAt,
        });
        return NextResponse.json(finalize(repaired, model, true, passType));
      } catch (repairError) {
        if (repairError instanceof AiEndpointUnavailableError) {
          markModelFailure(model, repairError.message);
          lastEndpointReason = repairError.message;
          lastFailedModel = model;
          logAiOperationTelemetry({
            operationName,
            passType: isAiTimeoutDetail(repairError.message) ? 'timeout' : 'endpoint_failed',
            model,
            modelTier,
            attemptStage: modelTier === 'fallback' ? 'fallback' : 'repair',
            repairUsed: true,
            durationMs: Date.now() - operationStartedAt,
            detail: repairError.message,
          });
          lastFailurePassType = isAiTimeoutDetail(repairError.message) ? 'timeout' : 'endpoint_failed';
          lastFailureRepairUsed = true;
          console.warn(`[MIND] ${operationName} repair endpoint failed for model ${model}.`, repairError.message);
          continue;
        }
        if (repairError instanceof AiOperationContractError) {
          lastValidationReason = describeValidationError(repairError);
          lastFailedModel = model;
          logAiOperationTelemetry({
            operationName,
            passType: 'validation_failed',
            model,
            modelTier,
            attemptStage: modelTier === 'fallback' ? 'fallback' : 'repair',
            repairUsed: true,
            durationMs: Date.now() - operationStartedAt,
            detail: lastValidationReason,
          });
          lastFailurePassType = 'validation_failed';
          lastFailureRepairUsed = true;
          console.error(
            `[MIND] ${operationName} repair output still failed for model ${model}.`,
            repairError.kind,
            repairError.message,
          );
          continue;
        }
        throw repairError;
      }
    }
  }

  if (lastEndpointReason) {
    const failedModelTier = getModelTier(lastFailedModel) === 'primary' ? 'primary' : 'fallback';
    logAiOperationTelemetry({
      operationName,
      passType: isAiTimeoutDetail(lastEndpointReason) ? 'timeout' : 'endpoint_failed',
      model: lastFailedModel,
      modelTier: failedModelTier,
      attemptStage: lastFailureRepairUsed ? 'repair' : failedModelTier === 'fallback' ? 'fallback' : 'primary',
      repairUsed: lastFailureRepairUsed,
      durationMs: Date.now() - operationStartedAt,
      detail: lastEndpointReason,
    });
    return failureResponse(
      'ollama_unavailable',
      classifyFailureReason(lastEndpointReason),
      'ไม่สามารถเชื่อมต่อ Ollama ได้ในขณะนี้',
      lastEndpointReason,
      503,
      true,
      lastFailedModel,
      [DEFAULT_AI_START_ACTION, ...getAiInstallActions()],
      {
        passType: lastFailurePassType ?? (isAiTimeoutDetail(lastEndpointReason) ? 'timeout' : 'endpoint_failed'),
        durationMs: Date.now() - operationStartedAt,
        repairUsed: lastFailureRepairUsed,
      },
    );
  }

  logAiOperationTelemetry({
    operationName,
    passType: 'validation_failed',
    model: lastFailedModel,
    modelTier: getModelTier(lastFailedModel) === 'primary' ? 'primary' : 'fallback',
    attemptStage:
      lastFailureRepairUsed
        ? 'repair'
        : getModelTier(lastFailedModel) !== 'primary'
          ? 'fallback'
          : 'primary',
    repairUsed: lastFailureRepairUsed,
    durationMs: Date.now() - operationStartedAt,
    detail: lastValidationReason,
  });
  return failureResponse(
    'validation_failed',
    'unknown',
    'โมเดลตอบกลับในรูปแบบที่ไม่ถูกต้อง',
    lastValidationReason,
    422,
    true,
    lastFailedModel,
    undefined,
    {
      passType: lastFailurePassType ?? 'validation_failed',
      durationMs: Date.now() - operationStartedAt,
      repairUsed: lastFailureRepairUsed,
    },
  );
}
