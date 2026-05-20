import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

const DEFAULT_PORT = Number(process.env.MIND_DEMO_BROWSER_PORT || 3205) || 3205;

async function ensureBuiltApp() {
  await access('.next/BUILD_ID');
}

async function checkHealthyServer(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/ai/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
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

async function stopServer(process: ChildProcess) {
  if (process.exitCode !== null) return;

  process.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (process.exitCode === null && Date.now() < deadline) {
    await delay(100);
  }

  if (process.exitCode === null) {
    process.kill('SIGKILL');
  }
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
    const child = spawn('tsx', ['scripts/browser-verify-demo-runbook.ts'], {
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

  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;

  // 1. Check if healthy MIND server is already running on the chosen port
  console.log(`[SMOKE] Checking if healthy server already running on ${baseUrl}...`);
  const isHealthy = await checkHealthyServer(baseUrl);

  if (isHealthy) {
    console.log(JSON.stringify({
      smoke: 'demo-browser',
      port: DEFAULT_PORT,
      baseUrl,
      reused: true,
      status: 'healthy'
    }, null, 2));

    const exitCode = await runBrowserVerify(baseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  // 2. If not healthy, check if the port is busy/occupied by a different process
  const isAvailable = await isPortAvailable(DEFAULT_PORT);
  if (!isAvailable) {
    throw new Error(
      `Port ${DEFAULT_PORT} is currently occupied by a non-MIND process or an unhealthy server. ` +
      `Please free port ${DEFAULT_PORT} or specify a different port via MIND_DEMO_BROWSER_PORT.`
    );
  }

  // 3. Port is free, build and start new server
  await ensureBuiltApp();

  console.log(JSON.stringify({
    smoke: 'demo-browser',
    port: DEFAULT_PORT,
    baseUrl,
    reused: false,
    status: 'starting'
  }, null, 2));

  const server = startServer(DEFAULT_PORT);
  console.log(`[SMOKE] Started Next.js server on port ${DEFAULT_PORT} with owned PID ${server.pid}`);

  try {
    await waitForServer(baseUrl);
    const exitCode = await runBrowserVerify(baseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    console.log(`[SMOKE] Stopping owned server process (PID ${server.pid})...`);
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error('[SMOKE] demo browser wrapper failed', error);
  process.exitCode = 1;
});
