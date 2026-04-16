import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyScaffoldRefineResult,
  getVisibleScaffoldStep,
  getVisibleScaffoldSteps,
  normalizeComparableScaffoldStep,
} from './scaffold-refine';

test('normalizeComparableScaffoldStep strips helper prefixes and whitespace noise', () => {
  const normalized = normalizeComparableScaffoldStep('  ขยับอีกนิด:   ขยับอีกนิด:   สรุปสถานะงานที่เราทำแล้ว   ');
  assert.equal(normalized, 'สรุปสถานะงานที่เราทำแล้ว');
});

test('classifyScaffoldRefineResult treats prefix-only change as no_change', () => {
  const result = classifyScaffoldRefineResult(
    ['สรุปสถานะงานที่เราทำแล้ว'],
    ['ขยับอีกนิด: สรุปสถานะงานที่เราทำแล้ว'],
  );

  assert.equal(result, 'no_change');
});

test('classifyScaffoldRefineResult accepts materially different visible step', () => {
  const result = classifyScaffoldRefineResult(
    ['สรุปสถานะงานที่เราทำแล้ว'],
    ['ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน'],
  );

  assert.equal(result, 'success');
});

test('classifyScaffoldRefineResult accepts richer downstream refinement even when current step stays similar', () => {
  const result = classifyScaffoldRefineResult(
    [
      'สรุป requirement ที่มีอยู่',
      'ร่าง timeline รอบแรก',
      'ตีราคาแบบคร่าว ๆ',
    ],
    [
      'ขยับอีกนิด: สรุป requirement ที่มีอยู่',
      'แยก requirement ที่ชัดแล้วออกจาก assumption',
      'ทำ timeline รอบแรกจากส่วนที่ชัด',
      'เตรียม estimate ช่วงราคาเบื้องต้น',
    ],
  );

  assert.equal(result, 'success');
});

test('getVisibleScaffoldStep clamps to the current visible step safely', () => {
  const result = getVisibleScaffoldStep(['ขั้นแรก', 'ขั้นสอง', 'ขั้นสาม'], 10);
  assert.equal(result, 'ขั้นสาม');
});

test('getVisibleScaffoldSteps returns the visible slice from the current step onward', () => {
  const result = getVisibleScaffoldSteps(['ขั้นแรก', 'ขั้นสอง', 'ขั้นสาม'], 1);
  assert.deepEqual(result, ['ขั้นสอง', 'ขั้นสาม']);
});
