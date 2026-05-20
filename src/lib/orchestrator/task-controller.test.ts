import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiRescueResponse } from '../ai/operations';
import type { AiSynthesisResponse } from '../ai/schema';
import type { Action, AppSession, TaskContext } from '../store/idb';
import { normalizeSession } from '../store/idb';
import {
  SCAFFOLD_REFINE_FAILED_COPY,
  SCAFFOLD_REFINE_NO_CHANGE_COPY,
} from './scaffold-refine';
import {
  createTaskController,
  mergeTaskConstraints,
} from './task-controller';

function makeTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    id: 'task-1',
    workflowType: 'client_response',
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'has_one_action',
    currentStepIndex: 0,
    currentActionId: 'action-1',
    rescueHistory: [],
    ...overrides,
  };
}

function makePayload(overrides: Partial<AiSynthesisResponse> = {}): AiSynthesisResponse {
  return {
    workflow_type: 'client_response',
    requires_clarification: false,
    situation_summary: 'สรุปสถานะงานที่เราทำแล้ว',
    reply_draft: 'ได้เลยครับ เดี๋ยวผมสรุปให้ก่อน',
    recommended_action: {
      title: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
      rationale: 'ลดความฟุ้งแล้วขยับจากบริบทจริงก่อน',
      micro_steps: [
        'สรุปสถานะงานที่เราทำแล้ว',
        'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน',
        'ร่างข้อความตอบกลับเพื่อขอ clarification',
      ],
    },
    alternative_actions: [],
    detected_blockers: [],
    ...overrides,
  };
}

function makeAction(): Action {
  return {
    id: 'action-1',
    createdAt: 1,
    title: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
    rationale: 'ลดความฟุ้งแล้วขยับจากบริบทจริงก่อน',
    microSteps: [
      'สรุปสถานะงานที่เราทำแล้ว',
      'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน',
      'ร่างข้อความตอบกลับเพื่อขอ clarification',
    ],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_response',
  };
}

