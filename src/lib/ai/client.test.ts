import assert from 'node:assert/strict';
import test from 'node:test';

import puterSdk from '@heyputer/puter.js';
import {
  FreePuterClient,
  getPuterClient,
  LocalGemmaClient,
  getPuterCircuitBreakerStateForTest,
  resetPuterCircuitBreakerStateForTest,
  seedPuterCircuitBreakerStateForTest,
} from '@/lib/ai/client';
import {
  buildActionUserPrompt,
  buildIntakeUserPrompt,
  buildPuterActionUserPrompt,
  buildPuterIntakeUserPrompt,
  PUTER_ACTION_SYSTEM_PROMPT,
  PUTER_INTAKE_SYSTEM_PROMPT,
  PUTER_RESCUE_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import type {
  AiActionResponse,
  AiIntakeResponse,
  AiRescueResponse,
} from '@/lib/ai/operations';
import { createTaskContext } from '@/lib/store/idb';

const originalSetAuthToken = puterSdk.setAuthToken;
const originalChat = puterSdk.ai.chat;
const originalRunIntake = LocalGemmaClient.prototype.runIntake;
const originalRunAction = LocalGemmaClient.prototype.runAction;
const originalRunRescue = LocalGemmaClient.prototype.runRescue;
const originalPuterApiKey = process.env.PUTER_API_KEY;
const originalPuterTimeoutMs = process.env.MIND_PUTER_TIMEOUT_MS;
const originalLegacyPuterTimeoutMs = process.env.PUTER_TIMEOUT_MS;
const originalPuterModel = process.env.MIND_PUTER_MODEL;
const originalPuterMaxTokens = process.env.MIND_PUTER_MAX_TOKENS;
const originalPuterIntakeMaxTokens = process.env.MIND_PUTER_INTAKE_MAX_TOKENS;
const originalPuterActionMaxTokens = process.env.MIND_PUTER_ACTION_MAX_TOKENS;
const originalPuterRescueMaxTokens = process.env.MIND_PUTER_RESCUE_MAX_TOKENS;
const originalPuterTemperature = process.env.MIND_PUTER_TEMPERATURE;
const originalPuterReasoningEffort = process.env.MIND_PUTER_REASONING_EFFORT;
const originalPuterTextVerbosity = process.env.MIND_PUTER_TEXT_VERBOSITY;
const originalPuterDebugRaw = process.env.MIND_PUTER_DEBUG_RAW;
const originalPuterCircuitFailureThreshold = process.env.MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD;
const originalPuterCircuitWindowMs = process.env.MIND_PUTER_CIRCUIT_WINDOW_MS;
const originalPuterCircuitCooldownMs = process.env.MIND_PUTER_CIRCUIT_COOLDOWN_MS;
const originalWarn = console.warn;
const originalInfo = console.info;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restorePuterTestState() {
  puterSdk.setAuthToken = originalSetAuthToken;
  puterSdk.ai.chat = originalChat;
  LocalGemmaClient.prototype.runIntake = originalRunIntake;
  LocalGemmaClient.prototype.runAction = originalRunAction;
  LocalGemmaClient.prototype.runRescue = originalRunRescue;
  console.warn = originalWarn;
  console.info = originalInfo;
  restoreEnv('PUTER_API_KEY', originalPuterApiKey);
  restoreEnv('MIND_PUTER_TIMEOUT_MS', originalPuterTimeoutMs);
  restoreEnv('PUTER_TIMEOUT_MS', originalLegacyPuterTimeoutMs);
  restoreEnv('MIND_PUTER_MODEL', originalPuterModel);
  restoreEnv('MIND_PUTER_MAX_TOKENS', originalPuterMaxTokens);
  restoreEnv('MIND_PUTER_INTAKE_MAX_TOKENS', originalPuterIntakeMaxTokens);
  restoreEnv('MIND_PUTER_ACTION_MAX_TOKENS', originalPuterActionMaxTokens);
  restoreEnv('MIND_PUTER_RESCUE_MAX_TOKENS', originalPuterRescueMaxTokens);
  restoreEnv('MIND_PUTER_TEMPERATURE', originalPuterTemperature);
  restoreEnv('MIND_PUTER_REASONING_EFFORT', originalPuterReasoningEffort);
  restoreEnv('MIND_PUTER_TEXT_VERBOSITY', originalPuterTextVerbosity);
  restoreEnv('MIND_PUTER_DEBUG_RAW', originalPuterDebugRaw);
  restoreEnv('MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD', originalPuterCircuitFailureThreshold);
  restoreEnv('MIND_PUTER_CIRCUIT_WINDOW_MS', originalPuterCircuitWindowMs);
  restoreEnv('MIND_PUTER_CIRCUIT_COOLDOWN_MS', originalPuterCircuitCooldownMs);
  resetPuterCircuitBreakerStateForTest();
}

function buildTask() {
  return createTaskContext({
    sourceText: 'ลูกค้าขอให้ช่วยสรุป next action จาก note ที่ค้างอยู่',
  });
}

function puterMessage(content: unknown) {
  return { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } };
}

