import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type GateStep = {
  label: string;
  cmd: string;
  args: string[];
};

const STUDIO_SERVER_PORT = Number(process.env.MIND_PHASE5_GATE_PORT || 3201) || 3201;
const STUDIO_SMOKE_LABELS = new Set(['studio-desktop', 'studio-mobile', 'reentry-mobile']);

const steps: GateStep[] = [
  { label: 'unit-tests', cmd: 'npm', args: ['test'] },
  { label: 'build', cmd: 'npm', args: ['run', 'build'] },
  { label: 'studio-desktop', cmd: 'npm', args: ['run', 'smoke:studio'] },
  { label: 'studio-mobile', cmd: 'npm', args: ['run', 'smoke:studio-mobile'] },
  { label: 'reentry-mobile', cmd: 'npm', args: ['run', 'smoke:reentry-mobile'] },
  { label: 'task-flow-repeat', cmd: 'npm', args: ['run', 'smoke:task-flow:repeat'] },
  { label: 'rescue-benchmark', cmd: 'npm', args: ['run', 'benchmark:rescue'] },
];

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

  throw new Error(`Timed out waiting for Phase 5 gate server at ${baseUrl}`);
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

function startStudioSmokeServer(port: number) {
  return spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: 'inherit',
  });
}

async function runStep(step: GateStep, extraEnv?: Record<string, string | undefined>) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(step.cmd, step.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(
    JSON.stringify(
      {
        gate: 'phase-5-pre-demo-pre-release',
        dryRun,
        steps: steps.map((step) => ({
          label: step.label,
          command: [step.cmd, ...step.args].join(' '),
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const smokeBaseUrl = `http://127.0.0.1:${STUDIO_SERVER_PORT}`;
  let studioServer: ChildProcess | null = null;

  try {
    for (const step of steps) {
      if (step.label === 'studio-desktop') {
        console.log(`[PHASE5_GATE] starting studio smoke server at ${smokeBaseUrl}`);
        studioServer = startStudioSmokeServer(STUDIO_SERVER_PORT);
        await waitForServer(smokeBaseUrl);
      }

      console.log(`[PHASE5_GATE] starting ${step.label}`);
      const exitCode = await runStep(
        step,
        STUDIO_SMOKE_LABELS.has(step.label)
          ? {
              MIND_BASE_URL: smokeBaseUrl,
            }
          : undefined,
      );
      if (exitCode !== 0) {
        console.error(`[PHASE5_GATE] failed ${step.label} with exit code ${exitCode}`);
        process.exitCode = exitCode;
        return;
      }
      console.log(`[PHASE5_GATE] passed ${step.label}`);

      if (step.label === 'reentry-mobile' && studioServer) {
        console.log('[PHASE5_GATE] stopping studio smoke server');
        await stopServer(studioServer);
        studioServer = null;
      }
    }

    console.log('[PHASE5_GATE] all checks passed');
  } finally {
    if (studioServer) {
      await stopServer(studioServer);
    }
  }
}

main().catch((error) => {
  console.error('[PHASE5_GATE] runner failed', error);
  process.exitCode = 1;
});
