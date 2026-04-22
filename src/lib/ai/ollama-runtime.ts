export type AiHealthStatus = 'checking' | 'ready' | 'unavailable' | 'model_missing';
export type AiModelTier = 'primary' | 'fallback' | 'emergency' | 'unknown';
export interface AiHealthResult {
  status: AiHealthStatus;
  model: string;
  modelTier: AiModelTier;
  reason?: string;
  detail?: string;
  retryable: boolean;
  actions?: string[];
}

export const CANONICAL_LOCAL_OLLAMA_HOST = 'http://127.0.0.1:11437';
export const CANONICAL_LOCAL_PRIMARY_MODEL = 'gemma2:2b';
export const DEFAULT_AI_START_ACTION = 'npm run ollama:serve:cpu-safe';
const LEGACY_LOCAL_OLLAMA_HOST = 'http://localhost:11434';

export type CanonicalRuntimeAlignmentIssue = {
  kind: 'host_mismatch' | 'model_mismatch';
  expected: string;
  actual: string;
};

/**
 * Canonical local app startup now comes from package scripts:
 * - npm run dev
 * - npm run start
 *
 * These raw defaults stay in place only for backwards compatibility and explicit
 * non-canonical/manual paths such as dev:raw/start:raw and tests that model the
 * older Qwen-primary runtime behavior.
 */
export function normalizeOllamaBaseUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return LEGACY_LOCAL_OLLAMA_HOST;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `http://${raw}`;
}

export function getCanonicalRuntimeAlignmentIssues(
  env: NodeJS.ProcessEnv = process.env,
): CanonicalRuntimeAlignmentIssue[] {
  const issues: CanonicalRuntimeAlignmentIssue[] = [];
  const configuredHost = env.OLLAMA_HOST;
  const configuredModel = env.AI_MODEL;

  if (typeof configuredHost === 'string' && normalizeOllamaBaseUrl(configuredHost) !== CANONICAL_LOCAL_OLLAMA_HOST) {
    issues.push({
      kind: 'host_mismatch',
      expected: CANONICAL_LOCAL_OLLAMA_HOST,
      actual: normalizeOllamaBaseUrl(configuredHost),
    });
  }

  if (typeof configuredModel === 'string' && configuredModel.trim() !== CANONICAL_LOCAL_PRIMARY_MODEL) {
    issues.push({
      kind: 'model_mismatch',
      expected: CANONICAL_LOCAL_PRIMARY_MODEL,
      actual: configuredModel.trim(),
    });
  }

  return issues;
}

const OLLAMA_HOST = normalizeOllamaBaseUrl(process.env.OLLAMA_HOST);
const OLLAMA_CHAT_ENDPOINT = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_TAGS_ENDPOINT = `${OLLAMA_HOST}/api/tags`;
const OLLAMA_PS_ENDPOINT = `${OLLAMA_HOST}/api/ps`;
export const OLLAMA_CPU_SAFE_OPTIONS = {
  num_gpu: 0,
} as const;

export const DEFAULT_PRIMARY_MODEL = process.env.AI_MODEL || 'qwen2.5:3b';

const shouldWarnOnNonCanonicalRuntime =
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production') &&
  getCanonicalRuntimeAlignmentIssues(process.env).length > 0;

if (shouldWarnOnNonCanonicalRuntime) {
  console.warn(
    '[MIND][Runtime] Non-canonical local AI path detected. ' +
    'Canonical local app startup is gemma2:2b on http://127.0.0.1:11437 via npm run dev / npm run start. ' +
    'Use dev:raw/start:raw only for explicit manual debugging.',
  );
}