function stringifyLogArgs(args: unknown[]) {
  return args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
}

function assertPuterOptions(
  calls: unknown[][],
  operation: 'intake' | 'action' | 'rescue',
  expectedMaxTokens: number,
) {
  assert.equal(calls.length, 1);
  const [messages, options, testMode] = calls[0] ?? [];
  if (operation === 'rescue') {
    assert.equal(Array.isArray(messages), true);
  } else {
    assert.equal(typeof messages, 'string');
  }
  assert.equal(testMode, false);
  assert.equal((options as any).model, 'gpt-5.4-nano');
  assert.equal((options as any).max_tokens, expectedMaxTokens);
  assert.equal((options as any).temperature, 0);
  assert.equal((options as any).reasoning_effort, 'minimal');
  assert.deepEqual((options as any).text, { verbosity: 'low' });
  assert.equal((options as any).verbosity, 'low');
  assert.match(JSON.stringify(messages), new RegExp(operation === 'intake' ? 'candidateActions' : operation === 'action' ? 'chosenAction' : 'rescuePlan'));
}

function intakeFixture(): AiIntakeResponse {
  return {
    workflowType: 'client_resume',
    roomDigest: 'ลูกค้าขอให้ช่วยสรุป next action จาก note ที่ค้างอยู่',
    taskFrame: {
      objective: 'สรุป next action จาก note ที่ค้าง',
      stage: 'มีบริบทพอเริ่มจัดก้าวแรก',
      stakeholders: [],
    },
    blockers: [],
    requiresClarification: false,
    clarificationQuestion: undefined,
    taskShape: {
      deliverableType: 'execution',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'กำลังกลับเข้าบริบทของงานนี้เพื่อหาก้าวแรกที่เริ่มได้จริง',
      confidence: 0.8,
    },
    candidateActions: [
      {
        title: 'สรุป note ให้เหลือก้าวแรก',
        rationale: 'ช่วยให้เริ่มต่อได้ทันที',
        kind: 'resume_first',
      },
    ],
    meta: {
      model: 'puter',
      passType: 'primary_pass',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };
}

function actionFixture(): AiActionResponse {
  return {
    chosenAction: {
      title: 'สรุป note ให้เหลือก้าวแรก',
      rationale: 'ช่วยให้เริ่มต่อได้ทันที',
      successSignal: 'ได้ก้าวแรกที่เริ่มได้',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้มีบริบทพอเริ่มจากก้าวเดียวก่อน',
    situationSummary: 'งานนี้มี note ค้างอยู่และต้องเลือกก้าวแรก',
    meta: {
      model: 'puter',
      passType: 'primary_pass',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };
}

function rescueFixture(): AiRescueResponse {
  return {
    diagnosis: {
      primaryReason: 'too_big',
      explanation: 'ก้าวนี้ยังใหญ่เกินไปสำหรับเริ่มทันที',
    },
    rescuePlan: {
      mode: 'shrink',
      steps: [
        'ตัดก้าวนี้ให้เหลือส่วนเล็กที่สุด',
        'ทำแค่ส่วนเล็กนั้นก่อน',
      ],
    },
    suggestedMessage: 'เริ่มจากส่วนเล็กที่สุดก่อน',
    meta: {
      model: 'puter',
      passType: 'primary_pass',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };
}

test.afterEach(() => {
  restorePuterTestState();
});

test('getPuterClient binds PUTER_API_KEY to the public Puter SDK singleton', () => {
  let observedToken = '';
  process.env.PUTER_API_KEY = ' puter-token ';
  puterSdk.setAuthToken = ((token: string) => {
    observedToken = token;
  }) as typeof puterSdk.setAuthToken;

  const client = getPuterClient();

  assert.equal(observedToken, 'puter-token');
  assert.equal(typeof client.ai.chat, 'function');
});

test('FreePuterClient.runIntake calls Puter first and parses a successful intake response', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(intakeFixture());
  }) as any;

  const response = await new FreePuterClient().runIntake(buildTask());

  assertPuterOptions(chatCalls, 'intake', 1200);
  assert.equal(response.workflowType, 'client_resume');
  assert.equal(response.candidateActions[0]?.title, 'สรุป note ให้เหลือก้าวแรก');
  assert.equal(response.meta.model, 'puter');
  assert.equal(response.meta.passType, 'primary_pass');
});

test('FreePuterClient.runAction calls Puter first and parses a successful action response', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(actionFixture());
  }) as any;

  const response = await new FreePuterClient().runAction(buildTask());

  assertPuterOptions(chatCalls, 'action', 1000);
  assert.equal(response.chosenAction.title, 'สรุป note ให้เหลือก้าวแรก');
  assert.equal(response.whyThisNow.includes('ก้าวเดียว'), true);
  assert.equal(response.meta.model, 'puter');
  assert.equal(response.meta.passType, 'primary_pass');
});

