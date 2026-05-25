import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiActionResponse, AiIntakeResponse, AiScaffoldResponse } from '../ai/operations';
import type { AiSynthesisResponse } from '../ai/schema';
import type { Action, TaskContext } from '../store/idb';
import {
  buildActionSuccessArtifacts,
  buildBootstrapMicroSteps,
  buildPayloadFromAiActionResponse,
  buildScaffoldSuccessArtifacts,
  buildReentryTaskArtifacts,
  deriveBounceBackRoute,
  deriveRoomBlockers,
  hasResumableTask,
  routeFromResumeTarget,
} from './task-machine';
import { validateStarterMicroSteps } from '../ai/operation-contract';
import { COMPLETED_CONTEXT_REUSE_HANDOFF } from '../source-grounding';

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

const PAYMENT_API_BRAINDUMP = [
  'เหนื่อยมาก',
  'ต้องตอบ ABC Corp',
  'payment API timeout ไป 20 นาที',
  'CS ถามว่าจะตอบลูกค้ายังไง',
  'ยังไม่ได้เปิด Dashboard',
  'หัวตื้อ ไม่รู้จะเริ่มตรงไหน',
].join('\n');

const PAYMENT_API_EXPECTED_STEPS = [
  'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
  'เติมอัปเดต 3 บรรทัดให้ CS',
  'ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลาเกินข้อมูลที่เห็น',
];

const BROWSER_QA_BRAINDUMP = [
  'ห้องนี้รกมาก ต้องเตรียม demo MIND วันนี้',
  'แต่ยังมี notes กระจัดกระจาย เรื่อง fallback latency, reentry card, ปุ่มช่วยแก้ก้าวนี้, evidence source',
  'และกลัวว่ากดจบแล้วกลับมาจะ context หาย',
  'อยากได้ก้าวเดียวที่ทำต่อได้ทันที',
].join('\n');

const BROWSER_QA_EXPECTED_STEPS = [
  'จด fallback latency, reentry card, evidence source เป็น 3 จุด demo',
  'เช็กปุ่มช่วยแก้ก้าวนี้กับ completed context ว่ายังต่อเนื่อง',
  'ร่าง demo checklist ที่กัน context หายหลังจบงาน',
];

const TEAM_PRESENTATION_BRAINDUMP = [
  'พรุ่งนี้ต้องพรีเซนต์งานในทีม แต่ตอนนี้หัวกระจัดกระจายมาก',
  'มี notes อยู่หลายที่ ทั้งในแชท ในไฟล์สไลด์ และในสมุด',
  'สิ่งที่ต้องพูดคือผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
  'แต่ยังไม่รู้จะเริ่มจากตรงไหน กลัวเปิดสไลด์แล้วนั่งจ้องเปล่า ๆ',
  'อยากได้ก้าวเดียวที่เริ่มทำได้ทันทีใน 10 นาที',
].join('\n');

const TEAM_PRESENTATION_EXPECTED_STEPS = [
  'เปิด notes จากแชท ไฟล์สไลด์ และสมุด',
  'จดหัวข้อพรีเซนต์ 3 ช่อง: ผลที่ทำไปแล้ว ปัญหาที่เจอ แผนต่อไป',
  'เติมสไลด์แรกด้วยหัวข้อที่เริ่มได้ใน 10 นาที',
];

const MESSY_PHYSICAL_ROOM_BRAINDUMP = [
  'ห้องรกมาก มีเสื้อผ้ากองบนเก้าอี้',
  'โต๊ะมีแก้วน้ำกับกระดาษเต็มไปหมด',
  'อยากเริ่มเก็บใน 10 นาทีแต่ไม่รู้จะเริ่มจากตรงไหน',
].join('\n');

const MESSY_PHYSICAL_ROOM_EXPECTED_STEPS = [
  'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
  'ย้ายแก้วน้ำกับกระดาษออกจากโต๊ะหนึ่งมุม',
  'เช็กว่าเก้าอี้หรือโต๊ะพร้อมใช้งานใน 10 นาที',
];

const CUSTOMER_LOGO_REVISION_BRAINDUMP = [
  'ลูกค้าขอแก้งานโลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้)',
  'ข้อมูลอยู่กระจายใน LINE ยังไม่ตอบลูกค้า',
  'อยากได้ก้าวเดียวเริ่มงานได้โดยไม่เปิดทุกอย่างพร้อมกัน',
].join('\n');

const STUDENT_REPORT_BRAINDUMP = [
  'ต้องส่งรายงานวิชาวิศวะพรุ่งนี้ แต่ตอนนี้ติดมาก',
  'หัวข้อคือ renewable energy storage มี reference links หลายอันในแชท',
  'ยังไม่ได้เปิดเอกสารจริง ไม่รู้จะเริ่มเขียนบทนำจากตรงไหน',
  'อยากได้ก้าวเดียวที่ทำได้ใน 10 นาที',
].join('\n');

const STUDENT_REPORT_EXPECTED_STEPS = [
  'เปิด reference link 1 อันของ renewable energy storage',
  'จด 3 bullet สำหรับบทนำรายงาน',
  'เขียนประโยคแรกของบทนำจาก bullet ที่จด',
];