function parseModelList(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

const PRIMARY_MODELS = [
  DEFAULT_PRIMARY_MODEL,
  'qwen3:4b-instruct',
];

const FALLBACK_MODELS = parseModelList(process.env.AI_FALLBACK_MODELS, [CANONICAL_LOCAL_PRIMARY_MODEL]);

// Emergency-only local fallback for machines where the preferred models cannot boot.
const EMERGENCY_MODELS = ['llama3.2:1b'];

const MODEL_PRIORITY = [...new Set([...PRIMARY_MODELS, ...FALLBACK_MODELS, ...EMERGENCY_MODELS])];
const PRIME_TIMEOUT_MS = Number(process.env.AI_PRIME_TIMEOUT_MS || 45000) || 45000;
const HEALTH_RECOVERY_TIMEOUT_MS = Number(process.env.AI_HEALTH_RECOVERY_TIMEOUT_MS || 8000) || 8000;

let primePromise: Promise<string | null> | null = null;
const knownBadModels = new Set<string>();
let lastWarmFailureDetail: string | undefined;

type OllamaTagsResponse = { models?: Array<{ name: string }> };
type OllamaPsResponse = { models?: Array<{ name: string }> };
type OllamaChatResponse = { message?: { content?: string } };

function normalizeModelName(model: string) {
  return model.split(':')[0];
}

function matchesModel(candidate: string, availableName: string) {
  return availableName.startsWith(normalizeModelName(candidate));
}

function buildPriorityList(available: string[]) {
  return MODEL_PRIORITY.filter((candidate) =>
    available.some((name) => matchesModel(candidate, name))
  );
}

function getModelTier(model: string | undefined): AiModelTier {
  if (!model) return 'unknown';
  if (PRIMARY_MODELS.some((candidate) => matchesModel(candidate, model))) return 'primary';
  if (FALLBACK_MODELS.some((candidate) => matchesModel(candidate, model))) return 'fallback';
  if (EMERGENCY_MODELS.some((candidate) => matchesModel(candidate, model))) return 'emergency';
  return 'unknown';
}

export function isPrimaryModel(model: string | undefined) {
  return getModelTier(model) === 'primary';
}

export function getAiInstallActions() {
  return PRIMARY_MODELS[0] === FALLBACK_MODELS[0]
    ? [`ollama pull ${PRIMARY_MODELS[0]}`]
    : [`ollama pull ${PRIMARY_MODELS[0]}`, `ollama pull ${FALLBACK_MODELS[0]}`];
}

function orderModels(installed: string[], loaded: string[]) {
  const ordered = new Set<string>();

  for (const model of installed) {
    if (!knownBadModels.has(model)) ordered.add(model);
  }

  for (const model of loaded) {
    if (!knownBadModels.has(model)) ordered.add(model);
  }

  for (const model of installed) {
    ordered.add(model);
  }

  return [...ordered];
}

function isLikelyRuntimeFailure(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('timed out') ||
    lower.includes('returned 500') ||
    lower.includes('llama runner process has terminated') ||
    lower.includes('failed to initialize metal backend') ||
    lower.includes('endpoint could not be reached') ||
    lower.includes('context canceled')
  );
}

