import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManualRescueResponse,
  extractAnchorWords,
  inferRescueFallbackReason,
  normalizeRescueResponse,
  resolveRescueRouteBudget,
} from './rescue-runtime';
import type { Action, TaskContext } from '@/lib/store/idb';

// ─── Banned Phrases ──────────────────────────────────────────────────────────

const BANNED_PHRASES = [
  'AI ยังตอบไม่ทัน',
  'ลดแรงเริ่ม',
  'พลังงานต่ำ',
  'ทำแค่ 5 นาทีแรก',
];

function assertNoBannedPhrases(text: string, label: string) {
  for (const phrase of BANNED_PHRASES) {
    assert.ok(!text.includes(phrase), `${label} must not include banned phrase: "${phrase}". Got: "${text}"`);
  }
}

function assertHasAtLeastNAnchors(text: string, anchors: string[], n: number, label: string) {
  const count = anchors.filter((a) => text.includes(a)).length;
  assert.ok(count >= n, `${label} must include at least ${n} anchor(s) from [${anchors.join(', ')}]. Found ${count} in: "${text}"`);
}

// ─── Existing Tests ──────────────────────────────────────────────────────────

test('resolveRescueRouteBudget widens only timeout-recovery retries', () => {
  const resolved = resolveRescueRouteBudget(
    {
      primaryTimeoutMs: 20000,
      repairTimeoutMs: 14000,
      fallbackTimeoutMs: 14000,
      overallBudgetMs: 40000,
    },
    {
      attempt: 2,
      previousStatus: 503,
      previousReason: 'request_timeout',
      previousPassType: 'timeout',
    },
  );

  assert.deepEqual(resolved, {
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 16000,
    fallbackTimeoutMs: 16000,
    overallBudgetMs: 45000,
  });
});

test('resolveRescueRouteBudget keeps the baseline budget on first attempt', () => {
  const baseline = {
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 14000,
    fallbackTimeoutMs: 14000,
    overallBudgetMs: 40000,
  };

  const resolved = resolveRescueRouteBudget(baseline, {
    attempt: 1,
    previousStatus: 503,
    previousReason: 'request_timeout',
    previousPassType: 'timeout',
  });

  assert.deepEqual(resolved, baseline);
});

test('inferRescueFallbackReason maps personal friction to low_energy without requiring blockerSignals', () => {
  const reason = inferRescueFallbackReason({
    id: 'task-low-energy',
    workflowType: 'client_resume',
    sourceText: 'หิวข้าวมากแต่ต้องทำงานต่อ',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'stalled',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    taskShape: {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'ตอนนี้หิวและหมดแรงแต่ยังต้องทำงานต่อ',
      behaviorIntent: 'personal_friction',
      confidence: 0.84,
    },
  });

  assert.equal(reason, 'low_energy');
});

// ─── Semantic Quality Tests ──────────────────────────────────────────────────

function makeRescueTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    id: 'rescue-task-1',
    sourceText: 'ลูกค้า ABC Corp ทวงงานค้าง เซิร์ฟเวอร์ล่มเมื่อเช้า แชตไลน์เด้งไม่หยุด',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'stalled',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    ...overrides,
  };
}

test('buildManualRescueResponse (missing_context): no banned phrases, has causal explanation with anchors', () => {
  const task = makeRescueTask({ blockerSignals: ['missing_file_or_context'] });
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  // Explanation quality
  assertNoBannedPhrases(response.diagnosis.explanation, 'explanation');
  assertHasAtLeastNAnchors(response.diagnosis.explanation, ['ABC Corp', 'เซิร์ฟเวอร์', 'แชต'], 1, 'explanation');
  assert.ok(response.diagnosis.explanation.includes('ขาด') || response.diagnosis.explanation.includes('ไม่พอ'),
    'Explanation must describe WHY blocked (missing info)');

  // Recovery quality
  assert.equal(response.rescuePlan.steps.length, 1, 'Must have exactly 1 recovery step');
  for (const step of response.rescuePlan.steps) {
    assertNoBannedPhrases(step, 'recovery step');
  }

  // Suggested message quality
  assert.ok(response.suggestedMessage, 'missing_context should include a copy-paste message');
  assertNoBannedPhrases(response.suggestedMessage!, 'suggested message');
});

