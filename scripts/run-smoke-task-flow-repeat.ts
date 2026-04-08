import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  };
};

const RUN_COUNT = Number(process.env.MIND_SMOKE_TASK_FLOW_REPEAT_RUNS || 5) || 5;
const OUTPUT_DIR =
  process.env.MIND_SMOKE_TASK_FLOW_REPEAT_DIR || `/tmp/mind-smoke-task-flow-repeat-${Date.now()}`;

async function runOnce(index: number) {
  const summaryPath = join(OUTPUT_DIR, `run-${index + 1}.json`);

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn('npm', ['run', 'smoke:task-flow'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIND_SMOKE_TASK_FLOW_SUMMARY_PATH: summaryPath,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  const contents = await readFile(summaryPath, 'utf8');
  const report = JSON.parse(contents) as SmokeRunSummary;
  return {
    run: index + 1,
    exitCode,
    report,
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