test('FreePuterClient.runRescue calls Puter first and parses a successful rescue response', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(rescueFixture());
  }) as any;

  const response = await new FreePuterClient().runRescue(buildTask());

  assertPuterOptions(chatCalls, 'rescue', 180);
  assert.equal(response.diagnosis.primaryReason, 'too_big');
  assert.equal(response.rescuePlan.mode, 'shrink');
  assert.equal(response.meta.model, 'puter');
  assert.equal(response.meta.passType, 'primary_pass');
});

test('FreePuterClient logs Puter success latency and contract status', async () => {
  const infoLogs: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage(intakeFixture())) as any;
  console.info = ((...args: unknown[]) => {
    infoLogs.push(stringifyLogArgs(args));
  }) as typeof console.info;

  await new FreePuterClient().runIntake(buildTask());

  const joined = infoLogs.join('\n');
  assert.match(joined, /Puter returned contract-valid JSON/);
  assert.match(joined, /"operation":"intake"/);
  assert.match(joined, /"backend":"puter"/);
  assert.match(joined, /"model":"gpt-5.4-nano"/);
  assert.match(joined, /"elapsed_ms":\d+/);
  assert.match(joined, /"timeout_ms":15000/);
  assert.match(joined, /"contract":"valid"/);
});

test('FreePuterClient honors Puter env overrides for model, timeout, and operation max tokens', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_MODEL = 'gpt-5-mini';
  process.env.MIND_PUTER_TIMEOUT_MS = '12345';
  process.env.MIND_PUTER_ACTION_MAX_TOKENS = '222';
  process.env.MIND_PUTER_TEMPERATURE = '0.2';
  process.env.MIND_PUTER_REASONING_EFFORT = 'low';
  process.env.MIND_PUTER_TEXT_VERBOSITY = 'medium';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(actionFixture());
  }) as any;

  await new FreePuterClient().runAction(buildTask());

  const options = chatCalls[0]?.[1] as any;
  assert.equal(options.model, 'gpt-5-mini');
  assert.equal(options.max_tokens, 222);
  assert.equal(options.temperature, 0.2);
  assert.equal(options.reasoning_effort, 'low');
  assert.deepEqual(options.text, { verbosity: 'medium' });
  assert.equal(options.verbosity, 'medium');
});

test('FreePuterClient extracts fenced Puter intake JSON without using fallback', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(`\`\`\`json\n${JSON.stringify(intakeFixture())}\n\`\`\``);
  }) as any;
  LocalGemmaClient.prototype.runIntake = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runIntake;

  const intake = await new FreePuterClient().runIntake(buildTask());

  assert.equal(chatCalls.length, 1);
  assert.equal(intake.meta.model, 'puter');
  assert.equal(intake.candidateActions[0]?.kind, 'resume_first');
});

test('FreePuterClient normalizes Puter intake candidate kinds before parsing', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage({
    ...intakeFixture(),
    workflowType: 'client_response',
    taskShape: {
      ...intakeFixture().taskShape,
      immediateNeed: 'send_reply_now',
    },
    candidateActions: [
      {
        title: 'ถามกลับเพื่อยืนยัน scope ก่อน',
        rationale: 'ต้องล็อกข้อมูลที่ยังขาดก่อนตอบ timeline',
        kind: 'clarify_scope',
      },
      {
        title: 'ร่าง reply สั้นให้ลูกค้า',
        rationale: 'ช่วยตอบลูกค้าได้ทันที',
        kind: 'client_reply',
      },
    ],
  })) as any;
  LocalGemmaClient.prototype.runIntake = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runIntake;

  const intake = await new FreePuterClient().runIntake(buildTask());

  assert.equal(intake.meta.model, 'puter');
  assert.equal(intake.candidateActions[0]?.kind, 'dependency_first');
  assert.equal(intake.candidateActions[1]?.kind, 'reply_first');
});