test('normalizeRescueResponse keeps exactly one grounded smaller step for the incident room', () => {
  const task = makeRescueTask({
    sourceText: [
      'เหนื่อยมาก แต่ยังต้องตอบ ABC Corp เรื่อง incident เมื่อเช้า',
      'payment API timeout ไป 20 นาที',
      'ทีม CS ถามว่าจะตอบลูกค้ายังไง',
      'ผมยังไม่ได้เปิด Dashboard อีกรอบ',
      'หัวตื้อ ไม่รู้จะเริ่มตรงไหน',
    ].join('\n'),
  });
  const action: Action = {
    id: 'action-1',
    createdAt: 1,
    title: 'ส่งอัปเดตสถานะ incident ให้ CS',
    rationale: 'ตอบลูกค้าด้วยสถานะล่าสุดก่อน',
    microSteps: ['เปิด Dashboard', 'เช็ก payment API', 'ร่าง update ให้ CS'],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_response',
  };

  const response = normalizeRescueResponse({
    task,
    action,
    currentStepIndex: 0,
    rescue: {
      diagnosis: {
        primaryReason: 'too_big',
        explanation: 'ยังไม่ได้เปิด Dashboard และยังต้องตอบ CS เรื่อง payment API',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'วิเคราะห์ root cause ของ timeout',
          'ทำ RCA แล้ววางแผน incident response หลายขั้น',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: 'test-rescue',
        repairUsed: false,
        usedRoomFiles: [],
      },
    },
  });

  assert.equal(response.rescuePlan.steps.length, 1);
  assert.equal(response.rescuePlan.mode, 'shrink');
  assert.equal(response.rescuePlan.steps[0], 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS');
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /CPU spike|10:20/u);
});

test('normalizeRescueResponse keeps Browser QA rescue grounded and does not invent customer context', () => {
  const task = makeRescueTask({
    sourceText: [
      'ห้องนี้รกมาก ต้องเตรียม demo MIND วันนี้',
      'notes กระจัดกระจาย เรื่อง fallback latency, reentry card, ปุ่มช่วยแก้ก้าวนี้, evidence source',
      'กลัวว่ากดจบแล้วกลับมาจะ context หาย',
      'อยากได้ก้าวเดียวที่ทำต่อได้ทันที',
    ].join('\n'),
    currentPlan: {
      actionTitle: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
      steps: [
        { id: 'step-1', text: 'สรุป ปุ่ม เป็น 3 บรรทัด' },
        { id: 'step-2', text: 'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้' },
      ],
    },
  });
  const action: Action = {
    id: 'action-demo',
    createdAt: 1,
    title: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
    rationale: 'ต้องรวมจุดเสี่ยงของ demo ให้เช็กได้ทันที',
    microSteps: [
      'สรุป ปุ่ม เป็น 3 บรรทัด',
      'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้',
    ],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_resume',
  };

  const response = normalizeRescueResponse({
    task,
    action,
    currentStepIndex: 0,
    rescue: {
      diagnosis: {
        primaryReason: 'too_big',
        explanation: 'ติดเพราะ notes demo ยังปนกันหลายเรื่อง',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้',
          'จัดแผน demo หลายขั้น',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: 'test-rescue',
        repairUsed: false,
        usedRoomFiles: [],
      },
    },
  });

  assert.equal(response.rescuePlan.steps.length, 1);
  assert.equal(response.rescuePlan.steps[0], 'จด 3 จุดที่ต้องโชว์ใน demo: fallback latency, reentry card, evidence source');
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /ลูกค้า|client|customer/iu);
});

