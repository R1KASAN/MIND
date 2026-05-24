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
