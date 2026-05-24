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
const TEAM_PRESENTATION_BRAINDUMP = [
  'พรุ่งนี้ต้องพรีเซนต์งานในทีม แต่ตอนนี้หัวกระจัดกระจายมาก',
  'มี notes อยู่หลายที่ ทั้งในแชท ในไฟล์สไลด์ และในสมุด',
  'สิ่งที่ต้องพูดคือผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
  'แต่ยังไม่รู้จะเริ่มจากตรงไหน กลัวเปิดสไลด์แล้วนั่งจ้องเปล่า ๆ',
  'อยากได้ก้าวเดียวที่เริ่มทำได้ทันทีใน 10 นาที',
].join(' ');
const MESSY_PHYSICAL_ROOM_BRAINDUMP = [
  'ห้องรกมาก มีเสื้อผ้ากองบนเก้าอี้',
  'โต๊ะมีแก้วน้ำกับกระดาษเต็มไปหมด',
  'อยากเริ่มเก็บใน 10 นาทีแต่ไม่รู้จะเริ่มจากตรงไหน',
].join(' ');
const CUSTOMER_LOGO_REVISION_BRAINDUMP = [
  'ลูกค้าขอแก้งานโลโก้',
  'บอกว่าสีหลักยังไม่ตรงแบรนด์ และอยากได้ตัวเลือกที่ดู minimal กว่านี้',
  'ต้องตอบลูกค้าว่าจะเริ่มแก้จากจุดไหนก่อน',
].join(' ');
const STUDENT_REPORT_BRAINDUMP = [
  'ต้องส่งรายงานวิชาวิศวะพรุ่งนี้ แต่ตอนนี้ติดมาก',
  'หัวข้อคือ renewable energy storage มี reference links หลายอันในแชท',
  'ยังไม่ได้เปิดเอกสารจริง ไม่รู้จะเริ่มเขียนบทนำจากตรงไหน',
  'อยากได้ก้าวเดียวที่ทำได้ใน 10 นาที',
].join(' ');
const PRODUCT_POST_BRAINDUMP = [
  'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas',
  'มีรูปสินค้าแล้ว แต่ caption ยังไม่มี',
  'จุดขายคือเบา ซักง่าย และมี 3 สี',
  'กลัวนั่งคิดนาน อยากได้ก้าวเดียวที่เริ่มทำได้ทันที',
].join(' ');

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

test('internal team presentation prep stays non-client and preserves presentation anchors', () => {
  const shape = deriveTaskShapeFromText(TEAM_PRESENTATION_BRAINDUMP);
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
    action.whyThisNow,
    action.situationSummary,
  ].join(' ');

  assert.equal(workflowType, 'client_resume');
  assert.notEqual(shape.behaviorIntent, 'client_delivery');
  assert.match(combinedText, /พรีเซนต์|นำเสนอ|notes|แชท|ไฟล์สไลด์|สไลด์|สมุด/);
  assert.match(combinedText, /ผลที่ทำไปแล้ว|ปัญหาที่เจอ|แผนต่อไป|10 นาที/);
  assert.doesNotMatch(combinedText, /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu);
});

test('messy physical room fallback chooses one concrete physical starting action', () => {
  const shape = deriveTaskShapeFromText(MESSY_PHYSICAL_ROOM_BRAINDUMP);
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
    action.whyThisNow,
    action.situationSummary,
  ].join(' ');

  assert.equal(workflowType, 'client_resume');
  assert.notEqual(shape.behaviorIntent, 'client_delivery');
  assert.match(combinedText, /ห้องรก|เสื้อผ้า|เก้าอี้|โต๊ะ|10 นาที/);
  assert.match(action.chosenTitle, /เก็บเสื้อผ้า 5 ชิ้น|เคลียร์เก้าอี้/u);
  assert.doesNotMatch(combinedText, /ลูกค้า|client|customer|ผู้ว่าจ้าง|proposal|delegate|มอบหมาย/u);
});

test('explicit customer logo revision keeps customer wording allowed and logo anchors grounded', () => {
  const shape = deriveTaskShapeFromText(CUSTOMER_LOGO_REVISION_BRAINDUMP);
  const workflowType = inferWorkflowTypeFromTaskShape(shape);
  const action = buildActionFallbackCopy(workflowType, shape);
  const combinedText = [
    shape.workContext,
    action.chosenTitle,
    action.chosenRationale,
    action.whyThisNow,
    action.situationSummary,
  ].join(' ');

  assert.equal(workflowType, 'client_response');
  assert.equal(shape.behaviorIntent, 'client_delivery');
  assert.match(combinedText, /ลูกค้า/);
  assert.match(combinedText, /โลโก้|สีหลัก|แบรนด์|minimal/u);
});

test('student report fallback stays on report topic and avoids customer framing', () => {
  const shape = deriveTaskShapeFromText(STUDENT_REPORT_BRAINDUMP);
  const workflowType = inferWorkflowTypeFromTaskShape(shape);
  const action = buildActionFallbackCopy(workflowType, shape);
  const combinedText = [
    shape.workContext,
    action.chosenTitle,
    action.chosenRationale,
    action.whyThisNow,
    action.situationSummary,
  ].join(' ');

  assert.equal(workflowType, 'client_resume');
  assert.notEqual(shape.behaviorIntent, 'client_delivery');
  assert.match(combinedText, /รายงาน|renewable energy storage|reference links|บทนำ|10 นาที/u);
  assert.doesNotMatch(combinedText, /ลูกค้า|client|customer|บริษัท|หัวหน้า|เงิน|หมอ/iu);
});

test('online shop product post fallback produces one caption action without customer framing', () => {
  const shape = deriveTaskShapeFromText(PRODUCT_POST_BRAINDUMP);
  const workflowType = inferWorkflowTypeFromTaskShape(shape);
  const action = buildActionFallbackCopy(workflowType, shape);
  const combinedText = [
    shape.workContext,
    action.chosenTitle,
    action.chosenRationale,
    action.whyThisNow,
    action.situationSummary,
  ].join(' ');

  assert.equal(workflowType, 'client_resume');
  assert.notEqual(shape.behaviorIntent, 'client_delivery');
  assert.match(combinedText, /โพสต์สินค้า|ร้านออนไลน์|กระเป๋าผ้า canvas|caption|เบา|ซักง่าย|3 สี/u);
  assert.doesNotMatch(combinedText, /ลูกค้า|client|customer|บริษัท|หัวหน้า|เงิน|หมอ/iu);
});