const PRODUCT_POST_BRAINDUMP = [
  'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas',
  'มีรูปสินค้าแล้ว แต่ caption ยังไม่มี',
  'จุดขายคือเบา ซักง่าย และมี 3 สี',
  'กลัวนั่งคิดนาน อยากได้ก้าวเดียวที่เริ่มทำได้ทันที',
].join('\n');

const PRODUCT_POST_EXPECTED_STEPS = [
  'จดจุดขายกระเป๋าผ้า canvas: เบา ซักง่าย 3 สี',
  'ร่าง caption สินค้า 3 บรรทัด',
  'ตรวจว่า caption พร้อมโพสต์คืนนี้',
];

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
      micro_steps_source: 'ai' as const,
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
      micro_steps_source: 'ai' as const,
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
    meta: { model: "mock", passType: "primary_pass" as const, durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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
    meta: { model: "mock", passType: "primary_pass" as const, durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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
    meta: { model: "mock", passType: "primary_pass" as const, durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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
    meta: { model: "mock", passType: "primary_pass" as const, durationMs: 100, repairUsed: false, usedRoomFiles: [] }
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

test('buildPayloadFromAiActionResponse grounds accepted payment API BrainDump scaffold steps', () => {
  const task = makeTask({
    sourceText: PAYMENT_API_BRAINDUMP,
    taskFrame: {
      objective: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
      stage: 'triage',
      stakeholders: ['ABC Corp', 'CS'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
      rationale: 'ต้องตอบ ABC Corp/CS โดยไม่เดาสถานะก่อนเช็ก Dashboard',
      successSignal: 'มีข้อความตอบกลับที่อิงสถานะล่าสุด',
    },
    alternatives: [],
    whyThisNow: 'ABC Corp และ CS รอคำตอบเรื่อง payment API timeout',
    situationSummary: 'ABC Corp มี payment API timeout และยังไม่ได้เปิด Dashboard',
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: ['สถานะล่าสุดจาก Dashboard'],
    workContext: 'ABC Corp รอคำตอบเรื่อง payment API timeout และ CS ต้องตอบลูกค้า',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);

  assert.deepEqual(payload.recommended_action.micro_steps, PAYMENT_API_EXPECTED_STEPS);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /แยกงานค้าง|แต่ละรายการ/u);
});

test('buildPayloadFromAiActionResponse grounds Browser QA demo scaffold without collapsing to button-only work', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: BROWSER_QA_BRAINDUMP,
    blockerSignals: ['too_big'],
    taskFrame: {
      objective: 'เตรียม demo MIND ให้เช็ก lifecycle ได้ครบ',
      stage: 'demo_readiness',
      stakeholders: ['demo reviewer'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
      rationale: 'ต้องรวมจุดเสี่ยงของ demo ให้กลายเป็นก้าวเดียวที่ทำต่อได้',
      successSignal: 'มี checklist demo ที่ใช้ไล่เช็กก่อนพรีเซนต์',
    },
    alternatives: [],
    whyThisNow: 'demo MIND วันนี้ต้องไม่หลุด context หลังจบงาน',
    situationSummary: 'notes กระจัดกระจายเรื่อง fallback latency, reentry card, ปุ่มช่วยแก้, evidence source และ context หาย',
    starterMicroSteps: [
      'สรุป ปุ่ม เป็น 3 บรรทัด',
      'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
      'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, ['too_big'], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: [],
    workContext: 'เตรียม demo MIND เรื่อง fallback latency, reentry card, ปุ่มช่วยแก้ก้าวนี้, evidence source, context หาย',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);

  assert.deepEqual(payload.recommended_action.micro_steps, BROWSER_QA_EXPECTED_STEPS);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /ลูกค้า|client|customer|สรุป ปุ่ม เป็น 3 บรรทัด/iu);
});

test('buildPayloadFromAiActionResponse rejects invented customer starter steps when source has no customer anchor', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: BROWSER_QA_BRAINDUMP,
    taskFrame: {
      objective: 'เตรียม demo MIND ให้เช็ก lifecycle ได้ครบ',
      stage: 'demo_readiness',
      stakeholders: ['demo reviewer'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ทำ checklist demo MIND สำหรับ fallback latency, reentry card, evidence source',
      rationale: 'ต้องรวมจุดเสี่ยงของ demo ให้กลายเป็นก้าวเดียวที่ทำต่อได้',
      successSignal: 'มี checklist demo ที่ใช้ไล่เช็กก่อนพรีเซนต์',
    },
    alternatives: [],
    whyThisNow: 'demo MIND วันนี้ต้องไม่หลุด context หลังจบงาน',
    situationSummary: 'notes กระจัดกระจายเรื่อง fallback latency, reentry card, ปุ่มช่วยแก้, evidence source และ context หาย',
    starterMicroSteps: [
      'แจ้งลูกค้าว่ากำลังตรวจสอบ completed context',
      'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้',
      'ส่งข้อความให้ customer หลังเช็ก evidence source',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: [],
    workContext: 'เตรียม demo MIND เรื่อง fallback latency, reentry card, ปุ่มช่วยแก้ก้าวนี้, evidence source, context หาย',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /ลูกค้า|client|customer/iu);
  assert.match(payload.recommended_action.micro_steps.join(' '), /fallback latency|reentry card|evidence source|context/u);
});

test('buildPayloadFromAiActionResponse rejects customer-contaminated action for internal team presentation prep', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: TEAM_PRESENTATION_BRAINDUMP,
    taskFrame: {
      objective: 'ช่วยเหลือลูกค้าในการจัดระเบียบและเริ่มต้นเตรียมการนำเสนอผลงาน',
      stage: 'presentation_prep',
      stakeholders: ['ลูกค้า'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ร่างข้อความตอบลูกค้าเพื่อสรุปประเด็นนำเสนอ',
      rationale: 'ช่วยให้ลูกค้าจัดระเบียบความคิดและเห็นภาพรวมของสิ่งที่ต้องนำเสนอ',
      successSignal: 'ลูกค้าได้ข้อความสรุปประเด็นนำเสนอ',
    },
    alternatives: [],
    whyThisNow: 'ลูกค้าต้องเริ่มเตรียมการนำเสนอภายใน 10 นาที',
    situationSummary: 'ลูกค้าต้องการเตรียมการนำเสนอในทีมพรุ่งนี้ แต่ข้อมูลกระจัดกระจายและไม่รู้จะเริ่มอย่างไร',
    starterMicroSteps: [
      'สรุปสิ่งที่ลูกค้าต้องพูดเป็นรายการสั้น',
      'ร่างข้อความตอบลูกค้าเกี่ยวกับสไลด์',
      'ส่งข้อความให้ customer หลังจัด notes',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: ['notes จากแชท ไฟล์สไลด์ และสมุด'],
    workContext: 'ลูกค้าต้องการเตรียมการนำเสนอในทีมพรุ่งนี้ แต่ข้อมูลกระจัดกระจาย',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);

  const combined = [
    payload.situation_summary,
    payload.recommended_action.title,
    payload.recommended_action.rationale,
    ...payload.recommended_action.micro_steps,
  ].join(' ');

  assert.equal(payload.recommended_action.title, 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง');
  assert.deepEqual(payload.recommended_action.micro_steps, TEAM_PRESENTATION_EXPECTED_STEPS);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(combined, /พรีเซนต์งานในทีม|notes|แชท|ไฟล์สไลด์|สมุด|ผลที่ทำไปแล้ว|ปัญหาที่เจอ|แผนต่อไป|10 นาที/);
  assert.doesNotMatch(combined, /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu);
});

test('buildBootstrapMicroSteps grounds internal presentation prep to notes and slide anchors', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง',
      successSignal: 'ได้หัวข้อพรีเซนต์ที่เริ่มเติมสไลด์ได้',
    },
    {
      deliverableType: 'execution',
      immediateNeed: 'resume_execution',
      missingInputs: ['notes จากแชท ไฟล์สไลด์ และสมุด'],
      workContext: 'ต้องเตรียมพรีเซนต์งานในทีมจาก notes หลายแหล่งใน 10 นาที',
      behaviorIntent: 'admin_task',
      confidence: 0.88,
    },
    makeTask({ sourceText: TEAM_PRESENTATION_BRAINDUMP }),
  );

  assert.deepEqual(steps, TEAM_PRESENTATION_EXPECTED_STEPS);
  assert.doesNotMatch(steps.join(' '), /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu);
});

test('buildPayloadFromAiActionResponse grounds messy physical room to physical cleanup steps', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: MESSY_PHYSICAL_ROOM_BRAINDUMP,
    taskFrame: {
      objective: 'เคลียร์พื้นที่ใช้งานหนึ่งจุดในห้องรก',
      stage: 'physical_room_reset',
      stakeholders: ['ตัวเอง'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'วางแผนจัดห้องทั้งหมดให้เป็นระบบ',
      rationale: 'ห้องรกและต้องจัดระเบียบหลายส่วน',
      successSignal: 'ห้องเรียบร้อย',
    },
    alternatives: [],
    whyThisNow: 'ต้องเริ่มเก็บใน 10 นาที',
    situationSummary: 'ห้องรก มีเสื้อผ้าบนเก้าอี้และของบนโต๊ะ',
    starterMicroSteps: [
      'วางแผนจัดห้องทั้งหมด',
      'แยกประเภทของทุกชิ้นในห้อง',
      'จัดระบบใหม่ทั้งโต๊ะและเก้าอี้',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: ['พื้นที่กายภาพจุดแรกที่ต้องเคลียร์ในห้อง'],
    workContext: 'ห้องรก มีเสื้อผ้าบนเก้าอี้และของบนโต๊ะ จึงควรเริ่มจากเคลียร์พื้นที่กายภาพหนึ่งจุดใน 10 นาที',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);

  assert.deepEqual(payload.recommended_action.micro_steps, MESSY_PHYSICAL_ROOM_EXPECTED_STEPS);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(payload.recommended_action.title, /เก็บเสื้อผ้า 5 ชิ้น|เคลียร์เก้าอี้/u);
  assert.doesNotMatch([
    payload.recommended_action.title,
    payload.recommended_action.rationale,
    ...payload.recommended_action.micro_steps,
  ].join(' '), /ลูกค้า|client|customer|proposal|วางแผนจัดห้องทั้งหมด/u);
});

test('buildPayloadFromAiActionResponse allows customer wording when source is customer logo revision', () => {
  const task = makeTask({
    workflowType: 'client_response',
    sourceText: CUSTOMER_LOGO_REVISION_BRAINDUMP,
    taskFrame: {
      objective: 'ตอบลูกค้าเรื่องแก้งานโลโก้',
      stage: 'logo_revision',
      stakeholders: ['ลูกค้า'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'เปิด LINE แล้วจดรายการแก้โลโก้ 3 จุด: สี / ฟอนต์ / ขนาดโลโก้',
      rationale: 'ลูกค้าขอแก้สีหลักและอยากได้โลโก้ minimal กว่าเดิม',
      successSignal: 'ลูกค้ารู้ลำดับการแก้โลโก้',
    },
    alternatives: [],
    whyThisNow: 'ต้องตอบลูกค้าว่าจะเริ่มแก้จากจุดไหนก่อน',
    situationSummary: 'ลูกค้าขอแก้งานโลโก้ สีหลักยังไม่ตรงแบรนด์',
    starterMicroSteps: [
      'สรุป feedback โลโก้เรื่องสีหลักและแบรนด์',
      'ร่างข้อความตอบลูกค้าว่าจะเริ่มจากสีหลัก',
      'ตรวจว่าไม่รับแก้ scope เกิน feedback',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: [],
    workContext: 'ลูกค้าขอแก้งานโลโก้ สีหลักยังไม่ตรงแบรนด์ และอยากได้ตัวเลือก minimal',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);
  const combined = [
    payload.situation_summary,
    payload.recommended_action.title,
    payload.recommended_action.rationale,
    ...payload.recommended_action.micro_steps,
  ].join(' ');

  assert.match(combined, /ลูกค้า/);
  assert.match(combined, /โลโก้|สีหลัก|แบรนด์|minimal/u);
});

test('buildPayloadFromAiActionResponse advances completed logo context to reply drafting', () => {
  const completedLogoContext = [
    CUSTOMER_LOGO_REVISION_BRAINDUMP,
    COMPLETED_CONTEXT_REUSE_HANDOFF,
    'อัปเดตล่าสุด: ทำก้าวแรกเสร็จแล้ว แต่ยังไม่แน่ใจว่าควรทำอะไรต่อดี',
  ].join('\n\n');
  const task = makeTask({
    workflowType: 'client_response',
    sourceText: completedLogoContext,
    taskFrame: {
      objective: 'ตอบลูกค้าเรื่องแก้งานโลโก้',
      stage: 'logo_revision',
      stakeholders: ['ลูกค้า'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'เปิด LINE แล้วจดรายการแก้โลโก้ 3 จุด: สี / ฟอนต์ / ขนาดโลโก้',
      rationale: 'รวมจุดที่ต้องแก้ให้อยู่ที่เดียวกันก่อน จะได้ไม่ตกหล่น',
      successSignal: 'ได้รายการแก้โลโก้ 3 จุดที่ชัดเจน',
    },
    alternatives: [],
    whyThisNow: 'ลูกค้าขอแก้งานผ่าน LINE ที่กระจัดกระจาย การจดออกมาก่อนจะช่วยให้เริ่มทำทีละจุดได้ง่ายขึ้น',
    situationSummary: 'ลูกค้าขอแก้งานโลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้) ข้อมูลอยู่กระจายใน LINE ยังไม่ตอบลูกค้า',
    starterMicroSteps: [
      'เปิด LINE หาข้อความที่ลูกค้าบรีฟเรื่องโลโก้',
      'จดรายการแก้สี ฟอนต์ และขนาดโลโก้ลง Notes',
      'เช็กให้ชัวร์ว่ามีแค่ 3 จุดนี้',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'send_reply_now',
    missingInputs: [],
    workContext: 'ลูกค้าขอแก้งานโลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้) ข้อมูลอยู่กระจายใน LINE ยังไม่ตอบลูกค้า',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);

  assert.equal(
    payload.recommended_action.title,
    'ร่างคำตอบลูกค้า 3 บรรทัดจากรายการแก้สี ฟอนต์ และขนาดโลโก้',
  );
  assert.equal(
    payload.situation_summary,
    'จดรายการแก้โลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้) เรียบร้อยแล้ว',
  );
  assert.deepEqual(payload.recommended_action.micro_steps, [
    'เรียบเรียง 3 จุดที่จดไว้เป็นประโยคตอบกลับ',
    'ตรวจทานความถูกต้องก่อนส่งให้ลูกค้า',
    'กดส่งข้อความทาง LINE',
  ]);
});

test('buildPayloadFromAiActionResponse grounds student report without customer framing', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: STUDENT_REPORT_BRAINDUMP,
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ร่างข้อความแนะนำวิธีเริ่มเขียนบทนำรายงาน renewable energy storage',
      rationale: 'ช่วยให้เริ่มต้นงานได้ภายในเวลาที่กำหนด',
      successSignal: 'ได้แนวทางเริ่มรายงาน',
    },
    alternatives: [],
    whyThisNow: 'ต้องส่งรายงานพรุ่งนี้',
    situationSummary: 'ต้องเริ่มรายงานจาก reference links ในแชท',
    starterMicroSteps: ['สรุป แชท/10 นาที เป็น 3 บรรทัด', 'จดสถานะล่าสุดของแต่ละรายการ', 'ร่างข้อความตอบลูกค้า'],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: ['reference link แรกที่ใช้เริ่มบทนำรายงาน'],
    workContext: 'ต้องเริ่มรายงานวิชาวิศวะหัวข้อ renewable energy storage จาก reference links ในแชท โดยเริ่มบทนำให้ได้ใน 10 นาที',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);
  const combined = [payload.situation_summary, payload.recommended_action.title, ...payload.recommended_action.micro_steps].join(' ');

  assert.deepEqual(payload.recommended_action.micro_steps, STUDENT_REPORT_EXPECTED_STEPS);
  assert.match(combined, /รายงาน|renewable energy storage|reference link|บทนำ|10 นาที/u);
  assert.doesNotMatch(combined, /ลูกค้า|client|customer|บริษัท|หัวหน้า|เงิน|หมอ/iu);
});

test('buildPayloadFromAiActionResponse grounds product post without customer framing', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    sourceText: PRODUCT_POST_BRAINDUMP,
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'เสนอ caption ตัวอย่างสำหรับกระเป๋าผ้า canvas',
      rationale: 'ลูกค้าต้องการ caption สำหรับสินค้าใหม่',
      successSignal: 'ได้ caption',
    },
    alternatives: [],
    whyThisNow: 'ต้องโพสต์สินค้าใหม่คืนนี้',
    situationSummary: 'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์',
    starterMicroSteps: ['สรุป แชท/แชต เป็น 3 บรรทัด', 'จดสถานะล่าสุดของแต่ละรายการ', 'ร่างข้อความตอบลูกค้า'],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_resume', response, [], {
    deliverableType: 'execution',
    immediateNeed: 'resume_execution',
    missingInputs: ['caption สินค้าที่เริ่มจากจุดขายพร้อมใช้'],
    workContext: 'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas มีรูปแล้ว จุดขายคือเบา ซักง่าย และมี 3 สี',
    behaviorIntent: 'admin_task',
    confidence: 0.88,
  }, task);
  const combined = [payload.situation_summary, payload.recommended_action.title, ...payload.recommended_action.micro_steps].join(' ');

  assert.deepEqual(payload.recommended_action.micro_steps, PRODUCT_POST_EXPECTED_STEPS);
  assert.match(combined, /โพสต์สินค้า|ร้านออนไลน์|กระเป๋าผ้า canvas|caption|เบา|ซักง่าย|3 สี/u);
  assert.doesNotMatch(combined, /ลูกค้า|client|customer|บริษัท|หัวหน้า|เงิน|หมอ/iu);
});

