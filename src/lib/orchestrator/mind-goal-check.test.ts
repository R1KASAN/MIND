import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateMindGoalStage } from './mind-goal-check';

const abcSource = [
  'เหนื่อยมาก',
  'ต้องตอบ ABC Corp',
  'payment API timeout ไป 20 นาที',
  'CS ถามว่าจะตอบลูกค้ายังไง',
  'ยังไม่ได้เปิด Dashboard',
  'หัวตื้อ ไม่รู้จะเริ่มตรงไหน',
].join('\n');

const browserQaSource = [
  'ห้องนี้รกมาก ต้องเตรียม demo MIND วันนี้',
  'notes กระจัดกระจาย เรื่อง fallback latency, reentry card, ปุ่มช่วยแก้ก้าวนี้, evidence source',
  'กลัวว่ากดจบแล้วกลับมาจะ context หาย',
  'อยากได้ก้าวเดียวที่ทำต่อได้ทันที',
].join('\n');

const teamPresentationSource = [
  'พรุ่งนี้ต้องพรีเซนต์งานในทีม แต่ตอนนี้หัวกระจัดกระจายมาก',
  'มี notes อยู่หลายที่ ทั้งในแชท ในไฟล์สไลด์ และในสมุด',
  'สิ่งที่ต้องพูดคือผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
  'แต่ยังไม่รู้จะเริ่มจากตรงไหน กลัวเปิดสไลด์แล้วนั่งจ้องเปล่า ๆ',
  'อยากได้ก้าวเดียวที่เริ่มทำได้ทันทีใน 10 นาที',
].join('\n');

const messyPhysicalRoomSource = [
  'ห้องรกมาก มีเสื้อผ้ากองบนเก้าอี้',
  'โต๊ะมีแก้วน้ำกับกระดาษเต็มไปหมด',
  'อยากเริ่มเก็บใน 10 นาทีแต่ไม่รู้จะเริ่มจากตรงไหน',
].join('\n');

const customerLogoRevisionSource = [
  'ลูกค้าขอแก้งานโลโก้',
  'บอกว่าสีหลักยังไม่ตรงแบรนด์ และอยากได้ตัวเลือกที่ดู minimal กว่านี้',
  'ต้องตอบลูกค้าว่าจะเริ่มแก้จากจุดไหนก่อน',
].join('\n');

const studentReportSource = [
  'ต้องส่งรายงานวิชาวิศวะพรุ่งนี้ แต่ตอนนี้ติดมาก',
  'หัวข้อคือ renewable energy storage มี reference links หลายอันในแชท',
  'ยังไม่ได้เปิดเอกสารจริง ไม่รู้จะเริ่มเขียนบทนำจากตรงไหน',
  'อยากได้ก้าวเดียวที่ทำได้ใน 10 นาที',
].join('\n');

const productPostSource = [
  'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas',
  'มีรูปสินค้าแล้ว แต่ caption ยังไม่มี',
  'จุดขายคือเบา ซักง่าย และมี 3 สี',
  'กลัวนั่งคิดนาน อยากได้ก้าวเดียวที่เริ่มทำได้ทันที',
].join('\n');

test('one_action passes when the action is one grounded next move with room anchors', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: abcSource,
    actionTitle: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
    actionCount: 1,
    steps: ['ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout'],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'pass');
  assert.deepEqual(check.reason_codes, []);
  assert.equal(check.action_count, 1);
  assert.equal(check.source_kind, 'ai');
  assert.ok(check.anchor_hits.includes('ABC Corp'));
  assert.ok(check.anchor_hits.includes('payment API'));
});

test('one_action flags broad collection wording for Browser QA demo context', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: browserQaSource,
    actionTitle: 'รวบรวมข้อมูลเกี่ยวกับ คำตอบ latency, reentry card, ปุ่มช่วยแก้, evidence source',
    actionCount: 1,
    steps: ['รวบรวมข้อมูลเกี่ยวกับ คำตอบ latency, reentry card, ปุ่มช่วยแก้, evidence source'],
    sourceKind: 'ai',
  });

  assert.notEqual(check.verdict, 'pass');
  assert.ok(check.reason_codes.includes('broad_collection_action'));
  assert.ok(check.anchor_hits.includes('reentry card'));
  assert.ok(check.anchor_hits.includes('evidence source'));
});

