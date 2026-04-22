import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAiHealth } from '@/lib/ai/adapter';

test('checkAiHealth returns checking when health polling aborts', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error('timed out');
    error.name = 'AbortError';
    throw error;
  };

  try {
    const result = await checkAiHealth();
    assert.equal(result.status, 'checking');
    assert.match(result.detail ?? '', /health endpoint ยังตอบไม่ทัน/i);
  } finally {
    global.fetch = originalFetch;
  }
});
