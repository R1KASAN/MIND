import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PRIMARY_MODEL,
  FALLBACK_MODELS,
  getCanonicalRuntimeAlignmentIssues,
  getAiInstallActions,
  getModelTier,
  isPrimaryModel,
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
    OLLAMA_HOST: 'http://127.0.0.1:11437',
    AI_MODEL: 'gemma2:2b',
  });

  assert.deepEqual(issues, []);
});

test('getCanonicalRuntimeAlignmentIssues flags host mismatch', () => {
  const issues = getCanonicalRuntimeAlignmentIssues({
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
