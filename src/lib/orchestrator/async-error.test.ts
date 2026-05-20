import { test, describe } from 'node:test';
import assert from 'node:assert';
import { normalizeAsyncError } from './async-error';

describe('async-error helper tests', () => {
  test('normalizeAsyncError should return the original Error if it is already an Error instance', () => {
    const originalError = new Error('original error message');
    const result = normalizeAsyncError(originalError, 'TestContext');
    assert.strictEqual(result, originalError);
  });

  test('normalizeAsyncError should convert string reasons into Error with clear message', () => {
    const reason = 'Something went wrong';
    const result = normalizeAsyncError(reason, 'TestContext');
    assert.ok(result instanceof Error);
    assert.match(result.message, /\[normalizeAsyncError\] Client async failure in TestContext: Something went wrong/);
    assert.strictEqual((result as any).originalReason, reason);
  });

  test('normalizeAsyncError should handle undefined reason', () => {
    const reason = undefined;
    const result = normalizeAsyncError(reason, 'TestContext');
    assert.ok(result instanceof Error);
    assert.match(result.message, /\[normalizeAsyncError\] Client async failure in TestContext: undefined/);
    assert.strictEqual((result as any).originalReason, reason);
  });

  test('normalizeAsyncError should handle object reason', () => {
    const reason = { code: 500, err: 'DBError' };
    const result = normalizeAsyncError(reason, 'TestContext');
    assert.ok(result instanceof Error);
    assert.match(result.message, /"code":500/);
    assert.strictEqual((result as any).originalReason, reason);
  });
});
