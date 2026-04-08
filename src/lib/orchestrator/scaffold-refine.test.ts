import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyScaffoldRefineResult,
  getVisibleScaffoldStep,
  normalizeComparableScaffoldStep,
} from './scaffold-refine';

test('normalizeComparableScaffoldStep strips helper prefixes and whitespace noise', () => {
  const normalized = normalizeComparableScaffoldStep('  ขยับอีกนิด:   ขยับอีกนิด:   สรุปสถานะงานที่เราทำแล้ว   ');
  assert.equal(normalized, 'สรุปสถานะงานที่เราทำแล้ว');
});

test('classifyScaffoldRefineResult treats prefix-only change as no_change', () => {
  const result = classifyScaffoldRefineResult(
    'สรุปสถานะงานที่เราทำแล้ว',
    'ขยับอีกนิด: สรุปสถานะงานที่เราทำแล้ว',
  );

  assert.equal(result, 'no_change');
});

test('classifyScaffoldRefineResult accepts materially different visible step', () => {
  const result = classifyScaffoldRefineResult(
    'สรุปสถานะงานที่เราทำแล้ว',
    'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน',
  );

  assert.equal(result, 'success');
});

test('getVisibleScaffoldStep clamps to the current visible step safely', () => {
  const result = getVisibleScaffoldStep(['ขั้นแรก', 'ขั้นสอง', 'ขั้นสาม'], 10);
  assert.equal(result, 'ขั้นสาม');
});
