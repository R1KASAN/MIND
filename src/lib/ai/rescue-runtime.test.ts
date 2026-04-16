import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRescueRouteBudget } from './rescue-runtime';

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
    repairTimeoutMs: 15000,
    fallbackTimeoutMs: 15000,
    overallBudgetMs: 43000,
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
