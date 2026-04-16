import { MODEL_PRIORITY } from '@/lib/ai/ollama-runtime';

function normalizeOllamaBaseUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return 'http://127.0.0.1:11434';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `http://${raw}`;
}

const OLLAMA_BASE_URL = normalizeOllamaBaseUrl(process.env.OLLAMA_HOST);
const REQUIRED_VERSION = process.env.MIND_OLLAMA_REQUIRED_VERSION || '0.17.0';
const REQUIRED_MODEL = process.env.MIND_OLLAMA_CHECK_MODEL?.trim();

type OllamaTagsResponse = { models?: Array<{ name: string }> };

function normalizeModelName(model: string) {
  return model.split(':')[0];
}

function matchesModel(candidate: string, installedName: string) {
  return installedName.startsWith(normalizeModelName(candidate));
}

function normalizeDirectResponse(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s.!?]+$/g, '');
}

function parseSemver(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left: string, right: string) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

async function fetchInstalledModels() {
  const tagsResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!tagsResponse.ok) {
    throw new Error(`Ollama tags endpoint failed with HTTP ${tagsResponse.status}`);
  }

  const tagsBody = (await tagsResponse.json()) as OllamaTagsResponse;
  return (tagsBody.models || []).map((model) => model.name);
}

async function generateOk(model: string) {
  const generateResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: 'ตอบคำว่า ok เท่านั้น',
      stream: false,
      options: {
        num_predict: 8,
        num_gpu: 0,
      },
    }),
  });

  if (!generateResponse.ok) {
    throw new Error(`Ollama direct generate failed with HTTP ${generateResponse.status}`);
  }

  const generateBody = (await generateResponse.json()) as { response?: string };
  const directResponse = (generateBody.response ?? '').trim().toLowerCase();
  if (normalizeDirectResponse(directResponse) !== 'ok') {
    throw new Error(`Expected direct generate response "ok" but received "${directResponse}"`);
  }

  return directResponse;
}

async function main() {
  const versionResponse = await fetch(`${OLLAMA_BASE_URL}/api/version`);
  if (!versionResponse.ok) {
    throw new Error(`Ollama version check failed with HTTP ${versionResponse.status}`);
  }

  const versionBody = (await versionResponse.json()) as { version?: string };
  const version = versionBody.version ?? 'unknown';
  const versionMatches = compareSemver(version, REQUIRED_VERSION) >= 0;
  const installedModels = await fetchInstalledModels();
  const candidateModels = REQUIRED_MODEL
    ? [REQUIRED_MODEL]
    : MODEL_PRIORITY.filter((candidate) =>
        installedModels.some((installed) => matchesModel(candidate, installed)),
      );
  const modelsToTry = candidateModels.length > 0
    ? candidateModels
    : (REQUIRED_MODEL ? [REQUIRED_MODEL] : MODEL_PRIORITY.slice(0, 1));

  let verifiedModel = '';
  let directResponse = '';
  let lastError: string | undefined;

  for (const model of modelsToTry) {
    try {
      directResponse = await generateOk(model);
      verifiedModel = model;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }
  }

  const summary = {
    runtime: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    requiredVersion: REQUIRED_VERSION,
    actualVersion: version,
    versionMatches,
    installedModels,
    candidateModels: modelsToTry,
    requiredModel: REQUIRED_MODEL || undefined,
    verifiedModel: verifiedModel || undefined,
    directGenerateOk: Boolean(verifiedModel),
    directResponse,
    lastError,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!versionMatches) {
    throw new Error(`Expected Ollama ${REQUIRED_VERSION} or newer but found ${version}`);
  }

  if (!verifiedModel) {
    throw new Error(
      lastError
        ? `No installed Ollama model could generate "ok". Last error: ${lastError}`
        : 'No installed Ollama model could generate "ok"',
    );
  }
}

main().catch((error) => {
  console.error('[RUNTIME_CHECK] local Ollama runtime failed', error);
  process.exitCode = 1;
});
