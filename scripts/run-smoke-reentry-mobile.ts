import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_PORT = Number(process.env.MIND_REENTRY_MOBILE_PORT || 3204) || 3204;

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
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

async function runBrowserSmoke(baseUrl: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn('tsx', ['scripts/browser-smoke-reentry-mobile.ts'], {
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
    const exitCode = await runBrowserSmoke(providedBaseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  await ensureBuiltApp();

  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  console.log(JSON.stringify({ smoke: 'reentry-mobile', baseUrl, source: 'fresh-prod-server' }, null, 2));

  const server = startServer(DEFAULT_PORT);
  try {
    await waitForServer(baseUrl);
    const exitCode = await runBrowserSmoke(baseUrl);
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error('[SMOKE] reentry mobile wrapper failed', error);
  process.exitCode = 1;
});