function makeSession(task: TaskContext, payload: AiSynthesisResponse): AppSession {
  return normalizeSession({
    lastActive: 100,
    uiRoute: 'SCAFFOLD',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
}

test('mergeTaskConstraints persists reply-first and patches time/energy constraints', () => {
  const task = makeTask({
    constraints: {
      energyLevel: 'medium',
    },
  });

  const result = mergeTaskConstraints(task, {
    mode: 'reply_first',
    constraintPatch: {
      timeBudgetMin: 10,
      energyLevel: 'low',
    },
  });

  assert.equal(result.persistedNegotiationMode, 'reply_first');
  assert.equal(result.nextTask.constraints?.preferReplyFirst, true);
  assert.equal(result.nextTask.constraints?.timeBudgetMin, 10);
  assert.equal(result.nextTask.constraints?.energyLevel, 'low');
});

test('handleMakeSmaller routes to rescue with no_change diagnostics after structural retry still changes nothing', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  const refineLoadingStates: boolean[] = [];
  let latestSession: AppSession | null = session;
  let feedback = null as { message: string; reason: string; diagnostic: string } | null;
  let currentPayload: AiSynthesisResponse | null = payload;
  const trackedEvents: Array<{ name: string; properties: Record<string, unknown> | undefined }> = [];

  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    const [first, second] = args;
    if (typeof first === 'string' && first.startsWith('[EVENT] ')) {
      trackedEvents.push({
        name: first.replace('[EVENT] ', '').trim(),
        properties: (second as Record<string, unknown> | undefined),
      });
    }
  };
  let scaffoldCalls = 0;
  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/api/ai/scaffold')) {
      scaffoldCalls += 1;
      return new Response(JSON.stringify({
        planTitle: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
        steps: [
          { id: 'step-1', text: scaffoldCalls === 1 ? 'ขยับอีกนิด: สรุปสถานะงานที่เราทำแล้ว' : 'สรุปสถานะงานที่เราทำแล้ว' },
          { id: 'step-2', text: 'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน' },
          { id: 'step-3', text: 'ร่างข้อความตอบกลับเพื่อขอ clarification' },
        ],
        shortcutOptions: [],
        revisedCurrentStepIndex: 0,
        meta: {
          model: 'qwen2.5:3b',
          usedRoomFiles: [],
          repairUsed: scaffoldCalls > 1,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/rescue')) {
      return new Response(JSON.stringify({
        diagnosis: {
          primaryReason: 'too_big',
          explanation: 'ก้าวนี้ยังใหญ่เกินกว่าจะย่อยต่อจากถ้อยคำเดิมได้',
        },
        rescuePlan: {
          mode: 'shrink',
          steps: [
            'กลับไปทำแค่ส่วนเล็กที่สุดของ step นี้ก่อน',
            'ถ้ายังติดอยู่ ให้เลือกข้อมูลชิ้นเดียวที่ต้องดูต่อ',
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
    }

    throw new Error(`unexpected fetch call: ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: (value) => {
        currentPayload = value;
      },
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: (value) => {
        refineLoadingStates.push(value);
      },
      setScaffoldRefineFeedback: (value) => {
        feedback = value
          ? { message: value.message, reason: value.reason, diagnostic: value.diagnostic }
          : null;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.deepEqual(refineLoadingStates, [true, false, false]);
    assert.equal(scaffoldCalls, 2);
    assert.equal(feedback?.message, SCAFFOLD_REFINE_NO_CHANGE_COPY);
    assert.equal(feedback?.reason, 'no_change');
    assert.match(feedback?.diagnostic ?? '', /2 รอบ/);
    const noChangeEvent = trackedEvents.find((event) => event.name === 'make_smaller_no_change');
    assert.equal(feedback?.message, SCAFFOLD_REFINE_NO_CHANGE_COPY);
    assert.equal(noChangeEvent?.properties?.outcome_label, 'rescue');
    assert.equal(noChangeEvent?.properties?.initial_scaffold_model, 'qwen2.5:3b');
    assert.equal(noChangeEvent?.properties?.structural_retry_used, true);
    assert.equal(noChangeEvent?.properties?.structural_retry_model, 'qwen2.5:3b');
    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(
      currentPayload?.recommended_action.micro_steps[0],
      'สรุปสถานะงานที่เราทำแล้ว',
    );
  } finally {
    console.log = originalConsoleLog;
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller routes to clarification when no_change suggests missing scope', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    currentStepIndex: 1,
    blockerSignals: ['unclear_scope'],
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let clarificationPrompt = '';
  let feedback = null as { routeLabel?: string; reasonLabel?: string } | null;

  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('/api/ai/scaffold')) {
      throw new Error(`unexpected fetch call: ${url}`);
    }

    return new Response(JSON.stringify({
      planTitle: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
      steps: [
        { id: 'step-1', text: 'สรุปสถานะงานที่เราทำแล้ว' },
        { id: 'step-2', text: 'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน' },
        { id: 'step-3', text: 'ร่างข้อความตอบกลับเพื่อขอ clarification' },
      ],
      shortcutOptions: [],
      revisedCurrentStepIndex: 1,
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
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: (value) => {
        clarificationPrompt = value;
      },
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: (value) => {
        feedback = value
          ? { routeLabel: value.suggestedRouteLabel, reasonLabel: value.suggestedReasonLabel }
          : null;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'CLARIFICATION');
    assert.match(clarificationPrompt, /ต้องรู้เพิ่มอีกนิด/);
    assert.match(clarificationPrompt, /ถามลูกค้า/);
    assert.equal(feedback?.routeLabel, 'ไป Clarification');
    assert.equal(feedback?.reasonLabel, 'โจทย์ยังไม่ชัด');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller surfaces failed diagnostics when scaffold request fails', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let feedback = null as { message: string; reason: string; diagnostic: string } | null;
  const trackedEvents: Array<{ name: string; properties: Record<string, unknown> | undefined }> = [];

  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    const [first, second] = args;
    if (typeof first === 'string' && first.startsWith('[EVENT] ')) {
      trackedEvents.push({
        name: first.replace('[EVENT] ', '').trim(),
        properties: (second as Record<string, unknown> | undefined),
      });
    }
  };
  global.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      type: 'operation_failed',
      reason: 'unknown',
      message: 'AI scaffold ไม่สำเร็จ (503)',
      retryable: true,
    },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: () => undefined,
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: (value) => {
        feedback = value
          ? { message: value.message, reason: value.reason, diagnostic: value.diagnostic }
          : null;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(feedback?.message, SCAFFOLD_REFINE_FAILED_COPY);
    assert.equal(feedback?.reason, 'failed');
    assert.match(feedback?.diagnostic ?? '', /output ใช้ต่อไม่ได้|ไม่สำเร็จ/);
    const failedEvent = trackedEvents.find((event) => event.name === 'make_smaller_failed');
    assert.equal(failedEvent?.properties?.outcome_label, 'retry');
    assert.equal(failedEvent?.properties?.failed_operation, 'scaffold');
  } finally {
    console.log = originalConsoleLog;
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller accepts a richer scaffold when downstream steps become more specific', async () => {
  const payload = makePayload({
    recommended_action: {
      title: 'ทำ proposal รอบแรก',
      rationale: 'เริ่มจากล็อกของที่ต้องใช้ก่อน',
      micro_steps: [
        'รวบ requirement ที่มีอยู่',
        'ร่าง timeline รอบแรก',
        'ตีราคาแบบคร่าว ๆ',
      ],
    },
  });
  const task = makeTask({
    workflowType: 'client_resume',
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload: AiSynthesisResponse | null = payload;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'ล็อกของที่ต้องรู้ก่อนทำ proposal',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: รวบ requirement ที่มีอยู่' },
      { id: 'step-2', text: 'แยก requirement ที่ชัดแล้วออกจาก assumption' },
      { id: 'step-3', text: 'ทำ timeline รอบแรกจากส่วนที่ชัด' },
      { id: 'step-4', text: 'เตรียม estimate ช่วงราคาเบื้องต้น' },
    ],
    shortcutOptions: [],
    revisedCurrentStepIndex: 0,
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: (value) => {
        currentPayload = value;
      },
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
    assert.equal(latestSession?.task?.assistantMode, 'scaffold_refinement');
    assert.equal(latestSession?.task?.currentPlan?.steps.length, 4);
    assert.equal(latestSession?.task?.currentPlan?.steps[1]?.text, 'แยก requirement ที่ชัดแล้วออกจาก assumption');
    assert.equal(currentPayload?.recommended_action.title, 'ล็อกของที่ต้องรู้ก่อนทำ proposal');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleCompleteScaffold advances to the next step without clearing the task', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async () => undefined,
  });

  await controller.handleCompleteScaffold();

  assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
  assert.equal(latestSession?.task?.currentStepIndex, 1);
  assert.equal(latestSession?.task?.assistantMode, 'scaffold_refinement');
  assert.equal(latestSession?.task?.lifecycleState, 'in_scaffold');
  assert.equal(latestSession?.task?.currentActionId, 'action-1');
  assert.notEqual(latestSession?.task, undefined);
  assert.notEqual(latestSession?.currentPayload, undefined);
});

test('handleCompleteScaffold enters completion summary on the last step', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    currentStepIndex: 2,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      successSignal: 'สรุปและส่ง clarification ได้ครบ',
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  const actionUpdates: Array<{ id: string; modifications: Partial<Action> }> = [];

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async (id, modifications) => {
      actionUpdates.push({ id, modifications });
    },
  });

  await controller.handleCompleteScaffold();

  assert.equal(actionUpdates.length, 0);
  assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
  assert.equal(latestSession?.task?.assistantMode, 'scaffold_completion');
  assert.equal(latestSession?.task?.currentStepIndex, 2);
  assert.equal(latestSession?.task?.currentPlan?.successSignal, 'สรุปและส่ง clarification ได้ครบ');
});

test('handleStartNewFromCompletedScaffold soft-resets the Room after marking the action completed', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_completion',
    currentActionId: 'action-1',
    currentStepIndex: 2,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  const actionUpdates: Array<{ id: string; modifications: Partial<Action> }> = [];

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async (id, modifications) => {
      actionUpdates.push({ id, modifications });
    },
  });

  await controller.handleStartNewFromCompletedScaffold();

  assert.equal(actionUpdates[0]?.id, 'action-1');
  assert.equal(actionUpdates[0]?.modifications.state, 'COMPLETED');
  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.task?.lifecycleState, 'dumped');
  assert.equal(latestSession?.task?.sourceText, task.sourceText);
  assert.equal(latestSession?.task?.currentActionId, null);
  assert.equal(latestSession?.task?.currentStepIndex, 0);
  assert.equal(latestSession?.currentPayload, undefined);
  assert.equal(latestSession?.currentActionId, null);
  assert.equal(latestSession?.activeDumpContext?.text, task.sourceText);
});

test('handleRejectAction sends the user to decision board without losing the original proposal', async () => {
  const payload = makePayload({
    alternative_actions: [
      {
        title: 'สรุป feedback เป็น bullet list ก่อน',
        rationale: 'ช่วยจัดระเบียบก่อนตอบ',
      },
      {
        title: 'ร่างข้อความถามกลับ 2 จุดที่ยังไม่ชัด',
        rationale: 'เหมาะเมื่อ scope ยังไม่ชัดพอจะเริ่มแก้',
      },
    ],
  });
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    actionExplanation: 'เริ่มจากการสรุปก่อนจะตอบได้ชัดที่สุด',
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'ONE_ACTION',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async () => undefined,
  });

  await controller.handleRejectAction();

  assert.equal(latestSession?.uiRoute, 'DECISION_BOARD');
  assert.equal(latestSession?.currentPayload?.recommended_action.title, payload.recommended_action.title);
  assert.equal(latestSession?.task?.oneActionTracking?.hasViewedAlternative, true);
});

test('handleReturnToPrimaryAction restores the original one-action screen', async () => {
  const payload = makePayload({
    alternative_actions: [
      {
        title: 'สรุป feedback เป็น bullet list ก่อน',
        rationale: 'ช่วยจัดระเบียบก่อนตอบ',
      },
    ],
  });
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    actionExplanation: 'ข้อเสนอแรกช่วยให้ตอบกลับได้ชัดที่สุด',
    oneActionTracking: {
      hasViewedAlternative: true,
      hasAdjusted: false,
    },
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'DECISION_BOARD',
    notThisCount: 1,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let latestWhyThisNow = '';

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: (value) => {
      latestWhyThisNow = value;
    },
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async () => undefined,
  });

  await controller.handleReturnToPrimaryAction();

  assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
  assert.equal(latestSession?.currentPayload?.recommended_action.title, payload.recommended_action.title);
  assert.equal(latestWhyThisNow, 'ข้อเสนอแรกช่วยให้ตอบกลับได้ชัดที่สุด');
});

test('handleDump falls back to local synthesis when action synthesis times out', async () => {
  const initialTask = makeTask({
    lifecycleState: 'dumped',
    currentActionId: null,
    sourceText: 'ข้อความเก่า',
    currentStepIndex: 0,
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    task: initialTask,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload = null as AiSynthesisResponse | null;
  let currentActionState = null as Action | null;
  const fetchCalls: string[] = [];

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.includes('/api/ai/intake')) {
      return new Response(JSON.stringify({
        workflowType: 'client_response',
        roomDigest: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page',
        taskFrame: {
          objective: 'ตอบลูกค้ากลับวันนี้',
          stage: 'กำลังสรุปสถานการณ์',
          stakeholders: ['ลูกค้า'],
        },
        blockers: [],
        requiresClarification: false,
        clarificationQuestion: null,
        taskShape: {
          deliverableType: 'reply',
          immediateNeed: 'send_reply_now',
          missingInputs: [],
          workContext: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้',
          confidence: 0.9,
        },
        candidateActions: [
          {
            title: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
            rationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวนหลายรอบ',
            kind: 'reply_first',
          },
        ],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/action')) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          type: 'ollama_unavailable',
          reason: 'request_timeout',
          message: 'AI action timed out',
          detail: 'AI request timed out after 45000ms',
          retryable: true,
        },
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload,
      currentActionState,
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: (value) => {
        currentPayload = value;
      },
      setCurrentActionState: (value) => {
        currentActionState = value;
      },
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleDump({
      text: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้ ช่วยสรุปสถานการณ์ ร่างข้อความตอบกลับ แล้วบอกก้าวแรกที่ควรทำต่อทันที',
      sourceText: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้ ช่วยสรุปสถานการณ์ ร่างข้อความตอบกลับ แล้วบอกก้าวแรกที่ควรทำต่อทันที',
      extractedText: '',
      sourceFiles: [],
    });

    assert.equal(fetchCalls.some((url) => url.includes('/api/ai/action')), true);
    assert.equal(fetchCalls.some((url) => url === '/api/ai'), false);
    assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
    assert.equal(latestSession?.task?.lifecycleState, 'has_one_action');
    assert.equal(latestSession?.task?.assistantMode, 'action_negotiation');
    assert.equal(currentPayload?.recommended_action.micro_steps.length, 3);
    assert.ok((currentActionState?.title.length ?? 0) > 0);
    assert.ok((latestSession?.task?.lastStableSummary?.length ?? 0) > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleDump ignores a second concurrent submit and only runs one AI lifecycle', async () => {
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    task: undefined,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  const fetchCalls: string[] = [];
  let releaseIntake = null as (() => void) | null;
  const intakeGate = new Promise<void>((resolve) => {
    releaseIntake = resolve;
  });

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.includes('/api/ai/intake')) {
      await intakeGate;
      return new Response(JSON.stringify({
        workflowType: 'client_response',
        roomDigest: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page',
        taskFrame: {
          objective: 'ตอบลูกค้ากลับวันนี้',
          stage: 'กำลังสรุปสถานการณ์',
          stakeholders: ['ลูกค้า'],
        },
        blockers: [],
        requiresClarification: false,
        clarificationQuestion: null,
        taskShape: {
          deliverableType: 'reply',
          immediateNeed: 'send_reply_now',
          missingInputs: [],
          workContext: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้',
          confidence: 0.9,
        },
        candidateActions: [
          {
            title: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
            rationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวนหลายรอบ',
            kind: 'reply_first',
          },
        ],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/action')) {
      return new Response(JSON.stringify({
        chosenAction: {
          title: 'สรุปประเด็นหลักแล้วร่างข้อความตอบกลับ',
          rationale: 'ช่วยให้ตอบลูกค้าได้โดยไม่ต้องกลับไปอ่านใหม่ทั้งก้อน',
          successSignal: 'ได้ร่างตอบกลับฉบับแรก',
        },
        situationSummary: 'สรุปสถานะงานที่เราทำแล้ว',
        whyThisNow: 'นี่คือก้าวที่ขยับงานได้เร็วสุดจากบริบทปัจจุบัน',
        alternatives: [],
        replyDraft: 'ผมสรุปประเด็นหลักให้ก่อน แล้วค่อยร่างคำตอบ',
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: null,
      currentActionState: null,
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
        if (value) sessionRef.current = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    const submission = {
      text: 'ลูกค้าส่ง feedback มาเยอะมาก ต้องสรุปก่อน',
      sourceText: 'ลูกค้าส่ง feedback มาเยอะมาก ต้องสรุปก่อน',
      extractedText: '',
      sourceFiles: [],
    };

    const firstRun = controller.handleDump(submission);
    const secondRun = controller.handleDump(submission);

    releaseIntake?.();
    await Promise.all([firstRun, secondRun]);

    assert.equal(fetchCalls.filter((url) => url.includes('/api/ai/intake')).length, 1);
    assert.equal(fetchCalls.filter((url) => url.includes('/api/ai/action')).length, 1);
    assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleDump writes lastStableSummary from action operation success', async () => {
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    task: makeTask({
      lifecycleState: 'dumped',
      currentActionId: null,
      sourceText: 'ข้อความเก่า',
      currentStepIndex: 0,
    }),
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/ai/intake')) {
      return new Response(JSON.stringify({
        workflowType: 'client_response',
        roomDigest: 'ต้องตอบลูกค้าเรื่อง proposal ให้ชัดขึ้น',
        taskFrame: {
          objective: 'ตอบลูกค้ากลับให้ชัดวันนี้',
          stage: 'awaiting_reply',
          stakeholders: ['client'],
        },
        blockers: [],
        requiresClarification: false,
        clarificationQuestion: null,
        taskShape: {
          deliverableType: 'reply',
          immediateNeed: 'send_reply_now',
          missingInputs: [],
          workContext: 'ลูกค้าถาม scope เพิ่ม',
          confidence: 0.9,
        },
        candidateActions: [
          {
            title: 'สรุปขอบเขตงานก่อนตอบ',
            rationale: 'ลดความกำกวมก่อน commit',
            kind: 'reply_first',
          },
        ],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/action')) {
      return new Response(JSON.stringify({
        chosenAction: {
          title: 'สรุป scope ที่ยืนยันแล้วและถามจุดที่ยังไม่ชัด',
          rationale: 'ให้ลูกค้าเห็นสิ่งที่เข้าใจตรงกันก่อนเดินต่อ',
          successSignal: 'ลูกค้าตอบยืนยัน 2 จุดที่ค้าง',
        },
        alternatives: [],
        whyThisNow: 'ลดความเสี่ยงตอบผิดบริบท',
        replyDraft: 'ผมสรุป scope ที่ตกลงกันไว้ด้านล่าง แล้วขอ confirm เพิ่มอีก 2 จุดครับ',
        situationSummary: 'ลูกค้าถามเพิ่มเรื่อง scope และ timeline หลังหายไปหลายวัน',
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: null,
      currentActionState: null,
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleDump({
      text: 'ลูกค้าถามเพิ่มเรื่อง scope และ timeline',
      sourceText: 'ลูกค้าถามเพิ่มเรื่อง scope และ timeline',
      extractedText: '',
      sourceFiles: [],
    });

    assert.equal(
      latestSession?.task?.lastStableSummary,
      'ลูกค้าถามเพิ่มเรื่อง scope และ timeline หลังหายไปหลายวัน',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleRetry falls back deterministically without calling legacy synthesis route', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'failed',
    currentActionId: null,
    sourceText: 'ลูกค้าส่ง context ยาวและต้องตอบกลับวันนี้',
    lastSynthesis: payload,
    lastFailureReason: 'request_timeout',
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'MANUAL_FALLBACK',
    notThisCount: 0,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  const fetchCalls: string[] = [];

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.includes('/api/ai/intake')) {
      return new Response(JSON.stringify({
        workflowType: 'client_response',
        roomDigest: 'ต้องตอบลูกค้าภายในวันนี้',
        taskFrame: {
          objective: 'ตอบลูกค้ากลับแบบไม่หลุดบริบท',
          stage: 'awaiting_reply',
          stakeholders: ['client'],
        },
        blockers: [],
        requiresClarification: false,
        clarificationQuestion: null,
        taskShape: {
          deliverableType: 'reply',
          immediateNeed: 'send_reply_now',
          missingInputs: [],
          workContext: 'มีข้อสงสัยจากลูกค้า',
          confidence: 0.8,
        },
        candidateActions: [
          {
            title: 'สรุปประเด็นก่อนตอบ',
            rationale: 'ตอบได้ตรงขึ้น',
            kind: 'reply_first',
          },
        ],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/action')) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          type: 'ollama_unavailable',
          reason: 'request_timeout',
          message: 'AI action timed out',
          detail: 'AI request timed out after 45000ms',
          retryable: true,
        },
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: null,
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleRetry();

    assert.equal(fetchCalls.some((url) => url === '/api/ai'), false);
    assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
    assert.equal(latestSession?.task?.assistantMode, 'action_negotiation');
    assert.ok((latestSession?.task?.lastStableSummary?.length ?? 0) > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleClarificationSubmit falls back deterministically without legacy route calls', async () => {
  const task = makeTask({
    lifecycleState: 'clarification_needed',
    currentActionId: null,
    sourceText: 'ลูกค้าขอเดโม่และถามรายละเอียดราคา',
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'CLARIFICATION',
    notThisCount: 0,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  const fetchCalls: string[] = [];

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.includes('/api/ai/intake')) {
      return new Response(JSON.stringify({
        workflowType: 'client_response',
        roomDigest: 'ต้องตอบกลับลูกค้าเรื่องเดโม่',
        taskFrame: {
          objective: 'ตอบให้เร็วและครบ',
          stage: 'clarification_received',
          stakeholders: ['client'],
        },
        blockers: [],
        requiresClarification: false,
        clarificationQuestion: null,
        taskShape: {
          deliverableType: 'reply',
          immediateNeed: 'send_reply_now',
          missingInputs: [],
          workContext: 'ลูกค้าถามราคาและเวลาเดโม่',
          confidence: 0.8,
        },
        candidateActions: [
          {
            title: 'ร่างตอบเดโม่แบบสั้น',
            rationale: 'ตอบเร็วเพื่อรักษา momentum',
            kind: 'reply_first',
          },
        ],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/ai/action')) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          type: 'ollama_unavailable',
          reason: 'request_timeout',
          message: 'AI action timed out',
          detail: 'AI request timed out after 45000ms',
          retryable: true,
        },
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: null,
      currentActionState: null,
      clarificationPrompt: 'ต้องตอบเดโม่วันไหน',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleClarificationSubmit('เดโม่ได้บ่ายวันพุธ');

    assert.equal(fetchCalls.some((url) => url === '/api/ai'), false);
    assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
    assert.equal(latestSession?.task?.lifecycleState, 'has_one_action');
    assert.ok((latestSession?.task?.lastStableSummary?.length ?? 0) > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('loadReentryBrief updates lastStableSummary from successful reentry output', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_refinement',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    lastStableSummary: 'สรุปเก่า',
  });
  const session = normalizeSession({
    lastActive: Date.now() - 1000 * 60 * 60 * 24,
    uiRoute: 'BOUNCE_BACK',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/ai/reentry')) {
      return new Response(JSON.stringify({
        reentrySummary: 'ลูกค้ารอนัดเดโม่และต้องยืนยัน timeline ภายในวันนี้',
        topActions: [
          {
            roomId: 'task-1',
            title: 'ส่งข้อความยืนยันเวลานัดเดโม่',
            rationale: 'รักษา momentum ดีล',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
        meta: {
          model: 'qwen2.5:3b',
          repairUsed: false,
          usedRoomFiles: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch call to ${url}`);
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.loadReentryBrief('bounce_back');

    assert.equal(
      latestSession?.task?.lastStableSummary,
      'ลูกค้ารอนัดเดโม่และต้องยืนยัน timeline ภายในวันนี้',
    );
    assert.equal(
      latestSession?.task?.reentryBrief?.summary,
      'ลูกค้ารอนัดเดโม่และต้องยืนยัน timeline ภายในวันนี้',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('resumeFromSuggestedReentry seeds one-action state for dumped save-point rooms', async () => {
  const task = makeTask({
    lifecycleState: 'dumped',
    currentActionId: null,
    lastSynthesis: undefined,
    reentryBrief: {
      summary: 'ลูกค้ากำลังรอคำตอบสั้น ๆ เรื่อง demo slot และ next step',
      topActions: [
        {
          roomId: 'task-1',
          title: 'ร่าง reply สั้นเพื่อ confirm demo slot',
          rationale: 'ช่วยกันดีลเย็นและเริ่มตอบได้ทันที',
          impact: 'high',
          effort: 'low',
          resumeTarget: 'ONE_ACTION',
        },
      ],
      ignoredNoise: [],
      createdAt: Date.now(),
    },
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    currentPayload: undefined,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload = null as AiSynthesisResponse | null;
  let currentActionState = null as Action | null;
  const savedActions: Action[] = [];

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload,
    currentActionState,
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: (value) => {
      currentPayload = value;
    },
    setCurrentActionState: (value) => {
      currentActionState = value;
    },
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async (action) => {
      savedActions.push(action);
    },
    persistActionUpdate: async () => undefined,
  });

  await controller.resumeFromSuggestedReentry();

  assert.equal(savedActions.length, 1);
  assert.equal(savedActions[0]?.title, 'ร่าง reply สั้นเพื่อ confirm demo slot');
  assert.equal(latestSession?.uiRoute, 'ONE_ACTION');
  assert.equal(latestSession?.task?.lifecycleState, 'has_one_action');
  assert.equal(latestSession?.task?.currentActionId, savedActions[0]?.id);
  assert.equal(currentPayload?.recommended_action.title, 'ร่าง reply สั้นเพื่อ confirm demo slot');
  assert.equal(currentActionState?.title, 'ร่าง reply สั้นเพื่อ confirm demo slot');
});

test('handleOneActionAdjustmentTouched marks the current one-action proposal as adjusted', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'ONE_ACTION',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async () => undefined,
  });

  await controller.handleOneActionAdjustmentTouched();

  assert.equal(latestSession?.task?.oneActionTracking?.hasAdjusted, true);
});

test('openDumpWithCurrentContext keeps the task context visible while returning to dump', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    reentryBrief: {
      summary: 'เริ่มจากสรุปสถานะล่าสุดก่อน',
      topActions: [
        {
          roomId: 'task-1',
          title: 'สรุปสถานะล่าสุด',
          rationale: 'ช่วยกลับเข้าบริบทได้ไวสุด',
          impact: 'high',
          effort: 'low',
          resumeTarget: 'ONE_ACTION',
        },
      ],
      ignoredNoise: [],
      createdAt: 100,
    },
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: makeAction(),
    clarificationPrompt: '',
    dumpStartTime: null,
    aiModel: 'qwen2.5:3b',
    setSession: (value) => {
      latestSession = value;
    },
    setCurrentPayload: () => undefined,
    setCurrentActionState: () => undefined,
    setManualFallbackSuggestedActions: () => undefined,
    setManualFallbackRetryable: () => undefined,
    setClarificationPrompt: () => undefined,
    setCurrentWhyThisNow: () => undefined,
    setCurrentRescueState: () => undefined,
    setIsRescueLoading: () => undefined,
    setIsNegotiatingAction: () => undefined,
    setIsReentryLoading: () => undefined,
    isScaffoldRefining: false,
    setIsScaffoldRefining: () => undefined,
    setScaffoldRefineFeedback: () => undefined,
    setDumpStartTime: () => undefined,
    recordAiOpsEntry: () => undefined,
    persistSession: async () => undefined,
    persistActionSave: async () => undefined,
    persistActionUpdate: async () => undefined,
  });

  await controller.openDumpWithCurrentContext();

  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.task?.lifecycleState, 'dumped');
  assert.equal(latestSession?.task?.sourceText, task.sourceText);
  assert.equal(latestSession?.activeDumpContext?.text, task.sourceText);
  assert.equal(latestSession?.currentActionId, null);
});

test('handleAcceptAction emits one_action_accepted_first_try when no alternative or adjustment was used', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    oneActionTracking: {
      hasViewedAlternative: false,
      hasAdjusted: false,
    },
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'ONE_ACTION',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  const originalConsoleLog = console.log;
  const loggedLines: string[] = [];
  console.log = (...args: unknown[]) => {
    loggedLines.push(args.join(' '));
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: () => undefined,
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleAcceptAction();

    assert.equal(
      loggedLines.some((line) => line.includes('one_action_accepted_first_try')),
      true,
    );
  } finally {
    console.log = originalConsoleLog;
  }
});

test('handleAcceptAction marks retrieval analytics only when current step has retrieved evidence', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentActionId: 'action-1',
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: [
        {
          id: 'step-1',
          text: payload.recommended_action.micro_steps[0],
          evidence: [
            {
              sourceId: 'file:brief',
              label: 'brief.txt',
              excerpt: 'ลูกค้ารอ timeline ใหม่',
              sourceKindLabel: 'retrieved',
            },
          ],
          provenance: {
            generatedAt: 1,
            generatedBy: 'action',
            sourceIds: ['file:brief'],
          },
        },
      ],
    },
    oneActionTracking: {
      hasViewedAlternative: true,
      hasAdjusted: false,
    },
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'ONE_ACTION',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef = { current: session };
  const originalConsoleLog = console.log;
  const events: Array<{ name: string; properties: Record<string, unknown> }> = [];
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[EVENT] ')) {
      events.push({
        name: first.replace('[EVENT] ', '').trim(),
        properties: args[1] && typeof args[1] === 'object'
          ? args[1] as Record<string, unknown>
          : {},
      });
    }
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        if (value) sessionRef.current = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: () => undefined,
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleAcceptAction();

    const confirmed = events.find((event) => event.name === 'step_confirmed');
    assert.equal(confirmed?.properties.retrieval_enabled, true);
    assert.equal(confirmed?.properties.retrieval_selection_method, 'retrieval');
    assert.equal(confirmed?.properties.retrieved_source_count, 1);
    assert.deepEqual(confirmed?.properties.source_ids, ['file:brief']);
  } finally {
    console.log = originalConsoleLog;
  }
});

test('handleEnterRescue falls back with safe-copy language when rescue fails', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
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

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
      },
      setCurrentPayload: () => undefined,
      setCurrentActionState: () => undefined,
      setManualFallbackSuggestedActions: () => undefined,
      setManualFallbackRetryable: () => undefined,
      setClarificationPrompt: () => undefined,
      setCurrentWhyThisNow: () => undefined,
      setCurrentRescueState: (value) => {
        latestRescueState = value;
      },
      setIsRescueLoading: () => undefined,
      setIsNegotiatingAction: () => undefined,
      setIsReentryLoading: () => undefined,
      isScaffoldRefining: false,
      setIsScaffoldRefining: () => undefined,
      setScaffoldRefineFeedback: () => undefined,
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleEnterRescue();
    const rescueExplanation = (latestRescueState as AiRescueResponse | null)?.diagnosis.explanation ?? '';

    assert.equal(
      rescueExplanation.includes('บริบทงานและข้อความเดิมของคุณยังอยู่ครบ'),
      true,
    );
    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(latestSession?.status, 'RESCUE');
    assert.equal(latestSession?.task?.lifecycleState, 'stalled');
  } finally {
    global.fetch = originalFetch;
  }
});
