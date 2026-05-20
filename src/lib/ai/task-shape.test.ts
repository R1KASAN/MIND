import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
  buildIntakeFallbackCandidates,
  buildActionFallbackCopy,
  buildTaskFrameFallback,
  isProposalLike,
} from './task-shape';

// ---------------------------------------------------------------------------
// Table-driven: deliverableType classification
// ---------------------------------------------------------------------------

const CLASSIFICATION_CASES: Array<{
  name: string;
  input: string;
  expectedType: string;
  expectedIntent?: string;
  notType?: string;
  allowUnknown?: boolean;
}> = [
    // execution / delegation chaos
    {
      name: 'EN agency chaos => execution',
      input: 'Client rejected font. Video is delayed. Need urgent plan to split work.',
      expectedType: 'execution',
      expectedIntent: 'client_delivery',
    },
    {
      name: 'TH agency chaos => execution',
      input: 'ลูกค้าตีกลับฟอนต์ วิดีโอดีเลย์ ต้องแบ่งงานด่วนให้ทีม',
      expectedType: 'execution',
      expectedIntent: 'client_delivery',
    },
    // proposal / planning — combined signals
    {
      name: 'TH clinic timeline+estimate+scope => proposal',
      input: 'ลูกค้าอยากทำแอปจองคิวคลินิก แต่ requirement ยังไม่นิ่ง มีแค่ note กระจัดกระจาย ขอ timeline กับ estimate ราคาเบื้องต้นหน่อย',
      expectedType: 'proposal',
      expectedIntent: 'client_delivery',
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
      expectedIntent: 'client_delivery',
    },
    {
      name: 'personal friction stays unknown instead of fake client work',
      input: 'หิวข้าวแต่ต้องทำงาน',
      expectedType: 'unknown',
      expectedIntent: 'personal_friction',
      allowUnknown: true,
    },
    {
      name: 'personal friction typo still stays personal',
      input: 'หัวข้าวแต่ต้องทำงาน',
      expectedType: 'unknown',
      expectedIntent: 'personal_friction',
      allowUnknown: true,
    },
    {
      name: 'admin task stays admin instead of fake client work',
      input: 'จ่ายบิลค่าอินเทอร์เน็ตแล้วจัดไฟล์ใบเสร็จ',
      expectedType: 'unknown',
      expectedIntent: 'admin_task',
      allowUnknown: true,
    },
    {
      name: 'TH mixed-intent emotional friction with client keyword => personal_friction',
      input: 'ทะเลาะกับลูกค้า + กลัว/รู้สึกผิด + ไม่กล้าส่งงาน',
      expectedType: 'unknown',
      expectedIntent: 'personal_friction',
      allowUnknown: true,
    },
    {
      name: 'TH pure client relational word => client_delivery',
      input: 'ลูกค้าด่า',
      expectedType: 'unknown',
      expectedIntent: 'client_delivery',
      allowUnknown: true,
    },
  ];

for (const { name, input, expectedType, expectedIntent, notType, allowUnknown } of CLASSIFICATION_CASES) {
  test(name, () => {
    const shape = deriveTaskShapeFromText(input);
    assert.equal(shape.deliverableType, expectedType, `deliverableType for: "${input}"`);
    if (expectedIntent) {
      assert.equal(shape.behaviorIntent, expectedIntent, `behaviorIntent for: "${input}"`);
    }
    if (!allowUnknown) {
      assert.notEqual(shape.deliverableType, 'unknown', `must not be unknown: "${input}"`);
    }
    if (notType) {
      assert.notEqual(shape.deliverableType, notType);
    }
  });
}

test('strong personal-friction text wins over conflicting model-provided behaviorIntent', () => {
  const shape = deriveTaskShapeFromText('หิวข้าวมากแต่ต้องทำงานต่อ ยังไม่มีแรงเปิดงานทั้งก้อน', {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    behaviorIntent: 'client_delivery',
    workContext: 'งาน client delivery ที่ต้องแบ่งงานให้ทีม',
  });

  assert.equal(shape.behaviorIntent, 'personal_friction');
  assert.match(shape.workContext, /หิว|ร่างกาย|สมาธิ|ไม่พร้อม|งานขยับ/);
  assert.doesNotMatch(shape.workContext, /client delivery|แบ่งงานให้ทีม/);
});

test('strong personal-friction text keeps weak draft/client signals out of execution fallback', () => {
  const shape = deriveTaskShapeFromText(
    'หิวข้าวมากแต่ต้องทำงานต่อ ยังไม่มีแรงเปิดงานทั้งก้อน แต่อยากกลับไปเคลียร์ draft ให้ลูกค้าภายในวันนี้',
  );

  assert.equal(shape.deliverableType, 'unknown');
  assert.equal(shape.behaviorIntent, 'personal_friction');
});

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

test('personal friction fallback keeps the user context in human copy instead of inventing client/project context', () => {
  const shape = deriveTaskShapeFromText(
    'หิวข้าวมากแต่ต้องทำงานต่อ ยังไม่มีแรงเปิดงานทั้งก้อน แต่อยากกลับไปเคลียร์ draft ให้ลูกค้าภายในวันนี้',
  );
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
  assert.equal(shape.behaviorIntent, 'personal_friction');
  assert.match(combinedText, /หิว|ร่างกาย|สมาธิ|พลัง|เติม|ก้าว/);
  assert.doesNotMatch(combinedText, /โปรเจกต์|proposal|requirement|ไฟล์|delegate|มอบหมาย|ส่งต่อให้ทีม|ทีมเดินต่อ/);
  assert.doesNotMatch(combinedText, /productivity template|fallback|reflection|behaviorIntent|blocker/);
  assert.doesNotMatch(action.whyThisNow, /ผู้ใช้|แรงเสียดทานส่วนตัว|productivity template|fallback|reflection/);
  assert.doesNotMatch(action.situationSummary, /ผู้ใช้|แรงเสียดทานส่วนตัว|productivity template|fallback|reflection/);
});

test('admin task fallback keeps admin tone instead of client delivery tone', () => {
  const shape = deriveTaskShapeFromText('จ่ายบิลค่าอินเทอร์เน็ตแล้วจัดไฟล์ใบเสร็จ');
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
  assert.equal(shape.behaviorIntent, 'admin_task');
  assert.match(combinedText, /แอดมิน|ภาระ|บิล|เอกสาร|จัดการ/);
  assert.doesNotMatch(combinedText, /ลูกค้า|proposal|requirement|estimate|timeline/);
});