test('FreePuterClient extracts action JSON surrounded by prose without using fallback', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(`ได้ครับ นี่คือ JSON:\n${JSON.stringify(actionFixture())}\nจบ`);
  }) as any;
  LocalGemmaClient.prototype.runAction = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runAction;

  const action = await new FreePuterClient().runAction(buildTask());

  assert.equal(chatCalls.length, 1);
  assert.equal(action.meta.model, 'puter');
  assert.equal(action.chosenAction.title, 'สรุป note ให้เหลือก้าวแรก');
});

test('FreePuterClient accepts realistic compact Puter demo JSON for intake and action', async () => {
  const demoTask = createTaskContext({
    sourceText: 'เหนื่อยมากแต่ต้องตอบลูกค้า Acme เรื่อง proposal เว็บไซต์ ลูกค้าถาม timeline ราคาเบื้องต้น และ scope ที่ยังไม่ชัด',
    workflowType: 'client_response',
    blockerSignals: ['low_energy', 'unclear_scope'],
  });
  const compactIntake = {
    workflowType: 'client_response',
    roomDigest: 'เหนื่อยแต่ต้องตอบลูกค้า Acme เรื่อง proposal, timeline, ราคา และ scope ที่ยังไม่ชัด',
    taskFrame: {
      objective: 'เตรียมคำตอบลูกค้า Acme โดยไม่รับ commitment เกิน scope',
      stage: 'มีบริบทพอเลือกก้าวแรกที่เล็กและปลอดภัย',
      stakeholders: ['ลูกค้า Acme'],
    },
    blockers: ['low_energy', 'unclear_scope'],
    requiresClarification: false,
    clarificationQuestion: null,
    taskShape: {
      deliverableType: 'reply',
      immediateNeed: 'send_reply_now',
      behaviorIntent: 'client_delivery',
      missingInputs: ['scope ที่ชัดเจน'],
      workContext: 'ต้องตอบลูกค้าเรื่อง proposal ในสภาพพลังงานต่ำ โดยคุม timeline ราคา และ scope ให้ไม่เกินจริง',
      confidence: 0.84,
    },
    candidateActions: [
      {
        title: 'ร่างคำตอบลูกค้า Acme แบบคุม timeline และ scope',
        rationale: 'เป็นก้าวเล็กที่ตอบลูกค้าได้ทันทีโดยไม่ commit เกินข้อมูลที่มี',
        kind: 'reply_first',
      },
    ],
    meta: { model: 'puter', usedRoomFiles: [], repairUsed: false },
  };
  const compactAction = {
    chosenAction: {
      title: 'ร่างคำตอบลูกค้า Acme แบบคุม timeline และ scope',
      rationale: 'ตอบได้ในก้าวเดียวและยังกันความเสี่ยงจาก scope ที่ไม่ชัด',
      successSignal: 'มีข้อความตอบกลับสั้นที่ส่งหรือปรับต่อได้',
    },
    alternatives: [
      {
        title: 'แยกคำถามเรื่อง scope ที่ต้องยืนยันก่อน',
        rationale: 'เหมาะถ้ายังไม่พร้อมร่างคำตอบทันที',
      },
    ],
    whyThisNow: 'ลูกค้ารอคำตอบและมีบริบทพอร่างข้อความที่ไม่รับ commitment เกินจริง',
    replyDraft: 'ขอบคุณครับ ขอเช็ก scope ที่ยังไม่ชัดอีกจุดก่อนยืนยัน timeline และราคาเบื้องต้น แล้วจะส่งกรอบที่ปลอดภัยให้ต่อครับ',
    situationSummary: 'เหนื่อยแต่ต้องตอบลูกค้า Acme เรื่อง proposal จึงควรเริ่มจาก reply สั้นที่คุม scope',
    meta: { model: 'puter', usedRoomFiles: [], repairUsed: false },
  };
  let callCount = 0;
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage(callCount++ === 0 ? compactIntake : compactAction)) as any;
  LocalGemmaClient.prototype.runIntake = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runAction = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runAction;

  const intake = await new FreePuterClient().runIntake(demoTask);
  const action = await new FreePuterClient().runAction(demoTask, {
    preferredCandidate: intake.candidateActions[0],
  });

  assert.equal(intake.meta.model, 'puter');
  assert.equal(action.meta.model, 'puter');
  assert.match(intake.roomDigest, /Acme|proposal/);
  assert.match(action.situationSummary, /Acme|proposal/);
});

