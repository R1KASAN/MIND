import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type RescueBaseline = {
  label: string;
  numPredict: number;
  repairNumPredict: number;
  primaryTimeoutMs: number;
  repairTimeoutMs: number;
  overallBudgetMs: number;
};

const DEFAULT_PORT = Number(process.env.MIND_SMOKE_TASK_FLOW_PORT || 3203) || 3203;
const DEFAULT_BASELINE: RescueBaseline = {
  label: process.env.MIND_RESCUE_BASELINE_LABEL || 'rescue-balanced-repair-160',
  numPredict: Number(process.env.MIND_RESCUE_BASELINE_NUM_PREDICT || 160) || 160,
  repairNumPredict: Number(process.env.MIND_RESCUE_BASELINE_REPAIR_NUM_PREDICT || 220) || 220,
  primaryTimeoutMs: Number(process.env.MIND_RESCUE_BASELINE_TIMEOUT_MS || 20000) || 20000,
  repairTimeoutMs: Number(process.env.MIND_RESCUE_BASELINE_REPAIR_TIMEOUT_MS || 14000) || 14000,
  overallBudgetMs: Number(process.env.MIND_RESCUE_BASELINE_OVERALL_BUDGET_MS || 40000) || 40000,
};

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
      // keep polling until the server is ready
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

function startServer(port: number, baseline: RescueBaseline) {
  return spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      AI_NUM_PREDICT_RESCUE: String(baseline.numPredict),
      AI_NUM_PREDICT_RESCUE_REPAIR: String(baseline.repairNumPredict),
      AI_TIMEOUT_RESCUE_MS: String(baseline.primaryTimeoutMs),
      AI_TIMEOUT_RESCUE_REPAIR_MS: String(baseline.repairTimeoutMs),
      AI_OVERALL_TIMEOUT_RESCUE_MS: String(baseline.overallBudgetMs),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

async function runBrowserSmoke(baseUrl: string, baseline: RescueBaseline) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn('tsx', ['scripts/browser-smoke-task-flow.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIND_BASE_URL: baseUrl,
        MIND_RESCUE_BASELINE_LABEL: baseline.label,
        MIND_SMOKE_TASK_FLOW_SUMMARY_PATH: process.env.MIND_SMOKE_TASK_FLOW_SUMMARY_PATH,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  await ensureBuiltApp();

  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  const baseline = DEFAULT_BASELINE;

  console.log(
    JSON.stringify(
      {
        smoke: 'task-flow',
        baseline,
        baseUrl,
      },
      null,
      2,
    ),
  );

  const server = startServer(DEFAULT_PORT, baseline);
  try {
    await waitForServer(baseUrl);
    const exitCode = await runBrowserSmoke(baseUrl, baseline);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error('[SMOKE] task flow wrapper failed', error);
  process.exitCode = 1;
});
