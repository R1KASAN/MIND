import test from 'node:test';
import assert from 'node:assert/strict';

import { guardStalePhrases } from './source-grounding';
import type { TaskContext } from '@/lib/store/idb';

function mockTask(sourceText: string): TaskContext {
  return {
    roomId: 'room-1',
    sourceText,
    extractedText: '',
    lifecycleState: 'has_one_action',
    createdAt: 100,
  } as any;
}

test('guardStalePhrases neutralizes generic customer phrases for non-logo context', () => {
  const generic = 'แนะนำขั้นตอนต่อไปตามบริบทเดิม';
  assert.equal(
    guardStalePhrases(generic, mockTask('')),
    'แนะนำขั้นตอนต่อไป'
  );

  const generic2 = 'คุณทำก้าวแรกเสร็จสิ้นแล้วและต้องการคำแนะนำในการดำเนินการต่อไปโดยอิงจากบริบทเดิม';
  assert.equal(
    guardStalePhrases(generic2, mockTask('')),
    'ทำก้าวแรกเสร็จแล้วและพร้อมดำเนินงานต่อ'
  );
});

test('guardStalePhrases maps generic reentry phrases to logo specific action when logo context is present', () => {
  const logoContext = 'แก้ โลโก้ สี ฟอนต์ ขนาดโลโก้ ลูกค้า';
  const task = mockTask(logoContext);

  const expected = 'ร่างคำตอบลูกค้า 3 บรรทัดจากรายการแก้สี ฟอนต์ และขนาดโลโก้';

  assert.equal(
    guardStalePhrases('แนะนำก้าวต่อไป', task),
    expected
  );

  assert.equal(
    guardStalePhrases('แนะนำแนวทางต่อไปตามบริบทเดิม', task),
    expected
  );

  assert.equal(
    guardStalePhrases('แนะนำขั้นตอนต่อไป', task),
    expected
  );

  assert.equal(
    guardStalePhrases('อิงจากบริบทเดิม', task),
    expected
  );

  assert.equal(
    guardStalePhrases('ดำเนินการต่อไป', task),
    expected
  );

  assert.equal(
    guardStalePhrases('คุณทำก้าวแรกเสร็จสิ้นแล้วและต้องการคำแนะนำในการดำเนินการต่อไปโดยอิงจากบริบทเดิม', task),
    expected
  );
  
  // Also check that a good specific phrase is not replaced (e.g. if it doesn't match the regex)
  assert.equal(
    guardStalePhrases('เปิดไฟลส่งลูกค้า', task),
    'เปิดไฟลส่งลูกค้า'
  );
});
