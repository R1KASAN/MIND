import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScaffoldRefineFeedback,
  classifyScaffoldRefineResult,
  getVisibleScaffoldStep,
  getVisibleScaffoldSteps,
  inferScaffoldRefineFallback,
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

test('buildScaffoldRefineFeedback separates no_change diagnostics from failed diagnostics', () => {
  const noChange = buildScaffoldRefineFeedback('no_change', {
    suggestedRoute: 'rescue',
    attemptedStructuralRetry: true,
    suggestedRouteLabel: 'ไป Rescue',
    suggestedReasonLabel: 'ก้าวนี้ยังใหญ่เกิน',
  });
  const failed = buildScaffoldRefineFeedback('failed');

  assert.equal(noChange.reason, 'no_change');
  assert.equal(noChange.suggestedRoute, 'rescue');
  assert.match(noChange.diagnostic, /2 รอบ/);
  assert.equal(noChange.suggestedRouteLabel, 'ไป Rescue');
  assert.equal(noChange.suggestedReasonLabel, 'ก้าวนี้ยังใหญ่เกิน');
  assert.equal(failed.reason, 'failed');
  assert.equal(failed.suggestedRoute, 'retry');
  assert.match(failed.message, /เรียก AI/);
});

test('inferScaffoldRefineFallback eval fixtures cover clarify, dependency, and too_big cases', () => {
  const fixtures = [
    {
      name: 'clarify',
      blockerSignals: ['unclear_scope'],
      currentStep: 'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน',
      expectedRoute: 'clarification',
      expectedText: 'ถามลูกค้า',
    },
    {
      name: 'dependency',
      blockerSignals: ['dependency'],
      currentStep: 'รอไฟล์ต้นฉบับจากลูกค้าก่อนแก้รอบถัดไป',
      expectedRoute: 'rescue',
      expectedReason: 'dependency',
    },
    {
      name: 'too_big',
      blockerSignals: ['too_big'],
      currentStep: 'ทำ proposal ทั้งชุดให้พร้อมส่ง',
      expectedRoute: 'rescue',
      expectedReason: 'too_big',
    },
  ] as const;

  for (const fixture of fixtures) {
    const result = inferScaffoldRefineFallback(fixture.blockerSignals, fixture.currentStep);
    assert.equal(result.route, fixture.expectedRoute, fixture.name);

    if (fixture.expectedRoute === 'clarification') {
      assert.match(result.prompt ?? '', new RegExp(fixture.expectedText));
    } else {
      assert.equal(result.rescueReason, fixture.expectedReason, fixture.name);
    }
  }
});
