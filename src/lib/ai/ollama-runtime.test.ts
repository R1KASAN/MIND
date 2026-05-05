import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PRIMARY_MODEL,
  FALLBACK_MODELS,
  getCanonicalRuntimeAlignmentIssues,
  getAiHealth,
  getAiInstallActions,
  getModelTier,
  isPrimaryModel,
  markModelFailure,
  markModelSuccess,
} from '@/lib/ai/ollama-runtime';

test('getModelTier classifies primary, fallback, emergency, and unknown models', () => {
  assert.equal(getModelTier(DEFAULT_PRIMARY_MODEL), 'primary');
  assert.equal(getModelTier(FALLBACK_MODELS[0]), 'fallback');
  assert.equal(getModelTier('llama3.2:1b'), 'emergency');
  assert.equal(getModelTier('mistral:7b'), 'unknown');
  assert.equal(getModelTier(undefined), 'unknown');
});

test('isPrimaryModel only returns true for configured primary models', () => {
  assert.equal(isPrimaryModel(DEFAULT_PRIMARY_MODEL), true);
  assert.equal(isPrimaryModel(FALLBACK_MODELS[0]), false);
  assert.equal(isPrimaryModel('llama3.2:1b'), false);
});

test('getAiInstallActions includes both primary and fallback install commands', () => {
  const actions = getAiInstallActions();

  assert.equal(actions.length >= 2, true);
  assert.equal(actions[0], `ollama pull ${DEFAULT_PRIMARY_MODEL}`);
  assert.equal(actions.some((action) => action === `ollama pull ${FALLBACK_MODELS[0]}`), true);
});

test('getCanonicalRuntimeAlignmentIssues accepts canonical host and model', () => {
  const issues = getCanonicalRuntimeAlignmentIssues({
    NODE_ENV: 'test',
    OLLAMA_HOST: 'http://127.0.0.1:11437',
    AI_MODEL: 'gemma2:2b',
  });

  assert.deepEqual(issues, []);
});

test('getCanonicalRuntimeAlignmentIssues flags host mismatch', () => {
  const issues = getCanonicalRuntimeAlignmentIssues({
    NODE_ENV: 'test',
    OLLAMA_HOST: 'http://127.0.0.1:11434',
    AI_MODEL: 'gemma2:2b',
  });

  assert.deepEqual(issues, [
    {
      kind: 'host_mismatch',
      expected: 'http://127.0.0.1:11437',
      actual: 'http://127.0.0.1:11434',
    },
  ]);
});

test('getCanonicalRuntimeAlignmentIssues flags model mismatch', () => {
  const issues = getCanonicalRuntimeAlignmentIssues({
    NODE_ENV: 'test',
    OLLAMA_HOST: 'http://127.0.0.1:11437',
    AI_MODEL: 'qwen2.5:3b',
  });

  assert.deepEqual(issues, [
    {
      kind: 'model_mismatch',
      expected: 'gemma2:2b',
      actual: 'qwen2.5:3b',
    },
  ]);
});

test('getAiHealth recovers preferred model when only emergency model is loaded', async () => {
  const originalFetch = global.fetch;

  markModelFailure('gemma2:2b', 'timed out');
  markModelFailure('qwen2.5:3b', 'timed out');

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({
        models: [{ name: 'gemma2:2b' }, { name: 'llama3.2:1b' }, { name: 'qwen2.5:3b' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/api/ps')) {
      return new Response(JSON.stringify({
        models: [{ name: 'llama3.2:1b' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/api/chat')) {
      const payload = JSON.parse(String(init?.body)) as { model: string };
      if (payload.model === 'gemma2:2b') {
        return new Response(JSON.stringify({
          message: { content: '{"ok":true}' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'model still unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const health = await getAiHealth();
    assert.equal(health.status, 'ready');
    assert.equal(health.model, 'gemma2:2b');
    assert.notEqual(health.modelTier, 'emergency');
  } finally {
    global.fetch = originalFetch;
    markModelSuccess('gemma2:2b');
    markModelSuccess('qwen2.5:3b');
    markModelSuccess('llama3.2:1b');
  }
});

test('getAiHealth stays in checking state when cached failures exist but Ollama is installed', async () => {
  const originalFetch = global.fetch;

  markModelFailure('gemma2:2b', 'timed out');
  markModelFailure('qwen2.5:3b', 'timed out');
  markModelFailure('llama3.2:1b', 'timed out');

  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({
        models: [{ name: 'gemma2:2b' }, { name: 'qwen2.5:3b' }, { name: 'llama3.2:1b' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/api/ps')) {
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const health = await getAiHealth();
    assert.equal(health.status, 'checking');
    assert.equal(health.retryable, true);
  } finally {
    global.fetch = originalFetch;
    markModelSuccess('gemma2:2b');
    markModelSuccess('qwen2.5:3b');
    markModelSuccess('llama3.2:1b');
  }
});
