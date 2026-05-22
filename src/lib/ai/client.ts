import type { TaskContext, Action } from '@/lib/store/idb';
import puterSdk, { type Puter } from '@heyputer/puter.js';
import type {
  AiIntakeResponse,
  AiActionResponse,
  AiRescueResponse
} from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';
import {
  AiOperationContractError,
  parseAiIntakeResponse,
  parseAiActionResponse,
  parseAiRescueResponse
} from '@/lib/ai/operation-contract';
import {
  buildTaskFrameFallback,
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
  buildActionFallbackCopy,
  shouldGenerateReplyDraft
} from '@/lib/ai/task-shape';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildIntakeUserPrompt,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  INTAKE_SYSTEM_PROMPT,
  PUTER_INTAKE_SYSTEM_PROMPT,
  ACTION_SYSTEM_PROMPT,
  PUTER_ACTION_SYSTEM_PROMPT,
  buildActionTaskContext,
  buildActionUserPrompt,
  buildPuterActionUserPrompt,
  buildPuterIntakeUserPrompt,
  buildPuterRescueUserPrompt,
  buildRescueUserPrompt,
  RESCUE_SYSTEM_PROMPT,
  PUTER_RESCUE_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { inferRescueFallbackReason, resolveRescueRouteBudget } from '@/lib/ai/rescue-runtime';
import { maskTaskContextForExternalLLM } from '@/lib/ai/masking';

type AiOperationName = 'intake' | 'action' | 'rescue';

type PuterFailureReason =
  | 'puter_timeout'
  | 'puter_contract_invalid'
  | 'puter_auth_error'
  | 'puter_network_error'
  | 'puter_empty_response'
  | 'puter_circuit_open'
  | 'puter_error';

type PuterRawResponseCategory =
  | 'empty'
  | 'non_json_text'
  | 'json_with_prose_or_fence'
  | 'json_missing_required_fields'
  | 'contract_invalid'
  | 'contract_valid';

type PuterCallMeta = {
  operation: AiOperationName;
  model: string;
  timeoutMs: number;
  startedAt: number;
};

type GroqFailureReason =
  | 'groq_timeout'
  | 'groq_contract_invalid'
  | 'groq_auth_error'
  | 'groq_quota_error'
  | 'groq_server_error'
  | 'groq_network_error'
  | 'groq_empty_response'
  | 'groq_circuit_open'
  | 'groq_error';

type GroqCallMeta = {
  operation: 'action' | 'rescue';
  provider: 'groq';
  circuitKey: 'groq:action' | 'groq:rescue';
  model: string;
  timeoutMs: number;
  startedAt: number;
};

class PuterOperationError extends Error {
  constructor(
    message: string,
    public reason: PuterFailureReason,
    public operation: AiOperationName,
    public model: string,
    public elapsedMs: number,
    public timeoutMs: number,
    public cause?: unknown,
    public openUntil?: number,
  ) {
    super(message);
    this.name = 'PuterOperationError';
  }
}

class GroqOperationError extends Error {
  constructor(
    message: string,
    public reason: GroqFailureReason,
    public meta: GroqCallMeta,
    public elapsedMs: number,
    public status?: number,
    public cause?: unknown,
    public openUntil?: number,
  ) {
    super(message);
    this.name = 'GroqOperationError';
  }
}

type PuterCircuitState = {
  failureTimestamps: number[];
  openUntil: number;
  probeInFlight: boolean;
};

export interface PuterCircuitBreakerSnapshot {
  failureTimestamps: number[];
  openUntil: number;
  probeInFlight: boolean;
}

type PuterCircuitGate =
  | {
      skip: true;
      reason: 'puter_circuit_open';
      openUntil: number;
    }
  | {
      skip: false;
    };

const DEFAULT_PUTER_CIRCUIT_FAILURE_THRESHOLD = 3;
const DEFAULT_PUTER_CIRCUIT_WINDOW_MS = 60_000;
const DEFAULT_PUTER_CIRCUIT_COOLDOWN_MS = 300_000;
const PUTER_OPERATION_NAMES: AiOperationName[] = ['intake', 'action', 'rescue'];
const DEFAULT_PUTER_CIRCUIT_TEST_OPERATION: AiOperationName = 'intake';
const PUTER_CIRCUIT_OPEN_HINT_THRESHOLD = 2;

function createPuterCircuitState(): PuterCircuitState {
  return {
    failureTimestamps: [],
    openUntil: 0,
    probeInFlight: false,
  };
}

const puterCircuitStates: Record<AiOperationName, PuterCircuitState> = {
  intake: createPuterCircuitState(),
  action: createPuterCircuitState(),
  rescue: createPuterCircuitState(),
};

const puterCircuitOpenFallbackCounts: Record<AiOperationName, number> = {
  intake: 0,
  action: 0,
  rescue: 0,
};

const groqActionCircuitState = createPuterCircuitState();
let groqActionCircuitOpenFallbackCount = 0;

const groqRescueCircuitState = createPuterCircuitState();
let groqRescueCircuitOpenFallbackCount = 0;

function getPuterCircuitState(operation: AiOperationName) {
  return puterCircuitStates[operation];
}

function resetPuterCircuitState(operation?: AiOperationName) {
  const operations = operation ? [operation] : PUTER_OPERATION_NAMES;
  for (const operationName of operations) {
    const state = getPuterCircuitState(operationName);
    state.failureTimestamps = [];
    state.openUntil = 0;
    state.probeInFlight = false;
    puterCircuitOpenFallbackCounts[operationName] = 0;
  }
}

export function resetPuterCircuitBreakerStateForTest(operation?: AiOperationName) {
  resetPuterCircuitState(operation);
}

export function getPuterCircuitBreakerStateForTest(operation: AiOperationName = DEFAULT_PUTER_CIRCUIT_TEST_OPERATION): PuterCircuitBreakerSnapshot {
  const state = getPuterCircuitState(operation);
  return {
    failureTimestamps: [...state.failureTimestamps],
    openUntil: state.openUntil,
    probeInFlight: state.probeInFlight,
  };
}

export function seedPuterCircuitBreakerStateForTest(
  snapshot: Partial<PuterCircuitBreakerSnapshot>,
  operation: AiOperationName = DEFAULT_PUTER_CIRCUIT_TEST_OPERATION,
) {
  const state = getPuterCircuitState(operation);
  state.failureTimestamps = snapshot.failureTimestamps ? [...snapshot.failureTimestamps] : [];
  state.openUntil = snapshot.openUntil ?? 0;
  state.probeInFlight = snapshot.probeInFlight ?? false;
}

export function resetGroqActionCircuitBreakerStateForTest() {
  groqActionCircuitState.failureTimestamps = [];
  groqActionCircuitState.openUntil = 0;
  groqActionCircuitState.probeInFlight = false;
  groqActionCircuitOpenFallbackCount = 0;
}

export function getGroqActionCircuitBreakerStateForTest(): PuterCircuitBreakerSnapshot {
  return {
    failureTimestamps: [...groqActionCircuitState.failureTimestamps],
    openUntil: groqActionCircuitState.openUntil,
    probeInFlight: groqActionCircuitState.probeInFlight,
  };
}

