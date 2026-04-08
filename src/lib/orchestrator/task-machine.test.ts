import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiActionResponse, AiIntakeResponse, AiScaffoldResponse } from '../ai/operations';
import type { Action, TaskContext } from '../store/idb';
import {
  buildActionSuccessArtifacts,
  buildScaffoldSuccessArtifacts,
  deriveBounceBackRoute,
  hasResumableTask,
  routeFromResumeTarget,
} from './task-machine';

function makeTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    id: 'task-1',
    workflowType: 'client_response',
    sourceText: 'ลูกค้าถาม timeline ใหม่',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: ['timeline_unclear'],
    lifecycleState: 'has_one_action',
    currentStepIndex: 0,
    currentActionId: 'action-1',
    rescueHistory: [],
    ...overrides,
  };
}

test('buildActionSuccessArtifacts keeps continuity and persists durable negotiation', () => {
  const task = makeTask({
    taskFrame: {
      objective: 'ตอบลูกค้าเรื่อง timeline',
      stage: 'awaiting_reply',
      stakeholders: ['client'],
    },
  });
  const existingAction: Action = {
    id: 'action-1',
    createdAt: 1,
    title: 'เก่า',
    rationale: 'เก่า',
    microSteps: ['เก่า 1', 'เก่า 2', 'เก่า 3'],
    isPinned: false,
    state: 'PENDING',
    workflowType: 'client_response',
  };
  const intake: AiIntakeResponse = {
    workflowType: 'client_response',
    roomDigest: 'ลูกค้ารอ timeline',
    taskFrame: {
      objective: 'ตอบลูกค้าเรื่อง timeline',
      stage: 'awaiting_reply',
      stakeholders: ['client'],
    },
    blockers: ['timeline_unclear'],
    requiresClarification: false,
    clarificationQuestion: undefined,
    candidateActions: [],
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };
  const actionResponse: AiActionResponse = {
    chosenAction: {
      title: 'ส่ง reply สั้นเพื่อยืนยัน deadline ใหม่',
      rationale: 'ลดแรงกดดันจาก client ก่อน',
      successSignal: 'ลูกค้ารู้ timeline ใหม่แล้ว',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้ควรเคลียร์ expectation ของลูกค้าก่อน',
    replyDraft: 'ผมจะส่งอัปเดต timeline ภายในวันนี้ครับ',
    situationSummary: 'งานยังไปต่อได้ถ้าล็อก timeline ก่อน',
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };

  const result = buildActionSuccessArtifacts({
    task,
    intake,
    actionResponse,
    existingAction,
    persistedNegotiationMode: 'reply_first',
  });

  assert.equal(result.actionState.id, existingAction.id);
  assert.equal(result.nextTask.constraints?.preferReplyFirst, true);
  assert.equal(result.nextTask.actionExplanation, actionResponse.whyThisNow);
  assert.equal(result.nextTask.currentPlan?.steps.length, 3);
});

test('buildScaffoldSuccessArtifacts updates payload and step checkpoint', () => {
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentStepIndex: 1,
    currentPlan: {
      actionTitle: 'ตอบลูกค้า',
      successSignal: 'ลูกค้ารู้แผน',
      steps: [
        { id: 'step-1', text: 'อ่านแชต' },
        { id: 'step-2', text: 'ร่าง reply' },
      ],
    },
  });
  const action: Action = {
    id: 'action-1',
    createdAt: 1,
    title: 'ตอบลูกค้า',
    rationale: 'คุยให้ชัดก่อน',
    microSteps: ['อ่านแชต', 'ร่าง reply', 'ส่ง reply'],
    isPinned: false,
    state: 'IN_PROGRESS',
  };
  const payload = {
    workflow_type: 'client_response' as const,
    requires_clarification: false,
    situation_summary: 'ลูกค้ารอคำตอบ',
    reply_draft: 'draft',
    recommended_action: {
      title: 'ตอบลูกค้า',
      rationale: 'คุยให้ชัดก่อน',
      micro_steps: ['อ่านแชต', 'ร่าง reply', 'ส่ง reply'],
    },
    alternative_actions: [],
    detected_blockers: [],
  };
  const scaffold: AiScaffoldResponse = {
    planTitle: 'ตอบลูกค้าด้วยข้อความสั้นก่อน',
    steps: [
      { id: 'step-1', text: 'เปิดแชตล่าสุด' },
      { id: 'step-2', text: 'แก้แค่บรรทัดแรกของ reply' },
      { id: 'step-3', text: 'ส่งข้อความสั้นยืนยัน deadline' },
    ],
    shortcutOptions: ['ใช้ draft เดิม'],
    revisedCurrentStepIndex: 1,
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };

  const result = buildScaffoldSuccessArtifacts({ task, action, payload, scaffold });

  assert.equal(result.nextPayload.recommended_action.title, scaffold.planTitle);
  assert.equal(result.nextTask.currentStepIndex, 1);
  assert.equal(result.nextTask.currentPlan?.steps[1].text, 'แก้แค่บรรทัดแรกของ reply');
});

test('bounce-back route helpers prefer real checkpoints', () => {
  const scaffoldTask = makeTask({ lifecycleState: 'in_scaffold', currentStepIndex: 1 });
  const doneTask = makeTask({ lifecycleState: 'done' });

  assert.equal(deriveBounceBackRoute(scaffoldTask, null), 'SCAFFOLD');
  assert.equal(routeFromResumeTarget('ONE_ACTION'), 'ONE_ACTION');
  assert.equal(hasResumableTask(scaffoldTask), true);
  assert.equal(hasResumableTask(doneTask), false);
});
