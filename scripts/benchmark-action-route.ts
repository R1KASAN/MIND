import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { AiActionResponseSchema } from '../src/lib/ai/operations';
import { createTaskContext, type TaskContext } from '../src/lib/store/idb';

type BenchmarkSetting = {
  label: string;
  numPredict: number;
  repairNumPredict: number;
};

type BenchmarkFixture = {
  name: string;
  buildBody: () => {
    task: TaskContext;
    preferredCandidate?: {
      title: string;
      rationale: string;
      kind: 'reply_first' | 'resume_first' | 'dependency_first';
    };
    negotiation?: {
      mode: 'default' | 'smaller' | 'faster' | 'safer' | 'reply_first' | 'resume_first';
      userNote?: string;
    };
  };
};

type BenchmarkSample = {
  fixtureName: string;
  status: number;
  latencyMs: number;
  ok: boolean;
  validated: boolean;
  passType?: string;
  repairUsed?: boolean;
};

type BenchmarkSummary = {
  setting: BenchmarkSetting;
  samples: BenchmarkSample[];
  firstPassRate: number;
  repairRate: number;
  validationFailureRate: number;
  okRate: number;
  medianLatencyMs: number;
};

const BASE_PORT = Number(process.env.ACTION_BENCH_PORT || 3040) || 3040;
const RUNS_PER_FIXTURE = Number(process.env.ACTION_BENCH_RUNS || 3) || 3;
const ALLOW_AGGRESSIVE = process.env.ACTION_BENCH_SKIP_AGGRESSIVE !== '1';
const DEFAULT_SETTINGS: BenchmarkSetting[] = [
  { label: 'baseline-420', numPredict: 420, repairNumPredict: 480 },
  { label: 'candidate-360', numPredict: 360, repairNumPredict: 420 },
];
const AGGRESSIVE_SETTING: BenchmarkSetting = {
  label: 'aggressive-300',
  numPredict: 300,
  repairNumPredict: 360,
};

const FIXTURES: BenchmarkFixture[] = [
  {
    name: 'client_response',
    buildBody: () => {
      const task = createTaskContext({
        sourceText:
          'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และรอคำตอบวันนี้ ช่วยหาก้าวแรกที่ตอบกลับได้เร็วและไม่พลาดประเด็นสำคัญ',
        workflowType: 'client_response',
        lifecycleState: 'has_one_action',
        blockerSignals: ['unclear_scope'],
      });
      task.taskFrame = {
        objective: 'ตอบลูกค้าด้วยสรุปสั้นและขอ clarification เท่าที่จำเป็น',
        stage: 'กำลังตีความ feedback หลายข้อจากลูกค้า',
        stakeholders: ['ลูกค้า'],
      };
      task.currentPlan = {
        actionTitle: 'สรุป feedback ก่อนตอบกลับ',
        successSignal: 'ลูกค้าเห็นว่าจับประเด็นถูกและรู้ว่าขั้นต่อไปคืออะไร',
        steps: [
          { id: 'step-1', text: 'สรุปประเด็นหลักของ feedback' },
          { id: 'step-2', text: 'ร่างข้อความตอบกลับสั้น ๆ' },
        ],
      };
      task.constraints = {
        timeBudgetMin: 10,
        energyLevel: 'medium',
        preferReplyFirst: true,
      };

      return {
        task,
        preferredCandidate: {
          title: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
          rationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวน',
          kind: 'reply_first',
        },
      };
    },
  },
  {
    name: 'client_resume',
    buildBody: () => {
      const task = createTaskContext({
        sourceText:
          'โปรเจกต์ redesign ค้างมาหลายวัน จำไม่ได้ว่าควรเริ่มตรงไหนก่อน แต่อยากขยับให้ได้ภายใน 25 นาที',
        workflowType: 'client_resume',
        lifecycleState: 'has_one_action',
      });
      task.taskFrame = {
        objective: 'กลับเข้าบริบทของงานค้างและเริ่มจากก้าวแรกที่แตะได้จริง',
        stage: 'กำลังกลับเข้าสู่งานที่ค้างอยู่',
        stakeholders: ['ตัวเอง', 'ลูกค้า'],
      };
      task.currentPlan = {
        actionTitle: 'กลับมาจับจุดค้างหลักก่อน',
        successSignal: 'รู้ว่าต้องแตะส่วนไหนก่อนและเริ่มลงมือได้ทันที',
        steps: [
          { id: 'step-1', text: 'สรุปว่างานค้างตรงไหน' },
          { id: 'step-2', text: 'เปิดไฟล์หรือหน้าที่ต้องแตะก่อน' },
        ],
      };
      task.constraints = {
        timeBudgetMin: 25,
        energyLevel: 'low',
        preferReplyFirst: false,
      };

      return {
        task,
        preferredCandidate: {
          title: 'สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี',
          rationale: 'ช่วยให้กลับเข้าบริบทของงานค้างได้เร็ว',
          kind: 'resume_first',
        },
      };
    },
  },
  {
    name: 'negotiation_smaller',
    buildBody: () => {
      const task = createTaskContext({
        sourceText:
          'ต้องตอบลูกค้าเรื่อง scope ใหม่ แต่ตอนนี้พลังงานต่ำและอยากได้ก้าวที่เล็กมากพอจะเริ่มได้ทันที',
        workflowType: 'client_response',
        lifecycleState: 'has_one_action',
      });
      task.taskFrame = {
        objective: 'หาก้าวแรกที่เล็กลงสำหรับการตอบลูกค้าเรื่อง scope',
        stage: 'กำลังต่อรอง next move ให้เล็กลง',
        stakeholders: ['ลูกค้า'],
      };
      task.currentPlan = {
        actionTitle: 'ตอบลูกค้าเรื่อง scope อย่างปลอดภัย',
        successSignal: 'มีข้อความสั้นที่ส่งได้หรือมีก้าวแรกที่แตะได้ทันที',
        steps: [
          { id: 'step-1', text: 'สรุปว่าลูกค้าขออะไร' },
          { id: 'step-2', text: 'เลือกว่าจะตอบหรือถามกลับก่อน' },
        ],
      };
      task.constraints = {
        timeBudgetMin: 10,
        energyLevel: 'low',
        preferReplyFirst: true,
      };

      return {
        task,
        preferredCandidate: {
          title: 'ร่างข้อความตอบกลับสั้นที่สุดที่ยังเคลียร์ scope ได้',
          rationale: 'ลดแรงเสียดทานของการเริ่มตอบตอนพลังงานต่ำ',
          kind: 'reply_first',
        },
        negotiation: {
          mode: 'smaller',
          userNote: 'ขอให้เล็กพอเริ่มได้ภายใน 10 นาทีและยังสุภาพกับลูกค้า',
        },
      };
    },
  },
];

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
}

