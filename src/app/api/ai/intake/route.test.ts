import assert from 'node:assert/strict';
import test from 'node:test';

import puterSdk from '@heyputer/puter.js';
import { POST } from '@/app/api/ai/intake/route';

const originalFetch = global.fetch;
const originalChat = puterSdk.ai.chat;
const originalSetAuthToken = puterSdk.setAuthToken;
const originalBackend = process.env.MIND_AI_BACKEND;
const originalPuterApiKey = process.env.PUTER_API_KEY;
const originalWarn = console.warn;

function restoreState() {
  global.fetch = originalFetch;
  puterSdk.ai.chat = originalChat;
  puterSdk.setAuthToken = originalSetAuthToken;
  console.warn = originalWarn;
  if (originalBackend === undefined) delete process.env.MIND_AI_BACKEND;
  else process.env.MIND_AI_BACKEND = originalBackend;
  if (originalPuterApiKey === undefined) delete process.env.PUTER_API_KEY;
  else process.env.PUTER_API_KEY = originalPuterApiKey;
}

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/ai/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.afterEach(() => {
  restoreState();
});

test('/api/ai/intake returns manual 200 after Puter failure and Local Gemma timeout', async () => {
  const warnings: string[] = [];
  process.env.MIND_AI_BACKEND = 'external_safe';
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => ({ message: { content: 'not json' } })) as any;
  console.warn = ((...args: unknown[]) => {
    warnings.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  }) as typeof console.warn;

  global.fetch = async (input) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.endsWith('/api/tags')) {
      return Response.json({ models: [{ name: 'gemma2:2b' }] });
    }

    if (url.endsWith('/api/ps')) {
      return Response.json({ models: [{ name: 'gemma2:2b' }] });
    }

    if (url.endsWith('/api/chat')) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await POST(buildRequest({
    task: {
      sourceText: 'ลูกค้าขอนัด demo และถามว่าควรเริ่ม pilot ยังไง',
      workflowType: 'client_response',
      blockerSignals: ['unclear_scope'],
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-mind-ai-fallback'), 'manual_intake');
  assert.match(warnings.join('\n'), /Puter failed, falling back/);
  assert.match(warnings.join('\n'), /Local Gemma failed, using manual response/);

  const data = await response.json() as {
    workflowType: string;
    roomDigest: string;
    candidateActions: unknown[];
    meta: { model: string; passType: string };
  };

  assert.equal(data.workflowType, 'client_response');
  assert.ok(data.roomDigest.length > 0);
  assert.ok(data.candidateActions.length > 0);
  assert.match(data.meta.model, /^manual_intake/);
  assert.equal(data.meta.passType, 'fallback_pass');
});