test('FreePuterClient raw diagnostics classify fenced JSON when enabled', async () => {
  const infoLogs: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_DEBUG_RAW = '1';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage(`\`\`\`json\n${JSON.stringify(actionFixture())}\n\`\`\``)) as any;
  console.info = ((...args: unknown[]) => {
    infoLogs.push(stringifyLogArgs(args));
  }) as typeof console.info;

  await new FreePuterClient().runAction(buildTask());

  const rawLog = infoLogs.find((entry) => entry.includes('[MIND][AI_PUTER_RAW]')) ?? '';
  assert.match(rawLog, /"operation":"action"/);
  assert.match(rawLog, /"category":"json_with_prose_or_fence"/);
  assert.match(rawLog, /"raw_length":\d+/);
  assert.match(rawLog, /"json_length":\d+/);
});

test('FreePuterClient raw diagnostics classify empty Puter output before fallback', async () => {
  const infoLogs: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_DEBUG_RAW = '1';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage('')) as any;
  console.info = ((...args: unknown[]) => {
    infoLogs.push(stringifyLogArgs(args));
  }) as typeof console.info;
  LocalGemmaClient.prototype.runIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;

  const intake = await new FreePuterClient().runIntake(buildTask());

  const rawLog = infoLogs.find((entry) => entry.includes('[MIND][AI_PUTER_RAW]')) ?? '';
  assert.equal(intake.meta.model, 'local_gemma_fixture');
  assert.match(rawLog, /"operation":"intake"/);
  assert.match(rawLog, /"category":"empty"/);
});

test('FreePuterClient timeout fallback log includes elapsed and timeout metadata', async () => {
  const warnings: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_TIMEOUT_MS = '5';
  process.env.MIND_PUTER_MODEL = 'gpt-5-nano';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (() => new Promise(() => undefined)) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(stringifyLogArgs(args));
  }) as typeof console.warn;
  LocalGemmaClient.prototype.runIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;

  const intake = await new FreePuterClient().runIntake(buildTask());

  const joined = warnings.join('\n');
  assert.equal(intake.meta.model, 'local_gemma_fixture');
  assert.match(joined, /Puter failed, falling back/);
  assert.match(joined, /"operation":"intake"/);
  assert.match(joined, /"backend":"puter"/);
  assert.match(joined, /"nextBackend":"local_gemma"/);
  assert.match(joined, /"reason":"puter_timeout"/);
  assert.match(joined, /"model":"gpt-5-nano"/);
  assert.match(joined, /"elapsed_ms":\d+/);
  assert.match(joined, /"timeout_ms":5/);
});