function toRate(count: number, total: number) {
  if (total === 0) return 0;
  return Number((count / total).toFixed(3));
}

function summarize(setting: BenchmarkSetting, samples: BenchmarkSample[]): BenchmarkSummary {
  const total = samples.length;
  const firstPassCount = samples.filter((sample) => sample.ok && sample.passType === 'primary_pass').length;
  const repairCount = samples.filter((sample) => sample.ok && sample.passType === 'repair_pass').length;
  const validationFailureCount = samples.filter(
    (sample) => !sample.ok && sample.passType === 'validation_failed',
  ).length;
  const okCount = samples.filter((sample) => sample.ok).length;

  return {
    setting,
    samples,
    firstPassRate: toRate(firstPassCount, total),
    repairRate: toRate(repairCount, total),
    validationFailureRate: toRate(validationFailureCount, total),
    okRate: toRate(okCount, total),
    medianLatencyMs: median(samples.map((sample) => sample.latencyMs)),
  };
}

function shouldRunAggressiveComparison(summaries: BenchmarkSummary[]) {
  const [baseline, candidate] = summaries;
  if (!baseline || !candidate) return false;
  return (
    baseline.repairRate > 0 ||
    candidate.repairRate > 0 ||
    baseline.validationFailureRate > 0 ||
    candidate.validationFailureRate > 0 ||
    baseline.firstPassRate === candidate.firstPassRate
  );
}

