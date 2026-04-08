export type AiHealthStatus = 'checking' | 'ready' | 'unavailable' | 'model_missing';
export interface AiHealthResult {
  status: AiHealthStatus;
  model: string;
  reason?: string;
  detail?: string;
  retryable: boolean;
  actions?: string[];
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_CHAT_ENDPOINT = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_TAGS_ENDPOINT = `${OLLAMA_HOST}/api/tags`;
const OLLAMA_PS_ENDPOINT = `${OLLAMA_HOST}/api/ps`;

const PRIMARY_MODELS = [
  process.env.AI_MODEL || 'qwen2.5:3b',
  'qwen3:4b-instruct',
  'gemma3n:e2b',
];

// Emergency-only local fallback for machines where the preferred models cannot boot.
const EMERGENCY_MODELS = ['llama3.2:1b'];

const MODEL_PRIORITY = [...new Set([...PRIMARY_MODELS, ...EMERGENCY_MODELS])];
const PRIME_TIMEOUT_MS = Number(process.env.AI_PRIME_TIMEOUT_MS || 45000) || 45000;

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

async function warmModel(model: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRIME_TIMEOUT_MS);

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

export async function getAiHealth(): Promise<AiHealthResult> {
  try {
    const installed = await fetchInstalledModelNames();
    if (installed.length === 0) {
      return {
        status: 'model_missing',
        model: PRIMARY_MODELS[0],
        reason: 'ไม่พบโมเดลในเครื่อง',
        detail: 'ยังไม่ได้ติดตั้งโมเดลที่ MIND ต้องใช้',
        retryable: false,
        actions: ['ollama pull qwen2.5:3b'],
      };
    }

    const loaded = await fetchLoadedModelNames();
    const ordered = orderModels(installed, loaded);
    const activeModel = ordered[0] || installed[0];

    if (loaded.length > 0) {
      return {
        status: 'ready',
        model: activeModel,
        retryable: true,
      };
    }

    if (!primePromise) {
      primePromise = primeBestAvailableModel().finally(() => {
        primePromise = null;
      });
    }

    if (knownBadModels.size >= installed.length && installed.length > 0) {
      return {
        status: 'unavailable',
        model: activeModel,
        reason: 'Ollama ไม่พร้อมใช้งาน',
        detail: lastWarmFailureDetail || 'โมเดลในเครื่องยังเริ่มทำงานไม่สำเร็จ',
        retryable: true,
        actions: ['ollama serve'],
      };
    }

    return {
      status: 'checking',
      model: activeModel,
      reason: 'กำลังโหลดโมเดล...',
      detail: 'Ollama กำลังเตรียมโมเดลในเครื่อง',
      retryable: true,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      model: PRIMARY_MODELS[0],
      reason: 'Ollama ไม่พร้อมใช้งาน',
      detail: error instanceof Error ? error.message : 'ไม่สามารถตรวจสอบสถานะ Ollama ได้',
      retryable: true,
      actions: ['ollama serve'],
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
  MODEL_PRIORITY,
  OLLAMA_CHAT_ENDPOINT,
};