test('FreePuterClient falls back to LocalGemmaClient when Puter fails without ENOENT leakage', async () => {
  const warnings: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    throw new Error('Puter auth failed');
  }) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(stringifyLogArgs(args));
  }) as typeof console.warn;

  LocalGemmaClient.prototype.runIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runAction = (async () => ({
    ...actionFixture(),
    meta: {
      ...actionFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runAction;
  LocalGemmaClient.prototype.runRescue = (async () => ({
    ...rescueFixture(),
    meta: {
      ...rescueFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runRescue;

  const intake = await new FreePuterClient().runIntake(buildTask());
  const action = await new FreePuterClient().runAction(buildTask());
  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(intake.meta.model, 'local_gemma_fixture');
  assert.equal(action.meta.model, 'local_gemma_fixture');
  assert.equal(rescue.meta.model, 'local_gemma_fixture');
  assert.equal(warnings.length, 3);
  assert.match(warnings.join('\n'), /Puter failed, falling back/);
  assert.match(warnings.join('\n'), /puter_auth_error/);
  assert.doesNotMatch(warnings.join('\n'), /ENOENT|dist\/puter\.cjs/);
});

test('FreePuterClient falls back when Puter returns non-JSON output', async () => {
  const warnings: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage('```json\n{\n```')) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  }) as typeof console.warn;

  LocalGemmaClient.prototype.runAction = (async () => ({
    ...actionFixture(),
    meta: {
      ...actionFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runAction;

  const action = await new FreePuterClient().runAction(buildTask());

  assert.equal(action.meta.model, 'local_gemma_fixture');
  assert.match(warnings.join('\n'), /Puter failed, falling back/);
  assert.match(warnings.join('\n'), /puter_contract_invalid/);
});

test('FreePuterClient opens a Puter circuit after repeated failures', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD = '1';
  process.env.MIND_PUTER_CIRCUIT_WINDOW_MS = '1000';
  process.env.MIND_PUTER_CIRCUIT_COOLDOWN_MS = '1000';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    throw new Error('Puter auth failed');
  }) as any;

  const localFallbackIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runIntake = localFallbackIntake;

  const response = await new FreePuterClient().runIntake(buildTask());
  const snapshot = getPuterCircuitBreakerStateForTest();

  assert.equal(response.meta.model, 'local_gemma_fixture');
  assert.equal(snapshot.failureTimestamps.length, 0);
  assert.ok(snapshot.openUntil > 0);
});

test('FreePuterClient opens only the rescue circuit after rescue failures', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD = '1';
  process.env.MIND_PUTER_CIRCUIT_WINDOW_MS = '1000';
  process.env.MIND_PUTER_CIRCUIT_COOLDOWN_MS = '1000';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    throw new Error('Puter rescue failed');
  }) as any;
  LocalGemmaClient.prototype.runRescue = (async () => ({
    ...rescueFixture(),
    meta: {
      ...rescueFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runRescue;

  const response = await new FreePuterClient().runRescue(buildTask());
  const rescueSnapshot = getPuterCircuitBreakerStateForTest('rescue');
  const intakeSnapshot = getPuterCircuitBreakerStateForTest('intake');
  const actionSnapshot = getPuterCircuitBreakerStateForTest('action');

  assert.equal(response.meta.model, 'local_gemma_fixture');
  assert.ok(rescueSnapshot.openUntil > 0);
  assert.equal(intakeSnapshot.openUntil, 0);
  assert.equal(actionSnapshot.openUntil, 0);
});

test('FreePuterClient still attempts intake and action while rescue circuit is open', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [],
    openUntil: Date.now() + 60_000,
    probeInFlight: false,
  }, 'rescue');
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(chatCalls.length === 1 ? intakeFixture() : actionFixture());
  }) as any;
  LocalGemmaClient.prototype.runIntake = (async () => {
    throw new Error('Local Gemma intake fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runAction = (async () => {
    throw new Error('Local Gemma action fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runAction;

  const client = new FreePuterClient();
  const intake = await client.runIntake(buildTask());
  const action = await client.runAction(buildTask());
  const rescueSnapshot = getPuterCircuitBreakerStateForTest('rescue');

  assert.equal(intake.meta.model, 'puter');
  assert.equal(action.meta.model, 'puter');
  assert.equal(chatCalls.length, 2);
  assert.equal(rescueSnapshot.openUntil > Date.now(), true);
});

test('FreePuterClient intake failure does not open the action circuit', async () => {
  let chatCallCount = 0;
  process.env.PUTER_API_KEY = 'puter-token';
  process.env.MIND_PUTER_CIRCUIT_FAILURE_THRESHOLD = '1';
  process.env.MIND_PUTER_CIRCUIT_WINDOW_MS = '1000';
  process.env.MIND_PUTER_CIRCUIT_COOLDOWN_MS = '1000';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    chatCallCount += 1;
    if (chatCallCount === 1) throw new Error('Puter intake failed');
    return puterMessage(actionFixture());
  }) as any;
  LocalGemmaClient.prototype.runIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runAction = (async () => {
    throw new Error('Local Gemma action fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runAction;

  const client = new FreePuterClient();
  const intake = await client.runIntake(buildTask());
  const action = await client.runAction(buildTask());

  assert.equal(intake.meta.model, 'local_gemma_fixture');
  assert.equal(action.meta.model, 'puter');
  assert.equal(chatCallCount, 2);
  assert.ok(getPuterCircuitBreakerStateForTest('intake').openUntil > 0);
  assert.equal(getPuterCircuitBreakerStateForTest('action').openUntil, 0);
});

test('Puter circuit test reset without operation clears all operation states', () => {
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [Date.now()],
    openUntil: Date.now() + 60_000,
    probeInFlight: true,
  }, 'intake');
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [Date.now()],
    openUntil: Date.now() + 60_000,
    probeInFlight: true,
  }, 'rescue');

  resetPuterCircuitBreakerStateForTest();

  assert.equal(getPuterCircuitBreakerStateForTest('intake').openUntil, 0);
  assert.equal(getPuterCircuitBreakerStateForTest('rescue').openUntil, 0);
});

test('FreePuterClient skips Puter while the circuit is open', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [],
    openUntil: Date.now() + 60_000,
    probeInFlight: false,
  });
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(intakeFixture());
  }) as any;

  const localFallbackIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runIntake = localFallbackIntake;

  const client = new FreePuterClient();
  const response = await client.runIntake(buildTask());
  const snapshot = getPuterCircuitBreakerStateForTest();

  assert.equal(response.meta.model, 'local_gemma_fixture');
  assert.equal(chatCalls.length, 0);
  assert.equal(snapshot.openUntil > Date.now(), true);
});

