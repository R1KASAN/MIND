import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  CANONICAL_LOCAL_OLLAMA_HOST,
  CANONICAL_LOCAL_PRIMARY_MODEL,
  DEFAULT_AI_START_ACTION,
  getCanonicalRuntimeAlignmentIssues,
} from '@/lib/ai/ollama-runtime';

const CHECK_TIMEOUT_MS = 30_000;
const VERSION_ENDPOINT = `${CANONICAL_LOCAL_OLLAMA_HOST}/api/version`;
const CHECK_COMMAND = ['npm', ['run', 'runtime:ollama:check:gemma']] as const;
const START_COMMAND = ['npm', ['run', 'ollama:serve:cpu-safe']] as const;

function formatIssues() {
  return getCanonicalRuntimeAlignmentIssues(process.env)
    .map((issue) => {
      if (issue.kind === 'host_mismatch') {
        return `OLLAMA_HOST points to ${issue.actual}; expected ${issue.expected}`;
      }
      return `AI_MODEL points to ${issue.actual}; expected ${issue.expected}`;
    })
    .join('\n');
}

function fail(message: string, detail?: string) {
  console.error(`[MIND][RuntimeGuard] ${message}`);
  if (detail) {
    console.error(detail);
  }
  process.exitCode = 1;
}

async function canReachCanonicalRuntime() {
  try {
    const response = await fetch(VERSION_ENDPOINT, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCanonicalRuntime() {
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await canReachCanonicalRuntime()) {
      return;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for Ollama at ${CANONICAL_LOCAL_OLLAMA_HOST}`);
}

function startCanonicalRuntimeInBackground() {
  const child = spawn(START_COMMAND[0], START_COMMAND[1], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OLLAMA_HOST: CANONICAL_LOCAL_OLLAMA_HOST,
      AI_MODEL: CANONICAL_LOCAL_PRIMARY_MODEL,
      AI_FALLBACK_MODELS: CANONICAL_LOCAL_PRIMARY_MODEL,
    },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function runModelCheck() {
  const child = spawn(CHECK_COMMAND[0], CHECK_COMMAND[1], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OLLAMA_HOST: CANONICAL_LOCAL_OLLAMA_HOST,
      AI_MODEL: CANONICAL_LOCAL_PRIMARY_MODEL,
      AI_FALLBACK_MODELS: CANONICAL_LOCAL_PRIMARY_MODEL,
      MIND_OLLAMA_CHECK_MODEL: CANONICAL_LOCAL_PRIMARY_MODEL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error((stderr || stdout).trim() || 'Gemma runtime check failed');
  }
}

async function main() {
  const issues = formatIssues();
  if (issues) {
    fail(
      'Canonical local AI runtime misalignment detected. Use npm run dev / npm run start without overriding host or model.',
      issues,
    );
    return;
  }

  if (!(await canReachCanonicalRuntime())) {
    console.log(`[MIND][RuntimeGuard] No Ollama service on ${CANONICAL_LOCAL_OLLAMA_HOST}. Starting ${DEFAULT_AI_START_ACTION}.`);
    startCanonicalRuntimeInBackground();

    try {
      await waitForCanonicalRuntime();
    } catch (error) {
      fail(
        `Canonical Ollama runtime did not boot on ${CANONICAL_LOCAL_OLLAMA_HOST}.`,
        error instanceof Error ? `${error.message}\nRun ${DEFAULT_AI_START_ACTION} manually and inspect its logs.` : `Run ${DEFAULT_AI_START_ACTION} manually and inspect its logs.`,
      );
      return;
    }
  }

  try {
    await runModelCheck();
  } catch (error) {
    fail(
      `Ollama is reachable on ${CANONICAL_LOCAL_OLLAMA_HOST}, but Gemma verification failed.`,
      error instanceof Error
        ? `${error.message}\nThe service booted, but ${CANONICAL_LOCAL_PRIMARY_MODEL} still cannot answer the runtime check.`
        : `The service booted, but ${CANONICAL_LOCAL_PRIMARY_MODEL} still cannot answer the runtime check.`,
    );
    return;
  }

  console.log(
    `[MIND][RuntimeGuard] Canonical Ollama runtime ready at ${CANONICAL_LOCAL_OLLAMA_HOST} with ${CANONICAL_LOCAL_PRIMARY_MODEL}.`,
  );
}

main().catch((error) => {
  fail(
    'Unexpected runtime guard failure.',
    error instanceof Error ? error.message : 'Unknown error',
  );
});