export function resetGroqRescueCircuitBreakerStateForTest() {
  groqRescueCircuitState.failureTimestamps = [];
  groqRescueCircuitState.openUntil = 0;
  groqRescueCircuitState.probeInFlight = false;
  groqRescueCircuitOpenFallbackCount = 0;
}

export function getGroqRescueCircuitBreakerStateForTest(): PuterCircuitBreakerSnapshot {
  return {
    failureTimestamps: [...groqRescueCircuitState.failureTimestamps],
    openUntil: groqRescueCircuitState.openUntil,
    probeInFlight: groqRescueCircuitState.probeInFlight,
  };
}

export interface AiActionOptions {
  preferredCandidate?: AiIntakeResponse['candidateActions'][number];
  evidenceContext?: ActionEvidenceContext;
  negotiation?: { mode: string; userNote?: string };
}

export interface AiRescueOptions {
  action?: Action;
  currentStepIndex?: number;
  retryContext?: any;
}

export interface AiClient {
  runIntake(task: TaskContext): Promise<AiIntakeResponse>;
  runAction(task: TaskContext, options?: AiActionOptions): Promise<AiActionResponse>;
  runRescue(task: TaskContext, options?: AiRescueOptions): Promise<AiRescueResponse>;
}

export class LocalGemmaClient implements AiClient {
  async runIntake(task: TaskContext): Promise<AiIntakeResponse> {
    const taskContext = buildOperationTaskContext(task);
    const fallbackTaskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
    const fallbackWorkflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
    const fallbackTaskFrame = buildTaskFrameFallback(fallbackWorkflowType, fallbackTaskShape);
    const fallbackRoomDigest = task.sourceText.trim().slice(0, 220) || 'สรุป room นี้จากบริบทที่มีอยู่';
    const fallbackObjective = task.taskFrame?.objective ?? fallbackTaskFrame.objective;
    const fallbackStage = task.taskFrame?.stage ?? fallbackTaskFrame.stage;

    return runAiOperation({
      operationName: 'intake',
      systemPrompt: INTAKE_SYSTEM_PROMPT,
      repairPrompt: AI_OPERATION_REPAIR_PROMPT,
      userPrompt: buildIntakeUserPrompt(task),
      buildRepairUserPrompt: (invalidOutput, failureDetail) =>
        buildOperationRepairUserPrompt('intake', taskContext, invalidOutput, failureDetail),
      parse: (raw) => parseAiIntakeResponse(raw, {
        fallbackSourceText: task.sourceText,
        fallbackTaskShape,
        fallbackWorkflowType,
        fallbackRoomDigest,
        fallbackObjective,
        fallbackStage,
      }),
      numPredict: Number(process.env.AI_NUM_PREDICT_INTAKE || 520) || 520,
      repairNumPredict: Number(process.env.AI_NUM_PREDICT_INTAKE_REPAIR || 560) || 560,
    });
  }

  async runAction(task: TaskContext, options?: AiActionOptions): Promise<AiActionResponse> {
    const { preferredCandidate, evidenceContext, negotiation } = options ?? {};
    const taskContext = buildActionTaskContext(task);
    const fallbackTaskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
    const fallbackWorkflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
    const fallbackActionCopy = buildActionFallbackCopy(fallbackWorkflowType, fallbackTaskShape);
    const preferredTitle = preferredCandidate?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective ?? fallbackActionCopy.chosenTitle;
    const preferredRationale = preferredCandidate?.rationale ?? fallbackActionCopy.chosenRationale;
    const fallbackSuccessSignal = task.currentPlan?.successSignal ?? fallbackActionCopy.successSignal;
    const fallbackWhyThisNow = negotiation?.mode && negotiation.mode !== 'default'
      ? `ตอนนี้กำลังปรับ action ให้ ${negotiation.mode} ขึ้น โดยยังยึดงานเดิมและข้อจำกัดปัจจุบัน`
      : fallbackActionCopy.whyThisNow;
    const fallbackSituationSummary = fallbackActionCopy.situationSummary;
    const fallbackReplyDraft = shouldGenerateReplyDraft(fallbackWorkflowType, fallbackTaskShape)
      ? fallbackActionCopy.replyDraft
      : undefined;
    const hasFileEvidence = (task.sourceFiles ?? []).some((f) => f.status === 'ready');

    const ACTION_NUM_PREDICT = Number(process.env.AI_NUM_PREDICT_ACTION || 380) || 380;

    return runAiOperation({
      operationName: 'action',
      systemPrompt: ACTION_SYSTEM_PROMPT,
      repairPrompt: AI_OPERATION_REPAIR_PROMPT,
      userPrompt: buildActionUserPrompt(task, preferredCandidate ?? null, negotiation as any ?? null, evidenceContext ?? null),
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
        fallbackTaskShape,
        hasFileEvidence,
      }),
      numPredict: ACTION_NUM_PREDICT,
      repairNumPredict: Number(process.env.AI_NUM_PREDICT_ACTION_REPAIR || Math.max(420, ACTION_NUM_PREDICT)) || Math.max(420, ACTION_NUM_PREDICT),
      primaryTimeoutMs: Number(process.env.AI_TIMEOUT_ACTION_QWEN_MS || process.env.AI_TIMEOUT_QWEN_MS || 60000) || 60000,
      repairTimeoutMs: Number(process.env.AI_REPAIR_TIMEOUT_ACTION_QWEN_MS || process.env.AI_REPAIR_TIMEOUT_QWEN_MS || 30000) || 30000,
      fallbackTimeoutMs: Number(process.env.AI_TIMEOUT_ACTION_FALLBACK_MS || process.env.AI_TIMEOUT_FALLBACK_MS || 20000) || 20000,
    });
  }

  async runRescue(task: TaskContext, options?: AiRescueOptions): Promise<AiRescueResponse> {
    const { action, currentStepIndex = 0, retryContext } = options ?? {};
    const taskContext = buildOperationTaskContext(task);
    const fallbackReason = inferRescueFallbackReason(task);
    const fallbackActionTitle = action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective;
    const fallbackCurrentStep =
      action?.microSteps[currentStepIndex] ??
      action?.microSteps[0] ??
      task.currentPlan?.steps[currentStepIndex]?.text ??
      task.currentPlan?.steps[0]?.text ??
      fallbackActionTitle;

    const rescueBudget = resolveRescueRouteBudget({
      primaryTimeoutMs: Number(process.env.AI_TIMEOUT_RESCUE_MS || 10000) || 10000,
      repairTimeoutMs: Number(process.env.AI_TIMEOUT_RESCUE_REPAIR_MS || 6000) || 6000,
      fallbackTimeoutMs: Number(process.env.AI_TIMEOUT_RESCUE_FALLBACK_MS || 6000) || 6000,
      overallBudgetMs: Number(process.env.AI_OVERALL_TIMEOUT_RESCUE_MS || 18000) || 18000,
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
      numPredict: Number(process.env.AI_NUM_PREDICT_RESCUE || 120) || 120,
      repairNumPredict: Number(process.env.AI_NUM_PREDICT_RESCUE_REPAIR || 160) || 160,
      primaryTimeoutMs: rescueBudget.primaryTimeoutMs,
      repairTimeoutMs: rescueBudget.repairTimeoutMs,
      fallbackTimeoutMs: rescueBudget.fallbackTimeoutMs,
      overallBudgetMs: rescueBudget.overallBudgetMs,
    });
  }
}