test('normalizeRescueResponse keeps internal presentation prep grounded and rejects customer drift', () => {
  const task = makeRescueTask({
    sourceText: [
      'พรุ่งนี้ต้องพรีเซนต์งานในทีม แต่ตอนนี้หัวกระจัดกระจายมาก',
      'มี notes อยู่หลายที่ ทั้งในแชท ในไฟล์สไลด์ และในสมุด',
      'สิ่งที่ต้องพูดคือผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
      'แต่ยังไม่รู้จะเริ่มจากตรงไหน กลัวเปิดสไลด์แล้วนั่งจ้องเปล่า ๆ',
      'อยากได้ก้าวเดียวที่เริ่มทำได้ทันทีใน 10 นาที',
    ].join('\n'),
    currentPlan: {
      actionTitle: 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง',
      steps: [
        { id: 'step-1', text: 'เปิด notes จากแชท ไฟล์สไลด์ และสมุด' },
      ],
    },
  });
  const action: Action = {
    id: 'action-presentation',
    createdAt: 1,
    title: 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง',
    rationale: 'ต้องเริ่มจาก notes ที่กระจัดกระจายก่อนเติมสไลด์',
    microSteps: ['เปิด notes จากแชท ไฟล์สไลด์ และสมุด'],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_resume',
  };

  const response = normalizeRescueResponse({
    task,
    action,
    currentStepIndex: 0,
    rescue: {
      diagnosis: {
        primaryReason: 'too_big',
        explanation: 'ติดเพราะ notes กระจัดกระจายหลายแหล่ง',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'ร่างข้อความตอบลูกค้า 3 บรรทัดเกี่ยวกับงานนำเสนอ',
          'วางแผนสไลด์หลายขั้น',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: 'test-rescue',
        repairUsed: false,
        usedRoomFiles: [],
      },
    },
  });

  assert.equal(response.rescuePlan.steps.length, 1);
  assert.equal(response.rescuePlan.steps[0], 'เปิดไฟล์สไลด์แล้วเขียน 3 หัวข้อ: ผลที่ทำไปแล้ว ปัญหาที่เจอ แผนต่อไป');
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu);
});

test('normalizeRescueResponse keeps messy physical room rescue to one physical step', () => {
  const task = makeRescueTask({
    sourceText: [
      'ห้องรกมาก มีเสื้อผ้ากองบนเก้าอี้',
      'โต๊ะมีแก้วน้ำกับกระดาษเต็มไปหมด',
      'อยากเริ่มเก็บใน 10 นาทีแต่ไม่รู้จะเริ่มจากตรงไหน',
    ].join('\n'),
    currentPlan: {
      actionTitle: 'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
      steps: [
        { id: 'step-1', text: 'วางแผนจัดห้องทั้งหมด' },
      ],
    },
  });
  const action: Action = {
    id: 'action-room',
    createdAt: 1,
    title: 'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
    rationale: 'เริ่มจากพื้นที่กายภาพหนึ่งจุด',
    microSteps: ['วางแผนจัดห้องทั้งหมด'],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_resume',
  };

  const response = normalizeRescueResponse({
    task,
    action,
    currentStepIndex: 0,
    rescue: {
      diagnosis: {
        primaryReason: 'too_big',
        explanation: 'ติดเพราะห้องรกและไม่รู้จะเริ่มจากตรงไหน',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'วางแผนจัดห้องทั้งหมดเป็นหลายโซน',
          'ลิสต์ของทุกชิ้นในห้อง',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: 'test-rescue',
        repairUsed: false,
        usedRoomFiles: [],
      },
    },
  });

  assert.deepEqual(response.rescuePlan.steps, ['เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้ก่อน']);
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /ลูกค้า|client|customer|แผน|หลายโซน/iu);
});