test('FreePuterClient logs a dev hint when puter_circuit_open repeats', async () => {
  const warnings: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [],
    openUntil: Date.now() + 60_000,
    probeInFlight: false,
  }, 'rescue');
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    throw new Error('Puter should be skipped while circuit is open');
  }) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(stringifyLogArgs(args));
  }) as typeof console.warn;
  LocalGemmaClient.prototype.runRescue = (async () => ({
    ...rescueFixture(),
    meta: {
      ...rescueFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runRescue;

  const client = new FreePuterClient();
  await client.runRescue(buildTask());
  await client.runRescue(buildTask());

  const joined = warnings.join('\n');
  assert.match(joined, /Puter circuit dev hint/);
  assert.match(joined, /Puter circuit is in-memory; restart dev server to clear old state/);
  assert.match(joined, /"operation":"rescue"/);
  assert.match(joined, /"reason":"puter_circuit_open"/);
  assert.match(joined, /"failure_count":0/);
  assert.match(joined, /"open_until":\d+/);
});

test('FreePuterClient allows a Puter probe again after cooldown expires', async () => {
  const chatCalls: unknown[][] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  seedPuterCircuitBreakerStateForTest({
    failureTimestamps: [],
    openUntil: Date.now() - 1,
    probeInFlight: false,
  });
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async (...args: unknown[]) => {
    chatCalls.push(args);
    return puterMessage(intakeFixture());
  }) as any;

  const localFallbackIntake = (async () => ({
    ...intakeFixture(),
    meta: {
      ...intakeFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runIntake;
  LocalGemmaClient.prototype.runIntake = localFallbackIntake;

  const response = await new FreePuterClient().runIntake(buildTask());
  const snapshot = getPuterCircuitBreakerStateForTest();

  assert.equal(response.meta.model, 'puter');
  assert.equal(chatCalls.length, 1);
  assert.equal(snapshot.openUntil, 0);
  assert.equal(snapshot.probeInFlight, false);
});

test('Puter prompt builders keep contracts while compacting Room context', () => {
  const repeatedContext = 'รายละเอียด room ที่ยาวมาก '.repeat(180);
  const repeatedEvidence = 'evidence จากไฟล์ที่ยาวมาก '.repeat(80);
  const task = createTaskContext({
    sourceText: repeatedContext,
    extractedText: repeatedContext,
    workflowType: 'client_resume',
    taskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      behaviorIntent: 'client_delivery',
      missingInputs: ['scope'],
      workContext: repeatedContext,
      confidence: 0.71,
    },
    blockerSignals: ['scope unclear'],
  });
  task.taskFrame = {
    objective: 'เตรียม proposal สำหรับลูกค้า',
    stage: 'กำลังจัด scope',
    stakeholders: ['ลูกค้า A'],
  };

  const preferredCandidate = {
    title: 'จัด scope จาก note ลูกค้า',
    rationale: 'ต้องล็อกขอบเขตก่อนทำ proposal',
    kind: 'resume_first',
  };
  const evidenceContext = {
    summaryText: repeatedEvidence,
    evidenceChips: [],
    selectionMethod: 'retrieval' as const,
  };

  const fullIntakePrompt = buildIntakeUserPrompt(task);
  const puterIntakePrompt = buildPuterIntakeUserPrompt(task);
  const fullActionPrompt = buildActionUserPrompt(task, preferredCandidate, null, evidenceContext);
  const puterActionPrompt = buildPuterActionUserPrompt(task, preferredCandidate, null, evidenceContext);

  assert.match(PUTER_INTAKE_SYSTEM_PROMPT, /candidateActions/);
  assert.match(PUTER_ACTION_SYSTEM_PROMPT, /chosenAction/);
  assert.match(PUTER_RESCUE_SYSTEM_PROMPT, /rescuePlan/);
  assert.equal(puterIntakePrompt.includes(repeatedContext), false);
  assert.equal(puterActionPrompt.includes(repeatedContext), false);
  assert.equal(puterActionPrompt.includes(repeatedEvidence), false);
  assert.equal(puterIntakePrompt.length < fullIntakePrompt.length, true);
  assert.equal(puterActionPrompt.length < fullActionPrompt.length, true);
  assert.match(puterIntakePrompt, /Return valid JSON only/);
  assert.match(puterActionPrompt, /จัด scope จาก note ลูกค้า/);
  assert.match(puterActionPrompt, /evidenceSummary/);
  assert.match(puterActionPrompt, /evidence จากไฟล์ที่ยาวมาก/);
});

// ---------------------------------------------------------------------------
// Rescue JSON normalization — Puter extraction path (Mini 1)
// ---------------------------------------------------------------------------

test('FreePuterClient.runRescue parses raw rescue JSON without fallback', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => puterMessage(rescueFixture())) as any;
  LocalGemmaClient.prototype.runRescue = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runRescue;

  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(rescue.diagnosis.primaryReason, 'too_big');
  assert.equal(rescue.rescuePlan.mode, 'shrink');
  assert.equal(rescue.meta.model, 'puter');
  assert.equal(rescue.meta.passType, 'primary_pass');
});

test('FreePuterClient.runRescue extracts fenced rescue JSON without fallback', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () =>
    puterMessage(`\`\`\`json\n${JSON.stringify(rescueFixture())}\n\`\`\``)) as any;
  LocalGemmaClient.prototype.runRescue = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runRescue;

  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(rescue.diagnosis.primaryReason, 'too_big');
  assert.equal(rescue.rescuePlan.mode, 'shrink');
  assert.equal(rescue.meta.model, 'puter');
});

