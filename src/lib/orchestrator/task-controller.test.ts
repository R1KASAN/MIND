import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
      micro_steps_source: 'ai',
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

function makeRescueResponse(reason: AiRescueResponse['diagnosis']['primaryReason'] = 'too_big'): AiRescueResponse {
  return {
    diagnosis: {
      primaryReason: reason,
      explanation: reason === 'dependency'
        ? 'ติดเพราะต้องรอข้อมูลจากคนอื่นก่อนเดินต่อ'
        : 'ติดเพราะก้าวนี้ยังใหญ่เกินไปเมื่อเทียบกับบริบทตอนนี้',
    },
    rescuePlan: {
      mode: reason === 'dependency' ? 'follow_up' : 'shrink',
      steps: reason === 'dependency'
        ? ['ถามคนที่ถือข้อมูลอยู่ให้ตอบหนึ่งจุด', 'รอคำตอบก่อน commit งานถัดไป']
        : ['ย่อยก้าวนี้ให้เหลือหนึ่งชิ้น', 'ทำชิ้นนั้นให้จบก่อนกลับมาดูส่วนที่เหลือ'],
    },
    suggestedMessage: reason === 'dependency' ? 'ขอข้อมูลเพิ่มหนึ่งจุดก่อนนะครับ' : undefined,
    meta: {
      model: 'test-rescue',
      repairUsed: false,
      usedRoomFiles: [],
    },
  };
}

test('Rescue UI exposes only recovery actions, not completion', () => {
  const source = readFileSync(new URL('../../components/Recovery/Rescue.tsx', import.meta.url), 'utf8');

  assert.match(source, /แบ่งก้าวนี้ให้เล็กลงแล้วนำไปใช้/);
  assert.match(source, /กลับไปแก้บริบทให้ตรงเคส/);
  assert.match(source, /พักงานนี้ไว้ก่อน เดี๋ยวกลับมาทำต่อ/);
  assert.doesNotMatch(source, /ทำก้าวนี้เสร็จแล้ว/);
});

function waitForCondition(assertion: () => boolean, label: string) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (assertion()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 1000) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(check, 0);
    };
    check();
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

