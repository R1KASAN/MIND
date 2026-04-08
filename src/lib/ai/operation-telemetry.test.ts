import assert from 'node:assert/strict';
import test from 'node:test';
import { isAiTimeoutDetail, resolveAiOperationPassType } from '@/lib/ai/operation-telemetry';

test('resolveAiOperationPassType prefers repair when repair used', () => {
  assert.equal(resolveAiOperationPassType({ repairUsed: true, modelTier: 'primary' }), 'repair_pass');
  assert.equal(resolveAiOperationPassType({ repairUsed: true, modelTier: 'fallback' }), 'repair_pass');
});

test('resolveAiOperationPassType distinguishes primary and fallback success', () => {
  assert.equal(resolveAiOperationPassType({ repairUsed: false, modelTier: 'primary' }), 'primary_pass');
  assert.equal(resolveAiOperationPassType({ repairUsed: false, modelTier: 'fallback' }), 'fallback_pass');
});

test('isAiTimeoutDetail detects timeout messages', () => {
  assert.equal(isAiTimeoutDetail('AI request timed out after 12000ms'), true);
  assert.equal(isAiTimeoutDetail('Ollama endpoint could not be reached'), false);
  assert.equal(isAiTimeoutDetail(undefined), false);
});