test('FreePuterClient.runRescue extracts rescue JSON embedded in prose without fallback', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () =>
    puterMessage(`นี่คือผลการวินิจฉัย:\n${JSON.stringify(rescueFixture())}\nจบแล้ว`)) as any;
  LocalGemmaClient.prototype.runRescue = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runRescue;

  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(rescue.diagnosis.primaryReason, 'too_big');
  assert.equal(rescue.rescuePlan.mode, 'shrink');
  assert.equal(rescue.meta.model, 'puter');
});

test('FreePuterClient.runRescue parses rescue JSON with extra unknown fields', async () => {
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  const fixtureWithExtras = {
    ...rescueFixture(),
    unknownField: 'extra-data-should-be-ignored',
    diagnosis: {
      ...rescueFixture().diagnosis,
      extraDiagnosisField: 'ignored',
    },
  };
  puterSdk.ai.chat = (async () => puterMessage(fixtureWithExtras)) as any;
  LocalGemmaClient.prototype.runRescue = (async () => {
    throw new Error('Local Gemma fallback should not run');
  }) as typeof LocalGemmaClient.prototype.runRescue;

  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(rescue.diagnosis.primaryReason, 'too_big');
  assert.equal(rescue.rescuePlan.mode, 'shrink');
  assert.equal(rescue.meta.model, 'puter');
});

test('FreePuterClient.runRescue falls back safely when Puter returns invalid rescue JSON', async () => {
  const warnings: string[] = [];
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  // Malformed JSON inside fences — extractPuterJsonObject returns null → puter_contract_invalid
  puterSdk.ai.chat = (async () => puterMessage('```json\n{\n```')) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  }) as typeof console.warn;
  LocalGemmaClient.prototype.runRescue = (async () => ({
    ...rescueFixture(),
    meta: {
      ...rescueFixture().meta,
      model: 'local_gemma_fixture',
      passType: 'fallback_pass',
    },
  })) as typeof LocalGemmaClient.prototype.runRescue;

  const rescue = await new FreePuterClient().runRescue(buildTask());

  assert.equal(rescue.meta.model, 'local_gemma_fixture');
  assert.match(warnings.join('\n'), /Puter failed, falling back/);
  assert.match(warnings.join('\n'), /puter_contract_invalid/);
});
