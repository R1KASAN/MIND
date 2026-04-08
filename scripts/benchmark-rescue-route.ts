import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { createTaskContext, type Action, type TaskContext } from '../src/lib/store/idb';
import { AiRescueResponseSchema } from '../src/lib/ai/operations';
import { requestRescue } from '../src/lib/orchestrator/task-events';

type BenchmarkSetting = {
  label: string;
  description: string;
  numPredict: number;
  repairNumPredict: number;
  primaryTimeoutMs: number;
  repairTimeoutMs: number;
  overallBudgetMs: number;
};

type RescueFixture = {
  name: string;
  description: string;
  forceClientRetry?: boolean;
  buildBody: () => {
    task: TaskContext;
    action: Action | null;
    currentStepIndex: number;
  };
};

type RescueRouteSample = {
  fixtureName: string;
  status: number;
  latencyMs: number;
  ok: boolean;
  validated: boolean;
  passType?: string;
  repairUsed?: boolean;
  failureDetail?: string;
  failureField?: string;
};

type RescueClientSample = {
  fixtureName: string;
  ok: boolean;
  latencyMs: number;
  retryAttempted: boolean;
  retrySucceeded: boolean;
  initialFailureStatus?: number;
  initialFailureReason?: string;
  passType?: string;
};

type RescueSummary = {
  setting: BenchmarkSetting;
  routeSamples: RescueRouteSample[];
  clientSamples: RescueClientSample[];
  routeOkRate: number;
  routeRepairRate: number;
  routeValidationFailureRate: number;
  route503Rate: number;
  clientOkRate: number;
  retryAttemptRate: number;
  retrySuccessRate: number;
  medianRouteLatencyMs: number;
  medianClientLatencyMs: number;
  routeFailureFields: Record<string, number>;
};

const BASE_PORT = Number(process.env.RESCUE_BENCH_PORT || 3050) || 3050;
const RUNS_PER_FIXTURE = Number(process.env.RESCUE_BENCH_RUNS || 1) || 1;
const PRESET_SETTINGS: BenchmarkSetting[] = [
  {
    label: 'rescue-baseline-170',
    description: 'Current rescue default. Use this as the control.',
    numPredict: 170,
    repairNumPredict: 210,
    primaryTimeoutMs: 22000,
    repairTimeoutMs: 12000,
    overallBudgetMs: 40000,
  },
  {
    label: 'rescue-faster-140',
    description: 'Lower token budget and shorter deadlines to check whether timeouts fall faster than quality.',
    numPredict: 140,
    repairNumPredict: 180,
    primaryTimeoutMs: 18000,
    repairTimeoutMs: 10000,
    overallBudgetMs: 32000,
  },
  {
    label: 'rescue-repair-heavy-170',
    description: 'Keep primary budget, but give the repair pass more room to recover contract-invalid output.',
    numPredict: 170,
    repairNumPredict: 240,
    primaryTimeoutMs: 22000,
    repairTimeoutMs: 16000,
    overallBudgetMs: 44000,
  },
  {
    label: 'rescue-longer-primary-170',
    description: 'Give the primary pass more time before falling into repair, while keeping the original repair budget.',
    numPredict: 170,
    repairNumPredict: 210,
    primaryTimeoutMs: 26000,
    repairTimeoutMs: 12000,
    overallBudgetMs: 46000,
  },
  {
    label: 'rescue-balanced-repair-160',
    description: 'Trim the primary budget slightly, but keep a healthier repair pass so latency stays closer to baseline.',
    numPredict: 160,
    repairNumPredict: 220,
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 14000,
    overallBudgetMs: 40000,
  },
  {
    label: 'repair-heavy-longer-repair',
    description: 'Hold the repair-heavy token budget steady and add a little more repair time to see if timeout-only losses disappear.',
    numPredict: 170,
    repairNumPredict: 240,
    primaryTimeoutMs: 22000,
    repairTimeoutMs: 18000,
    overallBudgetMs: 47000,
  },
  {
    label: 'balanced-higher-overall-budget',
    description: 'Keep the balanced live-loop shape, but add a narrower repair/overall buffer before giving up on rescue.',
    numPredict: 160,
    repairNumPredict: 220,
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 15000,
    overallBudgetMs: 43000,
  },
];