async function fetchInstalledModelNames() {
  const res = await fetch(OLLAMA_TAGS_ENDPOINT, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) {
    throw new Error(`Ollama tags endpoint returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as OllamaTagsResponse;
  const available = (data.models || []).map((model) => model.name);
  return buildPriorityList(available);
}

async function fetchLoadedModelNames() {
  try {
    const res = await fetch(OLLAMA_PS_ENDPOINT, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaPsResponse;
    const loaded = (data.models || []).map((model) => model.name);
    return buildPriorityList(loaded);
  } catch {
    return [];
  }
}

async function warmModel(model: string, timeoutMs = PRIME_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OLLAMA_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '5m',
        format: 'json',
        messages: [
          { role: 'system', content: 'ตอบเป็น JSON เท่านั้น {"ok": true}' },
          { role: 'user', content: 'warm' },
        ],
        options: {
          ...OLLAMA_CPU_SAFE_OPTIONS,
          temperature: 0,
          num_predict: 8,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    if (!data.message?.content) {
      throw new Error('Ollama returned an empty warm-up payload');
    }

    knownBadModels.delete(model);
    return model;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'warm-up failed';
    lastWarmFailureDetail = message;
    if (isLikelyRuntimeFailure(message)) {
      knownBadModels.add(model);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function primeBestAvailableModel() {
  const installed = await fetchInstalledModelNames();
  for (const model of installed) {
    if (knownBadModels.has(model)) continue;
    const warmed = await warmModel(model);
    if (warmed) return warmed;
  }
  return null;
}

async function recoverPreferredModel(installed: string[], activeModel: string | undefined) {
  const preferredCandidates = installed.filter((model) => {
    const tier = getModelTier(model);
    return (
      (tier === 'primary' || tier === 'fallback') &&
      !matchesModel(activeModel ?? '', model)
    );
  });

  for (const model of preferredCandidates) {
    const warmed = await warmModel(model, HEALTH_RECOVERY_TIMEOUT_MS);
    if (warmed) return warmed;
  }

  return null;
}

export async function getAiHealth(): Promise<AiHealthResult> {
  try {
    const installed = await fetchInstalledModelNames();
    if (installed.length === 0) {
      return {
        status: 'model_missing',
        model: PRIMARY_MODELS[0],
        modelTier: 'unknown',
        reason: 'ไม่พบโมเดลในเครื่อง',
        detail: 'ยังไม่ได้ติดตั้งโมเดลที่ MIND ต้องใช้',
        retryable: false,
        actions: getAiInstallActions(),
      };
    }

    const loaded = await fetchLoadedModelNames();
    const ordered = orderModels(installed, loaded);
    const activeModel = ordered[0] || installed[0];

    if (loaded.length > 0) {
      if (getModelTier(activeModel) === 'emergency') {
        const recoveredModel = await recoverPreferredModel(installed, activeModel);
        if (recoveredModel) {
          return {
            status: 'ready',
            model: recoveredModel,
            modelTier: getModelTier(recoveredModel),
            retryable: true,
          };
        }
      }

      return {
        status: 'ready',
        model: activeModel,
        modelTier: getModelTier(activeModel),
        retryable: true,
      };
    }

    if (!primePromise) {
      primePromise = primeBestAvailableModel().finally(() => {
        primePromise = null;
      });
    }

    return {
      status: 'checking',
      model: activeModel,
      modelTier: getModelTier(activeModel),
      reason: 'กำลังโหลดโมเดล...',
      detail: lastWarmFailureDetail || 'Ollama กำลังเตรียมโมเดลในเครื่อง',
      retryable: true,
      actions: [DEFAULT_AI_START_ACTION, ...getAiInstallActions()],
    };
  } catch (error) {
    return {
      status: 'unavailable',
      model: PRIMARY_MODELS[0],
      modelTier: getModelTier(PRIMARY_MODELS[0]),
      reason: 'Ollama ไม่พร้อมใช้งาน',
      detail: error instanceof Error ? error.message : 'ไม่สามารถตรวจสอบสถานะ Ollama ได้',
      retryable: true,
      actions: [DEFAULT_AI_START_ACTION, ...getAiInstallActions()],
    };
  }
}

export async function getSynthesisCandidateModels() {
  try {
    const installed = await fetchInstalledModelNames();
    const loaded = await fetchLoadedModelNames();
    const ordered = orderModels(installed, loaded);

    if (ordered.length > 0) {
      return ordered;
    }

    if (!primePromise && installed.length > 0) {
      primePromise = primeBestAvailableModel().finally(() => {
        primePromise = null;
      });
    }

    return installed.length > 0 ? installed : [PRIMARY_MODELS[0]];
  } catch {
    return [PRIMARY_MODELS[0]];
  }
}

export function markModelSuccess(model: string) {
  knownBadModels.delete(model);
}

export function markModelFailure(model: string, reason: string) {
  if (isLikelyRuntimeFailure(reason)) {
    knownBadModels.add(model);
  }
}

export {
  FALLBACK_MODELS,
  getModelTier,
  MODEL_PRIORITY,
  OLLAMA_CHAT_ENDPOINT,
};
