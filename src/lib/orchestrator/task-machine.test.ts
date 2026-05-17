import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiActionResponse, AiIntakeResponse, AiScaffoldResponse } from '../ai/operations';
import type { Action, TaskContext } from '../store/idb';
import {
  buildActionSuccessArtifacts,
  buildScaffoldSuccessArtifacts,
  buildReentryTaskArtifacts,
  deriveBounceBackRoute,
  deriveRoomBlockers,
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
    taskShape: {
      deliverableType: 'reply',
      immediateNeed: 'send_reply_now',
      missingInputs: [],
      workContext: 'ลูกค้ารอคำตอบเรื่อง timeline อยู่',
      confidence: 0.92,
    },
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
  assert.equal(result.nextTask.taskShape?.deliverableType, 'reply');
  assert.equal(result.payload.task_shape?.immediateNeed, 'send_reply_now');
});

test('buildActionSuccessArtifacts carries retrieved evidence into plan provenance', () => {
  const task = makeTask();
  const intake: AiIntakeResponse = {
    workflowType: 'client_response',
    taskShape: {
      deliverableType: 'reply',
      immediateNeed: 'send_reply_now',
      missingInputs: [],
      workContext: 'ลูกค้ารอคำตอบเรื่อง timeline อยู่',
      confidence: 0.92,
    },
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
    evidenceContext: {
      summaryText: '[file:brief] brief: ลูกค้ารอ timeline ใหม่',
      selectionMethod: 'retrieval',
      evidenceChips: [
        {
          sourceId: 'file:brief',
          label: 'brief.txt',
          excerpt: 'ลูกค้ารอ timeline ใหม่',
          sourceKindLabel: 'retrieved',
        },
      ],
    },
  });

  const firstStep = result.nextTask.currentPlan?.steps[0];
  assert.equal(firstStep?.evidence?.[0]?.sourceId, 'file:brief');
  assert.deepEqual(firstStep?.provenance?.sourceIds, ['file:brief']);
  assert.equal(firstStep?.confidence?.supportingSourceCount, 1);
});

test('buildActionSuccessArtifacts keeps proposal-start tasks resume-first and removes reply draft from payload', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด ต้องทำ timeline และ estimate',
  });
  const intake: AiIntakeResponse = {
    workflowType: 'client_resume',
    taskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: ['requirement ที่ต้องการจริง', 'ข้อมูลสำหรับ estimate ราคาและ effort'],
      workContext: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด note กระจัดกระจาย และยังเริ่มงานไม่ได้',
      confidence: 0.91,
    },
    roomDigest: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
    taskFrame: {
      objective: 'รวบ requirement และ scope ที่ยังไม่ชัดก่อนทำ proposal',
      stage: 'กำลังล็อกข้อมูลตั้งต้นเพื่อเริ่ม timeline และ estimate ได้จริง',
      stakeholders: ['client'],
    },
    blockers: ['unclear_scope'],
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
      title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
      rationale: 'proposal, timeline และ estimate จะเริ่มได้จริงก็ต่อเมื่อ requirement กับ scope ถูกล็อกพอประมาณก่อน',
      successSignal: 'ได้ requirement และ assumptions ชุดแรกที่ใช้ร่าง proposal รอบแรกได้',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้ยังไม่ควรกระโดดไปทำ timeline หรือ estimate เพราะ requirement และ scope ยังไม่ชัดพอ',
    replyDraft: undefined,
    situationSummary: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่สรุป note กระจัดกระจาย และ timeline กับ estimate ยังติดข้อมูลไม่ครบ',
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
  });

  assert.equal(result.workflowType, 'client_resume');
  assert.equal(result.nextTask.taskShape?.deliverableType, 'proposal');
  assert.equal(result.payload.reply_draft, undefined);
  assert.equal(result.payload.task_shape?.immediateNeed, 'define_scope');
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

test('buildReentryTaskArtifacts stores a reentry save point brief', () => {
  const task = makeTask({
    lifecycleState: 'stalled',
    sourceText: 'งานค้างต้องกลับเข้ามาใหม่',
  });
  const reentry = {
    reentrySummary: 'กลับมาทำต่อจากจุดที่ใกล้ที่สุด',
    topActions: [
      {
        roomId: 'task-1',
        title: 'กลับไปเปิดบริบทล่าสุด',
        rationale: 'ช่วยกลับเข้าจังหวะเดิมได้เร็ว',
        impact: 'high' as const,
        effort: 'low' as const,
        resumeTarget: 'ONE_ACTION' as const,
      },
    ],
    ignoredNoise: ['งานเก่า'],
  };

  const result = buildReentryTaskArtifacts(task, reentry);

  assert.equal(result.nextTask.assistantMode, 'reentry_brief');
  assert.equal(result.nextTask.lastAiOperation, 'reentry');
  assert.equal(result.nextTask.reentryBrief?.summary, reentry.reentrySummary);
  assert.equal(result.nextTask.reentryBrief?.topActions[0]?.title, 'กลับไปเปิดบริบทล่าสุด');
  assert.equal(result.nextTask.reentryBrief?.ignoredNoise[0], 'งานเก่า');
});

// ─── Phase 2.5: Save Point Metadata Tests ────────────────────────────────────

