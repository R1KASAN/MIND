import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type GateStep = {
  label: string;
  cmd: string;
  args: string[];
};

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11437';
const OLLAMA_GATE_HOST = new URL(OLLAMA_HOST).origin;
const OLLAMA_CPU_SAFE_SCRIPT = ['npm', ['run', 'ollama:serve:cpu-safe']] as const;

const steps: GateStep[] = [
  { label: 'runtime-preflight', cmd: 'npm', args: ['run', 'runtime:ollama:check:gemma'] },
  { label: 'unit-tests', cmd: 'npm', args: ['test'] },
  { label: 'build', cmd: 'npm', args: ['run', 'build'] },
  { label: 'ai-routes-gemma', cmd: 'npm', args: ['run', 'smoke:ai-routes:gemma'] },
  { label: 'demo-browser', cmd: 'npm', args: ['run', 'smoke:demo-browser'] },
];

async function waitForOllama(baseUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for Ollama at ${baseUrl}`);
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

  let ollamaServer: ChildProcess | null = null;
  try {
    const ollamaAlreadyReady = await (async () => {
      try {
        await waitForOllama(OLLAMA_GATE_HOST);
        return true;
      } catch {
        return false;
      }
    })();

    if (!ollamaAlreadyReady) {
      console.log(`[PHASE5_GATE] starting Ollama CPU-safe server at ${OLLAMA_GATE_HOST}`);
      ollamaServer = spawn(OLLAMA_CPU_SAFE_SCRIPT[0], OLLAMA_CPU_SAFE_SCRIPT[1], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OLLAMA_HOST: OLLAMA_GATE_HOST,
        },
        stdio: 'inherit',
      });
      await waitForOllama(OLLAMA_GATE_HOST);
    }

    for (const step of steps) {
      console.log(`[PHASE5_GATE] starting ${step.label}`);
      const exitCode = await runStep(step);
      if (exitCode !== 0) {
        console.error(`[PHASE5_GATE] failed ${step.label} with exit code ${exitCode}`);
        process.exitCode = exitCode;
        return;
      }
      console.log(`[PHASE5_GATE] passed ${step.label}`);
    }

    console.log('[PHASE5_GATE] all checks passed');
  } finally {
    if (ollamaServer) {
      console.log('[PHASE5_GATE] stopping Ollama CPU-safe server');
      await stopServer(ollamaServer);
    }
  }
}

main().catch((error) => {
  console.error('[PHASE5_GATE] runner failed', error);
  process.exitCode = 1;
});
