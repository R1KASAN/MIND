import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import type { Action, TaskContext } from '../store/idb';
import { composeRoomSourceText, type RoomSourceFile } from '../room';
import { clearRoomMemoryData, getRoomMemoryDb, getRoomMemorySnapshot } from '../store/room-memory-db';
import { requestIntake, requestRescue, SynthesisFailure } from './task-events';

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

function makeIntakeResponse() {
  return {
    workflowType: 'client_resume' as const,
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
      deliverableType: 'proposal' as const,
      immediateNeed: 'define_scope' as const,
      missingInputs: ['ขอบเขตงาน final'],
      workContext: 'งาน proposal ที่ยังต้องจัด requirement ให้ชัดก่อน',
      confidence: 0.8,
    },
    candidateActions: [
      {
        title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
        rationale: 'ช่วยลดการเดา scope',
        kind: 'resume_first' as const,
      },
    ],
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
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

test('requestRescue fallback appends blocker_updated with fallback diagnosis', async () => {
  const originalFetch = global.fetch;
  const originalMaxAttempts = process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;

  process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = '1';
  await clearRoomMemoryData();

  global.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      reason: 'request_timeout',
      message: 'AI rescue ไม่สำเร็จ (503)',
      retryable: true,
    },
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const rescue = await requestRescue(makeTask(), makeAction(), 0);
    const snapshot = await getRoomMemorySnapshot('task-1');
    const events = await getRoomMemoryDb().roomEvents.where('roomId').equals('task-1').toArray();

    assert.equal(rescue.diagnosis.primaryReason, 'unknown');
    assert.equal(snapshot?.latestRescue?.reason, 'unknown');
    assert.deepEqual(snapshot?.currentBlockers, ['unknown']);
    assert.ok(events.some((event) => event.type === 'rescue_created' && event.sourceOperationId === 'rescue:fallback'));
    assert.ok(events.some((event) => event.type === 'blocker_updated' && event.sourceOperationId === 'rescue:fallback'));
    assert.ok(events.some((event) => event.type === 'rescue_created' && event.intent?.kind === 'ai_created_rescue'));
    assert.equal(snapshot?.cognitiveState?.driftWarnings.length, 2);
  } finally {
    global.fetch = originalFetch;
    await clearRoomMemoryData();
    if (originalMaxAttempts === undefined) delete process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;
    else process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = originalMaxAttempts;
  }
});

