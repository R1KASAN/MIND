import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

type SmokeRunSummary = {
  smoke: 'task-flow';
  result: 'passed' | 'failed';
  stage: string;
  baseUrl?: string;
  baseline?: string;
  screenshot?: string;
  error?: string;
  summary?: {
    baseline?: string;
    reachedAction?: boolean;
    reachedScaffold?: boolean;
    reachedRescue?: boolean;
    reachedReentry?: boolean;
    reachedCompletionReset?: boolean;
    rescueStatus?: number;
    rescuePassType?: string;
    rescueFailureDetail?: string;
    rescueFailureField?: string;
    scaffoldStatus?: number;
    scaffoldRetryStatus?: number;
    scaffoldResponseObserved?: boolean;
    scaffoldRetryResponseObserved?: boolean;
    actionReadyMs?: number;
    scaffoldRefineMs?: number;
    rescueMs?: number;
    scaffoldRetryMs?: number;
    completionResetMs?: number;
    reentryMs?: number;
    consoleErrors?: string[];
    pageErrors?: string[];
  };
};

const RUN_COUNT = Number(process.env.MIND_SMOKE_TASK_FLOW_REPEAT_RUNS || 5) || 5;
const OUTPUT_DIR =
  process.env.MIND_SMOKE_TASK_FLOW_REPEAT_DIR || `/tmp/mind-smoke-task-flow-repeat-${Date.now()}`;
const START_PORT = Number(process.env.MIND_SMOKE_TASK_FLOW_REPEAT_START_PORT || 3203) || 3203;
const SMOKE_AI_ENV = {
  AI_TIMEOUT_QWEN_MS: process.env.AI_TIMEOUT_QWEN_MS || '25000',
  AI_REPAIR_TIMEOUT_QWEN_MS: process.env.AI_REPAIR_TIMEOUT_QWEN_MS || '15000',
  AI_TIMEOUT_FALLBACK_MS: process.env.AI_TIMEOUT_FALLBACK_MS || '15000',
  AI_REPAIR_TIMEOUT_FALLBACK_MS: process.env.AI_REPAIR_TIMEOUT_FALLBACK_MS || '10000',
  AI_OVERALL_TIMEOUT_MS: process.env.AI_OVERALL_TIMEOUT_MS || '60000',
  AI_TIMEOUT_ACTION_QWEN_MS: process.env.AI_TIMEOUT_ACTION_QWEN_MS || '15000',
  AI_REPAIR_TIMEOUT_ACTION_QWEN_MS: process.env.AI_REPAIR_TIMEOUT_ACTION_QWEN_MS || '10000',
  AI_TIMEOUT_ACTION_FALLBACK_MS: process.env.AI_TIMEOUT_ACTION_FALLBACK_MS || '12000',
  AI_NUM_PREDICT_ACTION: process.env.AI_NUM_PREDICT_ACTION || '180',
  AI_NUM_PREDICT_ACTION_REPAIR: process.env.AI_NUM_PREDICT_ACTION_REPAIR || '240',
  AI_TIMEOUT_RESCUE_MS: process.env.AI_TIMEOUT_RESCUE_MS || '10000',
  AI_REPAIR_TIMEOUT_RESCUE_MS: process.env.AI_REPAIR_TIMEOUT_RESCUE_MS || '8000',
  AI_TIMEOUT_RESCUE_FALLBACK_MS: process.env.AI_TIMEOUT_RESCUE_FALLBACK_MS || '8000',
  AI_OVERALL_TIMEOUT_RESCUE_MS: process.env.AI_OVERALL_TIMEOUT_RESCUE_MS || '25000',
  AI_TIMEOUT_SCAFFOLD_MS: process.env.AI_TIMEOUT_SCAFFOLD_MS || '12000',
  AI_REPAIR_TIMEOUT_SCAFFOLD_MS: process.env.AI_REPAIR_TIMEOUT_SCAFFOLD_MS || '10000',
  AI_TIMEOUT_SCAFFOLD_FALLBACK_MS: process.env.AI_TIMEOUT_SCAFFOLD_FALLBACK_MS || '12000',
  AI_OVERALL_TIMEOUT_SCAFFOLD_MS: process.env.AI_OVERALL_TIMEOUT_SCAFFOLD_MS || '28000',
  MIND_SMOKE_AI_WAIT_TIMEOUT_MS: process.env.MIND_SMOKE_AI_WAIT_TIMEOUT_MS || '210000',
};

