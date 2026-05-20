import test from 'node:test';
import assert from 'node:assert/strict';

import { inferIntakeClarificationNeed } from './intake-clarification-rules';
import { deriveTaskShapeFromText } from './task-shape';

const ABC_DUMP = [
  'ABC Corp ทวงงานค้าง 2 ตัวในแชต',
  'โปรดักชันล่มตั้งแต่เช้า แต่ผมยังไม่รู้สถานะล่าสุด',
  'ทีมถามสเปกปุ่มบ่ายนี้',
  'สไลด์ลูกค้าบ่ายสองยังโล่ง',
  'ผมตื้อและหิวมาก ไม่รู้ควรเริ่มจากอะไร',
].join('\n');

function taskShape(text: string) {
  return deriveTaskShapeFromText(text);
}

test('inferIntakeClarificationNeed triggers for ABC Corp unknown latest status without FORCE_CLARIFICATION', () => {
  const result = inferIntakeClarificationNeed({
    sourceText: ABC_DUMP,
    taskShape: taskShape(ABC_DUMP),
    aiRequiresClarification: false,
  });

  assert.equal(result.requiresClarification, true);
  assert.ok(result.matchedFamilies.includes('customer_pressure'));
  assert.ok(result.matchedFamilies.includes('unknown_latest_status'));
  assert.ok(result.matchedFamilies.includes('unresolved_incident'));
  assert.match(result.clarificationQuestion ?? '', /ABC Corp|prod|โปรดักชัน|สถานะ|งานค้าง/);
});

test('inferIntakeClarificationNeed triggers for similar customer incident with different names', () => {
  const sourceText = [
    'Beta Logistics ถามในไลน์ว่าของที่ค้างจะเสร็จเมื่อไร',
    'ระบบ payment webhook alert ตั้งแต่เช้า แต่ยังไม่ชัดว่ากลับมาปกติหรือยัง',
    'ทีม QA รอคำตอบเรื่อง release เย็นนี้',
  ].join('\n');

  const result = inferIntakeClarificationNeed({
    sourceText,
    taskShape: taskShape(sourceText),
    aiRequiresClarification: false,
  });

  assert.equal(result.requiresClarification, true);
  assert.ok(result.matchedFamilies.includes('customer_pressure'));
  assert.ok(result.matchedFamilies.includes('unknown_latest_status'));
  assert.ok(result.matchedFamilies.includes('pending_commitment'));
});

test('inferIntakeClarificationNeed does not trigger from overload alone', () => {
  const sourceText = 'ผมหิว เหนื่อย และสมองตื้อมาก ไม่รู้จะเริ่มจากอะไร';
  const result = inferIntakeClarificationNeed({
    sourceText,
    taskShape: taskShape(sourceText),
    aiRequiresClarification: false,
  });

  assert.equal(result.requiresClarification, false);
  assert.ok(result.matchedFamilies.includes('human_overload'));
});

test('inferIntakeClarificationNeed does not trigger from isolated deadline keyword', () => {
  const sourceText = 'มี deadline บ่ายนี้ ต้องจัดสไลด์ให้เสร็จ';
  const result = inferIntakeClarificationNeed({
    sourceText,
    taskShape: taskShape(sourceText),
    aiRequiresClarification: false,
  });

  assert.equal(result.requiresClarification, false);
  assert.ok(result.matchedFamilies.includes('pending_commitment'));
  assert.ok(!result.matchedFamilies.includes('unknown_latest_status'));
});

test('inferIntakeClarificationNeed does not trigger when latest status is known and reply is ready', () => {
  const sourceText = [
    'ลูกค้า ABC Corp ถามเรื่อง incident',
    'prod restart แล้ว ระบบกลับมาปกติและ RCA สรุปแล้ว',
    'ตอนนี้ต้องส่ง update สั้น ๆ ให้ลูกค้า',
  ].join('\n');
  const result = inferIntakeClarificationNeed({
    sourceText,
    taskShape: {
      ...taskShape(sourceText),
      immediateNeed: 'send_reply_now',
    },
    aiRequiresClarification: false,
  });

  assert.equal(result.requiresClarification, false);
});

test('inferIntakeClarificationNeed uses shorter question when human overload is present', () => {
  const withOverload = inferIntakeClarificationNeed({
    sourceText: ABC_DUMP,
    taskShape: taskShape(ABC_DUMP),
    aiRequiresClarification: false,
  });
  const withoutOverloadText = ABC_DUMP.replace('ผมตื้อและหิวมาก ไม่รู้ควรเริ่มจากอะไร', 'ยังไม่ได้ตอบลูกค้าเพราะกลัว commit เวลาเกินจริง');
  const withoutOverload = inferIntakeClarificationNeed({
    sourceText: withoutOverloadText,
    taskShape: taskShape(withoutOverloadText),
    aiRequiresClarification: false,
  });

  assert.equal(withOverload.requiresClarification, true);
  assert.equal(withoutOverload.requiresClarification, true);
  assert.ok((withOverload.clarificationQuestion ?? '').length < (withoutOverload.clarificationQuestion ?? '').length);
});

test('inferIntakeClarificationNeed preserves AI question when AI already asks', () => {
  const result = inferIntakeClarificationNeed({
    sourceText: 'ลูกค้าถามเรื่อง timeline',
    taskShape: taskShape('ลูกค้าถามเรื่อง timeline'),
    aiRequiresClarification: true,
    aiClarificationQuestion: 'ตอนนี้ timeline ที่รับปากลูกค้าไว้คือวันไหน?',
  });

  assert.equal(result.requiresClarification, true);
  assert.equal(result.clarificationQuestion, 'ตอนนี้ timeline ที่รับปากลูกค้าไว้คือวันไหน?');
  assert.equal(result.reason, 'ai_requested_clarification');
});
