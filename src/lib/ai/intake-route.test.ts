import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '@/app/api/ai/intake/route';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildIntakeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('/api/ai/intake accepts the minimal { task: { sourceText } } contract', async () => {
  const originalFetch = global.fetch;
  const chatPrompts: string[] = [];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/tags')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }],
      });
    }

    if (url.endsWith('/api/ps')) {
      return jsonResponse({
        models: [{ name: 'qwen2.5:3b' }],
      });
    }

    if (url.endsWith('/api/chat')) {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const userPrompt = payload.messages?.find((message) => message.role === 'user')?.content ?? '';
      chatPrompts.push(userPrompt);

      return jsonResponse({
        message: {
          content: JSON.stringify({
            workflowType: 'client_resume',
            roomDigest: 'ลูกค้าขอ proposal ใหม่ แต่ requirement ยังไม่ชัด',
            taskFrame: {
              objective: 'จัดกรอบ scope ก่อนเริ่มร่าง proposal',
              stage: 'ข้อมูลกระจัดกระจายและยังไม่สรุป requirement กลาง',
              stakeholders: ['ลูกค้า ACME', 'คุณ'],
            },
            blockers: ['unclear_scope'],
            requiresClarification: false,
            clarificationQuestion: null,
            taskShape: {
              deliverableType: 'proposal',
              immediateNeed: 'define_scope',
              missingInputs: ['ขอบเขตงาน final'],
              workContext: 'งาน proposal ที่ยังต้องจัด requirement ให้ชัดก่อน',
              confidence: 0.8,
            },
            candidateActions: [
              {
                title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
                rationale: 'ช่วยลดการเดา scope',
                kind: 'resume_first',
              },
            ],
            meta: {
              model: 'qwen2.5:3b',
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
    const response = await POST(buildIntakeRequest({
      task: {
        sourceText: 'ลูกค้า ACME ขอ proposal เว็บใหม่ภายในสัปดาห์นี้ แต่ requirement ยังไม่ชัด',
      },
    }));

    assert.equal(response.status, 200);
    assert.equal(chatPrompts.length > 0, true);
    assert.equal(chatPrompts[0]?.includes('sourceFiles:\nไม่มีไฟล์แนบ'), true);
    assert.equal(chatPrompts[0]?.includes('pendingInputs:\nไม่มี'), true);

    const data = await response.json() as {
      workflowType: string;
      requiresClarification: boolean;
      candidateActions: Array<{ title: string }>;
    };

    assert.equal(data.workflowType, 'client_resume');
    assert.equal(data.requiresClarification, false);
    assert.equal(data.candidateActions[0]?.title, 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน');
  } finally {
    global.fetch = originalFetch;
  }
});