export function getPuterClient(): Puter {
  const token = process.env.PUTER_API_KEY?.trim();
  if (!token) throw new Error('PUTER_API_KEY is not set');

  puterSdk.setAuthToken(token);
  return puterSdk;
}

function extractPuterResponseText(response: any) {
  const content = response?.message?.content ?? response;
  if (typeof content === 'string') return content.trim();
  if (content === null || content === undefined) return '';
  if (typeof content?.toString === 'function' && content.toString !== Object.prototype.toString) {
    const text = content.toString().trim();
    if (text && text !== '[object Object]') return text;
  }
  return JSON.stringify(content);
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPuterTimeoutMs() {
  return parsePositiveNumber(process.env.MIND_PUTER_TIMEOUT_MS || process.env.PUTER_TIMEOUT_MS, 15000);
}

function getPuterCircuitFailureThreshold() {
  return parsePositiveNumber(process.env.MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_PUTER_CIRCUIT_FAILURE_THRESHOLD);
}

function getPuterCircuitWindowMs() {
  return parsePositiveNumber(process.env.MIND_PUTER_CIRCUIT_WINDOW_MS, DEFAULT_PUTER_CIRCUIT_WINDOW_MS);
}

function getPuterCircuitCooldownMs() {
  return parsePositiveNumber(process.env.MIND_PUTER_CIRCUIT_COOLDOWN_MS, DEFAULT_PUTER_CIRCUIT_COOLDOWN_MS);
}

function getPuterModel() {
  return process.env.MIND_PUTER_MODEL?.trim() || 'gpt-5.4-nano';
}

function getPuterCircuitKey(operation: AiOperationName) {
  return `puter:${operation}` as const;
}

function isGroqActionPrimaryEnabled() {
  return process.env.MIND_ACTION_PRIMARY?.trim().toLowerCase() === 'groq' && Boolean(process.env.GROQ_API_KEY?.trim());
}

function getGroqApiKey() {
  return process.env.GROQ_API_KEY?.trim() || '';
}

function getGroqModel() {
  return process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
}

function getGroqActionTimeoutMs() {
  return parsePositiveNumber(process.env.GROQ_ACTION_TIMEOUT_MS, 8000);
}

function getGroqActionMaxTokens() {
  return parsePositiveNumber(
    process.env.MIND_GROQ_ACTION_MAX_TOKENS || process.env.GROQ_ACTION_MAX_TOKENS,
    getPuterMaxTokens('action')
  );
}

function isGroqRescuePrimaryEnabled() {
  return process.env.MIND_RESCUE_PRIMARY?.trim().toLowerCase() === 'groq' && Boolean(process.env.GROQ_API_KEY?.trim());
}

function getGroqRescueModel() {
  return process.env.GROQ_RESCUE_MODEL?.trim() || 'llama-3.3-70b-versatile';
}

function getGroqRescueTimeoutMs() {
  return parsePositiveNumber(process.env.GROQ_RESCUE_TIMEOUT_MS, 8000);
}

function getGroqRescueMaxTokens() {
  return parsePositiveNumber(
    process.env.MIND_GROQ_RESCUE_MAX_TOKENS || process.env.GROQ_RESCUE_MAX_TOKENS,
    600
  );
}

function getPuterMaxTokens(operation: AiOperationName) {
  const specific = process.env[`MIND_PUTER_${operation.toUpperCase()}_MAX_TOKENS`];
  const fallbackByOperation: Record<AiOperationName, number> = {
    intake: 1200,
    action: 1000,
    rescue: 180,
  };
  return parsePositiveNumber(specific || process.env.MIND_PUTER_MAX_TOKENS, fallbackByOperation[operation]);
}

function buildPuterChatOptions(operation: AiOperationName) {
  const textVerbosity = process.env.MIND_PUTER_TEXT_VERBOSITY?.trim() || 'low';
  return {
    model: getPuterModel(),
    max_tokens: getPuterMaxTokens(operation),
    temperature: Number(process.env.MIND_PUTER_TEMPERATURE ?? 0),
    reasoning_effort: process.env.MIND_PUTER_REASONING_EFFORT?.trim() || 'minimal',
    text: { verbosity: textVerbosity },
    verbosity: textVerbosity,
  };
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function isPuterRawDebugEnabled() {
  return process.env.MIND_PUTER_DEBUG_RAW === '1';
}

function extractBalancedJsonObject(input: string) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractPuterJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Try balanced extraction below for malformed wrapping or trailing text.
    }
  }

  const balanced = extractBalancedJsonObject(candidate);
  if (!balanced) return null;

  try {
    JSON.parse(balanced);
    return balanced;
  } catch {
    return null;
  }
}

function parseJsonObjectCandidate(candidate: string | null) {
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizePuterCandidateKind(kind: unknown, parsed: Record<string, unknown>) {
  if (kind === 'reply_first' || kind === 'resume_first' || kind === 'dependency_first') return kind;
  const lower = typeof kind === 'string' ? kind.toLowerCase() : '';
  if (
    lower.includes('reply') ||
    lower.includes('respond') ||
    lower.includes('answer') ||
    lower.includes('client')
  ) {
    return 'reply_first';
  }
  if (
    lower.includes('depend') ||
    lower.includes('clarify') ||
    lower.includes('scope') ||
    lower.includes('input') ||
    lower.includes('question')
  ) {
    return 'dependency_first';
  }

  const taskShape = parsed.taskShape && typeof parsed.taskShape === 'object'
    ? parsed.taskShape as Record<string, unknown>
    : {};
  if (parsed.workflowType === 'client_response' || taskShape.immediateNeed === 'send_reply_now') {
    return 'reply_first';
  }
  return 'resume_first';
}

function normalizePuterJsonForOperation(operation: AiOperationName, jsonCandidate: string | null) {
  if (!jsonCandidate || operation !== 'intake') return jsonCandidate;
  const parsed = parseJsonObjectCandidate(jsonCandidate);
  if (!parsed || !Array.isArray(parsed.candidateActions)) return jsonCandidate;

  const normalized = {
    ...parsed,
    candidateActions: parsed.candidateActions.map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
      return {
        ...(candidate as Record<string, unknown>),
        kind: normalizePuterCandidateKind((candidate as Record<string, unknown>).kind, parsed),
      };
    }),
  };

  return JSON.stringify(normalized);
}