test('normalizeRescueResponse keeps student report rescue grounded to report context', () => {
  const task = makeRescueTask({
    sourceText: [
      'ต้องส่งรายงานวิชาวิศวะพรุ่งนี้ แต่ตอนนี้ติดมาก',
      'หัวข้อคือ renewable energy storage มี reference links หลายอันในแชท',
      'ยังไม่ได้เปิดเอกสารจริง ไม่รู้จะเริ่มเขียนบทนำจากตรงไหน',
      'อยากได้ก้าวเดียวที่ทำได้ใน 10 นาที',
    ].join('\n'),
  });

  const response = normalizeRescueResponse({
    task,
    currentStepIndex: 0,
    rescue: {
      diagnosis: { primaryReason: 'too_big', explanation: 'ติดเพราะยังไม่รู้จะเริ่มบทนำจากตรงไหน' },
      rescuePlan: { mode: 'shrink', steps: ['ร่างข้อความตอบลูกค้า', 'วางแผนรายงานทั้งหมด'] },
      suggestedMessage: undefined,
      meta: { model: 'test-rescue', repairUsed: false, usedRoomFiles: [] },
    },
  });

  assert.deepEqual(response.rescuePlan.steps, ['เปิด reference link 1 อันแล้วจด 3 bullet สำหรับบทนำรายงาน']);
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /ลูกค้า|client|customer|วางแผนรายงานทั้งหมด/iu);
});

test('normalizeRescueResponse keeps product post rescue grounded to caption context', () => {
  const task = makeRescueTask({
    sourceText: [
      'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas',
      'มีรูปสินค้าแล้ว แต่ caption ยังไม่มี',
      'จุดขายคือเบา ซักง่าย และมี 3 สี',
      'กลัวนั่งคิดนาน อยากได้ก้าวเดียวที่เริ่มทำได้ทันที',
    ].join('\n'),
  });

  const response = normalizeRescueResponse({
    task,
    currentStepIndex: 0,
    rescue: {
      diagnosis: { primaryReason: 'too_big', explanation: 'ติดเพราะ caption ยังไม่มี' },
      rescuePlan: { mode: 'shrink', steps: ['ร่างอัปเดตลูกค้า 3 บรรทัด', 'รวบรวมข้อมูลสินค้าเพิ่ม'] },
      suggestedMessage: undefined,
      meta: { model: 'test-rescue', repairUsed: false, usedRoomFiles: [] },
    },
  });

  assert.deepEqual(response.rescuePlan.steps, ['ร่าง caption 3 บรรทัดจากจุดขาย เบา ซักง่าย และ 3 สี']);
  assert.doesNotMatch(response.rescuePlan.steps[0] ?? '', /ลูกค้า|client|customer|รวบรวมข้อมูล/iu);
});

test('buildManualRescueResponse (dependency): no banned phrases, includes follow-up message', () => {
  const task = makeRescueTask({ blockerSignals: ['dependency'] });
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  assertNoBannedPhrases(response.diagnosis.explanation, 'explanation');
  assert.ok(response.diagnosis.explanation.includes('รอ') || response.diagnosis.explanation.includes('ปลดล็อก'),
    'dependency explanation must mention waiting or unblocking');
  assert.ok(response.suggestedMessage, 'dependency should include a copy-paste message');
  assertNoBannedPhrases(response.suggestedMessage!, 'suggested message');
});

test('buildManualRescueResponse (unclear_scope): no banned phrases, explains scope issue', () => {
  const task = makeRescueTask({ blockerSignals: ['unclear_scope'] });
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  assertNoBannedPhrases(response.diagnosis.explanation, 'explanation');
  assert.ok(
    response.diagnosis.explanation.includes('ขอบเขต') || response.diagnosis.explanation.includes('กว้าง'),
    'unclear_scope explanation must mention scope',
  );
});

