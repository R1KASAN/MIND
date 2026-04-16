import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '@/app/api/ai/route';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildLegacyDumpRequest(dump: string) {
  return new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dump }),
  });
}

test('legacy /api/ai returns primary and fallback install actions when no models are installed', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return jsonResponse({ models: [] });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const response = await POST(buildLegacyDumpRequest('ลูกค้าส่งงานมาให้สรุป'));
    assert.equal(response.status, 503);

    const data = await response.json() as {
      error: { reason: string; actions?: string[] };
    };

    assert.equal(data.error.reason, 'model_missing');
    assert.deepEqual(data.error.actions, ['ollama pull qwen2.5:3b', 'ollama pull gemma2:2b']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('legacy /api/ai falls through from primary endpoint failure to Gemma synthesis success', async () => {
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
            workflow_type: 'client_response',
            requires_clarification: false,
            situation_summary: 'Gemma สรุปบริบทนี้แทน primary ได้',
            reply_draft: 'ผมสรุปประเด็นหลักไว้แล้วและพร้อมตอบกลับต่อครับ',
            recommended_action: {
              title: 'สรุปประเด็นหลักแล้วตอบกลับลูกค้า',
              rationale: 'เริ่มจากการยืนยันความเข้าใจร่วมก่อน',
              micro_steps: [
                'เปิดข้อความลูกค้าและสรุป 3 ประเด็นหลัก',
                'ร่างคำตอบสั้นเพื่อยืนยันความเข้าใจ',
                'ส่งกลับเมื่อถ้อยคำชัดแล้ว',
              ],
            },
            alternative_actions: [],
            detected_blockers: [],
          }),
        },
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    const response = await POST(buildLegacyDumpRequest('ลูกค้าส่ง feedback ยาวและต้องตอบวันนี้'));
    assert.equal(response.status, 200);
    assert.deepEqual(modelCalls, ['qwen2.5:3b', 'gemma2:2b']);

    const data = await response.json() as {
      situation_summary: string;
      recommended_action: { title: string };
    };

    assert.equal(data.situation_summary, 'Gemma สรุปบริบทนี้แทน primary ได้');
    assert.equal(data.recommended_action.title, 'สรุปประเด็นหลักแล้วตอบกลับลูกค้า');
  } finally {
    global.fetch = originalFetch;
  }
});
