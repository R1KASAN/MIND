import assert from 'node:assert/strict';
import test from 'node:test';

import { AiOperationContractError } from '@/lib/ai/operation-contract';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('runAiOperation falls through from primary endpoint failure to Gemma fallback success', async () => {
  const originalFetch = global.fetch;
  const modelCalls: string[] = [];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }, { name: 'gemma2:2b' }],
      });
    }

    if (url.endsWith('/api/ps')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }],
      });
    }

    if (url.endsWith('/api/chat')) {
      const payload = JSON.parse(String(init?.body)) as { model: string };
      modelCalls.push(payload.model);

      if (payload.model === 'qwen2.5:3b') {
        return jsonResponse({ error: 'primary down' }, 503);
      }

      return jsonResponse({
        message: {
          content: JSON.stringify({
            ok: true,
            value: 'gemma-pass',
            meta: {
              usedRoomFiles: [],
              repairUsed: false,
            },
          }),
        },
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const response = await runAiOperation({
      operationName: 'test_op',
      systemPrompt: 'system',
      repairPrompt: 'repair',
      userPrompt: 'user',
      buildRepairUserPrompt: () => 'repair-user',
      parse: (raw) => JSON.parse(raw) as {
        ok: boolean;
        value: string;
        meta: { usedRoomFiles: string[]; repairUsed: boolean };
      },
      numPredict: 32,
      repairNumPredict: 48,
    });

    const data = response as any;
    assert.deepEqual(modelCalls, ['qwen2.5:3b', 'gemma2:2b']);

    assert.equal(data.value, 'gemma-pass');
    assert.equal(data.meta.model, 'gemma2:2b');
    assert.equal(data.meta.passType, 'fallback_pass');
    assert.equal(data.meta.repairUsed, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runAiOperation retries repair on primary validation failure before falling through to Gemma', async () => {
  const originalFetch = global.fetch;
  const modelCalls: string[] = [];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }, { name: 'gemma2:2b' }],
      });
    }

    if (url.endsWith('/api/ps')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }],
      });
    }

    if (url.endsWith('/api/chat')) {
      const payload = JSON.parse(String(init?.body)) as { model: string };
      modelCalls.push(payload.model);

      if (payload.model === 'qwen2.5:3b') {
        return jsonResponse({
          message: {
            content: modelCalls.length === 1 ? 'bad primary payload' : 'still bad after repair',
          },
        });
      }

      return jsonResponse({
        message: {
          content: JSON.stringify({
            ok: true,
            value: 'fallback-after-validation',
            meta: {
              usedRoomFiles: [],
              repairUsed: false,
            },
          }),
        },
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const response = await runAiOperation({
      operationName: 'test_validation_fallback',
      systemPrompt: 'system',
      repairPrompt: 'repair',
      userPrompt: 'user',
      buildRepairUserPrompt: () => 'repair-user',
      parse: (raw) => {
        if (raw.includes('bad')) {
          throw new AiOperationContractError('schema_validation_failed', 'synthetic invalid payload');
        }

        return JSON.parse(raw) as {
          value: string;
          meta: { usedRoomFiles: string[]; repairUsed: boolean };
        };
      },
      numPredict: 32,
      repairNumPredict: 48,
    });

    const data = response as any;
    assert.deepEqual(modelCalls, ['qwen2.5:3b', 'qwen2.5:3b', 'gemma2:2b']);

    assert.equal(data.value, 'fallback-after-validation');
    assert.equal(data.meta.model, 'gemma2:2b');
    assert.equal(data.meta.passType, 'fallback_pass');
  } finally {
    global.fetch = originalFetch;
  }
});