test('buildManualRescueResponse (low_energy): no banned phrases, recommends body-first', () => {
  const task = makeRescueTask({
    sourceText: 'หิวข้าว เหนื่อย ต้องทำงานลูกค้า ABC Corp ต่อ',
    blockerSignals: ['low_energy'],
  });
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  assertNoBannedPhrases(response.diagnosis.explanation, 'explanation');
  assert.ok(
    response.diagnosis.explanation.includes('ร่างกาย') || response.diagnosis.explanation.includes('พร้อม') || response.diagnosis.explanation.includes('พัก'),
    'low_energy explanation must reference physical state',
  );
  // Must NOT contain internal phrases
  assert.ok(!response.diagnosis.explanation.includes('AI'), 'Must not expose AI internals');
});

test('buildManualRescueResponse (too_big / unknown): no banned phrases, explains task is too large', () => {
  const task = makeRescueTask({ blockerSignals: ['too_big'] });
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  assertNoBannedPhrases(response.diagnosis.explanation, 'explanation');
  assert.ok(
    response.diagnosis.explanation.includes('ใหญ่') || response.diagnosis.explanation.includes('เล็ก'),
    'too_big explanation must explain task is too large',
  );
});

test('buildManualRescueResponse default fallback: no banned phrases, has anchors', () => {
  const task = makeRescueTask(); // no specific blocker, lifecycleState: stalled -> maps to too_big
  const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

  const fullText = [
    response.diagnosis.explanation,
    ...response.rescuePlan.steps,
    response.suggestedMessage ?? '',
  ].join(' ');

  assertNoBannedPhrases(fullText, 'full rescue output');
  // At least one anchor must be present in the full output
  const anchors = extractAnchorWords(task);
  assertHasAtLeastNAnchors(fullText, anchors, 1, 'full rescue output');
});

test('buildManualRescueResponse ABC Corp context: diagnosis mentions specific anchors from brain dump', () => {
  const task = makeRescueTask({
    sourceText: 'ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต ไลน์กลุ่มก็เด้งไม่หยุด เซิร์ฟเวอร์โปรดักชันล่มเมื่อเช้า',
    blockerSignals: ['too_big'],
  });
  const action = {
    id: 'act-1',
    createdAt: 1,
    title: 'ตอบลูกค้า ABC Corp เรื่องงานค้าง',
    rationale: 'ลูกค้ารอคำตอบ',
    microSteps: ['เปิดแชต', 'ร่างข้อความ', 'ส่ง'],
    isPinned: false,
    state: 'PENDING' as const,
  };
  const response = buildManualRescueResponse({ task, action, currentStepIndex: 0 });

  // Diagnosis must mention ABC Corp + เซิร์ฟเวอร์
  assert.ok(response.diagnosis.explanation.includes('ABC Corp'),
    `Diagnosis must mention ABC Corp. Got: "${response.diagnosis.explanation}"`);

  // Diagnosis must be a causal sentence (not just anchor listing)
  assert.ok(
    response.diagnosis.explanation.includes('เกี่ยวกับ') || response.diagnosis.explanation.includes('เพราะ'),
    'Diagnosis must explain causation, not just list anchors',
  );
});

test('all rescue reasons produce no banned phrases regardless of task content', () => {
  const reasons: Array<{ blockerSignals: string[]; taskShape?: TaskContext['taskShape'] }> = [
    { blockerSignals: ['missing_file_or_context'] },
    { blockerSignals: ['dependency'] },
    { blockerSignals: ['unclear_scope'] },
    { blockerSignals: ['low_energy'] },
    { blockerSignals: ['too_big'] },
    { blockerSignals: [] }, // default
  ];

  for (const { blockerSignals, taskShape } of reasons) {
    const task = makeRescueTask({ blockerSignals, taskShape });
    const response = buildManualRescueResponse({ task, currentStepIndex: 0 });

    const fullText = [
      response.diagnosis.explanation,
      ...response.rescuePlan.steps,
      response.suggestedMessage ?? '',
    ].join(' ');

    assertNoBannedPhrases(fullText, `rescue for blockers=[${blockerSignals.join(',')}]`);
    assert.ok(!fullText.includes('AI '), `Must not expose AI internals for blockers=[${blockerSignals.join(',')}]`);
  }
});
