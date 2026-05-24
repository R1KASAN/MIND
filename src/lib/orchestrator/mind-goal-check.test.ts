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
