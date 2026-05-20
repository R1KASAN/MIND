import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { AiActionResponseSchema, AiIntakeResponseSchema, AiReentryResponseSchema } from '../src/lib/ai/operations';
import { createTaskContext, type Action } from '../src/lib/store/idb';

const DEFAULT_PORT = Number(process.env.MIND_SMOKE_AI_ROUTES_PORT || 3204) || 3204;
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11437';
const TARGET_MODEL = process.env.AI_MODEL || 'gemma2:2b';

type SmokeResult = {
  route: 'intake' | 'action' | 'reentry';
  status: number;
  model: string;
  passType?: string;
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
      // keep polling until the app server is ready
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for app server at ${baseUrl}`);
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
  const serverLogPath = process.env.MIND_SMOKE_AI_ROUTES_SERVER_LOG_PATH;
  const serverLogFd = serverLogPath ? openSync(serverLogPath, 'a') : null;

  return spawn('npm', ['run', 'start:local-ai', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OLLAMA_HOST: OLLAMA_BASE_URL,
      AI_MODEL: TARGET_MODEL,
      AI_FALLBACK_MODELS: TARGET_MODEL,
      AI_TIMEOUT_QWEN_MS: process.env.AI_TIMEOUT_QWEN_MS || '120000',
      AI_TIMEOUT_ACTION_QWEN_MS: process.env.AI_TIMEOUT_ACTION_QWEN_MS || '120000',
      AI_REPAIR_TIMEOUT_QWEN_MS: process.env.AI_REPAIR_TIMEOUT_QWEN_MS || '60000',
      AI_TIMEOUT_FALLBACK_MS: process.env.AI_TIMEOUT_FALLBACK_MS || '60000',
      AI_TIMEOUT_ACTION_FALLBACK_MS: process.env.AI_TIMEOUT_ACTION_FALLBACK_MS || '60000',
      AI_OVERALL_TIMEOUT_MS: process.env.AI_OVERALL_TIMEOUT_MS || '180000',
    },
    stdio: ['ignore', serverLogFd ?? 'inherit', serverLogFd ?? 'inherit'],
  });
}

function buildIntakeTask() {
  return createTaskContext({
    roomId: 'room-gemma-intake',
    sourceText:
      'ลูกค้าส่งอีเมลมาขอนัด demo สัปดาห์หน้า และถามว่า pilot เริ่มได้เร็วสุดเมื่อไร ช่วยหาก้าวแรกที่ตอบได้จริงโดยไม่ต้อง reread ทั้ง thread',
    workflowType: 'client_response',
    lifecycleState: 'dumped',
    blockerSignals: ['unclear_scope'],
  });
}

function buildActionFixture() {
  const task = createTaskContext({
    roomId: 'room-gemma-action',
    sourceText:
      'ลูกค้าถามเรื่อง pilot และ timeline อยากได้ข้อความตอบกลับที่เริ่มได้จริงภายในไม่กี่นาที โดยไม่เผลอรับ commitment เกิน scope',
    workflowType: 'client_response',
    lifecycleState: 'has_one_action',
    blockerSignals: ['unclear_scope'],
  });

  task.taskFrame = {
    objective: 'ตอบลูกค้าเรื่อง pilot และ timeline แบบปลอดภัย',
    stage: 'กำลังเตรียมข้อความตอบกลับก่อนนัด demo',
    stakeholders: ['ลูกค้า'],
  };
  task.currentPlan = {
    actionTitle: 'สรุปสิ่งที่ตอบได้ตอนนี้ก่อนร่าง reply',
    successSignal: 'มีข้อความตอบกลับสั้นที่ส่งได้จริงและไม่หลุด scope',
    steps: [
      { id: 'step-1', text: 'สรุปสิ่งที่ลูกค้าขอจากอีเมลล่าสุด' },
      { id: 'step-2', text: 'ร่างข้อความตอบกลับพร้อมกรอบ next step' },
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
      title: 'ร่างข้อความตอบกลับสั้นที่ล็อกกรอบ pilot ก่อน',
      rationale: 'ช่วยตอบลูกค้าได้เร็วโดยไม่รับ scope เกินจริง',
      kind: 'reply_first' as const,
    },
  };
}

function buildReentryFixture() {
  const task = createTaskContext({
    roomId: 'room-gemma-reentry',
    sourceText:
      'โปรเจกต์ pilot ค้างมาสามวัน ต้องกลับมาต่อจากอีเมลกับโน้ตเดิม โดยเป้าคือรู้ว่าควรเริ่มก้าวไหนก่อน',
    workflowType: 'client_resume',
    lifecycleState: 'has_one_action',
    currentActionId: 'action-gemma-reentry',
  });

  task.taskFrame = {
    objective: 'กลับเข้าบริบทของ pilot แล้วเริ่มจาก next move ที่แตะได้ทันที',
    stage: 'กำลัง reentry หลังหายไปหลายวัน',
    stakeholders: ['ตัวเอง', 'ลูกค้า'],
  };
  task.currentPlan = {
    actionTitle: 'สรุปจุดค้างของ pilot ก่อน',
    successSignal: 'รู้ว่าต้องเปิดอะไรและทำอะไรก่อนในห้านาทีแรก',
    steps: [
      { id: 'step-1', text: 'เปิดข้อสรุปล่าสุดของ pilot' },
      { id: 'step-2', text: 'เช็กสิ่งที่ต้องตอบหรือยืนยันกับลูกค้า' },
    ],
  };
  task.currentStepIndex = 0;

  const action: Action = {
    id: 'action-gemma-reentry',
    roomId: 'room-gemma-reentry',
    createdAt: Date.now(),
    title: 'สรุปจุดค้างของ pilot ก่อน',
    rationale: 'ช่วยกลับเข้าบริบทโดยไม่ต้องรื้อทั้งหมดใหม่',
    microSteps: ['เปิดข้อสรุปล่าสุดของ pilot', 'เช็กสิ่งที่ต้องตอบหรือยืนยันกับลูกค้า'],
    isPinned: true,
    state: 'IN_PROGRESS',
    workflowType: 'client_resume',
    situationSummary: 'มีบริบทพอสำหรับกลับเข้าบริบทและเดินต่อจากจุดเดิม',
    detectedBlockers: [],
  };

  return { task, action, scope: 'bounce_back' as const };
}

async function postJson(baseUrl: string, route: string, body: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

function assertGemmaMeta(route: SmokeResult['route'], model: string | undefined) {
  assert.ok(model, `${route} response did not include meta.model`);
  assert.match(model, /gemma2/i, `${route} response meta.model was not Gemma: ${model}`);
}

async function runIntake(baseUrl: string): Promise<SmokeResult> {
  const { response, json } = await postJson(baseUrl, '/api/ai/intake', {
    task: buildIntakeTask(),
  });
  assert.equal(response.status, 200, `intake returned HTTP ${response.status}: ${JSON.stringify(json)}`);

  const parsed = AiIntakeResponseSchema.safeParse(json);
  assert.equal(parsed.success, true, `intake response failed schema validation: ${JSON.stringify(json)}`);
  assertGemmaMeta('intake', parsed.data.meta.model);

  return {
    route: 'intake',
    status: response.status,
    model: parsed.data.meta.model,
    passType: parsed.data.meta.passType,
  };
}

async function runAction(baseUrl: string): Promise<SmokeResult> {
  const { task, preferredCandidate } = buildActionFixture();
  const { response, json } = await postJson(baseUrl, '/api/ai/action', {
    task,
    preferredCandidate,
  });
  assert.equal(response.status, 200, `action returned HTTP ${response.status}: ${JSON.stringify(json)}`);

  const parsed = AiActionResponseSchema.safeParse(json);
  assert.equal(parsed.success, true, `action response failed schema validation: ${JSON.stringify(json)}`);
  assertGemmaMeta('action', parsed.data.meta.model);

  return {
    route: 'action',
    status: response.status,
    model: parsed.data.meta.model,
    passType: parsed.data.meta.passType,
  };
}

async function runReentry(baseUrl: string): Promise<SmokeResult> {
  const { task, action, scope } = buildReentryFixture();
  const { response, json } = await postJson(baseUrl, '/api/ai/reentry', {
    task,
    action,
    scope,
  });
  assert.equal(response.status, 200, `reentry returned HTTP ${response.status}: ${JSON.stringify(json)}`);

  const parsed = AiReentryResponseSchema.safeParse(json);
  assert.equal(parsed.success, true, `reentry response failed schema validation: ${JSON.stringify(json)}`);
  assertGemmaMeta('reentry', parsed.data.meta.model);

  return {
    route: 'reentry',
    status: response.status,
    model: parsed.data.meta.model,
    passType: parsed.data.meta.passType,
  };
}

async function main() {
  await ensureBuiltApp();

  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  console.log(
    JSON.stringify(
      {
        smoke: 'ai-routes-gemma',
        baseUrl,
        ollamaBaseUrl: OLLAMA_BASE_URL,
        targetModel: TARGET_MODEL,
      },
      null,
      2,
    ),
  );

  const server = startServer(DEFAULT_PORT);
  try {
    await waitForServer(baseUrl);
    const results = [
      await runIntake(baseUrl),
      await runAction(baseUrl),
      await runReentry(baseUrl),
    ];

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error('[SMOKE] gemma ai routes failed', error);
  process.exitCode = 1;
});
