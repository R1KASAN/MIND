import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiRescueResponse } from '../ai/operations';
import type { AiSynthesisResponse } from '../ai/schema';
import type { Action, AppSession, TaskContext } from '../store/idb';
import { normalizeSession } from '../store/idb';
import {
  createTaskController,
  mergeTaskConstraints,
} from './task-controller';
import { SCAFFOLD_REFINE_FAILURE_COPY } from './scaffold-refine';

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

test('handleMakeSmaller surfaces inline feedback for a no_change scaffold refinement', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
  const refineLoadingStates: boolean[] = [];
  let feedbackMessage: string | null = null;
  let currentPayload: AiSynthesisResponse | null = payload;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    planTitle: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
    steps: [
      { id: 'step-1', text: 'ขยับอีกนิด: สรุปสถานะงานที่เราทำแล้ว' },
      { id: 'step-2', text: 'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน' },
      { id: 'step-3', text: 'ร่างข้อความตอบกลับเพื่อขอ clarification' },
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
      setSession: () => undefined,
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
        feedbackMessage = value?.message ?? null;
      },
      setDumpStartTime: () => undefined,
      recordAiOpsEntry: () => undefined,
      persistSession: async () => undefined,
      persistActionSave: async () => undefined,
      persistActionUpdate: async () => undefined,
    });

    await controller.handleMakeSmaller();

    assert.deepEqual(refineLoadingStates, [true, false]);
    assert.equal(feedbackMessage, SCAFFOLD_REFINE_FAILURE_COPY);
    assert.equal(
      currentPayload?.recommended_action.micro_steps[0],
      'สรุปสถานะงานที่เราทำแล้ว',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleCompleteScaffold clears the active session after marking the action completed', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
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

  assert.equal(actionUpdates[0]?.id, 'action-1');
  assert.equal(actionUpdates[0]?.modifications.state, 'COMPLETED');
  assert.equal(latestSession?.uiRoute, 'DUMP_ENTRY');
  assert.equal(latestSession?.task, undefined);
  assert.equal(latestSession?.currentPayload, undefined);
  assert.equal(latestSession?.currentActionId, null);
  assert.equal(latestSession?.activeDumpContext, undefined);
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

test('handleEnterRescue falls back with safe-copy language when rescue fails', async () => {
  const payload = makePayload();
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentActionId: 'action-1',
    lastSynthesis: payload,
  });
  const session = makeSession(task, payload);
  const sessionRef = { current: session };
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
      setSession: () => undefined,
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
  } finally {
    global.fetch = originalFetch;
  }
});