test('requestIntake omits file context when sourceText is the canonical merged room text', async () => {
  const originalFetch = global.fetch;
  const file: RoomSourceFile = {
    id: 'file-1',
    name: 'brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1200,
    status: 'ready',
    createdAt: 1,
  };
  const extractedText = 'เอกสารสรุป scope เบื้องต้นจาก brief.pdf';
  const task: TaskContext = {
    ...makeTask(),
    sourceText: composeRoomSourceText(
      'ลูกค้าขอ proposal ด่วนและผมกำลังรวมบริบททั้งหมดไว้ใน room เดียว',
      extractedText,
      [file],
    ),
    extractedText,
    sourceFiles: [file],
  };
  let capturedBody: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify(makeIntakeResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await requestIntake(task);
    assert.equal(response.workflowType, 'client_resume');
    assert.deepEqual(capturedBody, {
      task: {
        sourceText: task.sourceText,
      },
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('requestIntake appends source_added events for live room sources', async () => {
  const originalFetch = global.fetch;
  const file: RoomSourceFile = {
    id: 'file-1',
    name: 'brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1200,
    status: 'ready',
    createdAt: 1,
    extractedText: 'Phase 2 budget and deadline notes',
  };
  const task: TaskContext = {
    ...makeTask(),
    sourceText: 'Manual note about the client scope',
    sourceFiles: [file],
  };

  await clearRoomMemoryData();
  global.fetch = async () => new Response(JSON.stringify(makeIntakeResponse()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await requestIntake(task);
    const events = await getRoomMemoryDb().roomEvents.where('roomId').equals('task-1').toArray();
    const sourceEvents = events.filter((event) => event.type === 'source_added');

    assert.ok(sourceEvents.some((event) => event.refs.some((ref) => ref.id === 'manual:task-1')));
    assert.ok(sourceEvents.some((event) => event.refs.some((ref) => ref.id === 'file:file-1')));
    assert.equal(sourceEvents.every((event) => event.actor === 'system'), true);
    assert.equal(sourceEvents.every((event) => event.intent?.kind === 'context_entered'), true);
    assert.ok(events.some((event) => event.type === 'blocker_updated' && event.intent?.kind === 'ai_detected_blocker'));
  } finally {
    global.fetch = originalFetch;
    await clearRoomMemoryData();
  }
});

test('requestIntake preserves extracted file context when sourceText is not a canonical merged room text', async () => {
  const originalFetch = global.fetch;
  const file: RoomSourceFile = {
    id: 'file-1',
    name: 'brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1200,
    status: 'ready',
    createdAt: 1,
  };
  const extractedText = 'เอกสารสรุป scope เบื้องต้นจาก brief.pdf';
  const task: TaskContext = {
    ...makeTask(),
    sourceText: 'ลูกค้าขอ proposal ด่วน แต่ข้อความรวมใน room ยังไม่ merge context จากไฟล์แนบ',
    extractedText,
    sourceFiles: [file],
  };
  let capturedBody: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({
      ...makeIntakeResponse(),
      meta: {
        model: 'qwen2.5:3b',
        usedRoomFiles: ['brief.pdf'],
        repairUsed: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await requestIntake(task);
    assert.deepEqual(capturedBody, {
      task: {
        sourceText: task.sourceText,
        extractedText,
        sourceFiles: [file],
      },
    });
    assert.notEqual(task.sourceText, composeRoomSourceText('', extractedText, [file]));
  } finally {
    global.fetch = originalFetch;
  }
});

test('requestIntake does not drop file context when sourceText only mentions file names in prose', async () => {
  const originalFetch = global.fetch;
  const file: RoomSourceFile = {
    id: 'file-1',
    name: 'brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1200,
    status: 'ready',
    createdAt: 1,
  };
  const task: TaskContext = {
    ...makeTask(),
    sourceText: 'ผมเปิด brief.pdf แล้ว แต่ข้อความใน room นี้ยังเป็นแค่โน้ตสั้น ๆ ยังไม่ได้ merge บริบทจากไฟล์แนบเข้ามา',
    extractedText: '',
    sourceFiles: [file],
  };
  let capturedBody: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({
      ...makeIntakeResponse(),
      meta: {
        model: 'qwen2.5:3b',
        usedRoomFiles: ['brief.pdf'],
        repairUsed: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await requestIntake(task);
    assert.deepEqual(capturedBody, {
      task: {
        sourceText: task.sourceText,
        sourceFiles: [file],
      },
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('requestRescue can use a third attempt for transient rescue failures when configured', async () => {
  const originalFetch = global.fetch;
  const originalMaxAttempts = process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;
  const originalTimeoutBackoff = process.env.MIND_RESCUE_TIMEOUT_BACKOFF_MS;
  let fetchCount = 0;
  const requestBodies: Array<Record<string, unknown>> = [];

  process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = '3';
  process.env.MIND_RESCUE_TIMEOUT_BACKOFF_MS = '1';

  global.fetch = async (_input, init) => {
    fetchCount += 1;
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    if (fetchCount < 3) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          reason: 'request_timeout',
          message: 'AI rescue ไม่สำเร็จ (503)',
          retryable: true,
          telemetry: {
            passType: 'timeout',
          },
        },
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      diagnosis: {
        primaryReason: 'dependency',
        explanation: 'ตอนนี้ต้องรอข้อมูลจากคนอื่นก่อน',
      },
      rescuePlan: {
        mode: 'follow_up',
        steps: [
          'สรุปข้อมูลที่ยังขาดให้ชัด',
          'ส่ง follow-up สั้น ๆ เพื่อปลดล็อก dependency นี้',
        ],
      },
      suggestedMessage: 'ขอข้อมูลเพิ่มอีกหนึ่งจุดเพื่อให้เดินงานต่อได้',
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
    assert.equal(fetchCount, 3);
    assert.equal(rescue.rescuePlan.mode, 'follow_up');
    assert.equal(rescue.diagnosis.primaryReason, 'dependency');
    assert.equal(requestBodies[0]?.retryContext, undefined);
    assert.deepEqual(requestBodies[1]?.retryContext, {
      attempt: 2,
      previousStatus: 503,
      previousReason: 'request_timeout',
      previousPassType: 'timeout',
    });
    assert.deepEqual(requestBodies[2]?.retryContext, {
      attempt: 3,
      previousStatus: 503,
      previousReason: 'request_timeout',
      previousPassType: 'timeout',
    });
  } finally {
    global.fetch = originalFetch;
    if (originalMaxAttempts === undefined) delete process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;
    else process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = originalMaxAttempts;
    if (originalTimeoutBackoff === undefined) delete process.env.MIND_RESCUE_TIMEOUT_BACKOFF_MS;
    else process.env.MIND_RESCUE_TIMEOUT_BACKOFF_MS = originalTimeoutBackoff;
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