test('working_steps flags dropped Browser QA anchors and weak button overfocus', () => {
  const check = evaluateMindGoalStage({
    stage: 'working_steps',
    sourceText: browserQaSource,
    actionTitle: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
    actionCount: 1,
    steps: [
      'สรุป ปุ่ม เป็น 3 บรรทัด',
      'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
      'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้',
    ],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'fail');
  assert.ok(check.reason_codes.includes('dropped_strong_room_anchors'));
  assert.ok(check.reason_codes.includes('weak_anchor_overfocus'));
  assert.ok(check.reason_codes.includes('invented_customer_context'));
  assert.ok(check.missing_anchors.includes('fallback latency'));
});

test('rescue flags invented customer context for Browser QA demo room', () => {
  const check = evaluateMindGoalStage({
    stage: 'rescue',
    sourceText: browserQaSource,
    actionTitle: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
    actionCount: 1,
    steps: ['ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้'],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'fail');
  assert.ok(check.reason_codes.includes('invented_customer_context'));
});

test('one_action fails invented external stakeholder for internal team presentation prep', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: teamPresentationSource,
    actionTitle: 'ร่างข้อความตอบลูกค้าเพื่อสรุปประเด็นนำเสนอ',
    actionCount: 1,
    steps: ['ร่างข้อความตอบลูกค้าเพื่อสรุปประเด็นนำเสนอ'],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'fail');
  assert.ok(check.reason_codes.includes('external_stakeholder_not_in_source'));
  assert.ok(check.reason_codes.includes('presentation_prep_customer_drift'));
});

test('presentation-prep grounded action passes with source anchors', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: teamPresentationSource,
    actionTitle: 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง',
    actionCount: 1,
    steps: ['เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง'],
    sourceKind: 'fallback',
  });

  assert.equal(check.verdict, 'pass');
  assert.ok(check.anchor_hits.includes('notes'));
  assert.ok(check.anchor_hits.includes('พรีเซนต์งานในทีม'));
});

test('messy physical room action passes when grounded to physical anchors', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: messyPhysicalRoomSource,
    actionTitle: 'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
    actionCount: 1,
    steps: ['เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้'],
    sourceKind: 'fallback',
  });

  assert.equal(check.verdict, 'pass');
  assert.ok(check.anchor_hits.includes('เสื้อผ้า'));
  assert.ok(check.anchor_hits.includes('เก้าอี้'));
});

test('messy physical room flags broad abstract cleanup plans', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: messyPhysicalRoomSource,
    actionTitle: 'วางแผนจัดห้องทั้งหมดให้เป็นระบบ',
    actionCount: 1,
    steps: ['วางแผนจัดห้องทั้งหมดให้เป็นระบบ'],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'fail');
  assert.ok(check.reason_codes.includes('broad_task_list_action'));
  assert.ok(check.reason_codes.includes('missing_room_anchor'));
});

test('customer logo revision allows customer wording when source includes customer and logo anchors', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: customerLogoRevisionSource,
    actionTitle: 'ร่างข้อความตอบลูกค้าว่าจะเริ่มแก้โลโก้จากสีหลักก่อน',
    actionCount: 1,
    steps: ['ร่างข้อความตอบลูกค้าว่าจะเริ่มแก้โลโก้จากสีหลักก่อน'],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'pass');
  assert.ok(check.anchor_hits.includes('ลูกค้า'));
  assert.ok(check.anchor_hits.includes('โลโก้'));
});

test('student report action passes with report anchors and no customer context', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: studentReportSource,
    actionTitle: 'เปิด reference link 1 อัน แล้วจด 3 bullet สำหรับบทนำรายงาน',
    actionCount: 1,
    steps: ['เปิด reference link 1 อัน แล้วจด 3 bullet สำหรับบทนำรายงาน'],
    sourceKind: 'fallback',
  });

  assert.equal(check.verdict, 'pass');
  assert.ok(check.anchor_hits.includes('reference links'));
  assert.ok(check.anchor_hits.includes('บทนำ'));
});