function hasRequiredPuterFields(operation: AiOperationName, parsed: Record<string, unknown> | null) {
  if (!parsed) return false;
  if (operation === 'intake') {
    return Boolean(
      parsed.workflowType &&
      parsed.roomDigest &&
      parsed.taskFrame &&
      parsed.taskShape &&
      Array.isArray(parsed.candidateActions) &&
      parsed.candidateActions.length > 0,
    );
  }
  if (operation === 'action') {
    return Boolean(
      parsed.chosenAction &&
      Array.isArray(parsed.alternatives) &&
      typeof parsed.whyThisNow === 'string' &&
      typeof parsed.situationSummary === 'string',
    );
  }
  return true;
}

function classifyPuterRawResponse(
  operation: AiOperationName,
  raw: string,
  jsonCandidate: string | null,
  status: 'pre_parse' | 'contract_valid' | 'contract_invalid',
): PuterRawResponseCategory {
  if (!raw.trim()) return 'empty';
  if (!jsonCandidate) return 'non_json_text';
  if (status === 'contract_invalid') return 'contract_invalid';
  const parsed = parseJsonObjectCandidate(jsonCandidate);
  if (!hasRequiredPuterFields(operation, parsed)) return 'json_missing_required_fields';

  const trimmed = raw.trim();
  if (trimmed !== jsonCandidate.trim() || /^```/i.test(trimmed)) return 'json_with_prose_or_fence';
  if (status === 'contract_valid') return 'contract_valid';
  return 'contract_valid';
}

function sanitizePuterRawPreview(raw: string) {
  const secret = process.env.PUTER_API_KEY?.trim();
  const redactedSecret = secret ? raw.split(secret).join('[REDACTED_PUTER_API_KEY]') : raw;
  return redactedSecret
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/("?(?:api[_-]?key|token|authorization)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[REDACTED]$3')
    .slice(0, 900);
}

function logPuterRawDiagnostics(input: {
  meta: PuterCallMeta;
  raw: string;
  jsonCandidate: string | null;
  category: PuterRawResponseCategory;
}) {
  if (!isPuterRawDebugEnabled()) return;
  console.info('[MIND][AI_PUTER_RAW]', {
    operation: input.meta.operation,
    backend: 'puter',
    model: input.meta.model,
    elapsed_ms: elapsedMs(input.meta.startedAt),
    timeout_ms: input.meta.timeoutMs,
    raw_length: input.raw.length,
    json_length: input.jsonCandidate?.length ?? 0,
    category: input.category,
    raw_preview: sanitizePuterRawPreview(input.raw),
  });
}

function classifyPuterFailure(error: unknown): PuterFailureReason {
  if (error instanceof PuterOperationError) return error.reason;
  if (error instanceof AiOperationContractError) return 'puter_contract_invalid';
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('timed out') || lower.includes('timeout')) return 'puter_timeout';
    if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized')) return 'puter_auth_error';
    if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('connection')) return 'puter_network_error';
    if (lower.includes('empty response')) return 'puter_empty_response';
    return 'puter_error';
  }
  return 'puter_error';
}

function getPuterErrorClass(error: unknown) {
  if (error instanceof PuterOperationError) return error.name;
  if (error instanceof AiOperationContractError) return error.name;
  if (error instanceof Error) return error.name || error.constructor?.name || 'Error';
  return typeof error;
}

function describePuterFailure(error: unknown) {
  if (error instanceof AiOperationContractError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function readPuterFailureMeta(operation: AiOperationName, error: unknown) {
  if (error instanceof PuterOperationError) {
    return {
      operation: error.operation,
      model: error.model,
      elapsedMs: error.elapsedMs,
      timeoutMs: error.timeoutMs,
      openUntil: error.openUntil,
    };
  }

  return {
    operation,
    model: getPuterModel(),
    elapsedMs: undefined,
    timeoutMs: getPuterTimeoutMs(),
  };
}

function logPuterSuccess(meta: PuterCallMeta) {
  console.info('[MIND][AI_PUTER] Puter returned contract-valid JSON', {
    operation: meta.operation,
    backend: 'puter',
    circuit_key: getPuterCircuitKey(meta.operation),
    model: meta.model,
    elapsed_ms: elapsedMs(meta.startedAt),
    timeout_ms: meta.timeoutMs,
    contract: 'valid',
  });
}

function logPuterFallback(operation: AiOperationName, error: unknown) {
  const meta = readPuterFailureMeta(operation, error);
  const reason = classifyPuterFailure(error);
  console.warn('[MIND][AI_FALLBACK] Puter failed, falling back', {
    operation: meta.operation,
    backend: 'puter',
    nextBackend: 'local_gemma',
    reason,
    circuit_key: getPuterCircuitKey(meta.operation),
    error_class: getPuterErrorClass(error),
    model: meta.model,
    elapsed_ms: meta.elapsedMs,
    timeout_ms: meta.timeoutMs,
    detail: describePuterFailure(error),
  });

  if (reason === 'puter_circuit_open') {
    const state = getPuterCircuitState(meta.operation);
    puterCircuitOpenFallbackCounts[meta.operation] += 1;
    if (puterCircuitOpenFallbackCounts[meta.operation] === PUTER_CIRCUIT_OPEN_HINT_THRESHOLD) {
      console.warn('[MIND][AI_FALLBACK] Puter circuit dev hint', {
        operation: meta.operation,
        backend: 'puter',
        reason,
        circuit_key: getPuterCircuitKey(meta.operation),
        failure_count: state.failureTimestamps.length,
        open_until: meta.openUntil ?? state.openUntil,
        hint: 'Puter circuit is in-memory; restart dev server to clear old state.',
      });
    }
  }
}

function pruneRecentFailures(operation: AiOperationName, now: number) {
  const windowMs = getPuterCircuitWindowMs();
  const state = getPuterCircuitState(operation);
  state.failureTimestamps = state.failureTimestamps.filter(
    (timestamp) => now - timestamp <= windowMs,
  );
}

function shouldSkipPuterOperation(operation: AiOperationName): PuterCircuitGate {
  const now = Date.now();
  const state = getPuterCircuitState(operation);
  if (state.openUntil > 0 && now < state.openUntil) {
    return {
      skip: true,
      reason: 'puter_circuit_open' as const,
      openUntil: state.openUntil,
    };
  }

  if (state.openUntil > 0 && now >= state.openUntil) {
    if (state.probeInFlight) {
      return {
        skip: true,
        reason: 'puter_circuit_open' as const,
        openUntil: state.openUntil,
      };
    }

    state.probeInFlight = true;
    return {
      skip: false,
    };
  }

  return {
    skip: false,
  };
}

function recordPuterSuccess(operation: AiOperationName) {
  resetPuterCircuitState(operation);
}

function recordPuterFailure(now: number, operation: AiOperationName, reason: PuterFailureReason) {
  pruneRecentFailures(operation, now);
  const state = getPuterCircuitState(operation);
  state.failureTimestamps.push(now);

  const threshold = getPuterCircuitFailureThreshold();
  const failureCount = state.failureTimestamps.length;
  if (failureCount >= threshold) {
    state.openUntil = now + getPuterCircuitCooldownMs();
    state.failureTimestamps = [];
    state.probeInFlight = false;
    console.warn('[MIND][AI_FALLBACK] Puter circuit_state_change', {
      operation,
      backend: 'puter',
      reason,
      circuit_key: getPuterCircuitKey(operation),
      failure_count: failureCount,
      failure_threshold: threshold,
      cooldown_ms: getPuterCircuitCooldownMs(),
      open_until: state.openUntil,
      model: getPuterModel(),
    });
    return;
  }
}

function pruneRecentGroqActionFailures(now: number) {
  const windowMs = getPuterCircuitWindowMs();
  groqActionCircuitState.failureTimestamps = groqActionCircuitState.failureTimestamps.filter(
    (timestamp) => now - timestamp <= windowMs,
  );
}

function shouldSkipGroqAction() {
  const now = Date.now();
  if (groqActionCircuitState.openUntil > 0 && now < groqActionCircuitState.openUntil) {
    return {
      skip: true,
      openUntil: groqActionCircuitState.openUntil,
    };
  }

  if (groqActionCircuitState.openUntil > 0 && now >= groqActionCircuitState.openUntil) {
    if (groqActionCircuitState.probeInFlight) {
      return {
        skip: true,
        openUntil: groqActionCircuitState.openUntil,
      };
    }

    groqActionCircuitState.probeInFlight = true;
    return { skip: false };
  }

  return { skip: false };
}

function recordGroqActionSuccess() {
  groqActionCircuitState.failureTimestamps = [];
  groqActionCircuitState.openUntil = 0;
  groqActionCircuitState.probeInFlight = false;
  groqActionCircuitOpenFallbackCount = 0;
}

function openGroqActionCircuit(now: number, reason: GroqFailureReason, failureCount: number) {
  groqActionCircuitState.openUntil = now + getPuterCircuitCooldownMs();
  groqActionCircuitState.failureTimestamps = [];
  groqActionCircuitState.probeInFlight = false;
  console.warn('[MIND][AI_FALLBACK] Groq circuit_state_change', {
    operation: 'action',
    provider: 'groq',
    reason,
    circuit_key: 'groq:action',
    failure_count: failureCount,
    failure_threshold: getPuterCircuitFailureThreshold(),
    cooldown_ms: getPuterCircuitCooldownMs(),
    open_until: groqActionCircuitState.openUntil,
    model: getGroqModel(),
  });
}

function recordGroqActionFailure(now: number, reason: GroqFailureReason) {
  pruneRecentGroqActionFailures(now);

  if (reason === 'groq_quota_error') {
    openGroqActionCircuit(now, reason, 1);
    return;
  }

  groqActionCircuitState.failureTimestamps.push(now);
  const failureCount = groqActionCircuitState.failureTimestamps.length;
  const threshold = getPuterCircuitFailureThreshold();
  if (failureCount >= threshold) {
    openGroqActionCircuit(now, reason, failureCount);
  }
}

function pruneRecentGroqRescueFailures(now: number) {
  const windowMs = getPuterCircuitWindowMs();
  groqRescueCircuitState.failureTimestamps = groqRescueCircuitState.failureTimestamps.filter(
    (timestamp) => now - timestamp <= windowMs,
  );
}

function shouldSkipGroqRescue() {
  const now = Date.now();
  if (groqRescueCircuitState.openUntil > 0 && now < groqRescueCircuitState.openUntil) {
    return {
      skip: true,
      openUntil: groqRescueCircuitState.openUntil,
    };
  }

  if (groqRescueCircuitState.openUntil > 0 && now >= groqRescueCircuitState.openUntil) {
    if (groqRescueCircuitState.probeInFlight) {
      return {
        skip: true,
        openUntil: groqRescueCircuitState.openUntil,
      };
    }

    groqRescueCircuitState.probeInFlight = true;
    return { skip: false };
  }

  return { skip: false };
}

function recordGroqRescueSuccess() {
  groqRescueCircuitState.failureTimestamps = [];
  groqRescueCircuitState.openUntil = 0;
  groqRescueCircuitState.probeInFlight = false;
  groqRescueCircuitOpenFallbackCount = 0;
}

function openGroqRescueCircuit(now: number, reason: GroqFailureReason, failureCount: number) {
  groqRescueCircuitState.openUntil = now + getPuterCircuitCooldownMs();
  groqRescueCircuitState.failureTimestamps = [];
  groqRescueCircuitState.probeInFlight = false;
  console.warn('[MIND][AI_FALLBACK] Groq circuit_state_change', {
    operation: 'rescue',
    provider: 'groq',
    reason,
    circuit_key: 'groq:rescue',
    failure_count: failureCount,
    failure_threshold: getPuterCircuitFailureThreshold(),
    cooldown_ms: getPuterCircuitCooldownMs(),
    open_until: groqRescueCircuitState.openUntil,
    model: getGroqRescueModel(),
  });
}

function recordGroqRescueFailure(now: number, reason: GroqFailureReason) {
  pruneRecentGroqRescueFailures(now);

  if (reason === 'groq_quota_error') {
    openGroqRescueCircuit(now, reason, 1);
    return;
  }

  groqRescueCircuitState.failureTimestamps.push(now);
  const failureCount = groqRescueCircuitState.failureTimestamps.length;
  const threshold = getPuterCircuitFailureThreshold();
  if (failureCount >= threshold) {
    openGroqRescueCircuit(now, reason, failureCount);
  }
}

function classifyGroqHttpFailure(status: number, bodyPreview: string): GroqFailureReason {
  const lower = bodyPreview.toLowerCase();
  if (status === 401 || status === 403) return 'groq_auth_error';
  if (status === 429 || lower.includes('quota') || lower.includes('rate limit')) return 'groq_quota_error';
  if (status >= 500) return 'groq_server_error';
  return 'groq_error';
}

function classifyGroqFailure(error: unknown): GroqFailureReason {
  if (error instanceof GroqOperationError) return error.reason;
  if (error instanceof AiOperationContractError) return 'groq_contract_invalid';
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (error.name === 'AbortError' || lower.includes('timed out') || lower.includes('timeout')) return 'groq_timeout';
    if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) return 'groq_quota_error';
    if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'groq_auth_error';
    if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('connection')) return 'groq_network_error';
    if (lower.includes('empty response')) return 'groq_empty_response';
  }
  return 'groq_error';
}

function logGroqProvider(input: {
  meta: GroqCallMeta;
  success: boolean;
  reason?: GroqFailureReason;
  elapsedMs: number;
  status?: number;
  openUntil?: number;
}) {
  console.info('[MIND][AI_GROQ]', {
    provider: 'groq',
    operation: input.meta.operation,
    circuit_key: input.meta.circuitKey,
    model: input.meta.model,
    elapsed_ms: input.elapsedMs,
    timeout_ms: input.meta.timeoutMs,
    success: input.success,
    reason: input.reason,
    status: input.status,
    open_until: input.openUntil,
  });
}

function logGroqFallback(operation: 'action' | 'rescue', error: unknown) {
  const defaultMeta: GroqCallMeta = operation === 'rescue'
    ? {
        operation: 'rescue',
        provider: 'groq',
        circuitKey: 'groq:rescue',
        model: getGroqRescueModel(),
        timeoutMs: getGroqRescueTimeoutMs(),
        startedAt: Date.now(),
      }
    : {
        operation: 'action',
        provider: 'groq',
        circuitKey: 'groq:action',
        model: getGroqModel(),
        timeoutMs: getGroqActionTimeoutMs(),
        startedAt: Date.now(),
      };

  const meta: GroqCallMeta = error instanceof GroqOperationError
    ? error.meta
    : defaultMeta;

  const reason = classifyGroqFailure(error);
  const elapsed = error instanceof GroqOperationError ? error.elapsedMs : elapsedMs(meta.startedAt);
  console.warn('[MIND][AI_FALLBACK] Groq failed, falling back', {
    operation: meta.operation,
    provider: 'groq',
    nextBackend: 'puter',
    reason,
    circuit_key: meta.circuitKey,
    model: meta.model,
    elapsed_ms: elapsed,
    timeout_ms: meta.timeoutMs,
    status: error instanceof GroqOperationError ? error.status : undefined,
  });

  if (reason === 'groq_circuit_open') {
    if (meta.operation === 'rescue') {
      groqRescueCircuitOpenFallbackCount += 1;
      if (groqRescueCircuitOpenFallbackCount === PUTER_CIRCUIT_OPEN_HINT_THRESHOLD) {
        console.warn('[MIND][AI_FALLBACK] Groq circuit dev hint', {
          operation: 'rescue',
          provider: 'groq',
          reason,
          circuit_key: meta.circuitKey,
          failure_count: groqRescueCircuitState.failureTimestamps.length,
          open_until: error instanceof GroqOperationError ? error.openUntil : groqRescueCircuitState.openUntil,
          hint: 'Groq circuit is in-memory; restart dev server to clear old state.',
        });
      }
    } else {
      groqActionCircuitOpenFallbackCount += 1;
      if (groqActionCircuitOpenFallbackCount === PUTER_CIRCUIT_OPEN_HINT_THRESHOLD) {
        console.warn('[MIND][AI_FALLBACK] Groq circuit dev hint', {
          operation: 'action',
          provider: 'groq',
          reason,
          circuit_key: meta.circuitKey,
          failure_count: groqActionCircuitState.failureTimestamps.length,
          open_until: error instanceof GroqOperationError ? error.openUntil : groqActionCircuitState.openUntil,
          hint: 'Groq circuit is in-memory; restart dev server to clear old state.',
        });
      }
    }
  }
}

async function withPuterTimeout<T>(meta: PuterCallMeta, promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsed = elapsedMs(meta.startedAt);
      reject(new PuterOperationError(
        `Puter ${meta.operation} timed out after ${meta.timeoutMs}ms`,
        'puter_timeout',
        meta.operation,
        meta.model,
        elapsed,
        meta.timeoutMs,
      ));
    }, meta.timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runPuterOperation<T>(
  operation: AiOperationName,
  systemPrompt: string,
  userPrompt: string,
  parse: (raw: string) => T
): Promise<T> {
  const circuitGate = shouldSkipPuterOperation(operation);
  if (circuitGate.skip) {
    const timeoutMs = getPuterTimeoutMs();
    throw new PuterOperationError(
      'Puter circuit is open',
      circuitGate.reason,
      operation,
      getPuterModel(),
      0,
      timeoutMs,
      undefined,
      circuitGate.openUntil,
    );
  }

  const puter = getPuterClient();
  const options = buildPuterChatOptions(operation);
  const meta: PuterCallMeta = {
    operation,
    model: options.model,
    timeoutMs: getPuterTimeoutMs(),
    startedAt: Date.now(),
  };
  let response: unknown;
  try {
    const useSinglePrompt = operation === 'intake' || operation === 'action';
    const puterInput = useSinglePrompt
      ? `${systemPrompt}\n\nContext:\n${userPrompt}`
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ];
    response = await withPuterTimeout(
      meta,
      puter.ai.chat(puterInput as any, options, false),
    );
  } catch (error) {
    if (error instanceof PuterOperationError) {
      if (error.reason !== 'puter_circuit_open') {
        recordPuterFailure(Date.now(), operation, error.reason);
      }
      throw error;
    }
    recordPuterFailure(Date.now(), operation, classifyPuterFailure(error));
    throw new PuterOperationError(
      error instanceof Error ? error.message : 'Puter request failed',
      classifyPuterFailure(error),
      operation,
      options.model,
      elapsedMs(meta.startedAt),
      meta.timeoutMs,
      error,
    );
  }

  const rawStr = extractPuterResponseText(response);
  const shouldNormalizeJson = operation === 'intake' || operation === 'action' || operation === 'rescue';
  const extractedJsonCandidate = shouldNormalizeJson ? extractPuterJsonObject(rawStr) : rawStr;
  const jsonCandidate = shouldNormalizeJson
    ? normalizePuterJsonForOperation(operation, extractedJsonCandidate)
    : extractedJsonCandidate;

  if (!rawStr) {
    logPuterRawDiagnostics({
      meta,
      raw: rawStr,
      jsonCandidate: null,
      category: 'empty',
    });
    recordPuterFailure(Date.now(), operation, 'puter_empty_response');
    throw new PuterOperationError(
      'Empty response from Puter',
      'puter_empty_response',
      operation,
      options.model,
      elapsedMs(meta.startedAt),
      meta.timeoutMs,
    );
  }

  if (shouldNormalizeJson && !jsonCandidate) {
    logPuterRawDiagnostics({
      meta,
      raw: rawStr,
      jsonCandidate: null,
      category: 'non_json_text',
    });
    recordPuterFailure(Date.now(), operation, 'puter_contract_invalid');
    throw new PuterOperationError(
      'Puter output did not contain a parseable JSON object',
      'puter_contract_invalid',
      operation,
      options.model,
      elapsedMs(meta.startedAt),
      meta.timeoutMs,
    );
  }

  let parsed: T;
  try {
    parsed = parse(jsonCandidate ?? rawStr);
  } catch (error) {
    logPuterRawDiagnostics({
      meta,
      raw: rawStr,
      jsonCandidate: shouldNormalizeJson ? jsonCandidate : rawStr,
      category: classifyPuterRawResponse(operation, rawStr, shouldNormalizeJson ? jsonCandidate : rawStr, 'contract_invalid'),
    });
    recordPuterFailure(Date.now(), operation, classifyPuterFailure(error));
    throw new PuterOperationError(
      error instanceof Error ? error.message : 'Puter output failed contract validation',
      classifyPuterFailure(error),
      operation,
      options.model,
      elapsedMs(meta.startedAt),
      meta.timeoutMs,
      error,
    );
  }
  (parsed as any).meta = { ...(parsed as any).meta, model: 'puter', passType: 'primary_pass' };
  logPuterRawDiagnostics({
    meta,
    raw: rawStr,
    jsonCandidate: shouldNormalizeJson ? jsonCandidate : rawStr,
    category: classifyPuterRawResponse(operation, rawStr, shouldNormalizeJson ? jsonCandidate : rawStr, 'contract_valid'),
  });
  recordPuterSuccess(operation);
  logPuterSuccess(meta);
  return parsed;
}

async function runGroqActionOperation<T>(
  systemPrompt: string,
  userPrompt: string,
  parse: (raw: string) => T,
): Promise<T> {
  const circuitGate = shouldSkipGroqAction();
  const meta: GroqCallMeta = {
    operation: 'action',
    provider: 'groq',
    circuitKey: 'groq:action',
    model: getGroqModel(),
    timeoutMs: getGroqActionTimeoutMs(),
    startedAt: Date.now(),
  };

  if (circuitGate.skip) {
    throw new GroqOperationError(
      'Groq action circuit is open',
      'groq_circuit_open',
      meta,
      0,
      undefined,
      undefined,
      circuitGate.openUntil,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), meta.timeoutMs);

  let rawStr = '';
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getGroqApiKey()}`,
      },
      body: JSON.stringify({
        model: meta.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: getGroqActionMaxTokens(),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const safeBodyPreview = (await response.text().catch(() => '')).slice(0, 220);
      const reason = classifyGroqHttpFailure(response.status, safeBodyPreview);
      recordGroqActionFailure(Date.now(), reason);
      throw new GroqOperationError(
        `Groq action request failed with HTTP ${response.status}`,
        reason,
        meta,
        elapsedMs(meta.startedAt),
        response.status,
      );
    }

    const payload = await response.json().catch(() => null) as any;
    rawStr = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? '';
    rawStr = typeof rawStr === 'string' ? rawStr.trim() : extractPuterResponseText(rawStr);
  } catch (error) {
    if (error instanceof GroqOperationError) {
      logGroqProvider({
        meta,
        success: false,
        reason: error.reason,
        elapsedMs: error.elapsedMs,
        status: error.status,
        openUntil: error.openUntil,
      });
      throw error;
    }

    const reason = classifyGroqFailure(error);
    recordGroqActionFailure(Date.now(), reason);
    const groqError = new GroqOperationError(
      reason === 'groq_timeout'
        ? `Groq action timed out after ${meta.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Groq action request failed',
      reason,
      meta,
      elapsedMs(meta.startedAt),
      undefined,
      error,
    );
    logGroqProvider({
      meta,
      success: false,
      reason,
      elapsedMs: groqError.elapsedMs,
    });
    throw groqError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!rawStr) {
    recordGroqActionFailure(Date.now(), 'groq_empty_response');
    const error = new GroqOperationError(
      'Empty response from Groq',
      'groq_empty_response',
      meta,
      elapsedMs(meta.startedAt),
    );
    logGroqProvider({
      meta,
      success: false,
      reason: error.reason,
      elapsedMs: error.elapsedMs,
    });
    throw error;
  }

  const jsonCandidate = extractPuterJsonObject(rawStr);
  if (!jsonCandidate) {
    recordGroqActionFailure(Date.now(), 'groq_contract_invalid');
    const error = new GroqOperationError(
      'Groq output did not contain a parseable JSON object',
      'groq_contract_invalid',
      meta,
      elapsedMs(meta.startedAt),
    );
    logGroqProvider({
      meta,
      success: false,
      reason: error.reason,
      elapsedMs: error.elapsedMs,
    });
    throw error;
  }

  let parsed: T;
  try {
    parsed = parse(jsonCandidate);
  } catch (error) {
    const reason = classifyGroqFailure(error);
    recordGroqActionFailure(Date.now(), reason);
    const groqError = new GroqOperationError(
      error instanceof Error ? error.message : 'Groq output failed contract validation',
      reason,
      meta,
      elapsedMs(meta.startedAt),
      undefined,
      error,
    );
    logGroqProvider({
      meta,
      success: false,
      reason,
      elapsedMs: groqError.elapsedMs,
    });
    throw groqError;
  }

  (parsed as any).meta = { ...(parsed as any).meta, model: 'groq', passType: 'primary_pass' };
  recordGroqActionSuccess();
  logGroqProvider({
    meta,
    success: true,
    elapsedMs: elapsedMs(meta.startedAt),
  });
  return parsed;
}

async function runGroqRescueOperation<T>(
  systemPrompt: string,
  userPrompt: string,
  parse: (raw: string) => T,
): Promise<T> {
  const circuitGate = shouldSkipGroqRescue();
  const meta: GroqCallMeta = {
    operation: 'rescue',
    provider: 'groq',
    circuitKey: 'groq:rescue',
    model: getGroqRescueModel(),
    timeoutMs: getGroqRescueTimeoutMs(),
    startedAt: Date.now(),
  };

  if (circuitGate.skip) {
    throw new GroqOperationError(
      'Groq rescue circuit is open',
      'groq_circuit_open',
      meta,
      0,
      undefined,
      undefined,
      circuitGate.openUntil,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), meta.timeoutMs);

  let rawStr = '';
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getGroqApiKey()}`,
      },
      body: JSON.stringify({
        model: meta.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: getGroqRescueMaxTokens(),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const safeBodyPreview = (await response.text().catch(() => '')).slice(0, 220);
      const reason = classifyGroqHttpFailure(response.status, safeBodyPreview);
      recordGroqRescueFailure(Date.now(), reason);
      throw new GroqOperationError(
        `Groq rescue request failed with HTTP ${response.status}`,
        reason,
        meta,
        elapsedMs(meta.startedAt),
        response.status,
      );
    }

    const payload = await response.json().catch(() => null) as any;
    rawStr = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? '';
    rawStr = typeof rawStr === 'string' ? rawStr.trim() : extractPuterResponseText(rawStr);
  } catch (error) {
    if (error instanceof GroqOperationError) {
      logGroqProvider({
        meta,
        success: false,
        reason: error.reason,
        elapsedMs: error.elapsedMs,
        status: error.status,
        openUntil: error.openUntil,
      });
      throw error;
    }

    const reason = classifyGroqFailure(error);
    recordGroqRescueFailure(Date.now(), reason);
    const groqError = new GroqOperationError(
      reason === 'groq_timeout'
        ? `Groq rescue timed out after ${meta.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Groq rescue request failed',
      reason,
      meta,
      elapsedMs(meta.startedAt),
      undefined,
      error,
    );
    logGroqProvider({
      meta,
      success: false,
      reason,
      elapsedMs: groqError.elapsedMs,
    });
    throw groqError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!rawStr) {
    recordGroqRescueFailure(Date.now(), 'groq_empty_response');
    const error = new GroqOperationError(
      'Empty response from Groq',
      'groq_empty_response',
      meta,
      elapsedMs(meta.startedAt),
    );
    logGroqProvider({
      meta,
      success: false,
      reason: error.reason,
      elapsedMs: error.elapsedMs,
    });
    throw error;
  }

  const jsonCandidate = extractPuterJsonObject(rawStr);
  if (!jsonCandidate) {
    recordGroqRescueFailure(Date.now(), 'groq_contract_invalid');
    const error = new GroqOperationError(
      'Groq output did not contain a parseable JSON object',
      'groq_contract_invalid',
      meta,
      elapsedMs(meta.startedAt),
    );
    logGroqProvider({
      meta,
      success: false,
      reason: error.reason,
      elapsedMs: error.elapsedMs,
    });
    throw error;
  }

  let parsed: T;
  try {
    parsed = parse(jsonCandidate);
  } catch (error) {
    const reason = classifyGroqFailure(error);
    recordGroqRescueFailure(Date.now(), reason);
    const groqError = new GroqOperationError(
      error instanceof Error ? error.message : 'Groq output failed contract validation',
      reason,
      meta,
      elapsedMs(meta.startedAt),
      undefined,
      error,
    );
    logGroqProvider({
      meta,
      success: false,
      reason,
      elapsedMs: groqError.elapsedMs,
    });
    throw groqError;
  }

  (parsed as any).meta = { ...(parsed as any).meta, model: 'groq', passType: 'primary_pass' };
  recordGroqRescueSuccess();
  logGroqProvider({
    meta,
    success: true,
    elapsedMs: elapsedMs(meta.startedAt),
  });
  return parsed;
}

export class FreePuterClient implements AiClient {
  constructor(private options: { maskExternalContext?: boolean } = {}) {}

  private externalTask(task: TaskContext): TaskContext {
    return this.options.maskExternalContext ? maskTaskContextForExternalLLM(task) as TaskContext : task;
  }

  async runIntake(task: TaskContext): Promise<AiIntakeResponse> {
    try {
      const puterTask = this.externalTask(task);
      const fallbackTaskShape = puterTask.taskShape ?? deriveTaskShapeFromText(puterTask.sourceText);
      const fallbackWorkflowType = puterTask.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
      const fallbackTaskFrame = buildTaskFrameFallback(fallbackWorkflowType, fallbackTaskShape);
      const fallbackRoomDigest = puterTask.sourceText.trim().slice(0, 220) || 'สรุป room นี้จากบริบทที่มีอยู่';
      const fallbackObjective = puterTask.taskFrame?.objective ?? fallbackTaskFrame.objective;
      const fallbackStage = puterTask.taskFrame?.stage ?? fallbackTaskFrame.stage;

      return await runPuterOperation(
        'intake',
        PUTER_INTAKE_SYSTEM_PROMPT,
        buildPuterIntakeUserPrompt(puterTask),
        (raw) => parseAiIntakeResponse(raw, {
          fallbackSourceText: puterTask.sourceText,
          fallbackTaskShape,
          fallbackWorkflowType,
          fallbackRoomDigest,
          fallbackObjective,
          fallbackStage,
        })
      );
    } catch (err) {
      logPuterFallback('intake', err);
      return new LocalGemmaClient().runIntake(task);
    }
  }

  async runAction(task: TaskContext, options?: AiActionOptions): Promise<AiActionResponse> {
    const { preferredCandidate, evidenceContext, negotiation } = options ?? {};
    const puterTask = this.externalTask(task);
    const fallbackTaskShape = puterTask.taskShape ?? deriveTaskShapeFromText(puterTask.sourceText);
    const fallbackWorkflowType = puterTask.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
    const fallbackActionCopy = buildActionFallbackCopy(fallbackWorkflowType, fallbackTaskShape);
    const preferredTitle = preferredCandidate?.title ?? puterTask.currentPlan?.actionTitle ?? puterTask.taskFrame?.objective ?? fallbackActionCopy.chosenTitle;
    const preferredRationale = preferredCandidate?.rationale ?? fallbackActionCopy.chosenRationale;
    const fallbackSuccessSignal = puterTask.currentPlan?.successSignal ?? fallbackActionCopy.successSignal;
    const fallbackWhyThisNow = negotiation?.mode && negotiation.mode !== 'default'
      ? `ตอนนี้กำลังปรับ action ให้ ${negotiation.mode} ขึ้น โดยยังยึดงานเดิมและข้อจำกัดปัจจุบัน`
      : fallbackActionCopy.whyThisNow;
    const fallbackSituationSummary = fallbackActionCopy.situationSummary;
    const fallbackReplyDraft = shouldGenerateReplyDraft(fallbackWorkflowType, fallbackTaskShape)
      ? fallbackActionCopy.replyDraft
      : undefined;
    const hasFileEvidence = (puterTask.sourceFiles ?? []).some((f) => f.status === 'ready');
    const systemPrompt = PUTER_ACTION_SYSTEM_PROMPT;
    const userPrompt = buildPuterActionUserPrompt(puterTask, preferredCandidate ?? null, negotiation as any ?? null, evidenceContext ?? null);
    const parseAction = (raw: string) => parseAiActionResponse(raw, {
      fallbackChosenTitle: preferredTitle,
      fallbackChosenRationale: preferredRationale,
      fallbackSuccessSignal,
      fallbackWhyThisNow,
      fallbackSituationSummary,
      fallbackReplyDraft,
      fallbackWorkflowType,
      fallbackTaskShape,
      hasFileEvidence,
    });

    if (isGroqActionPrimaryEnabled()) {
      try {
        return await runGroqActionOperation(
          systemPrompt,
          userPrompt,
          parseAction,
        );
      } catch (err) {
        logGroqFallback('action', err);
      }
    }

    try {
      return await runPuterOperation(
        'action',
        systemPrompt,
        userPrompt,
        parseAction,
      );
    } catch (err) {
      logPuterFallback('action', err);
      return new LocalGemmaClient().runAction(task, options);
    }
  }

  async runRescue(task: TaskContext, options?: AiRescueOptions): Promise<AiRescueResponse> {
    const { action, currentStepIndex = 0 } = options ?? {};
    const puterTask = this.externalTask(task);
    const fallbackReason = inferRescueFallbackReason(puterTask);
    const fallbackActionTitle = action?.title ?? puterTask.currentPlan?.actionTitle ?? puterTask.taskFrame?.objective;
    const fallbackCurrentStep =
      action?.microSteps[currentStepIndex] ??
      action?.microSteps[0] ??
      puterTask.currentPlan?.steps[currentStepIndex]?.text ??
      puterTask.currentPlan?.steps[0]?.text ??
      fallbackActionTitle;
    const systemPrompt = PUTER_RESCUE_SYSTEM_PROMPT;
    const userPrompt = buildPuterRescueUserPrompt(puterTask, action ?? null, currentStepIndex);
    const parseRescue = (raw: string) => parseAiRescueResponse(raw, {
      fallbackReason,
      fallbackActionTitle,
      fallbackCurrentStep,
    });

    if (isGroqRescuePrimaryEnabled()) {
      try {
        return await runGroqRescueOperation(
          systemPrompt,
          userPrompt,
          parseRescue,
        );
      } catch (err) {
        logGroqFallback('rescue', err);
      }
    }

    try {
      return await runPuterOperation(
        'rescue',
        systemPrompt,
        userPrompt,
        parseRescue,
      );
    } catch (err) {
      logPuterFallback('rescue', err);
      return new LocalGemmaClient().runRescue(task, options);
    }
  }
}

export function getAiClient(): AiClient {
  const backend = process.env.MIND_AI_BACKEND || 'local';

  if (backend === 'external_safe') {
    return new FreePuterClient({ maskExternalContext: true });
  }

  // default to local
  return new LocalGemmaClient();
}