function chooseRecommendedSetting(summaries: BenchmarkSummary[]) {
  const baseline = summaries.find((summary) => summary.setting.numPredict === 420);
  const candidate = summaries.find((summary) => summary.setting.numPredict === 360);
  if (!baseline || !candidate) {
    return {
      recommendedNumPredict: 360,
      reason: 'มีผล benchmark ไม่ครบ เลยคงค่า candidate 360 ไว้เป็นค่าแนะนำชั่วคราว',
    };
  }

  const candidateIsSafer =
    candidate.validationFailureRate <= baseline.validationFailureRate &&
    candidate.repairRate <= baseline.repairRate &&
    candidate.firstPassRate >= baseline.firstPassRate;
  const candidateIsFaster = candidate.medianLatencyMs <= baseline.medianLatencyMs;

  if (candidateIsSafer && candidateIsFaster) {
    return {
      recommendedNumPredict: 360,
      reason: '360 รักษาหรือเพิ่ม first-pass rate ได้ ขณะเดียวกัน repair/validation ไม่แย่ลงและ latency ดีกว่า',
    };
  }

  return {
    recommendedNumPredict: 420,
    reason: '420 ยังให้เสถียรภาพดีกว่า หรือ 360 ยังลด latency โดยแลกกับ repair/validation มากเกินไป',
  };
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

function startServer(setting: BenchmarkSetting, port: number) {
  const child = spawn('npm', ['run', 'start', '--', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      AI_NUM_PREDICT_ACTION: String(setting.numPredict),
      AI_NUM_PREDICT_ACTION_REPAIR: String(setting.repairNumPredict),
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

  return {
    child,
    readLogs: () => ({ stdout, stderr }),
  };
}

async function runFixture(baseUrl: string, fixture: BenchmarkFixture): Promise<BenchmarkSample> {
  const body = fixture.buildBody();
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/ai/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;
  const json = await response.json().catch(() => null);
  const parsed = AiActionResponseSchema.safeParse(json);

  const passType =
    parsed.success
      ? parsed.data.meta.passType ?? 'primary_pass'
      : (json && typeof json === 'object' && 'error' in json
        ? (json as { error?: { telemetry?: { passType?: string } } }).error?.telemetry?.passType
        : undefined);

  const repairUsed =
    parsed.success
      ? parsed.data.meta.repairUsed
      : (json && typeof json === 'object' && 'error' in json
        ? Boolean((json as { error?: { telemetry?: { repairUsed?: boolean } } }).error?.telemetry?.repairUsed)
        : false);

  return {
    fixtureName: fixture.name,
    status: response.status,
    latencyMs,
    ok: response.ok && parsed.success,
    validated: parsed.success,
    passType,
    repairUsed,
  };
}

async function benchmarkSetting(setting: BenchmarkSetting, port: number) {
  const server = startServer(setting, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl);

    const samples: BenchmarkSample[] = [];
    for (const fixture of FIXTURES) {
      for (let runIndex = 0; runIndex < RUNS_PER_FIXTURE; runIndex += 1) {
        samples.push(await runFixture(baseUrl, fixture));
      }
    }

    return summarize(setting, samples);
  } catch (error) {
    const logs = server.readLogs();
    throw new Error(
      [
        `Benchmark failed for ${setting.label}.`,
        error instanceof Error ? error.message : String(error),
        logs.stderr.trim() ? `stderr:\n${logs.stderr.trim()}` : '',
        logs.stdout.trim() ? `stdout:\n${logs.stdout.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  } finally {
    await stopServer(server.child);
  }
}

function printSummary(summary: BenchmarkSummary) {
  console.log(
    JSON.stringify(
      {
        setting: summary.setting.label,
        numPredict: summary.setting.numPredict,
        repairNumPredict: summary.setting.repairNumPredict,
        runs: summary.samples.length,
        okRate: summary.okRate,
        firstPassRate: summary.firstPassRate,
        repairRate: summary.repairRate,
        validationFailureRate: summary.validationFailureRate,
        medianLatencyMs: summary.medianLatencyMs,
      },
      null,
      2,
    ),
  );
}

async function main() {
  await ensureBuiltApp();

  const summaries: BenchmarkSummary[] = [];
  const settingsToRun = [...DEFAULT_SETTINGS];

  for (let index = 0; index < settingsToRun.length; index += 1) {
    const setting = settingsToRun[index];
    const summary = await benchmarkSetting(setting, BASE_PORT + index);
    summaries.push(summary);
    printSummary(summary);
  }

  if (ALLOW_AGGRESSIVE && shouldRunAggressiveComparison(summaries)) {
    const aggressiveSummary = await benchmarkSetting(AGGRESSIVE_SETTING, BASE_PORT + summaries.length);
    summaries.push(aggressiveSummary);
    printSummary(aggressiveSummary);
  }

  const recommendation = chooseRecommendedSetting(summaries);
  console.log(
    JSON.stringify(
      {
        recommendation,
        comparedSettings: summaries.map((summary) => ({
          setting: summary.setting.label,
          numPredict: summary.setting.numPredict,
          firstPassRate: summary.firstPassRate,
          repairRate: summary.repairRate,
          validationFailureRate: summary.validationFailureRate,
          medianLatencyMs: summary.medianLatencyMs,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[ACTION_BENCHMARK] failed', error);
  process.exitCode = 1;
});