const FIXTURES: RescueFixture[] = [
  {
    name: 'missing_context',
    description: 'Missing context blocker with a straightforward client-response plan.',
    buildBody: () => {
      const task = createTaskContext({
        sourceText: 'ลูกค้าส่ง feedback มาแต่ไฟล์แนบยังอ่านไม่ได้ ต้องหาทางกู้บริบทก่อนตอบกลับ',
        workflowType: 'client_response',
        lifecycleState: 'stalled',
        blockerSignals: ['missing_file_or_context'],
      });
      task.taskFrame = {
        objective: 'ตอบลูกค้าโดยอิงบริบทที่มีอยู่เท่าที่พอ',
        stage: 'กำลังหาทางกู้บริบทที่ขาด',
        stakeholders: ['ลูกค้า'],
      };
      task.currentPlan = {
        actionTitle: 'สรุป feedback จากบริบทที่มีอยู่',
        successSignal: 'รู้ว่าควรตอบอะไร และอะไรยังต้องถามเพิ่ม',
        steps: [
          { id: 'step-1', text: 'สรุปว่าตอนนี้รู้อะไรแล้ว' },
          { id: 'step-2', text: 'ถามหาสิ่งที่ขาดอย่างสุภาพ' },
        ],
      };

      const action: Action = {
        id: 'action-1',
        createdAt: task.createdAt,
        title: 'สรุป feedback จากบริบทที่มีอยู่',
        rationale: 'ยังตอบไม่ได้เต็มที่จนกว่าจะกู้บริบทให้พอ',
        microSteps: [
          'สรุปว่าตอนนี้รู้อะไรแล้ว',
          'ถามหาสิ่งที่ขาดอย่างสุภาพ',
          'ค่อยตอบกลับเมื่อบริบทพอ',
        ],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_response',
      };

      return { task, action, currentStepIndex: 0 };
    },
  },
  {
    name: 'dependency_wait',
    description: 'Dependency blocker where the user needs a follow-up path instead of a fresh start.',
    buildBody: () => {
      const task = createTaskContext({
        sourceText: 'งานค้างเพราะรอข้อมูลจากลูกค้าและยังไม่รู้ว่าควร follow up แบบไหนให้ไม่รบกวนเกินไป',
        workflowType: 'client_resume',
        lifecycleState: 'stalled',
        blockerSignals: ['dependency'],
      });
      task.taskFrame = {
        objective: 'กลับไปขยับงานค้างโดยลดแรงเสียดทานของ dependency',
        stage: 'ติดที่ต้องรอข้อมูลจากภายนอก',
        stakeholders: ['ลูกค้า', 'เรา'],
      };
      task.currentPlan = {
        actionTitle: 'follow up ลูกค้าแบบสุภาพและได้ข้อมูล',
        successSignal: 'ได้คำตอบที่จะพางานกลับมาเดินต่อ',
        steps: [
          { id: 'step-1', text: 'สรุปข้อมูลที่ยังขาด' },
          { id: 'step-2', text: 'ร่าง follow-up สั้น ๆ' },
        ],
      };

      const action: Action = {
        id: 'action-2',
        createdAt: task.createdAt,
        title: 'follow up ลูกค้าแบบสุภาพและได้ข้อมูล',
        rationale: 'ต้องขยับ dependency ก่อนจะเริ่มงานต่อได้',
        microSteps: [
          'สรุปข้อมูลที่ยังขาด',
          'ร่าง follow-up สั้น ๆ',
          'ส่งเฉพาะสิ่งที่ช่วยปลดล็อกงาน',
        ],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_resume',
      };

      return { task, action, currentStepIndex: 0 };
    },
  },
  {
    name: 'low_energy_shrink',
    description: 'Low-energy + too-big rescue case focused on shrinking work into the smallest next move.',
    buildBody: () => {
      const task = createTaskContext({
        sourceText: 'พลังงานต่ำมาก อยากได้ก้าวที่เล็กพอจะเริ่มได้ทันทีโดยไม่ต้องคิดเยอะ',
        workflowType: 'client_resume',
        lifecycleState: 'stalled',
        blockerSignals: ['low_energy', 'too_big'],
      });
      task.taskFrame = {
        objective: 'หาก้าวที่เล็กที่สุดเพื่อกลับเข้า task',
        stage: 'ต้องลดขนาดงานให้เริ่มได้ทันที',
        stakeholders: ['เรา'],
      };
      task.currentPlan = {
        actionTitle: 'หาก้าวแรกที่เล็กที่สุด',
        successSignal: 'มีสิ่งเดียวที่เริ่มได้ใน 5 นาที',
        steps: [
          { id: 'step-1', text: 'เลือกเฉพาะส่วนที่สำคัญที่สุด' },
          { id: 'step-2', text: 'ลงมือแค่ส่วนแรกก่อน' },
        ],
      };

      const action: Action = {
        id: 'action-3',
        createdAt: task.createdAt,
        title: 'หาก้าวแรกที่เล็กที่สุด',
        rationale: 'ลดแรงต้านของการเริ่มตอนพลังงานต่ำ',
        microSteps: [
          'เลือกเฉพาะส่วนที่สำคัญที่สุด',
          'ลงมือแค่ส่วนแรกก่อน',
          'หยุดเมื่อได้ความคืบหน้าชัด 1 จุด',
        ],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_resume',
      };

      return { task, action, currentStepIndex: 0 };
    },
  },
  {
    name: 'live_loop_client_response',
    description: 'Mirrors the live DUMP -> action -> scaffold rescue shape used in the browser smoke flow.',
    buildBody: () => {
      const task = createTaskContext({
        sourceText:
          'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้ ช่วยสรุปสถานการณ์ ร่างข้อความตอบกลับ แล้วบอกก้าวแรกที่ควรทำต่อทันที',
        workflowType: 'client_response',
        lifecycleState: 'stalled',
        blockerSignals: ['unclear_scope', 'too_big'],
      });
      task.taskFrame = {
        objective: 'ตอบลูกค้าโดยไม่ต้องกลับไปอ่านทุกอย่างใหม่ทั้งหมด',
        stage: 'มีบริบทยาวและก้าวถัดไปยังไม่คมพอ',
        stakeholders: ['ลูกค้า', 'เรา'],
      };
      task.currentPlan = {
        actionTitle: 'สรุปสถานะล่าสุดแล้วร่างข้อความตอบกลับสั้น ๆ',
        successSignal: 'ได้สรุปสถานการณ์และข้อความตอบลูกค้าฉบับแรกที่ใช้ต่อได้',
        steps: [
          { id: 'step-1', text: 'สรุป feedback หลักของลูกค้าให้เหลือ 2-3 ประเด็น' },
          { id: 'step-2', text: 'ร่างข้อความตอบกลับที่บอกทั้งสิ่งที่เข้าใจและสิ่งที่ต้องถามเพิ่ม' },
          { id: 'step-3', text: 'เลือกก้าวแรกของงานออกแบบที่ควรทำทันทีหลังตอบลูกค้า' },
        ],
      };

      const action: Action = {
        id: 'action-live-loop',
        createdAt: task.createdAt,
        title: 'สรุปสถานะล่าสุดแล้วร่างข้อความตอบกลับสั้น ๆ',
        rationale: 'ลดภาระการ reread และช่วยให้ตอบลูกค้าได้ก่อนงานจะค้างต่อ',
        microSteps: [
          'สรุป feedback หลักของลูกค้าให้เหลือ 2-3 ประเด็น',
          'ร่างข้อความตอบกลับที่บอกทั้งสิ่งที่เข้าใจและสิ่งที่ต้องถามเพิ่ม',
          'เลือกก้าวแรกของงานออกแบบที่ควรทำทันทีหลังตอบลูกค้า',
        ],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_response',
      };

      return { task, action, currentStepIndex: 1 };
    },
  },
  {
    name: 'forced_retry_rescue',
    description: 'Forces one client-side retry before the local rescue route succeeds, to stress recovery behavior.',
    forceClientRetry: true,
    buildBody: () => {
      const task = createTaskContext({
        sourceText: 'ขอทางกู้ที่ช่วยให้ตอบลูกค้าได้ แม้ตอนนี้ context ยังมั่วและเพิ่ง fail รอบแรกไป',
        workflowType: 'client_response',
        lifecycleState: 'stalled',
        blockerSignals: ['unknown', 'unclear_scope'],
      });
      task.taskFrame = {
        objective: 'ดูว่าระบบกู้ retry path ได้ไหมเมื่อรอบแรกของ rescue fail',
        stage: 'ต้องพิสูจน์ recovery path ของ rescue โดยไม่เปลี่ยน UI loop',
        stakeholders: ['เรา'],
      };
      task.currentPlan = {
        actionTitle: 'หาทางกู้ rescue รอบแรกแล้วกลับเข้าบริบทเดิม',
        successSignal: 'retry รอบถัดไปยังส่ง rescue ที่ใช้ได้กลับมา',
        steps: [
          { id: 'step-1', text: 'ระบุว่ารอบแรก fail เพราะอะไร' },
          { id: 'step-2', text: 'ลองใหม่ด้วยกติกาเดิมเพื่อดูว่าฟื้นได้ไหม' },
        ],
      };

      const action: Action = {
        id: 'action-forced-retry',
        createdAt: task.createdAt,
        title: 'หาทางกู้ rescue รอบแรกแล้วกลับเข้าบริบทเดิม',
        rationale: 'stress recovery path ให้ชัดว่าถ้า fail หนึ่งครั้ง client จะกู้ได้แค่ไหน',
        microSteps: [
          'ระบุว่ารอบแรก fail เพราะอะไร',
          'ลองใหม่ด้วยกติกาเดิมเพื่อดูว่าฟื้นได้ไหม',
        ],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_response',
      };

      return { task, action, currentStepIndex: 0 };
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

function extractFailureField(detail: string | undefined) {
  if (!detail) return undefined;

  const schemaPath = detail.match(/schema_validation_failed:\s*([a-zA-Z0-9_.[\]]+):/);
  if (schemaPath?.[1]) {
    return schemaPath[1];
  }

  const directPath = detail.match(/(?:^|\s)([a-zA-Z0-9_.[\]]+):/);
  if (directPath?.[1]) {
    return directPath[1];
  }

  const quotedPath = detail.match(/at ["']?([a-zA-Z0-9_.[\]]+)["']?/);
  return quotedPath?.[1];
}

function summarize(setting: BenchmarkSetting, routeSamples: RescueRouteSample[], clientSamples: RescueClientSample[]): RescueSummary {
  const total = routeSamples.length;
  const routeFailureFields = routeSamples.reduce<Record<string, number>>((accumulator, sample) => {
    if (!sample.failureField) return accumulator;
    accumulator[sample.failureField] = (accumulator[sample.failureField] ?? 0) + 1;
    return accumulator;
  }, {});
  return {
    setting,
    routeSamples,
    clientSamples,
    routeOkRate: toRate(routeSamples.filter((sample) => sample.ok).length, total),
    routeRepairRate: toRate(routeSamples.filter((sample) => sample.ok && sample.repairUsed).length, total),
    routeValidationFailureRate: toRate(routeSamples.filter((sample) => !sample.ok && sample.validated === false).length, total),
    route503Rate: toRate(routeSamples.filter((sample) => sample.status === 503).length, total),
    clientOkRate: toRate(clientSamples.filter((sample) => sample.ok).length, clientSamples.length),
    retryAttemptRate: toRate(clientSamples.filter((sample) => sample.retryAttempted).length, clientSamples.length),
    retrySuccessRate: toRate(clientSamples.filter((sample) => sample.retrySucceeded).length, clientSamples.length),
    medianRouteLatencyMs: median(routeSamples.map((sample) => sample.latencyMs)),
    medianClientLatencyMs: median(clientSamples.map((sample) => sample.latencyMs)),
    routeFailureFields,
  };
}

function resolveSettings() {
  const customSetting: BenchmarkSetting | null =
    process.env.RESCUE_BENCH_NUM_PREDICT || process.env.RESCUE_BENCH_REPAIR_NUM_PREDICT
      ? {
          label: process.env.RESCUE_BENCH_LABEL || 'rescue-custom',
          description: 'Custom setting from environment overrides.',
          numPredict: Number(process.env.RESCUE_BENCH_NUM_PREDICT || 170) || 170,
          repairNumPredict: Number(process.env.RESCUE_BENCH_REPAIR_NUM_PREDICT || 210) || 210,
          primaryTimeoutMs: Number(process.env.RESCUE_BENCH_TIMEOUT_MS || 22000) || 22000,
          repairTimeoutMs: Number(process.env.RESCUE_BENCH_REPAIR_TIMEOUT_MS || 12000) || 12000,
          overallBudgetMs: Number(process.env.RESCUE_BENCH_OVERALL_BUDGET_MS || 40000) || 40000,
        }
      : null;

  if (customSetting) return [customSetting];

  const requestedLabel = process.env.RESCUE_BENCH_PRESET?.trim();
  if (!requestedLabel) return PRESET_SETTINGS;

  const setting = PRESET_SETTINGS.find((candidate) => candidate.label === requestedLabel);
  if (!setting) {
    throw new Error(
      `Unknown RESCUE_BENCH_PRESET "${requestedLabel}". Expected one of: ${PRESET_SETTINGS.map((candidate) => candidate.label).join(', ')}`,
    );
  }

  return [setting];
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
  const child = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      AI_NUM_PREDICT_RESCUE: String(setting.numPredict),
      AI_NUM_PREDICT_RESCUE_REPAIR: String(setting.repairNumPredict),
      AI_TIMEOUT_RESCUE_MS: String(setting.primaryTimeoutMs),
      AI_TIMEOUT_RESCUE_REPAIR_MS: String(setting.repairTimeoutMs),
      AI_OVERALL_TIMEOUT_RESCUE_MS: String(setting.overallBudgetMs),
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

async function runRouteFixture(baseUrl: string, fixture: RescueFixture): Promise<RescueRouteSample> {
  const body = fixture.buildBody();
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/ai/rescue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;
  const json = await response.json().catch(() => null);
  const parsed = AiRescueResponseSchema.safeParse(json);

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
  const failureDetail =
    parsed.success
      ? undefined
      : (json && typeof json === 'object' && 'error' in json
        ? (json as { error?: { detail?: string } }).error?.detail
        : undefined);

  return {
    fixtureName: fixture.name,
    status: response.status,
    latencyMs,
    ok: response.ok && parsed.success,
    validated: parsed.success,
    passType,
    repairUsed,
    failureDetail,
    failureField: extractFailureField(failureDetail),
  };
}

function createBaseFetch(baseUrl: string, options?: { failFirstRescueRequest?: boolean }) {
  const nativeFetch = global.fetch.bind(global);
  let failedOnce = false;
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : '';

    if (
      options?.failFirstRescueRequest &&
      !failedOnce &&
      ((typeof input === 'string' && input.startsWith('/api/ai/rescue')) ||
        url.includes('/api/ai/rescue'))
    ) {
      failedOnce = true;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              type: 'ollama_unavailable',
              reason: 'request_timeout',
              message: 'Forced retry benchmark failure',
              detail: 'Forced retry benchmark failure before rescue route completes',
              retryable: true,
              telemetry: {
                passType: 'timeout',
                repairUsed: false,
              },
            },
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }

    if (typeof input === 'string' && input.startsWith('/')) {
      return nativeFetch(new URL(input, baseUrl).toString(), init);
    }
    if (input instanceof URL && input.toString().startsWith('/')) {
      return nativeFetch(new URL(input.toString(), baseUrl).toString(), init);
    }
    if (input instanceof Request && input.url.startsWith('/')) {
      return nativeFetch(new URL(input.url, baseUrl).toString(), init);
    }
    return nativeFetch(input as never, init as never);
  }) as typeof fetch;
}

function serializeLogPart(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseRetryLogs(logLines: string[]) {
  const failedLine = logLines.find((line) => line.includes('[EVENT] synthesis_failed') && line.includes('"operation":"rescue"'));
  const completedLine = logLines.find((line) => line.includes('[EVENT] synthesis_completed') && line.includes('"operation":"rescue"'));

  const retryAttempted = Boolean(failedLine && (failedLine.includes('"willRetry":true') || failedLine.includes('"retryAttempted":true')));
  const retrySucceeded = Boolean(completedLine && completedLine.includes('"retrySucceeded":true'));

  const statusMatch = failedLine?.match(/"status":(\d+)/);
  const reasonMatch = failedLine?.match(/"reason":"([^"]+)"/);

  return {
    retryAttempted,
    retrySucceeded,
    initialFailureStatus: statusMatch ? Number(statusMatch[1]) : undefined,
    initialFailureReason: reasonMatch?.[1],
  };
}

async function runClientFixture(baseUrl: string, fixture: RescueFixture): Promise<RescueClientSample> {
  const body = fixture.buildBody();
  const startedAt = Date.now();
  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;
  const logLines: string[] = [];

  global.fetch = createBaseFetch(baseUrl, { failFirstRescueRequest: fixture.forceClientRetry });
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(serializeLogPart).join(' '));
    originalConsoleLog(...(args as never[]));
  };

  try {
    const rescue = await requestRescue(body.task, body.action, body.currentStepIndex);
    const latencyMs = Date.now() - startedAt;
    const retrySummary = parseRetryLogs(logLines);

    return {
      fixtureName: fixture.name,
      ok: Boolean(rescue?.diagnosis?.primaryReason),
      latencyMs,
      retryAttempted: retrySummary.retryAttempted,
      retrySucceeded: retrySummary.retrySucceeded,
      initialFailureStatus: retrySummary.initialFailureStatus,
      initialFailureReason: retrySummary.initialFailureReason,
      passType: rescue.meta?.passType,
    };
  } catch {
    const latencyMs = Date.now() - startedAt;
    const retrySummary = parseRetryLogs(logLines);
    return {
      fixtureName: fixture.name,
      ok: false,
      latencyMs,
      retryAttempted: retrySummary.retryAttempted,
      retrySucceeded: retrySummary.retrySucceeded,
      initialFailureStatus: retrySummary.initialFailureStatus,
      initialFailureReason: retrySummary.initialFailureReason,
    };
  } finally {
    global.fetch = originalFetch;
    console.log = originalConsoleLog;
  }
}

async function benchmarkSetting(setting: BenchmarkSetting, port: number) {
  const server = startServer(setting, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl);

    const routeSamples: RescueRouteSample[] = [];
    const clientSamples: RescueClientSample[] = [];
    for (const fixture of FIXTURES) {
      for (let runIndex = 0; runIndex < RUNS_PER_FIXTURE; runIndex += 1) {
        routeSamples.push(await runRouteFixture(baseUrl, fixture));
        clientSamples.push(await runClientFixture(baseUrl, fixture));
      }
    }

    return summarize(setting, routeSamples, clientSamples);
  } catch (error) {
    const logs = server.readLogs();
    throw new Error(
      [
        `Rescue benchmark failed for ${setting.label}.`,
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

function printSummary(summary: RescueSummary) {
  console.log(
    JSON.stringify(
      {
        setting: summary.setting.label,
        description: summary.setting.description,
        numPredict: summary.setting.numPredict,
        repairNumPredict: summary.setting.repairNumPredict,
        primaryTimeoutMs: summary.setting.primaryTimeoutMs,
        repairTimeoutMs: summary.setting.repairTimeoutMs,
        overallBudgetMs: summary.setting.overallBudgetMs,
        runs: summary.routeSamples.length,
        routeOkRate: summary.routeOkRate,
        routeRepairRate: summary.routeRepairRate,
        routeValidationFailureRate: summary.routeValidationFailureRate,
        route503Rate: summary.route503Rate,
        clientOkRate: summary.clientOkRate,
        retryAttemptRate: summary.retryAttemptRate,
        retrySuccessRate: summary.retrySuccessRate,
        medianRouteLatencyMs: summary.medianRouteLatencyMs,
        medianClientLatencyMs: summary.medianClientLatencyMs,
        routeFailureFields: summary.routeFailureFields,
      },
      null,
      2,
    ),
  );
}

function scoreSummary(summary: RescueSummary) {
  return (
    summary.routeOkRate * 100 +
    summary.clientOkRate * 60 +
    summary.retrySuccessRate * 35 +
    summary.routeRepairRate * 20 -
    summary.route503Rate * 120 -
    summary.routeValidationFailureRate * 45 -
    summary.medianRouteLatencyMs / 1000 -
    summary.medianClientLatencyMs / 1000
  );
}

function compareSummaries(summaries: RescueSummary[]) {
  const rows = summaries.map((summary) => ({
    setting: summary.setting.label,
    description: summary.setting.description,
    numPredict: summary.setting.numPredict,
    repairNumPredict: summary.setting.repairNumPredict,
    primaryTimeoutMs: summary.setting.primaryTimeoutMs,
    repairTimeoutMs: summary.setting.repairTimeoutMs,
    overallBudgetMs: summary.setting.overallBudgetMs,
    routeOkRate: summary.routeOkRate,
    routeRepairRate: summary.routeRepairRate,
    routeValidationFailureRate: summary.routeValidationFailureRate,
    route503Rate: summary.route503Rate,
    clientOkRate: summary.clientOkRate,
    retryAttemptRate: summary.retryAttemptRate,
    retrySuccessRate: summary.retrySuccessRate,
    medianRouteLatencyMs: summary.medianRouteLatencyMs,
    medianClientLatencyMs: summary.medianClientLatencyMs,
    routeFailureFields: summary.routeFailureFields,
    score: Number(scoreSummary(summary).toFixed(2)),
  }));
  const sorted = [...rows].sort((left, right) => right.score - left.score);
  const best = summaries.find((summary) => summary.setting.label === sorted[0]?.setting) ?? summaries[0];
  const baseline = summaries.find((summary) => summary.setting.label === 'rescue-baseline-170') ?? summaries[0];
  const keepThisSetting =
    best.routeOkRate >= 0.5 &&
    best.retrySuccessRate >= 0.5 &&
    best.route503Rate <= 0.25 &&
    best.medianRouteLatencyMs <= 25000;

  return {
    rows,
    recommendation: {
      chosenSetting: keepThisSetting ? best.setting.label : null,
      keepThisSetting,
      reason:
        keepThisSetting
          ? `${best.setting.label} is the best current tradeoff between route stability, retry recovery, and latency.`
          : 'Rescue remains the weakest track; keep it out of hero onboarding or marketing until 503s fall and retry recovery improves.',
      baselineDelta: {
        routeOkRate: Number((best.routeOkRate - baseline.routeOkRate).toFixed(3)),
        route503Rate: Number((best.route503Rate - baseline.route503Rate).toFixed(3)),
        retrySuccessRate: Number((best.retrySuccessRate - baseline.retrySuccessRate).toFixed(3)),
        medianRouteLatencyMs: best.medianRouteLatencyMs - baseline.medianRouteLatencyMs,
      },
    },
  };
}

async function main() {
  await ensureBuiltApp();
  const settings = resolveSettings();
  const summaries: RescueSummary[] = [];

  for (const [index, setting] of settings.entries()) {
    const summary = await benchmarkSetting(setting, BASE_PORT + index);
    summaries.push(summary);
    printSummary(summary);
  }

  const comparison = compareSummaries(summaries);
  console.log(
    JSON.stringify(
      {
        comparison: comparison.rows,
        recommendation: comparison.recommendation,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[RESCUE_BENCHMARK] failed', error);
  process.exitCode = 1;
});
