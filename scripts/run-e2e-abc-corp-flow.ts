import { access } from 'node:fs/promises';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_PORT = Number(process.env.MIND_E2E_PORT || 3206) || 3206;

function ensurePortFree(port: number) {
  try {
    execSync(`lsof -t -i:${port} | xargs kill -9`);
    console.log(`[E2E] Port ${port} cleared successfully.`);
  } catch {
    // Port was already free
  }
}

async function ensureBuiltApp() {
  await access('.next/BUILD_ID');
}

async function waitForServer(baseUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/ai/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for server at ${baseUrl}`);
}

async function stopServer(process: ChildProcess, port: number) {
  if (process.exitCode !== null) {
    ensurePortFree(port);
    return;
  }

  process.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (process.exitCode === null && Date.now() < deadline) {
    await delay(100);
  }

  ensurePortFree(port);
}

function startServer(port: number) {
  return spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://127.0.0.1:11437',
      AI_MODEL: process.env.AI_MODEL || 'gemma2:2b',
      AI_FALLBACK_MODELS: process.env.AI_FALLBACK_MODELS || 'gemma2:2b',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

async function runBrowserVerify(baseUrl: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn('tsx', ['scripts/verify-abc-corp-flow.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIND_BASE_URL: baseUrl,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const providedBaseUrl = process.env.MIND_BASE_URL;
  if (providedBaseUrl) {
    const exitCode = await runBrowserVerify(providedBaseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  // Clear port 3206 before starting the server
  ensurePortFree(DEFAULT_PORT);

  await ensureBuiltApp();

  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  console.log(JSON.stringify({ smoke: 'e2e-abc-corp-flow', baseUrl }, null, 2));

  const server = startServer(DEFAULT_PORT);
  try {
    await waitForServer(baseUrl);
    const exitCode = await runBrowserVerify(baseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    await stopServer(server, DEFAULT_PORT);
  }
}

main().catch((error) => {
  console.error('[E2E] ABC Corp flow E2E wrapper failed', error);
  ensurePortFree(DEFAULT_PORT);
  process.exitCode = 1;
});