test('buildPayloadFromAiActionResponse rejects generic multi-item payment API starter steps', () => {
  const task = makeTask({
    sourceText: PAYMENT_API_BRAINDUMP,
    taskFrame: {
      objective: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
      stage: 'triage',
      stakeholders: ['ABC Corp', 'CS'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ร่างข้อความตอบ ABC Corp ว่าขอเวลาตรวจสอบ Payment API timeout',
      rationale: 'ต้องตอบ ABC Corp/CS โดยไม่เดาสถานะก่อนเช็ก Dashboard',
      successSignal: 'มีข้อความตอบกลับที่อิงสถานะล่าสุด',
    },
    alternatives: [],
    whyThisNow: 'ABC Corp และ CS รอคำตอบเรื่อง payment API timeout',
    situationSummary: 'ABC Corp มี payment API timeout และยังไม่ได้เปิด Dashboard',
    starterMicroSteps: [
      'แยกงานค้างของ ABC Corp เป็นรายการสั้น',
      'จดสถานะล่าสุดของแต่ละรายการ',
      'ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลา',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: ['สถานะล่าสุดจาก Dashboard'],
    workContext: 'ABC Corp รอคำตอบเรื่อง payment API timeout และ CS ต้องตอบลูกค้า',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);

  assert.deepEqual(payload.recommended_action.micro_steps, PAYMENT_API_EXPECTED_STEPS);
  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /แยกงานค้าง|แต่ละรายการ/u);
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
  // First step should now use the updated neutral copy
  assert.match(payload.recommended_action.micro_steps[0], /ดูข้อมูลที่คุณมีตอนนี้เกี่ยวกับ/);
});

test('buildBootstrapMicroSteps uses neutral copy (P0 change)', () => {
  const steps = buildBootstrapMicroSteps({
    title: 'ตอบลูกค้า ABC Corp',
    successSignal: 'ลูกค้ารู้แผน',
  });

  assert.equal(steps.length, 3);
  assert.match(steps[0], /ดูข้อมูลที่คุณมีตอนนี้เกี่ยวกับ/);
  assert.doesNotMatch(steps[0], /เปิดบริบทหรือไฟล์/);
});

test('buildPayloadFromAiActionResponse grounds ABC Corp mixed overload into work-artifact steps', () => {
  const task = makeTask({
    sourceText: [
      'ABC Corp ทวงงานค้าง 2 ตัวในแชต',
      'prod ล่ม 9 โมงจาก CPU spike ยังไม่มี RCA',
      'งานค้างคือ Dashboard mockup กับ payment API',
      'ผมหิว สมองตื้อ ไม่รู้ควรเริ่มจากอะไร',
    ].join('\n'),
    taskFrame: {
      objective: 'เช็กว่าต้องเติมอะไรก่อน แล้วเลือกก้าวงานที่เล็กที่สุด',
      stage: 'clarified',
      stakeholders: ['ABC Corp'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'เช็กว่าต้องเติมอะไรก่อน แล้วเลือกก้าวงานที่เล็กที่สุด',
      rationale: 'ลดความเสี่ยงก่อนตอบลูกค้า',
      successSignal: 'มี status ที่ตอบต่อได้',
    },
    alternatives: [],
    whyThisNow: 'ABC Corp รออยู่และ prod ยังไม่ปิด incident',
    situationSummary: 'ABC Corp, prod, Dashboard และ payment API ยังต้องจัดสถานะ',
    starterMicroSteps: [
      'พักหายใจ 2 นาทีแล้วกลับมาเรื่อง ABC Corp',
      'เปิดแค่หน้าจอเดียวที่เกี่ยวกับ ABC Corp / Dashboard',
      'ทำก้าวเล็กชิ้นเดียวของ "เช็กว่าต้องเติมอะไรก่อน แล้วเลือกก้าวงานที่เล็กที่สุด" ให้จบก่อน',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'unknown',
    immediateNeed: 'resume_execution',
    missingInputs: [],
    workContext: 'มีลูกค้า ABC Corp ทวงงานพร้อม incident และผู้ใช้หิว/สมองตื้อ',
    behaviorIntent: 'personal_friction',
    confidence: 0.8,
  }, task);
  const steps = payload.recommended_action.micro_steps;

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(steps[0], /prod|CPU spike|incident/);
  assert.doesNotMatch(steps[0], /พักหายใจ|เติมอะไรที่สุด/);
  assert.match(steps[2], /ร่างข้อความ|status note|สรุป/);
  assert.match(steps.join(' '), /ABC Corp/);
});

test('buildPayloadFromAiActionResponse uses clarification anchors for grounded fallback steps', () => {
  const task = makeTask({
    sourceText: [
      'ABC Corp ทวงงานค้าง 2 ตัวในแชต',
      'โปรดักชันล่มตั้งแต่เช้า แต่ยังไม่รู้สถานะล่าสุด',
      'ผมหิวและตื้อ ไม่รู้เริ่มตรงไหน',
    ].join('\n'),
    pendingInputs: [
      {
        kind: 'clarification',
        prompt: 'งานค้างคืออะไร',
        answer: 'Dashboard เหลือ KPI/table และ payment API ยังไม่ deploy ต้องเช็ก response กับ backend',
        createdAt: 1,
      },
    ],
    taskFrame: {
      objective: 'เลือกก้าวตอบ ABC Corp ให้ปลอดภัย',
      stage: 'clarified',
      stakeholders: ['ABC Corp'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ร่างข้อความอัปเดต ABC Corp',
      rationale: 'ต้องตอบแบบไม่ commit เวลา',
      successSignal: 'มีข้อความตอบกลับ',
    },
    alternatives: [],
    whyThisNow: 'ABC Corp รอในแชต',
    situationSummary: 'ABC Corp รอคำตอบหลัง prod ล่ม',
    starterMicroSteps: ['พักก่อน 2 นาที', 'เปิดหน้าจอเดียว', 'ทำก้าวเล็กชิ้นเดียวของ "ร่างข้อความอัปเดต ABC Corp"'],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'estimate',
    immediateNeed: 'resume_execution',
    missingInputs: ['ขอบเขต/รายการหัวข้อสำหรับพรีเซนต์', 'กรอบเวลาที่ต้อง estimate'],
    workContext: 'ABC Corp รอคำตอบและ prod ยังไม่ชัด',
    behaviorIntent: 'personal_friction',
    confidence: 0.76,
  }, task);
  const steps = payload.recommended_action.micro_steps.join(' ');

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(steps, /Dashboard/);
  assert.match(steps, /payment API/);
  assert.doesNotMatch(steps, /scope proposal|estimate\/timeline/);
});

test('buildPayloadFromAiActionResponse grounds non-ABC customer incident without overfitting', () => {
  const task = makeTask({
    sourceText: [
      'Zenith Bank ถามในแชตเรื่อง release เย็นนี้',
      'payment webhook timeout จาก provider ภายนอก',
      'QA รอคำตอบว่า release จะเลื่อนหรือไม่',
    ].join('\n'),
    taskFrame: {
      objective: 'ตอบสถานะ release ให้ปลอดภัย',
      stage: 'triage',
      stakeholders: ['Zenith Bank', 'QA'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบสถานะ release ให้ปลอดภัย',
      rationale: 'ลดความเสี่ยงจาก incident',
      successSignal: 'มีข้อความสถานะที่ส่งได้',
    },
    alternatives: [],
    whyThisNow: 'ลูกค้ากับ QA กำลังรอคำตอบ',
    situationSummary: 'Zenith Bank และ QA รอเรื่อง release/webhook',
    starterMicroSteps: ['พักก่อน 2 นาที', 'เปิดหน้าจอเดียว', 'ทำก้าวเล็กชิ้นเดียวของ "ตอบสถานะ release ให้ปลอดภัย"'],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: [],
    workContext: 'Zenith Bank รอสถานะ release และ payment webhook ยัง timeout',
    behaviorIntent: 'client_delivery',
    confidence: 0.86,
  }, task);
  const steps = payload.recommended_action.micro_steps.join(' ');

  assert.match(steps, /Zenith Bank|webhook|release/);
  assert.doesNotMatch(steps, /ABC Corp/);
});

test('buildPayloadFromAiActionResponse grounds proposal room to proposal-specific artifacts', () => {
  const task = makeTask({
    workflowType: 'client_response',
    sourceText: 'ช่วยทำ proposal ระบบ AI ในร้านค้าส่ง ข้อมูล scope กระจัดกระจาย ยังไม่มี estimate หรือ timeline',
    taskFrame: {
      objective: 'เริ่ม proposal โดยไม่เดา scope เกินจริง',
      stage: 'define_scope',
      stakeholders: ['client'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'รวบ scope proposal ก่อน estimate',
      rationale: 'ต้องล็อกข้อมูลก่อนประเมินราคา',
      successSignal: 'มี scope และคำถามที่ต้องถามกลับ',
    },
    alternatives: [],
    whyThisNow: 'proposal ยังขาด scope estimate timeline',
    situationSummary: 'ลูกค้าขอ proposal ระบบ AI ร้านค้าส่งแต่ scope ยังไม่ชัด',
    starterMicroSteps: [
      'สรุปสถานะล่าสุดของ ลูกค้า เป็น 3 บรรทัด',
      'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
      'ร่างข้อความตอบ ลูกค้า แบบปลอดภัย',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'proposal',
    immediateNeed: 'define_scope',
    missingInputs: ['scope', 'estimate', 'timeline'],
    workContext: 'proposal ระบบ AI ร้านค้าส่งยังขาด scope estimate และ timeline',
    behaviorIntent: 'client_delivery',
    confidence: 0.86,
  }, task);
  const steps = payload.recommended_action.micro_steps.join(' ');

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(steps, /proposal|scope|estimate|timeline|ระบบ AI ร้านค้าส่ง/);
  assert.doesNotMatch(steps, /สรุปสถานะล่าสุดของ ลูกค้า|ร่างข้อความตอบ ลูกค้า/);
});

test('buildPayloadFromAiActionResponse grounds release room to QA/webhook/Jira artifacts', () => {
  const task = makeTask({
    sourceText: 'QA รอคำตอบว่าจะเลื่อน release ไหม payment webhook fail เพราะ provider timeout ผู้จัดการขอ update ใน 30 นาที ยังไม่กล้าเปิด Jira',
    taskFrame: {
      objective: 'ตอบสถานะ release โดยไม่ยืนยันเกินจริง',
      stage: 'triage',
      stakeholders: ['QA', 'ผู้จัดการ'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบสถานะ release โดยไม่ยืนยันเกินจริง',
      rationale: 'ต้องกันความเสี่ยงจาก webhook และ Jira',
      successSignal: 'มี update ที่ส่งผู้จัดการได้',
    },
    alternatives: [],
    whyThisNow: 'QA และผู้จัดการรอ update',
    situationSummary: 'release ติด payment webhook/provider timeout และ Jira ยังไม่เปิด',
    starterMicroSteps: [
      'สรุปสถานะล่าสุดของ ลูกค้า เป็น 3 บรรทัด',
      'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
      'ร่างข้อความตอบ ลูกค้า แบบปลอดภัย',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: [],
    workContext: 'QA รอ release และ payment webhook fail จาก provider timeout ต้องเช็ก Jira',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);
  const steps = payload.recommended_action.micro_steps.join(' ');

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.match(steps, /QA|release|payment webhook|provider timeout|Jira/);
  assert.match(steps, /ร่าง update/);
  assert.doesNotMatch(steps, /ลูกค้า แบบปลอดภัย/);
});

test('buildBootstrapMicroSteps grounds mixed overload work into artifacts', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'เลือกก้าวเล็กที่สุดก่อน',
      successSignal: 'มี checkpoint งานแรก',
    },
    {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'หิวและเหนื่อย แต่มีรายงานสรุปรายสัปดาห์กับตรวจสเปกเว็บใหม่ค้างอยู่',
      behaviorIntent: 'personal_friction',
      confidence: 0.8,
    },
    makeTask({
      sourceText: 'หิวมาก เหนื่อย งานเยอะ ทั้งรายงานสรุปรายสัปดาห์ ทั้งตรวจสเปกเว็บใหม่',
    }),
  );

  assert.equal(steps.length, 3);
  assert.match(steps.join(' '), /รายงานสรุปรายสัปดาห์|สเปกเว็บ/);
  assert.match(steps.join(' '), /checklist|checkpoint|แยก/);
  assert.doesNotMatch(steps[0], /กิน|พัก|เติมพลัง/);
});

test('buildBootstrapMicroSteps keeps gentle generic fallback for overload-only context', () => {
  const steps = buildBootstrapMicroSteps(
    {
      title: 'เลือกก้าวเล็กที่เริ่มได้',
      successSignal: 'เริ่มได้หนึ่งก้าว',
    },
    {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'หิวและสมองตื้อ ยังไม่มีบริบทงานเฉพาะ',
      behaviorIntent: 'personal_friction',
      confidence: 0.7,
    },
    makeTask({ sourceText: 'ผมหิวมาก สมองตื้อ ไม่รู้จะเริ่มอะไรดี' }),
  );

  assert.equal(steps.length, 3);
  assert.match(steps.join(' '), /กิน|พัก|เติม|พลัง|ก้าวแรก/);
});

test('buildPayloadFromAiActionResponse rejects title echo starterMicroSteps to grounded fallback', () => {
  const task = makeTask({
    sourceText: 'ABC Corp ทวงงานในแชต prod incident ยังไม่มี RCA Dashboard กับ payment API ยังไม่ชัด',
    taskFrame: {
      objective: 'ตอบ ABC Corp แบบไม่ commit เวลา',
      stage: 'triage',
      stakeholders: ['ABC Corp'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'ตอบ ABC Corp แบบไม่ commit เวลา',
      rationale: 'ลูกค้ารอคำตอบ',
      successSignal: 'มีข้อความตอบกลับ',
    },
    alternatives: [],
    whyThisNow: 'ต้องลดความเสี่ยงจาก prod incident',
    situationSummary: 'ABC Corp รอคำตอบเรื่อง prod incident',
    starterMicroSteps: [
      'ทำก้าวเล็กชิ้นเดียวของ "ตอบ ABC Corp แบบไม่ commit เวลา"',
      'เปิดแค่หน้าจอเดียวที่เกี่ยวกับ ABC Corp',
      'เช็กผลว่าตอนนี้ตอบ ABC Corp แบบไม่ commit เวลา',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'reply',
    immediateNeed: 'send_reply_now',
    missingInputs: [],
    workContext: 'ABC Corp รอคำตอบเรื่อง prod incident',
    behaviorIntent: 'client_delivery',
    confidence: 0.9,
  }, task);

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /ทำก้าวเล็กชิ้นเดียวของ/);
});

test('buildPayloadFromAiActionResponse rejects customer-only generic fallback when stronger anchors exist', () => {
  const task = makeTask({
    sourceText: 'proposal ระบบ AI ร้านค้าส่ง ยังขาด scope estimate timeline',
    taskFrame: {
      objective: 'เริ่ม proposal',
      stage: 'define_scope',
      stakeholders: ['client'],
    },
  });
  const response: AiActionResponse = {
    chosenAction: {
      title: 'เริ่ม proposal',
      rationale: 'ต้องล็อก scope',
      successSignal: 'มี scope checklist',
    },
    alternatives: [],
    whyThisNow: 'proposal ยังไม่ชัด',
    situationSummary: 'proposal ระบบ AI ร้านค้าส่งยังขาด scope estimate timeline',
    starterMicroSteps: [
      'สรุปสถานะล่าสุดของ ลูกค้า เป็น 3 บรรทัด',
      'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
      'ร่างข้อความตอบ ลูกค้า แบบปลอดภัย',
    ],
    meta: { model: 'mock', usedRoomFiles: [], repairUsed: false },
  };

  const payload = buildPayloadFromAiActionResponse('client_response', response, [], {
    deliverableType: 'proposal',
    immediateNeed: 'define_scope',
    missingInputs: ['scope', 'estimate', 'timeline'],
    workContext: 'proposal ระบบ AI ร้านค้าส่ง',
    behaviorIntent: 'client_delivery',
    confidence: 0.86,
  }, task);

  assert.equal(payload.recommended_action.micro_steps_source, 'fallback');
  assert.doesNotMatch(payload.recommended_action.micro_steps.join(' '), /สรุปสถานะล่าสุดของ ลูกค้า|ร่างข้อความตอบ ลูกค้า/);
  assert.match(payload.recommended_action.micro_steps.join(' '), /proposal|scope|estimate|timeline|ระบบ AI ร้านค้าส่ง/);
});
