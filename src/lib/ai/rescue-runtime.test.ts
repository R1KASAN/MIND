import test from 'node:test';
import assert from 'node:assert/strict';

import { inferRescueFallbackReason, resolveRescueRouteBudget } from './rescue-runtime';

test('resolveRescueRouteBudget widens only timeout-recovery retries', () => {
  const resolved = resolveRescueRouteBudget(
    {
      primaryTimeoutMs: 20000,
      repairTimeoutMs: 14000,
      fallbackTimeoutMs: 14000,
      overallBudgetMs: 40000,
    },
    {
      attempt: 2,
      previousStatus: 503,
      previousReason: 'request_timeout',
      previousPassType: 'timeout',
    },
  );

  assert.deepEqual(resolved, {
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 16000,
    fallbackTimeoutMs: 16000,
    overallBudgetMs: 45000,
  });
});

test('resolveRescueRouteBudget keeps the baseline budget on first attempt', () => {
  const baseline = {
    primaryTimeoutMs: 20000,
    repairTimeoutMs: 14000,
    fallbackTimeoutMs: 14000,
    overallBudgetMs: 40000,
  };

  const resolved = resolveRescueRouteBudget(baseline, {
    attempt: 1,
    previousStatus: 503,
    previousReason: 'request_timeout',
    previousPassType: 'timeout',
  });

  assert.deepEqual(resolved, baseline);
});

test('inferRescueFallbackReason maps personal friction to low_energy without requiring blockerSignals', () => {
  const reason = inferRescueFallbackReason({
    id: 'task-low-energy',
    workflowType: 'client_resume',
    sourceText: 'หิวข้าวมากแต่ต้องทำงานต่อ',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'stalled',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    taskShape: {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'ตอนนี้หิวและหมดแรงแต่ยังต้องทำงานต่อ',
      behaviorIntent: 'personal_friction',
      confidence: 0.84,
    },
  });

  assert.equal(reason, 'low_energy');
});