test('handleMakeSmaller stays on SCAFFOLD with no_change feedback after structural retry still changes nothing', async () => {
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
      throw new Error('rescue must NOT be called automatically on no_change — user must explicitly click "ฉันติขัด"');
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

    assert.deepEqual(refineLoadingStates, [true, false]);
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
    assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
      micro_steps_source: 'ai',
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
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload: AiSynthesisResponse | null = payload;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'ล็อกของที่ต้องรู้ก่อนทำ proposal',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: รวบ requirement ที่มีอยู่ของลูกค้า' },
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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

test('handleCompleteScaffold completes against the full refined scaffold plan, not truncated micro steps', async () => {
  const payload = makePayload({
    recommended_action: {
      title: 'ตอบลูกค้าด้วยลำดับที่เล็กลง',
      rationale: 'ลดความเสี่ยงก่อนตอบ',
      micro_steps: [
        'เปิดแชต ABC Corp ล่าสุด',
        'แยกเรื่อง prod incident ออกจาก Dashboard/payment API',
        'ร่างข้อความสถานะที่ยังไม่ commit เวลา',
      ],
      micro_steps_source: 'ai',
    },
  });
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_refinement',
    currentActionId: 'action-1',
    currentStepIndex: 3,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: [
        { id: 'step-1', text: 'เปิดแชต ABC Corp ล่าสุด' },
        { id: 'step-2', text: 'แยกเรื่อง prod incident ออกจาก Dashboard/payment API' },
        { id: 'step-3', text: 'ร่างข้อความสถานะที่ยังไม่ commit เวลา' },
        { id: 'step-4', text: 'ตรวจคำตอบสุดท้ายก่อนส่งลูกค้า' },
      ],
    },
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
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

  assert.equal(latestSession?.task?.assistantMode, 'scaffold_completion');
  assert.equal(latestSession?.task?.currentStepIndex, 3);
  assert.equal(latestSession?.task?.currentPlan?.steps.length, 4);
  assert.equal(latestSession?.task?.currentPlan?.steps[3]?.provenance?.confirmedAt !== undefined, true);
});

test('handleCompleteScaffold finalizes a rescue-applied one-step scaffold as completed context', async () => {
  const rescueStep = 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วจดอัปเดต 3 บรรทัด';
  const payload = makePayload({
    situation_summary: 'ABC Corp รอ incident update หลัง payment API timeout',
    recommended_action: {
      title: 'ส่งอัปเดตสถานะ incident ให้ CS',
      rationale: 'ต้องตอบ CS ด้วยข้อมูลล่าสุด',
      micro_steps: [rescueStep],
      micro_steps_source: 'fallback',
    },
  });
  const task = makeTask({
    sourceText: [
      'เหนื่อยมาก',
      'ต้องตอบ ABC Corp',
      'payment API timeout ไป 20 นาที',
      'CS ถามว่าจะตอบลูกค้ายังไง',
      'ยังไม่ได้เปิด Dashboard',
    ].join('\n'),
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_refinement',
    currentActionId: 'action-1',
    currentStepIndex: 0,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: [
        {
          id: 'rescue-step-1',
          text: rescueStep,
          provenance: {
            generatedAt: 10,
            generatedBy: 'rescue',
            sourceIds: [],
          },
        },
      ],
    },
    rescueHistory: [{ reason: 'too_big', mode: 'shrink', createdAt: 10 }],
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload: AiSynthesisResponse | null = payload;
  let currentActionState: Action | null = {
    ...makeAction(),
    title: payload.recommended_action.title,
    rationale: payload.recommended_action.rationale,
    microSteps: [rescueStep],
  };
  const actionUpdates: Array<{ id: string; modifications: Partial<Action> }> = [];

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
      sessionRef.current = value;
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
    persistActionUpdate: async (id, modifications) => {
      actionUpdates.push({ id, modifications });
    },
  });

  await controller.handleCompleteScaffold();

  assert.equal(actionUpdates[0]?.id, 'action-1');
  assert.equal(actionUpdates[0]?.modifications.state, 'COMPLETED');
  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.task?.lifecycleState, 'done');
  assert.equal(latestSession?.task?.currentActionId, null);
  assert.equal(latestSession?.task?.currentStepIndex, 0);
  assert.equal(latestSession?.currentPayload, undefined);
  assert.equal(latestSession?.currentActionId, null);
  assert.equal(latestSession?.activeDumpContext?.text, task.sourceText);
  assert.equal(currentPayload, null);
  assert.equal(currentActionState, null);
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  assert.equal(latestSession?.task?.lifecycleState, 'done');
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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
  const sessionRef: { current: AppSession | null } = { current: session };
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

test('openDumpWithCurrentContext ignores delayed rescue result after user leaves Rescue', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = null;
  const rescueRequests: Array<{ resolve: (response: Response) => void }> = [];

  const originalFetch = global.fetch;
  global.fetch = async () => new Promise<Response>((resolve) => {
    rescueRequests.push({ resolve });
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

    const rescuePromise = controller.handleEnterRescue();
    await waitForCondition(() => rescueRequests.length === 1, 'rescue request to start');
    assert.equal(latestSession?.uiRoute, 'RESCUE');

    await controller.openDumpWithCurrentContext();
    assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');

    rescueRequests[0].resolve(new Response(JSON.stringify(makeRescueResponse('too_big')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await rescuePromise;

    assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
    assert.equal(latestRescueState, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleEnterRescue lets the newest rescue request win over an older delayed result', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = null;
  const rescueRequests: Array<{ resolve: (response: Response) => void }> = [];

  const originalFetch = global.fetch;
  global.fetch = async () => new Promise<Response>((resolve) => {
    rescueRequests.push({ resolve });
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

    const firstRescue = controller.handleEnterRescue();
    await waitForCondition(() => rescueRequests.length === 1, 'first rescue request');
    const secondRescue = controller.handleEnterRescue();
    await waitForCondition(() => rescueRequests.length === 2, 'second rescue request');

    rescueRequests[0].resolve(new Response(JSON.stringify(makeRescueResponse('too_big')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await firstRescue;
    assert.equal(latestRescueState, null);

    rescueRequests[1].resolve(new Response(JSON.stringify(makeRescueResponse('dependency')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await secondRescue;

    assert.equal(latestSession?.uiRoute, 'RESCUE');
    const finalRescueState = latestRescueState as AiRescueResponse | null;
    assert.equal(finalRescueState?.diagnosis.primaryReason, 'dependency');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleEnterRescue ignores rescue error after user leaves Rescue', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = null;
  const rescueRequests: Array<{ resolve: (response: Response) => void }> = [];
  const originalMaxAttempts = process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;

  const originalFetch = global.fetch;
  process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = '1';
  global.fetch = async () => new Promise<Response>((resolve) => {
    rescueRequests.push({ resolve });
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

    const rescuePromise = controller.handleEnterRescue();
    await waitForCondition(() => rescueRequests.length === 1, 'rescue error request');
    await controller.openDumpWithCurrentContext();

    rescueRequests[0].resolve(new Response(JSON.stringify({
      ok: false,
      error: {
        reason: 'unknown',
        message: 'AI rescue ไม่สำเร็จ (500)',
        retryable: true,
      },
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    await rescuePromise;

    assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
    assert.equal(latestRescueState, null);
  } finally {
    global.fetch = originalFetch;
    if (originalMaxAttempts === undefined) delete process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS;
    else process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS = originalMaxAttempts;
  }
});

test('handleEnterRescue ignores AbortError after user leaves Rescue', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = null;
  let fetchStarted = false;

  const originalFetch = global.fetch;
  global.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    fetchStarted = true;
    const signal = typeof init === 'object' && init && 'signal' in init
      ? init.signal as AbortSignal | undefined
      : undefined;
    signal?.addEventListener('abort', () => {
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
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

    const rescuePromise = controller.handleEnterRescue();
    await waitForCondition(() => fetchStarted, 'abortable rescue request');
    await controller.openDumpWithCurrentContext();
    await rescuePromise;

    assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
    assert.equal(latestRescueState, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller with invalid scaffold stays on Rescue with failed feedback', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestFeedback: any = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'Analyze client feedback',
    steps: [
      { id: 'step-1', text: 'Step 1: Check requirements' },
      { id: 'step-2', text: 'Step 2: Respond to client' },
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
      setScaffoldRefineFeedback: (value) => {
        latestFeedback = value;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(latestFeedback?.reason, 'failed');
    assert.equal(latestFeedback?.message, SCAFFOLD_REFINE_FAILED_COPY);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWalkAwayFromRescue returns to Brain Dump reentry card and preserves active rescue state', async () => {
  const payload = makePayload();
  const task = makeTask({
    roomId: 'room-rescue-pause',
    lifecycleState: 'stalled',
    assistantMode: 'rescue_diagnosis',
    currentActionId: 'action-1',
    currentStepIndex: 1,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
    rescueHistory: [{ reason: 'too_big', mode: 'shrink', createdAt: 10 }],
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestRescueState: AiRescueResponse | null = makeRescueResponse('too_big');
  let rescueLoading = true;

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
    setIsRescueLoading: (value) => {
      rescueLoading = value;
    },
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

  await controller.handleWalkAwayFromRescue();

  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.currentActionId, 'action-1');
  assert.deepEqual(latestSession?.currentPayload, payload);
  assert.equal(latestSession?.task?.lifecycleState, 'dumped');
  assert.equal(latestSession?.task?.assistantMode, 'reentry_brief');
  assert.equal(latestSession?.task?.currentActionId, 'action-1');
  assert.equal(latestSession?.task?.currentStepIndex, 1);
  assert.equal(latestSession?.task?.rescueHistory.length, 1);
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.resumeTarget, 'SCAFFOLD');
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.title, payload.recommended_action.title);
  assert.equal(latestRescueState?.diagnosis.primaryReason, 'too_big');
  assert.equal(rescueLoading, false);
});

test('handleWalkAwayFromRescue replaces stale reentry brief with current rescue context', async () => {
  const payload = makePayload({
    recommended_action: {
      title: 'ร่างอัปเดตสถานะ incident ให้ลูกค้า',
      rationale: 'ต้องตอบลูกค้าด้วยข้อมูลล่าสุดโดยไม่ commit เวลาเกินจริง',
      micro_steps: [
        'สรุปสถานะ prod ล่าสุด',
        'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังต้องเช็ก',
        'ร่างข้อความตอบลูกค้าแบบไม่ commit เวลา',
      ],
      micro_steps_source: 'ai',
    },
    situation_summary: 'ABC Corp รออัปเดต incident และยังมีงาน Dashboard/payment API ค้างอยู่',
  });
  const task = makeTask({
    roomId: 'room-rescue-stale-reentry',
    lifecycleState: 'stalled',
    assistantMode: 'rescue_diagnosis',
    currentActionId: 'action-1',
    currentStepIndex: 1,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
    reentryBrief: {
      summary: 'ข้อมูลเก่าจากรอบก่อนที่ไม่ควรโชว์แล้ว',
      topActions: [
        {
          roomId: 'old-room',
          title: 'ทำ action เก่าที่ไม่เกี่ยวกับ rescue รอบนี้',
          rationale: 'เหตุผลเก่า',
          impact: 'medium',
          effort: 'medium',
          resumeTarget: 'ONE_ACTION',
        },
      ],
      ignoredNoise: ['old-noise'],
      createdAt: 5,
    },
    rescueHistory: [{ reason: 'too_big', mode: 'shrink', createdAt: 10 }],
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload: payload,
    currentActionState: {
      ...makeAction(),
      title: payload.recommended_action.title,
      rationale: payload.recommended_action.rationale,
      microSteps: payload.recommended_action.micro_steps,
    },
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

  await controller.handleWalkAwayFromRescue();

  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.task?.assistantMode, 'reentry_brief');
  assert.equal(latestSession?.task?.reentryBrief?.summary, payload.situation_summary);
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.roomId, 'room-rescue-stale-reentry');
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.title, payload.recommended_action.title);
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.rationale, payload.recommended_action.rationale);
  assert.equal(latestSession?.task?.reentryBrief?.topActions[0]?.resumeTarget, 'SCAFFOLD');
  assert.deepEqual(latestSession?.task?.reentryBrief?.ignoredNoise, []);
});

test('handleMakeSmaller from rescue applies the current rescue step without reopening scaffold generation', async () => {
  const payload = makePayload({
    situation_summary: 'ABC Corp รอ incident update หลัง payment API timeout',
    recommended_action: {
      title: 'ส่งอัปเดตสถานะ incident ให้ CS',
      rationale: 'ลูกค้าต้องได้ status update ก่อนเพื่อคุมความคาดหวัง',
      micro_steps: [
        'เช็ก Dashboard ล่าสุด',
        'เติม status update 3 บรรทัด',
        'ส่งให้ทีม CS',
      ],
      micro_steps_source: 'ai',
    },
  });
  const task = makeTask({
    sourceText: [
      'เหนื่อยมาก แต่ยังต้องตอบ ABC Corp เรื่อง incident เมื่อเช้า',
      'payment API timeout ไป 20 นาที',
      'ทีม CS ถามว่าจะตอบลูกค้ายังไง',
      'ผมยังไม่ได้เปิด Dashboard อีกรอบ',
      'หัวตื้อ ไม่รู้จะเริ่มตรงไหน',
    ].join('\n'),
    lifecycleState: 'stalled',
    assistantMode: 'rescue_diagnosis',
    currentActionId: 'action-1',
    currentStepIndex: 0,
    lastSynthesis: payload,
    currentPlan: {
      actionTitle: payload.recommended_action.title,
      steps: payload.recommended_action.micro_steps.map((step, index) => ({
        id: `step-${index + 1}`,
        text: step,
      })),
    },
    rescueHistory: [{ reason: 'too_big', mode: 'shrink', createdAt: 10 }],
  });
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload: AiSynthesisResponse | null = payload;
  let currentActionState: Action | null = {
    ...makeAction(),
    title: payload.recommended_action.title,
    rationale: payload.recommended_action.rationale,
    microSteps: payload.recommended_action.micro_steps,
  };
  const persistedUpdates: Array<Partial<Action>> = [];

  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/ai/scaffold')) {
      throw new Error('apply rescue must not call scaffold generation');
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const controller = createTaskController({
      session,
      sessionRef,
      currentPayload: payload,
      currentActionState,
      currentRescueState: {
        diagnosis: {
          primaryReason: 'too_big',
          explanation: 'ยังไม่ได้เช็ก Dashboard ล่าสุดของ payment API จึงตอบ CS ไม่มั่นใจ',
        },
        rescuePlan: {
          mode: 'shrink',
          steps: ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS'],
        },
        suggestedMessage: undefined,
        meta: {
          model: 'test-rescue',
          repairUsed: false,
          usedRoomFiles: [],
        },
      },
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
        sessionRef.current = value;
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
      persistActionUpdate: async (_id, modifications) => {
        persistedUpdates.push(modifications);
      },
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
    assert.equal(latestSession?.task?.assistantMode, 'scaffold_refinement');
    assert.equal(latestSession?.task?.currentPlan?.steps.length, 1);
    assert.equal(
      latestSession?.task?.currentPlan?.steps[0]?.text,
      'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS',
    );
    assert.equal(currentPayload?.recommended_action.micro_steps[0], 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS');
    assert.deepEqual(currentActionState?.microSteps, ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS']);
    assert.deepEqual(persistedUpdates[0]?.microSteps, ['เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller with valid scaffold updates state and navigates once to SCAFFOLD', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let sessionUpdateCount = 0;
  let currentPayload: AiSynthesisResponse | null = payload;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'สรุปและตอบกลับ feedback',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: สรุปหัวข้อ feedback จากลูกค้า' },
      { id: 'step-2', text: 'ขยับอีกนิด: ร่างข้อความตอบกลับลูกค้าที่ชัดเจน' },
      { id: 'step-3', text: 'ขยับอีกนิด: ส่งข้อความยืนยันกับลูกค้าอีกครั้ง' },
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
      currentPayload: payload,
      currentActionState: makeAction(),
      clarificationPrompt: '',
      dumpStartTime: null,
      aiModel: 'qwen2.5:3b',
      setSession: (value) => {
        latestSession = value;
        sessionUpdateCount++;
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
    assert.equal(sessionUpdateCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller rejects English scaffold in a Thai room', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestFeedback: any = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'Prepare feedback summary',
    steps: [
      { id: 'step-1', text: 'Step 1: Check landing page feedback' },
      { id: 'step-2', text: 'Step 2: Draft the response email' },
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
      setScaffoldRefineFeedback: (value) => {
        latestFeedback = value;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(latestFeedback?.reason, 'failed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller rejects scaffold if it does not contain room anchors', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ABC Corp ถามเรื่อง Dashboard และ payment API ที่ยังค้างอยู่',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestFeedback: any = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'เตรียมตัวไปซื้อของกิน',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: ตรวจดูเงินในกระเป๋า' },
      { id: 'step-2', text: 'ขยับอีกนิด: เดินไปตลาดสด' },
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
      setScaffoldRefineFeedback: (value) => {
        latestFeedback = value;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(latestFeedback?.reason, 'failed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller accepts Thai non-echoing scaffold when room anchors are generic only', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let currentPayload: AiSynthesisResponse | null = payload;
  let latestFeedback: any = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'แยก feedback ให้เป็นข้อเล็กลง',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: อ่าน feedback แล้วจดประเด็นหลักหนึ่งข้อ' },
      { id: 'step-2', text: 'ขยับอีกนิด: แยกส่วนที่ต้องตอบกับส่วนที่ต้องถามเพิ่ม' },
      { id: 'step-3', text: 'ขยับอีกนิด: ร่างคำตอบสั้น ๆ จากประเด็นแรก' },
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
      currentPayload: payload,
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
      setScaffoldRefineFeedback: (value) => {
        latestFeedback = value;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'SCAFFOLD');
    assert.equal(latestSession?.task?.assistantMode, 'scaffold_refinement');
    assert.equal(currentPayload?.recommended_action.micro_steps[0], 'ขยับอีกนิด: อ่าน feedback แล้วจดประเด็นหลักหนึ่งข้อ');
    assert.equal(latestFeedback, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleMakeSmaller rejects scaffold if a step echoes action title', async () => {
  const payload = makePayload();
  const task = makeTask({
    sourceText: 'ลูกค้าส่ง feedback เรื่องหน้า landing',
    lifecycleState: 'stalled',
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
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'RESCUE',
    notThisCount: 0,
    currentActionId: task.currentActionId,
    currentPayload: payload,
    task,
  });
  const sessionRef: { current: AppSession | null } = { current: session };
  let latestSession: AppSession | null = session;
  let latestFeedback: any = null;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'สรุปและตอบกลับ feedback',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด' },
      { id: 'step-2', text: 'ขยับอีกนิด: ร่างคำตอบเรื่อง landing' },
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
      setScaffoldRefineFeedback: (value) => {
        latestFeedback = value;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.equal(latestSession?.uiRoute, 'RESCUE');
    assert.equal(latestFeedback?.reason, 'failed');
  } finally {
    global.fetch = originalFetch;
  }
});
