import assert from 'node:assert/strict';
import test from 'node:test';

import puterSdk from '@heyputer/puter.js';
import { POST } from '@/app/api/ai/action/route';
import { createTaskContext } from '@/lib/store/idb';

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
  return new Request('http://localhost/api/ai/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.afterEach(() => {
  restoreState();
});

test('/api/ai/action returns manual 200 after Puter failure and Local Gemma timeout', async () => {
  const warnings: string[] = [];
  process.env.MIND_AI_BACKEND = 'external_safe';
  process.env.PUTER_API_KEY = 'puter-token';
  puterSdk.setAuthToken = (() => undefined) as typeof puterSdk.setAuthToken;
  puterSdk.ai.chat = (async () => {
    throw new Error('Puter auth failed');
  }) as typeof puterSdk.ai.chat;
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

  const task = createTaskContext({
    sourceText: 'ลูกค้าถามเรื่อง pilot และ timeline ต้องการข้อความตอบกลับที่ไม่รับ scope เกินจริง',
    workflowType: 'client_response',
    blockerSignals: ['unclear_scope'],
  });

  const response = await POST(buildRequest({
    task,
    preferredCandidate: {
      title: 'ร่างข้อความตอบกลับสั้นที่ล็อกกรอบ pilot ก่อน',
      rationale: 'ช่วยตอบลูกค้าเร็วโดยไม่รับ scope เกินจริง',
      kind: 'reply_first',
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-mind-ai-fallback'), 'manual_action');
  assert.match(warnings.join('\n'), /Puter failed, falling back/);
  assert.match(warnings.join('\n'), /Local Gemma failed, using manual response/);

  const data = await response.json() as {
    chosenAction: { title: string };
    alternatives: unknown[];
    whyThisNow: string;
    situationSummary: string;
    meta: { model: string; passType: string };
  };

  assert.equal(data.chosenAction.title, 'ร่างข้อความตอบกลับสั้นที่ล็อกกรอบ pilot ก่อน');
  assert.ok(data.alternatives.length > 0);
  assert.ok(data.whyThisNow.length > 0);
  assert.ok(data.situationSummary.length > 0);
  assert.match(data.meta.model, /^manual_action/);
  assert.equal(data.meta.passType, 'fallback_pass');
});
