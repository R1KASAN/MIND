import test from 'node:test';
import assert from 'node:assert/strict';

import type { Action, TaskContext } from '../store/idb';
import { requestRescue, SynthesisFailure } from './task-events';

function makeTask(): TaskContext {
  return {
    id: 'task-1',
    workflowType: 'client_resume',
    sourceText: 'งานค้างและเริ่มไม่ออก',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'stalled',
    currentStepIndex: 0,
    currentActionId: 'action-1',
    rescueHistory: [],
  };
}

function makeAction(): Action {
  return {
    id: 'action-1',
    createdAt: 1,
    title: 'สรุปสถานะงานล่าสุด',
    rationale: 'เริ่มจากบริบทก่อน',
    microSteps: [
      'สรุปสถานะงานล่าสุด',
      'เลือกก้าวถัดไป',
      'ตอบลูกค้าถ้าจำเป็น',
    ],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_resume',
  };
}

test('requestRescue retries once on 503 and returns the recovered rescue payload', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          reason: 'unknown',
          message: 'AI rescue ไม่สำเร็จ (503)',
          retryable: true,
        },
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      diagnosis: {
        primaryReason: 'too_big',
        explanation: 'งานนี้ยังใหญ่เกินไปสำหรับรอบนี้',
      },
      rescuePlan: {
        mode: 'shrink',
        steps: [
          'กลับไปทำแค่ส่วนเล็กที่สุดของ step นี้ก่อน',
          'ถ้ายังติดอยู่ค่อยพักแล้วกลับมาใหม่',
        ],
      },
      suggestedMessage: null,
      meta: {
        model: 'qwen2.5:3b',
        usedRoomFiles: [],
        repairUsed: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const rescue = await requestRescue(makeTask(), makeAction(), 0);
    assert.equal(fetchCount, 2);
    assert.equal(rescue.rescuePlan.mode, 'shrink');
    assert.equal(rescue.diagnosis.primaryReason, 'too_big');
  } finally {
    global.fetch = originalFetch;
  }
});

test('requestRescue does not retry invalid rescue input failures', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      ok: false,
      error: {
        reason: 'unknown',
        message: 'ข้อมูลสำหรับ rescue ไม่ครบ',
        retryable: false,
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      requestRescue(makeTask(), makeAction(), 0),
      (error: unknown) => error instanceof SynthesisFailure,
    );
    assert.equal(fetchCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
