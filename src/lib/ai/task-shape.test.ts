import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
  buildIntakeFallbackCandidates,
  buildActionFallbackCopy,
  buildTaskFrameFallback,
  isProposalLike,
} from './task-shape.ts';

// ---------------------------------------------------------------------------
// Table-driven: deliverableType classification
// ---------------------------------------------------------------------------

const CLASSIFICATION_CASES: Array<{
  name: string;
  input: string;
  expectedType: string;
  notType?: string;
  allowUnknown?: boolean;
}> = [
  // execution / delegation chaos
  {
    name: 'EN agency chaos => execution',
    input: 'Client rejected font. Video is delayed. Need urgent plan to split work.',
    expectedType: 'execution',
  },
  {
    name: 'TH agency chaos => execution',
    input: 'ลูกค้าตีกลับฟอนต์ วิดีโอดีเลย์ ต้องแบ่งงานด่วนให้ทีม',
    expectedType: 'execution',
  },
  // proposal / planning — combined signals
  {
    name: 'TH clinic timeline+estimate+scope => proposal',
    input: 'ลูกค้าอยากทำแอปจองคิวคลินิก แต่ requirement ยังไม่นิ่ง มีแค่ note กระจัดกระจาย ขอ timeline กับ estimate ราคาเบื้องต้นหน่อย',
    expectedType: 'proposal',
  },
  {
    name: 'TH estimate/budget synonyms => proposal-like',
    input: 'ช่วยประเมินงบสำหรับโปรเจกต์นี้หน่อย',
    expectedType: 'estimate',
  },
  {
    name: 'TH timeline synonym ไทม์ไลน์ => timeline',
    input: 'ขอไทม์ไลน์โปรเจกต์คร่าวๆ',
    expectedType: 'timeline',
  },
  {
    name: 'scope-only without execution => proposal',
    input: 'requirement ยังไม่ชัด ต้องเคลียร์ scope ก่อน',
    expectedType: 'proposal',
  },
  // explicit proposal
  {
    name: 'explicit proposal => proposal',
    input: 'ลูกค้าขอ proposal AI',
    expectedType: 'proposal',
  },
  // reply
  {
    name: 'reply intent => reply',
    input: 'ต้องตอบลูกค้าก่อน',
    expectedType: 'reply',
  },
  {
    name: 'personal friction stays unknown instead of fake client work',
    input: 'หิวข้าวแต่ต้องทำงาน',
    expectedType: 'unknown',
    allowUnknown: true,
  },
];

for (const { name, input, expectedType, notType, allowUnknown } of CLASSIFICATION_CASES) {
  test(name, () => {
    const shape = deriveTaskShapeFromText(input);
    assert.equal(shape.deliverableType, expectedType, `deliverableType for: "${input}"`);
    if (!allowUnknown) {
      assert.notEqual(shape.deliverableType, 'unknown', `must not be unknown: "${input}"`);
    }
    if (notType) {
      assert.notEqual(shape.deliverableType, notType);
    }
  });
}

// ---------------------------------------------------------------------------
// isProposalLike helper
// ---------------------------------------------------------------------------

test('isProposalLike covers proposal, timeline, estimate', () => {
  assert.ok(isProposalLike('proposal'));
  assert.ok(isProposalLike('timeline'));
  assert.ok(isProposalLike('estimate'));
  assert.ok(!isProposalLike('execution'));
  assert.ok(!isProposalLike('reply'));
  assert.ok(!isProposalLike('unknown'));
});

// ---------------------------------------------------------------------------
// Fallback candidate & copy: generic status must NOT appear for known intents
// ---------------------------------------------------------------------------

const GENERIC_STATUS = 'สรุปสถานะล่าสุดของโปรเจกต์';

const FALLBACK_CASES: Array<{
  name: string;
  input: string;
  mustNotInclude: string[];
  titleMustMatch: RegExp;
}> = [
  {
    name: 'clinic timeline+estimate: no generic status in candidates',
    input: 'ลูกค้าอยากทำแอปจองคิวคลินิก แต่ requirement ยังไม่นิ่ง มีแค่ note กระจัดกระจาย ขอ timeline กับ estimate ราคาเบื้องต้นหน่อย',
    mustNotInclude: [GENERIC_STATUS],
    titleMustMatch: /requirement|scope|timeline|estimate|ราคา|ประเมิน/i,
  },
  {
    name: 'execution chaos: no generic status in candidates',
    input: 'Client rejected font. Video is delayed. Need urgent plan to split work.',
    mustNotInclude: [GENERIC_STATUS],
    titleMustMatch: /แบ่งงาน|มอบหมาย|delegate|assign|ปลดล็อก|unblock/i,
  },
  {
    name: 'TH budget estimate: no generic status',
    input: 'ช่วยประเมินงบสำหรับโปรเจกต์นี้หน่อย',
    mustNotInclude: [GENERIC_STATUS],
    titleMustMatch: /estimate|ราคา|ประเมิน|requirement|scope|timeline/i,
  },
];

for (const { name, input, mustNotInclude, titleMustMatch } of FALLBACK_CASES) {
  test(`candidates: ${name}`, () => {
    const shape = deriveTaskShapeFromText(input);
    const wf = inferWorkflowTypeFromTaskShape(shape);
    const candidates = buildIntakeFallbackCandidates(wf, shape);
    const allTitles = candidates.map((c) => c.title).join(' | ');
    for (const banned of mustNotInclude) {
      assert.ok(!allTitles.includes(banned), `Banned "${banned}" in: ${allTitles}`);
    }
    assert.ok(titleMustMatch.test(allTitles), `Expected match ${titleMustMatch} in: ${allTitles}`);
  });

  test(`action copy: ${name}`, () => {
    const shape = deriveTaskShapeFromText(input);
    const wf = inferWorkflowTypeFromTaskShape(shape);
    const copy = buildActionFallbackCopy(wf, shape);
    for (const banned of mustNotInclude) {
      assert.ok(!copy.chosenTitle.includes(banned), `Banned "${banned}" in title: ${copy.chosenTitle}`);
    }
  });
}

test('personal friction fallback keeps the user context instead of inventing client/project context', () => {
  const shape = deriveTaskShapeFromText('หิวข้าวแต่ต้องทำงาน');
  const workflowType = inferWorkflowTypeFromTaskShape(shape);
  const frame = buildTaskFrameFallback(workflowType, shape);
  const candidates = buildIntakeFallbackCandidates(workflowType, shape);
  const action = buildActionFallbackCopy(workflowType, shape);
  const combinedText = [
    shape.workContext,
    frame.objective,
    frame.stage,
    ...candidates.map((candidate) => `${candidate.title} ${candidate.rationale}`),
    action.chosenTitle,
    action.chosenRationale,
    action.situationSummary,
  ].join(' ');

  assert.equal(shape.deliverableType, 'unknown');
  assert.equal(shape.immediateNeed, 'resume_execution');
  assert.match(combinedText, /หิว|กิน|แรงเสียดทาน|พลังงาน|ก้าว 5 นาที/);
  assert.doesNotMatch(combinedText, /ลูกค้า|โปรเจกต์|proposal|requirement|ไฟล์/);
});