test('Phase 2.5: buildReentryTaskArtifacts includes failedFileNames from failed sourceFiles', () => {
  const task = makeTask({
    lifecycleState: 'stalled',
    sourceText: 'งานค้าง',
    sourceFiles: [
      {
        id: 'file-txt',
        name: 'notes.txt',
        kind: 'text',
        mimeType: 'text/plain',
        size: 100,
        status: 'ready',
        extractedText: 'notes',
        createdAt: 1,
      },
      {
        id: 'file-pdf',
        name: 'brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'failed_extraction',
        extractedText: '',
        failureReason: 'pdf_ocr_failed',
        createdAt: 1,
      },
      {
        id: 'file-img',
        name: 'scan.png',
        kind: 'image',
        mimeType: 'image/png',
        size: 5000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'ocr_garbled',
        createdAt: 1,
      },
    ],
  });
  const reentry = {
    reentrySummary: 'กลับมาทำต่อ',
    topActions: [{
      roomId: 'task-1',
      title: 'กลับ',
      rationale: 'ต่อจากเดิม',
      impact: 'high' as const,
      effort: 'low' as const,
      resumeTarget: 'ONE_ACTION' as const,
    }],
    ignoredNoise: [],
  };

  const result = buildReentryTaskArtifacts(task, reentry);
  const brief = result.nextTask.reentryBrief;

  assert.ok(brief);
  assert.deepEqual(brief.failedFileNames, ['brief.pdf', 'scan.png'], 'failed files captured');
  // Ready file should NOT appear in failedFileNames
  assert.ok(!brief.failedFileNames?.includes('notes.txt'), 'ready file excluded from failedFileNames');
});

test('Phase 2.5: buildReentryTaskArtifacts includes usedSourceIds from plan evidence', () => {
  const task = makeTask({
    lifecycleState: 'has_one_action',
    currentPlan: {
      actionTitle: 'ตอบลูกค้า',
      successSignal: 'ลูกค้ารู้แผน',
      steps: [
        {
          id: 'step-1',
          text: 'อ่านไฟล์',
          evidence: [
            { sourceId: 'file:notes-txt', label: 'notes.txt', excerpt: 'notes', sourceKindLabel: 'retrieved' },
          ],
        },
        {
          id: 'step-2',
          text: 'สรุป',
          evidence: [
            { sourceId: 'file:notes-txt', label: 'notes.txt', excerpt: 'notes', sourceKindLabel: 'retrieved' },
            { sourceId: 'manual:task-1', label: 'บริบทเดิม', excerpt: 'บริบท', sourceKindLabel: 'retrieved' },
          ],
        },
      ],
    },
  });
  const reentry = {
    reentrySummary: 'กลับมา',
    topActions: [{
      roomId: 'task-1',
      title: 'ต่อ',
      rationale: 'ต่อ',
      impact: 'high' as const,
      effort: 'low' as const,
      resumeTarget: 'ONE_ACTION' as const,
    }],
    ignoredNoise: [],
  };

  const result = buildReentryTaskArtifacts(task, reentry);
  const brief = result.nextTask.reentryBrief;

  assert.ok(brief);
  assert.deepEqual(brief.usedSourceIds, ['file:notes-txt', 'manual:task-1'], 'deduped source IDs');
});

test('Phase 2.5: buildReentryTaskArtifacts omits metadata fields when no failed files or evidence', () => {
  const task = makeTask({
    sourceFiles: [],
  });
  const reentry = {
    reentrySummary: 'กลับมา',
    topActions: [{
      roomId: 'task-1',
      title: 'ต่อ',
      rationale: 'ต่อ',
      impact: 'high' as const,
      effort: 'low' as const,
      resumeTarget: 'ONE_ACTION' as const,
    }],
    ignoredNoise: [],
  };

  const result = buildReentryTaskArtifacts(task, reentry);
  const brief = result.nextTask.reentryBrief;

  assert.ok(brief);
  assert.equal(brief.failedFileNames, undefined, 'omitted when empty');
  assert.equal(brief.usedSourceIds, undefined, 'omitted when empty');
});

test('bounce-back route helpers prefer real checkpoints', () => {
  const scaffoldTask = makeTask({ lifecycleState: 'in_scaffold', currentStepIndex: 1 });
  const doneTask = makeTask({ lifecycleState: 'done' });

  assert.equal(deriveBounceBackRoute(scaffoldTask, null), 'SCAFFOLD');
  assert.equal(routeFromResumeTarget('ONE_ACTION'), 'ONE_ACTION');
  assert.equal(hasResumableTask(scaffoldTask), true);
  assert.equal(hasResumableTask(doneTask), false);
});

test('deriveRoomBlockers adds missing_file_or_context when attached files are not ready', () => {
  const blockers = deriveRoomBlockers(makeTask({
    blockerSignals: ['timeline_unclear'],
    sourceFiles: [
      {
        id: 'file-1',
        name: 'brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 2048,
        status: 'failed',
        createdAt: 1,
        failureReason: 'pdf_text_garbled_after_ocr',
      },
    ],
  }));

  assert.equal(blockers.includes('timeline_unclear'), true);
  assert.equal(blockers.includes('missing_file_or_context'), true);
});
