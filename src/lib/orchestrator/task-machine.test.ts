import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiActionResponse, AiIntakeResponse, AiScaffoldResponse } from '../ai/operations';
import type { Action, TaskContext } from '../store/idb';
import {
  buildActionSuccessArtifacts,
  buildBootstrapMicroSteps,
  buildPayloadFromAiActionResponse,
  buildScaffoldSuccessArtifacts,
  buildReentryTaskArtifacts,
  deriveBounceBackRoute,
  deriveRoomBlockers,
  extractRoomAnchors,
  guardMicroStepsGrounding,
  hasResumableTask,
  routeFromResumeTarget,
} from './task-machine';
import { validateStarterMicroSteps } from '../ai/operation-contract';

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

test('buildBootstrapMicroSteps uses personal-friction steps instead of generic file-opening template', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'เลือกสิ่งเดียวที่ต้องเติมก่อนกลับไปทำงานก้าวเล็ก',
      successSignal: 'รู้สิ่งเล็ก ๆ ที่ต้องเติมตอนนี้ และมีก้าวงานหนึ่งก้าวที่เริ่มต่อได้',
    },
    {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'ตอนนี้หิวและหมดแรงแต่ยังต้องทำงานต่อ',
      behaviorIntent: 'personal_friction',
      confidence: 0.84,
    },
  );

  assert.equal(steps.length, 3);
  assert.match(steps.join(' '), /กิน|พัก|เติม|พลัง|ก้าวแรก/);
  assert.doesNotMatch(steps.join(' '), /เปิดบริบทหรือไฟล์|ทำก้าวหลักนี้ทันที/);
});

test('buildBootstrapMicroSteps grounds personal-friction fallback when ABC Corp room anchors exist', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'รวบข้อมูลตั้งต้นสำหรับ timeline และ estimate เบื้องต้น',
      successSignal: 'ได้ข้อมูลพอเริ่ม estimate',
    },
    {
      deliverableType: 'estimate',
      immediateNeed: 'resume_execution',
      behaviorIntent: 'personal_friction',
      missingInputs: [],
      workContext: 'หิวข้าวแต่ต้องทำงาน ลูกค้า ABC Corp ทวงใน chat',
      confidence: 0.63,
    },
    'ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต ไลน์กลุ่มก็เด้งไม่หยุด เรื่องเซิร์ฟเวอร์โปรดักชันล่มเมื่อเช้ายังไม่ได้ตรวจดูละเอียดเลย',
  );

  assert.equal(steps.length, 3);
  const joined = steps.join(' ');
  // At least one step mentions ABC Corp anchor
  assert.match(joined, /ABC Corp/);
  // At least one step mentions the action title context
  assert.match(joined, /timeline|estimate|รวบข้อมูล|ก้าวเล็ก/);
  // Should not be all self-care generic
  const selfCareCount = steps.filter((s) => /^เช็กก่อนว่า|^เลือกงานก้าว|^ทำแค่ก้าวแรก/.test(s)).length;
  assert.ok(selfCareCount <= 1, 'at most 1 step is generic self-care');
});

test('buildBootstrapMicroSteps grounds personal-friction for different customer names (no ABC Corp overfitting)', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'ดูสถานะ server incident ก่อน',
      successSignal: 'รู้สถานะ server',
    },
    {
      deliverableType: 'execution',
      immediateNeed: 'resume_execution',
      behaviorIntent: 'personal_friction',
      missingInputs: [],
      workContext: 'เหนื่อยมากแต่ XYZ Ltd ถามเรื่อง server ล่ม',
      confidence: 0.55,
    },
    'XYZ Ltd ถามเรื่อง server prod ล่ม และทีมยังหา RCA ไม่ได้ สมองตื้อมากตอนนี้',
  );

  assert.equal(steps.length, 3);
  const joined = steps.join(' ');
  // Must mention XYZ Ltd (not ABC Corp)
  assert.match(joined, /XYZ Ltd/);
  // Must NOT mention ABC Corp
  assert.doesNotMatch(joined, /ABC Corp/);
});