async function runOnce(index: number) {
  const summaryPath = join(OUTPUT_DIR, `run-${index + 1}.json`);
  const screenshotPath = join(OUTPUT_DIR, `run-${index + 1}-pass.png`);
  const failureScreenshotPath = join(OUTPUT_DIR, `run-${index + 1}-failure.png`);
  const serverLogPath = join(OUTPUT_DIR, `run-${index + 1}-server.log`);
  const runPort = START_PORT + index;

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn('npm', ['run', 'smoke:task-flow'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...SMOKE_AI_ENV,
        MIND_SMOKE_TASK_FLOW_PORT: String(runPort),
        MIND_SMOKE_TASK_FLOW_SUMMARY_PATH: summaryPath,
        MIND_SMOKE_SCREENSHOT: screenshotPath,
        MIND_SMOKE_FAILURE_SCREENSHOT: failureScreenshotPath,
        MIND_SMOKE_TASK_FLOW_SERVER_LOG_PATH: serverLogPath,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  let report: SmokeRunSummary;
  try {
    await access(summaryPath);
    const contents = await readFile(summaryPath, 'utf8');
    report = JSON.parse(contents) as SmokeRunSummary;
  } catch {
    report = {
      smoke: 'task-flow',
      result: 'failed',
      stage: 'wrapper',
      error:
        exitCode === 124
          ? 'task-flow browser smoke timed out before producing a summary'
          : 'task-flow wrapper exited before producing a summary',
    };
  }

  return {
    run: index + 1,
    exitCode,
    report,
    artifacts: {
      summaryPath,
      screenshotPath,
      failureScreenshotPath,
      serverLogPath,
      runPort,
    },
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const runs = [];
  for (let index = 0; index < RUN_COUNT; index += 1) {
    runs.push(await runOnce(index));
  }

  const aggregate = {
    smoke: 'task-flow-repeat',
    runs: RUN_COUNT,
    outputDir: OUTPUT_DIR,
    passedRuns: runs.filter((run) => run.report.result === 'passed').length,
    failedRuns: runs.filter((run) => run.report.result === 'failed').length,
    reachedReentryRuns: runs.filter((run) => run.report.summary?.reachedReentry).length,
    completionResetRuns: runs.filter((run) => run.report.summary?.reachedCompletionReset).length,
    rescue422Runs: runs.filter((run) => run.report.summary?.rescueStatus === 422).length,
    failingStages: runs
      .filter((run) => run.report.result === 'failed')
      .map((run) => ({ run: run.run, stage: run.report.stage, error: run.report.error })),
    reports: runs.map((run) => ({
      run: run.run,
      exitCode: run.exitCode,
      result: run.report.result,
      stage: run.report.stage,
      baseline: run.report.summary?.baseline ?? run.report.baseline,
      reachedAction: run.report.summary?.reachedAction ?? false,
      reachedScaffold: run.report.summary?.reachedScaffold ?? false,
      reachedRescue: run.report.summary?.reachedRescue ?? false,
      reachedReentry: run.report.summary?.reachedReentry ?? false,
      reachedCompletionReset: run.report.summary?.reachedCompletionReset ?? false,
      rescueStatus: run.report.summary?.rescueStatus,
      rescuePassType: run.report.summary?.rescuePassType,
      rescueFailureField: run.report.summary?.rescueFailureField,
      rescueFailureDetail: run.report.summary?.rescueFailureDetail,
      scaffoldResponseObserved: run.report.summary?.scaffoldResponseObserved ?? false,
      scaffoldRetryResponseObserved: run.report.summary?.scaffoldRetryResponseObserved ?? false,
      actionReadyMs: run.report.summary?.actionReadyMs,
      scaffoldRefineMs: run.report.summary?.scaffoldRefineMs,
      rescueMs: run.report.summary?.rescueMs,
      scaffoldRetryMs: run.report.summary?.scaffoldRetryMs,
      completionResetMs: run.report.summary?.completionResetMs,
      reentryMs: run.report.summary?.reentryMs,
      consoleErrors: run.report.summary?.consoleErrors ?? [],
      pageErrors: run.report.summary?.pageErrors ?? [],
      screenshot: run.artifacts.screenshotPath,
      failureScreenshot: run.artifacts.failureScreenshotPath,
      serverLog: run.artifacts.serverLogPath,
      port: run.artifacts.runPort,
    })),
  };

  await writeFile(join(OUTPUT_DIR, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(aggregate, null, 2));

  if (aggregate.failedRuns > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[SMOKE] task flow repeat runner failed', error);
  process.exitCode = 1;
});
