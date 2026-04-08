import { NextResponse } from 'next/server';
import {
  getAiHealth,
  getSynthesisCandidateModels,
  markModelFailure,
  markModelSuccess,
  OLLAMA_CHAT_ENDPOINT,
} from '@/lib/ai/ollama-runtime';
import {
  AI_REPAIR_PROMPT,
  buildRepairUserPrompt,
  SYSTEM_PROMPT,
} from '@/lib/ai/prompts';
import {
  AiContractError,
  type AiValidationFailureKind,
  parseAiSynthesisResponse,
} from '@/lib/ai/contract';
import type { AiFailureReason } from '@/lib/store/idb';

const PRIMARY_MODEL = process.env.AI_MODEL || 'qwen2.5:3b';
const QWEN_SYNTHESIS_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_QWEN_MS || 60000) || 60000;
const QWEN_REPAIR_TIMEOUT_MS = Number(process.env.AI_REPAIR_TIMEOUT_QWEN_MS || 30000) || 30000;
const FALLBACK_SYNTHESIS_TIMEOUT_MS =
  Number(process.env.AI_TIMEOUT_FALLBACK_MS || 20000) || 20000;
const FALLBACK_REPAIR_TIMEOUT_MS =
  Number(process.env.AI_REPAIR_TIMEOUT_FALLBACK_MS || 20000) || 20000;
const OVERALL_AI_BUDGET_MS = Number(process.env.AI_OVERALL_TIMEOUT_MS || 120000) || 120000;

type OllamaMessage = { role: string; content: string };
type OllamaChatResponse = {
  message?: { content?: string };
  done?: boolean;
};

class AiEndpointUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiEndpointUnavailableError';
  }
}

function classifyFailureReason(reason?: string | null): AiFailureReason {
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

function failureResponse(
  type: string,
  reason: AiFailureReason,
  message: string,
  detail: string | undefined,
  status: number,
  retryable: boolean,
  model?: string,
  actions?: string[],
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
      },
    },
    { status },
  );
}

function isPrimaryModel(model: string) {
  return model.startsWith(PRIMARY_MODEL.split(':')[0]);
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

function describeValidationError(kind: AiValidationFailureKind, message: string) {
  return `${kind}: ${message}`;
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
    if (error instanceof AiEndpointUnavailableError) {
      throw error;
    }

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

async function fetchSynthesisRaw(options: {
  dump: string;
  model: string;
  deadline: number;
}) {
  const timeoutMs = resolvePassTimeout(
    options.deadline,
    isPrimaryModel(options.model) ? QWEN_SYNTHESIS_TIMEOUT_MS : FALLBACK_SYNTHESIS_TIMEOUT_MS,
  );
  return fetchFromModel({
    model: options.model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: options.dump,
    timeoutMs,
    numPredict: 420,
  });
}

async function attemptRepair(options: {
  dump: string;
  invalidOutput: string;
  model: string;
  deadline: number;
  failureDetail?: string;
}) {
  const timeoutMs = resolvePassTimeout(
    options.deadline,
    isPrimaryModel(options.model) ? QWEN_REPAIR_TIMEOUT_MS : FALLBACK_REPAIR_TIMEOUT_MS,
  );
  const raw = await fetchFromModel({
    model: options.model,
    systemPrompt: AI_REPAIR_PROMPT,
    userPrompt: buildRepairUserPrompt(options.dump, options.invalidOutput, options.failureDetail),
    timeoutMs,
    numPredict: 480,
  });

  try {
    return {
      raw,
      validated: parseAiSynthesisResponse(raw),
    };
  } catch (error) {
    if (error instanceof AiContractError) {
      throw new AiContractError('repair_failed', error.message);
    }
    throw error;
  }
}

export async function GET() {
  const health = await getAiHealth();
  return NextResponse.json(health);
}

export async function POST(req: Request) {
  const deadline = Date.now() + OVERALL_AI_BUDGET_MS;

  try {
    const body = await req.json().catch(() => null);
    const dump = body?.dump;

    if (!dump || typeof dump !== 'string') {
      return failureResponse(
        'invalid_dump',
        'unknown',
        'ข้อความที่ส่งมาไม่ถูกต้อง',
        'Invalid or empty dump content',
        400,
        false,
      );
    }

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

    const candidates = await getSynthesisCandidateModels();
    let lastEndpointReason: string | null = null;
    let lastValidationReason = 'validation_failed: AI output did not satisfy the MIND contract';
    let lastFailedModel: string | undefined;

    for (const model of candidates) {
      let rawOutput: string;

      try {
        rawOutput = await fetchSynthesisRaw({ dump, model, deadline });
      } catch (error) {
        if (!(error instanceof AiEndpointUnavailableError)) throw error;

        markModelFailure(model, error.message);
        lastEndpointReason = error.message;
        lastFailedModel = model;
        console.warn(`[MIND] Model ${model} synthesis endpoint failed.`, error.message);
        continue;
      }

      try {
        const validated = parseAiSynthesisResponse(rawOutput);
        markModelSuccess(model);
        return NextResponse.json(validated);
      } catch (error) {
        if (!(error instanceof AiContractError)) throw error;

        lastValidationReason = describeValidationError(error.kind, error.message);
        lastFailedModel = model;
        console.warn(
          `[MIND] Model ${model} returned contract-invalid output; attempting repair.`,
          error.kind,
          error.message,
        );

        try {
          const repair = await attemptRepair({
            dump,
            invalidOutput: rawOutput,
            model,
            deadline,
            failureDetail: lastValidationReason,
          });

          markModelSuccess(model);
          return NextResponse.json(repair.validated);
        } catch (repairError) {
          if (repairError instanceof AiEndpointUnavailableError) {
            markModelFailure(model, repairError.message);
            lastEndpointReason = repairError.message;
            lastFailedModel = model;
            console.warn(`[MIND] Model ${model} repair endpoint failed.`, repairError.message);
            continue;
          }

          if (repairError instanceof AiContractError) {
            lastValidationReason = describeValidationError(repairError.kind, repairError.message);
            lastFailedModel = model;
            console.error(
              `[MIND] Model ${model} repair output still failed the contract.`,
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
      return failureResponse(
        'ollama_unavailable',
        classifyFailureReason(lastEndpointReason),
        'ไม่สามารถเชื่อมต่อ Ollama ได้ในขณะนี้',
        lastEndpointReason,
        503,
        true,
        lastFailedModel,
        ['ollama serve', 'ollama pull qwen2.5:3b'],
      );
    }

    return failureResponse(
      'validation_failed',
      'unknown',
      'โมเดลตอบกลับในรูปแบบที่ไม่ถูกต้อง',
      lastValidationReason,
      422,
      true,
      lastFailedModel,
    );
  } catch (error: unknown) {
    console.error('[MIND] Uncaught error in AI route:', error);
    const detail = error instanceof Error ? error.message : 'Unexpected AI route error';
    return failureResponse('route_error', 'unknown', 'เกิดข้อผิดพลาดระหว่างเรียก AI', detail, 500, true);
  }
}