test('buildBootstrapMicroSteps keeps gentle generic for pure overload without anchors', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'จัดการอะไรสักอย่าง',
      successSignal: 'ทำอะไรได้',
    },
    {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      behaviorIntent: 'personal_friction',
      missingInputs: [],
      workContext: 'หิวข้าว หมดแรง ไม่รู้จะทำอะไรดี',
      confidence: 0.3,
    },
    'หิวข้าว หมดแรง ไม่รู้จะทำอะไรดี',
  );

  assert.equal(steps.length, 3);
  // This is pure personal friction — generic steps are OK
  assert.match(steps.join(' '), /กิน|พัก|เติม|พลัง|ก้าวแรก/);
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

test('buildScaffoldSuccessArtifacts keeps revised index within full refined scaffold plan', () => {
  const task = makeTask({
    lifecycleState: 'in_scaffold',
    currentStepIndex: 1,
  });
  const action: Action = {
    id: 'action-1',
    createdAt: 1,
    title: 'ตอบลูกค้า',
    rationale: 'คุยให้ชัดก่อน',
    microSteps: ['อ่านแชต', 'ร่าง reply', 'ส่ง reply'],
    isPinned: false,
    state: 'IN_PROGRESS',
    workflowType: 'client_response',
  };
  const payload: AiSynthesisResponse = {
    workflow_type: 'client_response',
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
    planTitle: 'ตอบลูกค้าด้วยลำดับที่เล็กลง',
    steps: [
      { id: 'step-1', text: 'เปิดแชต ABC Corp ล่าสุด' },
      { id: 'step-2', text: 'แยกเรื่อง prod incident ออกจาก Dashboard/payment API' },
      { id: 'step-3', text: 'ร่างข้อความสถานะที่ยังไม่ commit เวลา' },
      { id: 'step-4', text: 'ตรวจคำตอบสุดท้ายก่อนส่งลูกค้า' },
    ],
    shortcutOptions: [],
    revisedCurrentStepIndex: 3,
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  };

  const result = buildScaffoldSuccessArtifacts({ task, action, payload, scaffold });

  assert.equal(result.nextPayload.recommended_action.micro_steps.length, 3);
  assert.equal(result.nextTask.currentPlan?.steps.length, 4);
  assert.equal(result.nextTask.currentStepIndex, 3);
  assert.equal(result.nextTask.currentPlan?.steps[3]?.text, 'ตรวจคำตอบสุดท้ายก่อนส่งลูกค้า');
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
      meta: { model: "mock", passType: "primary_pass", durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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
      meta: { model: "mock", passType: "primary_pass", durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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
      meta: { model: "mock", passType: "primary_pass", durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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

// ─── P1: starterMicroSteps Tests ──────────────────────────────────────────────

test('validateStarterMicroSteps accepts 3 valid context-specific steps', () => {
  const result = validateStarterMicroSteps(
    ['เปิดแชตลูกค้าล่าสุดเรื่อง timeline', 'ร่างข้อความตอบกลับแบบยังไม่ commit scope', 'ส่งหรือบันทึก draft ตอบกลับไว้'],
    false,
  );
  assert.ok(result);
  assert.equal(result.length, 3);
  assert.equal(result[0], 'เปิดแชตลูกค้าล่าสุดเรื่อง timeline');
});

test('validateStarterMicroSteps rejects when length is not 3', () => {
  assert.equal(validateStarterMicroSteps(['a', 'b'], false), undefined);
  assert.equal(validateStarterMicroSteps(['a', 'b', 'c', 'd'], false), undefined);
  assert.equal(validateStarterMicroSteps([], false), undefined);
});

test('validateStarterMicroSteps rejects when any item is empty', () => {
  assert.equal(validateStarterMicroSteps(['a', '', 'c'], false), undefined);
  assert.equal(validateStarterMicroSteps(['a', '   ', 'c'], false), undefined);
});

test('validateStarterMicroSteps rejects generic patterns', () => {
  assert.equal(validateStarterMicroSteps(['เปิดไฟล์ที่เกี่ยวข้อง', 'ทำงาน', 'เช็กผล'], false), undefined);
  assert.equal(validateStarterMicroSteps(['ดูข้อมูล', 'ทำก้าวหลักนี้ทันที: งาน', 'เช็ก'], false), undefined);
  assert.equal(validateStarterMicroSteps(['เปิดบริบทเรื่องนี้', 'ทำ', 'ดู'], false), undefined);
  assert.equal(validateStarterMicroSteps(['จัดการงานนี้ก่อน', 'ทำ', 'ดู'], false), undefined);
  assert.equal(validateStarterMicroSteps(['งานนี้ต้องเช็กก่อน', 'ทำ', 'ดู'], false), undefined);
  assert.equal(validateStarterMicroSteps(['ขยับงานต่อด้วยการเปิดแชต', 'ทำ', 'ดู'], false), undefined);
});

test('validateStarterMicroSteps rejects file references when no file evidence', () => {
  assert.equal(validateStarterMicroSteps(['เปิดไฟล์ brief', 'ดูข้อมูล', 'สรุป'], false), undefined);
  assert.equal(validateStarterMicroSteps(['อ่านเอกสาร RCA', 'ดูข้อมูล', 'สรุป'], false), undefined);
});

test('validateStarterMicroSteps allows file references when file evidence exists', () => {
  const result = validateStarterMicroSteps(['เปิดไฟล์ brief', 'สรุปเนื้อหา', 'ร่างตอบกลับ'], true);
  assert.ok(result);
  assert.equal(result.length, 3);
});

test('validateStarterMicroSteps returns undefined for non-array input', () => {
  assert.equal(validateStarterMicroSteps(null, false), undefined);
  assert.equal(validateStarterMicroSteps(undefined, false), undefined);
  assert.equal(validateStarterMicroSteps('string', false), undefined);
  assert.equal(validateStarterMicroSteps(42, false), undefined);
});

test('buildPayloadFromAiActionResponse uses AI starterMicroSteps when valid', () => {
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบลูกค้า ABC Corp',
      rationale: 'ลูกค้ารอคำตอบ',
      successSignal: 'ลูกค้ารู้',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้',
    situationSummary: 'ลูกค้ารอ',
    starterMicroSteps: ['เปิดแชต ABC Corp', 'ร่างข้อความตอบกลับ', 'ส่ง draft'],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, []);
  assert.deepEqual(payload.recommended_action.micro_steps, ['เปิดแชต ABC Corp', 'ร่างข้อความตอบกลับ', 'ส่ง draft']);
  assert.equal(payload.recommended_action.micro_steps_source, 'ai');
});

test('buildPayloadFromAiActionResponse falls back to bootstrap when starterMicroSteps absent', () => {
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบลูกค้า',
      rationale: 'ลูกค้ารอ',
      successSignal: 'ลูกค้ารู้',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้',
    situationSummary: 'ลูกค้ารอ',
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, []);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.equal(payload.recommended_action.micro_steps.length, 3);
  assert.match(payload.recommended_action.micro_steps[0], /ทวนข้อมูลที่มีอยู่ตอนนี้เกี่ยวกับ/);
});

test('buildBootstrapMicroSteps uses neutral copy (P0 change)', () => {
  const steps = buildBootstrapMicroSteps({
    title: 'ตอบลูกค้า ABC Corp',
    successSignal: 'ลูกค้ารู้แผน',
  });

  assert.equal(steps.length, 3);
  assert.match(steps[0], /ทวนข้อมูลที่มีอยู่ตอนนี้เกี่ยวกับ/);
  assert.doesNotMatch(steps.join(' '), /งานนี้|จัดการงานนี้|ขยับงานต่อ|ทำก้าวหลักนี้ทันที|เปิดบริบทหรือไฟล์/);
});

// ─── Grounding Guard Tests ────────────────────────────────────────────────────

test('extractRoomAnchors extracts company names and Thai work-context words', () => {
  const anchors = extractRoomAnchors(
    'ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต เรื่องเซิร์ฟเวอร์โปรดักชันล่ม',
  );
  assert.ok(anchors.includes('ABC Corp'), 'finds English company name');
  assert.ok(anchors.some((a) => a === 'เซิร์ฟเวอร์'), 'finds Thai server keyword');
  assert.ok(anchors.some((a) => a === 'แชต'), 'finds Thai chat keyword');
  assert.ok(anchors.some((a) => a === 'ลูกค้า'), 'finds Thai customer keyword');
});

test('extractRoomAnchors returns empty for anchorless text', () => {
  const anchors = extractRoomAnchors('หิวข้าว หมดแรง ไม่รู้จะทำอะไรดี');
  assert.equal(anchors.length, 0, 'no work anchors in pure personal text');
});

test('guardMicroStepsGrounding passes well-grounded steps with ABC Corp', () => {
  const sourceText = 'ลูกค้า ABC Corp ทวงงานในแชต เซิร์ฟเวอร์ล่ม';
  const steps = [
    'พักหายใจ 2 นาที',
    'เปิดแชต ABC Corp ล่าสุด',
    'ร่างข้อความสถานะสั้นเกี่ยวกับเซิร์ฟเวอร์ให้ลูกค้า',
  ];
  const result = guardMicroStepsGrounding(steps, sourceText);
  assert.ok(result, 'grounded steps should pass');
  assert.deepEqual(result, steps);
});

test('guardMicroStepsGrounding rejects all-self-care steps when anchors exist', () => {
  const sourceText = 'ลูกค้า ABC Corp ทวงงานในแชต เซิร์ฟเวอร์ล่ม';
  const steps = [
    'เช็กว่าต้องเติมอะไร กิน พัก หรือเริ่มงานเบา ๆ',
    'เลือกงานก้าวแรกที่เล็กพอ',
    'ทำก้าวแรกแล้วดูว่าพลังพอกลับไปต่อไหม',
  ];
  const result = guardMicroStepsGrounding(steps, sourceText);
  assert.equal(result, undefined, 'all self-care should be rejected');
});

test('guardMicroStepsGrounding rejects anchorless AI steps when room has anchors', () => {
  const sourceText = 'ลูกค้า ABC Corp ทวงงานในแชต เซิร์ฟเวอร์ล่ม';
  const steps = [
    'เริ่มจากงานที่เล็กที่สุด',
    'วางแผนก้าวถัดไป',
    'สรุปผลลัพธ์',
  ];
  const result = guardMicroStepsGrounding(steps, sourceText);
  assert.equal(result, undefined, 'anchorless steps should be rejected when anchors exist');
});

test('guardMicroStepsGrounding passes any steps when no anchors in sourceText', () => {
  const sourceText = 'หิวข้าว หมดแรง';
  const steps = [
    'เช็กว่าต้องเติมอะไร กิน พัก',
    'เลือกงานก้าวแรก',
    'ทำก้าวแรก',
  ];
  const result = guardMicroStepsGrounding(steps, sourceText);
  assert.ok(result, 'no anchors => guard is lenient');
});

test('buildPayloadFromAiActionResponse rejects anchorless AI steps and uses grounded fallback', () => {
  const response: AiActionResponse = {
    chosenAction: {
      title: 'รวบข้อมูลตั้งต้นสำหรับ ABC Corp',
      rationale: 'ลูกค้ารอ',
      successSignal: 'ได้ข้อมูล',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้',
    situationSummary: 'ABC Corp ทวง',
    starterMicroSteps: [
      'เช็กก่อนว่าต้องเติมอะไร กิน พัก หรือเริ่มงานเบา ๆ',
      'เลือกงานก้าวแรกที่เล็กพอทำได้',
      'ทำแค่ก้าวแรกแล้วดูพลัง',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const sourceText = 'ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต เซิร์ฟเวอร์ล่ม';
  const payload = buildPayloadFromAiActionResponse(
    'client_resume', response, [],
    {
      deliverableType: 'estimate',
      immediateNeed: 'resume_execution',
      behaviorIntent: 'personal_friction',
      missingInputs: [],
      workContext: 'ลูกค้า ABC Corp',
      confidence: 0.6,
    },
    sourceText,
  );

  // Should fallback because all 3 AI steps are self-care
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  // Fallback should be grounded (personal_friction + anchors = grounded fallback)
  const joined = payload.recommended_action.micro_steps.join(' ');
  assert.match(joined, /ABC Corp/, 'fallback should mention ABC Corp');
});

test('buildPayloadFromAiActionResponse keeps well-grounded AI steps', () => {
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบ ABC Corp',
      rationale: 'ลูกค้ารอ',
      successSignal: 'ลูกค้ารู้สถานะ',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้',
    situationSummary: 'ABC Corp ทวง',
    starterMicroSteps: [
      'พักสายตา 2 นาที',
      'เปิดแชต ABC Corp ล่าสุด',
      'ร่างข้อความสถานะเรื่องเซิร์ฟเวอร์ให้ลูกค้า',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const sourceText = 'ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต เซิร์ฟเวอร์ล่ม';
  const payload = buildPayloadFromAiActionResponse(
    'client_resume', response, [], undefined, sourceText,
  );

  assert.equal(payload.recommended_action.micro_steps_source, 'ai');
  assert.deepEqual(payload.recommended_action.micro_steps, response.starterMicroSteps);
});
