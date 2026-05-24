import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '@/app/api/ai/rescue/route';

function buildRescueRequest(body: unknown) {
  return new Request('http://localhost/api/ai/rescue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('/api/ai/rescue returns deterministic clarify plan for missing file/context blocker', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('should not call Ollama for deterministic missing-context rescue');
  };

  try {
    const response = await POST(buildRescueRequest({
      task: {
        id: 'task-1',
        roomId: 'room-1',
        workflowType: 'client_response',
        sourceText: 'ไฟล์แนบยังอ่านไม่ได้และตอนนี้ยังตอบลูกค้าไม่ได้',
        sourceFiles: [],
        extractedText: '',
        createdAt: 1,
        pendingInputs: [],
        blockerSignals: ['missing_file_or_context'],
        lifecycleState: 'stalled',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      },
      action: {
        id: 'action-1',
        createdAt: 1,
        title: 'สรุป feedback จากบริบทที่มีอยู่',
        rationale: 'ต้องกู้บริบทก่อนตอบ',
        microSteps: ['สรุปว่าตอนนี้รู้อะไรแล้ว', 'ถามหาสิ่งที่ขาดอย่างสุภาพ'],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_response',
      },
      currentStepIndex: 0,
    }));

    assert.equal(response.status, 200);
    assert.equal(fetchCalled, false);

    const data = await response.json() as {
      diagnosis: { primaryReason: string };
      rescuePlan: { mode: string; steps: string[] };
      meta: { model: string; passType: string; repairUsed: boolean };
    };

    assert.equal(data.diagnosis.primaryReason, 'missing_context');
    assert.equal(data.rescuePlan.mode, 'clarify');
    assert.equal(data.rescuePlan.steps.length, 1);
    assert.match(data.rescuePlan.steps[0] ?? '', /เติมข้อมูลที่ขาดที่สุด 1 จุด|ร่างอัปเดตลูกค้า/u);
    assert.equal(data.meta.model, 'deterministic_missing_context');
    assert.equal(data.meta.passType, 'fallback_pass');
    assert.equal(data.meta.repairUsed, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('/api/ai/rescue returns manual rescue instead of 503 when Ollama times out', async () => {
  const originalFetch = global.fetch;
  let chatCalled = false;

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
      chatCalled = true;
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const response = await POST(buildRescueRequest({
      task: {
        id: 'task-2',
        roomId: 'room-2',
        workflowType: 'client_resume',
        sourceText: 'งานค้างเพราะรอคำตอบจากลูกค้าและยังไม่รู้ว่าจะ follow up ยังไง',
        sourceFiles: [],
        extractedText: '',
        createdAt: 1,
        pendingInputs: [],
        blockerSignals: ['dependency'],
        lifecycleState: 'stalled',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
        currentPlan: {
          actionTitle: 'follow up ลูกค้าเพื่อปลดล็อกงาน',
          successSignal: 'ได้ข้อมูลที่ต้องใช้ต่อ',
          steps: [
            { id: 'step-1', text: 'สรุปข้อมูลที่ยังขาด' },
            { id: 'step-2', text: 'ร่าง follow-up สั้น ๆ' },
          ],
        },
      },
      action: {
        id: 'action-2',
        createdAt: 1,
        title: 'follow up ลูกค้าเพื่อปลดล็อกงาน',
        rationale: 'ต้องปลด dependency ก่อน',
        microSteps: ['สรุปข้อมูลที่ยังขาด', 'ร่าง follow-up สั้น ๆ'],
        isPinned: false,
        state: 'IN_PROGRESS',
        workflowType: 'client_resume',
      },
      currentStepIndex: 0,
    }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-mind-ai-fallback'), 'manual_rescue');
    assert.equal(chatCalled, true);

    const data = await response.json() as {
      diagnosis: { primaryReason: string };
      rescuePlan: { mode: string; steps: string[] };
      suggestedMessage?: string;
      meta: { model: string; passType: string; repairUsed: boolean };
    };

    assert.equal(data.diagnosis.primaryReason, 'dependency');
    assert.equal(data.rescuePlan.mode, 'follow_up');
    assert.equal(data.rescuePlan.steps.length, 1);
    assert.match(data.rescuePlan.steps[0] ?? '', /follow up ลูกค้า|ร่างอัปเดตลูกค้า|สรุปข้อมูลที่ยังขาด/u);
    assert.match(data.meta.model, /^manual_rescue/);
    assert.equal(data.meta.passType, 'fallback_pass');
    assert.equal(data.meta.repairUsed, false);
    assert.equal(typeof data.suggestedMessage, 'string');
  } finally {
    global.fetch = originalFetch;
  }
});

test('/api/ai/rescue parses prose-wrapped JSON successfully', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.endsWith('/api/tags') || url.endsWith('/api/ps')) {
      return Response.json({ models: [{ name: 'gemma2:2b' }] });
    }

    if (url.endsWith('/api/chat')) {
      return Response.json({
        message: {
          content: `Here is your rescue plan!
\`\`\`json
{
  "diagnosis": {
    "primaryReason": "dependency",
    "explanation": "waiting for dependency"
  },
  "rescuePlan": {
    "mode": "follow_up",
    "steps": ["step 1", "step 2"]
  },
  "suggestedMessage": "hello",
  "meta": { "model": "puter", "repairUsed": false }
}
\`\`\`
Good luck!`
        }
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const response = await POST(buildRescueRequest({
      task: {
        id: 'task-3',
        roomId: 'room-3',
        workflowType: 'client_resume',
        sourceText: 'test context',
        sourceFiles: [],
        extractedText: '',
        createdAt: 1,
        pendingInputs: [],
        blockerSignals: [],
        lifecycleState: 'stalled',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      },
    }));

    assert.equal(response.status, 200);
    const data = await response.json() as any;
    assert.equal(data.diagnosis.primaryReason, 'dependency');
    assert.equal(data.source, 'ai');
    assert.equal(data.aiProvider, 'local_gemma');
    assert.equal(data.aiAnalysisUsed, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('/api/ai/rescue falls back to manual rescue on non-JSON response', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.endsWith('/api/tags') || url.endsWith('/api/ps')) {
      return Response.json({ models: [{ name: 'gemma2:2b' }] });
    }

    if (url.endsWith('/api/chat')) {
      return Response.json({
        message: {
          content: 'This is completely invalid non-JSON output that will fail parsing.'
        }
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const response = await POST(buildRescueRequest({
      task: {
        id: 'task-4',
        roomId: 'room-4',
        workflowType: 'client_resume',
        sourceText: 'test context',
        sourceFiles: [],
        extractedText: '',
        createdAt: 1,
        pendingInputs: [],
        blockerSignals: [],
        lifecycleState: 'stalled',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      },
    }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-mind-ai-fallback'), 'manual_rescue');
    const data = await response.json() as any;
    assert.equal(data.source, 'manual_fallback');
    assert.equal(data.aiProvider, null);
    assert.equal(data.aiAnalysisUsed, false);
    assert.equal(typeof data.fallbackReason, 'string');
  } finally {
    global.fetch = originalFetch;
  }
});