test('product post action passes with product anchors and no customer context', () => {
  const check = evaluateMindGoalStage({
    stage: 'one_action',
    sourceText: productPostSource,
    actionTitle: 'ร่าง caption สินค้า 3 บรรทัดจากจุดขาย เบา ซักง่าย และ 3 สี',
    actionCount: 1,
    steps: ['ร่าง caption สินค้า 3 บรรทัดจากจุดขาย เบา ซักง่าย และ 3 สี'],
    sourceKind: 'fallback',
  });

  assert.equal(check.verdict, 'pass');
  assert.ok(check.anchor_hits.includes('caption'));
  assert.ok(check.anchor_hits.includes('เบา'));
  assert.ok(check.anchor_hits.includes('3 สี'));
});

test('working_steps fails generic backlog wording for a single incident room', () => {
  const check = evaluateMindGoalStage({
    stage: 'working_steps',
    sourceText: abcSource,
    actionTitle: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
    actionCount: 1,
    steps: [
      'แยกงานค้างของ ABC Corp เป็นรายการสั้น',
      'จดสถานะล่าสุดของแต่ละรายการ',
      'ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลา',
    ],
    sourceKind: 'ai',
  });

  assert.equal(check.verdict, 'fail');
  assert.ok(check.reason_codes.includes('generic_multi_item_scaffold'));
});

test('rescue passes exactly one smaller grounded step and fails multi-step rescue', () => {
  const oneStep = evaluateMindGoalStage({
    stage: 'rescue',
    sourceText: abcSource,
    actionTitle: 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วจดอัปเดต 3 บรรทัด',
    actionCount: 1,
    steps: ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วจดอัปเดต 3 บรรทัด'],
    sourceKind: 'ai',
  });
  const multiStep = evaluateMindGoalStage({
    stage: 'rescue',
    sourceText: abcSource,
    actionTitle: 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วจดอัปเดต 3 บรรทัด',
    actionCount: 1,
    steps: [
      'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
      'ร่างข้อความตอบ ABC Corp',
    ],
    sourceKind: 'ai',
  });

  assert.equal(oneStep.verdict, 'pass');
  assert.equal(multiStep.verdict, 'fail');
  assert.ok(multiStep.reason_codes.includes('rescue_must_be_one_step'));
});

test('active reentry fails completed rooms and completed context passes completed semantics', () => {
  const activeCheck = evaluateMindGoalStage({
    stage: 'active_reentry',
    sourceText: abcSource,
    actionTitle: 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
    actionCount: 1,
    steps: ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API'],
    lifecycleState: 'done',
    label: 'มีก้าวถัดไปชัดอยู่แล้ว',
    cta: 'ไปต่อ',
    contextSourceLabel: 'ใช้ latest input',
    sourceKind: 'unknown',
  });
  const completedCheck = evaluateMindGoalStage({
    stage: 'completed_context',
    sourceText: abcSource,
    actionTitle: 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
    actionCount: 1,
    steps: ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API'],
    lifecycleState: 'done',
    label: 'งานนี้เสร็จแล้ว',
    cta: 'ทำงานต่อจากบริบทนี้',
    sourceKind: 'unknown',
  });

  assert.equal(activeCheck.verdict, 'fail');
  assert.ok(activeCheck.reason_codes.includes('completed_room_cannot_be_active_reentry'));
  assert.equal(completedCheck.verdict, 'pass');
});

test('manual fallback is logged as manual instead of ai', () => {
  const check = evaluateMindGoalStage({
    stage: 'fallback',
    sourceText: abcSource,
    actionTitle: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
    actionCount: 1,
    steps: ['ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout'],
    sourceKind: 'manual',
  });

  assert.equal(check.verdict, 'pass');
  assert.equal(check.source_kind, 'manual');
  assert.ok(!check.reason_codes.includes('fallback_reported_as_ai'));
});
