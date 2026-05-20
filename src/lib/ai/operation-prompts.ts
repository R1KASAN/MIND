import type { Action, TaskContext } from '@/lib/store/idb';
import type { AiActionNegotiationMode, AiReentryScope } from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';

function truncateText(value: string | undefined, maxChars: number) {
  if (!value) return 'ไม่มี';
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

function describeFiles(task: TaskContext) {
  const sourceFiles = task.sourceFiles ?? [];
  if (sourceFiles.length === 0) return 'ไม่มีไฟล์แนบ';
  const primarySourceId = task.sourcePreference?.primarySourceId;
  return sourceFiles
    .map((file) => {
      const tags: string[] = [file.kind, file.status];
      if (primarySourceId === `file:${file.id}`) tags.push('primary_source');
      return `- ${file.name} (${tags.join(', ')})`;
    })
    .join('\n');
}

function describePendingInputs(task: TaskContext) {
  const pendingInputs = task.pendingInputs ?? [];
  if (pendingInputs.length === 0) return 'ไม่มี';
  return pendingInputs
    .map((input) => `- ${input.kind}: ${input.answer}`)
    .join('\n');
}

function describeAction(action: Action | null | undefined) {
  if (!action) return 'ไม่มี action ปัจจุบัน';
  return [
    `title: ${action.title}`,
    `rationale: ${action.rationale}`,
    `micro_steps:`,
    ...action.microSteps.map((step, index) => `  ${index + 1}. ${step}`),
  ].join('\n');
}

function describeRescueAction(action: Action | null | undefined, currentStepIndex: number) {
  if (!action) return 'ไม่มี action ปัจจุบัน';
  const currentStep = action.microSteps[currentStepIndex] ?? action.microSteps[0] ?? action.title;
  const nextStep = action.microSteps[currentStepIndex + 1] ?? action.microSteps[1];
  return [
    `title: ${action.title}`,
    `currentStep: ${currentStep}`,
    `nextStep: ${nextStep ?? 'ไม่มี'}`,
  ].join('\n');
}

function countUnansweredPendingInputs(task: TaskContext) {
  return (task.pendingInputs ?? []).filter((input) => !input.answer.trim()).length;
}

function resolveActionPromptMode(task: TaskContext): 'propose' | 'ask' {
  const unansweredCount = countUnansweredPendingInputs(task);
  const confidence = task.taskShape?.confidence ?? 0.5;
  if (unansweredCount >= 2 || confidence < 0.4) return 'ask';
  return 'propose';
}

function describeBehaviorIntent(task: TaskContext) {
  if (task.taskShape?.behaviorIntent) return task.taskShape.behaviorIntent;
  if (task.taskShape?.deliverableType && task.taskShape.deliverableType !== 'unknown') return 'client_delivery';
  return 'admin_task';
}

function buildActionDecisionGuidance(task: TaskContext) {
  const unansweredCount = countUnansweredPendingInputs(task);
  const confidence = task.taskShape?.confidence ?? 0.5;
  const actionMode = resolveActionPromptMode(task);
  const askReasons: string[] = [];

  if (unansweredCount >= 2) askReasons.push(`unansweredPendingInputs=${unansweredCount}`);
  if (confidence < 0.4) askReasons.push(`taskShapeConfidence=${confidence}`);

  return [
    `actionMode: ${actionMode}`,
    `unansweredPendingInputs: ${unansweredCount}`,
    `taskShapeConfidence: ${task.taskShape?.confidence ?? 'ไม่ระบุ'}`,
    `behaviorIntent: ${describeBehaviorIntent(task)}`,
    actionMode === 'ask'
      ? `modeInstruction: ask exactly one focused clarifying question before proposing a detailed concrete action; reason=${askReasons.join(', ')}`
      : 'modeInstruction: propose one concrete 15-30 minute next action grounded in available evidence and constraints',
  ].join('\n');
}

export function buildOperationTaskContext(task: TaskContext) {
  const blockerSignals = task.blockerSignals ?? [];
  const rescueHistory = task.rescueHistory ?? [];
  const taskShape = task.taskShape
    ? [
        `deliverableType: ${task.taskShape.deliverableType}`,
        `immediateNeed: ${task.taskShape.immediateNeed}`,
        `behaviorIntent: ${describeBehaviorIntent(task)}`,
        `missingInputs: ${(task.taskShape.missingInputs ?? []).join(', ') || 'ไม่มี'}`,
        `workContext: ${task.taskShape.workContext}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';
  const taskFrame = task.taskFrame
    ? [
        `objective: ${task.taskFrame.objective}`,
        `stage: ${task.taskFrame.stage}`,
        `stakeholders: ${(task.taskFrame.stakeholders ?? []).join(', ') || 'ไม่มี'}`,
      ].join('\n')
    : 'ไม่มี';
  const currentPlan = task.currentPlan
    ? [
        `actionTitle: ${task.currentPlan.actionTitle}`,
        `successSignal: ${task.currentPlan.successSignal ?? 'ไม่มี'}`,
        `steps:`,
        ...(task.currentPlan.steps ?? []).map((step, index) => `  ${index + 1}. ${step.text}`),
      ].join('\n')
    : 'ไม่มี';
  const rescueHistoryText = rescueHistory.length > 0
    ? rescueHistory.map((entry) => `- ${entry.reason} -> ${entry.mode}`).join('\n')
    : 'ไม่มี';
  const constraints = task.constraints
    ? [
        `timeBudgetMin: ${task.constraints.timeBudgetMin ?? 'ไม่ระบุ'}`,
        `energyLevel: ${task.constraints.energyLevel ?? 'ไม่ระบุ'}`,
        `preferReplyFirst: ${task.constraints.preferReplyFirst ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `currentStepIndex: ${task.currentStepIndex}`,
    `assistantMode: ${task.assistantMode ?? 'none'}`,
    `lastAiOperation: ${task.lastAiOperation ?? 'none'}`,
    `sourceText:`,
    task.sourceText,
    '',
    `extractedText:`,
    task.extractedText || 'ไม่มี',
    '',
    `sourcePreference:`,
    task.sourcePreference?.primarySourceId
      ? `${task.sourcePreference.primarySourceId} (${task.sourcePreference.selectedBy ?? 'unknown'})`
      : 'ไม่มีไฟล์หลักที่ผู้ใช้เลือก',
    '',
    `sourceFiles:`,
    describeFiles(task),
    '',
    `pendingInputs:`,
    describePendingInputs(task),
    '',
    `blockerSignals:`,
    blockerSignals.length > 0 ? blockerSignals.join(', ') : 'ไม่มี',
    '',
    `taskShape:`,
    taskShape,
    '',
    `taskFrame:`,
    taskFrame,
    '',
    `currentPlan:`,
    currentPlan,
    '',
    `constraints:`,
    constraints,
    '',
    `rescueHistory:`,
    rescueHistoryText,
    '',
    `actionExplanation:`,
    task.actionExplanation || 'ไม่มี',
    '',
    `lastFailureReason: ${task.lastFailureReason ?? 'none'}`,
  ].join('\n');
}

export function buildActionTaskContext(task: TaskContext) {
  const blockerSignals = task.blockerSignals ?? [];
  const rescueHistory = task.rescueHistory ?? [];
  const taskShape = task.taskShape
    ? [
        `deliverableType: ${task.taskShape.deliverableType}`,
        `immediateNeed: ${task.taskShape.immediateNeed}`,
        `behaviorIntent: ${describeBehaviorIntent(task)}`,
        `missingInputs: ${(task.taskShape.missingInputs ?? []).join(', ') || 'ไม่มี'}`,
        `workContext: ${truncateText(task.taskShape.workContext, 180)}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';
  const taskFrame = task.taskFrame
    ? [
        `objective: ${truncateText(task.taskFrame.objective, 180)}`,
        `stage: ${truncateText(task.taskFrame.stage, 120)}`,
        `stakeholders: ${(task.taskFrame.stakeholders ?? []).join(', ') || 'ไม่มี'}`,
      ].join('\n')
    : 'ไม่มี';
  const currentPlan = task.currentPlan
    ? [
        `actionTitle: ${truncateText(task.currentPlan.actionTitle, 160)}`,
        `successSignal: ${truncateText(task.currentPlan.successSignal, 180)}`,
        `steps:`,
        ...(task.currentPlan.steps ?? [])
          .slice(0, 5)
          .map((step, index) => `  ${index + 1}. ${truncateText(step.text, 140)}`),
      ].join('\n')
    : 'ไม่มี';
  const rescueHistoryText = rescueHistory.length > 0
    ? rescueHistory.slice(-3).map((entry) => `- ${entry.reason} -> ${entry.mode}`).join('\n')
    : 'ไม่มี';
  const constraints = task.constraints
    ? [
        `timeBudgetMin: ${task.constraints.timeBudgetMin ?? 'ไม่ระบุ'}`,
        `energyLevel: ${task.constraints.energyLevel ?? 'ไม่ระบุ'}`,
        `preferReplyFirst: ${task.constraints.preferReplyFirst ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `currentStepIndex: ${task.currentStepIndex}`,
    `assistantMode: ${task.assistantMode ?? 'none'}`,
    `lastAiOperation: ${task.lastAiOperation ?? 'none'}`,
    `sourceText: ${truncateText(task.sourceText, 900)}`,
    `extractedText: ${truncateText(task.extractedText, 700)}`,
    `sourcePreference: ${task.sourcePreference?.primarySourceId ?? 'ไม่มีไฟล์หลักที่ผู้ใช้เลือก'}`,
    `sourceFiles: ${truncateText(describeFiles(task), 500)}`,
    `pendingInputs: ${truncateText(describePendingInputs(task), 320)}`,
    `blockerSignals: ${blockerSignals.length > 0 ? blockerSignals.join(', ') : 'ไม่มี'}`,
    '',
    `taskShape:`,
    taskShape,
    '',
    `taskFrame:`,
    taskFrame,
    '',
    `currentPlan:`,
    currentPlan,
    '',
    `constraints:`,
    constraints,
    '',
    `rescueHistory:`,
    rescueHistoryText,
    '',
    `actionExplanation: ${truncateText(task.actionExplanation, 260)}`,
    `lastFailureReason: ${task.lastFailureReason ?? 'none'}`,
  ].join('\n');
}

export const AI_OPERATION_REPAIR_PROMPT = `
คุณคือ repair layer ของ MIND สำหรับ operation-based AI routes

หน้าที่:
- ซ่อม output ที่ไม่ผ่าน contract ให้กลายเป็น JSON object เดียว
- ห้ามตอบเป็น markdown หรือคำอธิบาย
- รักษาความหมายของงานเดิมไว้
- ถ้าฟิลด์สำคัญหาย ให้เติมโดยอิงจาก task context และ invalid output เท่าที่จำเป็น
- ห้ามใช้ placeholder เช่น ..., TBD, TODO, <text>
`.trim();

export const INTAKE_SYSTEM_PROMPT = `
คุณคือ intake copilot ของ MIND

เป้าหมาย:
- classify input เป็น client_response หรือ client_resume
- extract task shape ของงานให้ตรงกับบริบทจริง
- สรุป room นี้ให้เร็ว
- สร้าง task frame
- หา blockers
- เสนอ candidate actions 1-3 แบบ
- ถ้าจำเป็นจริง ๆ ให้ถาม clarification ได้ 1 ข้อ

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- ห้าม markdown, code fence, หรือคำอธิบายก่อนหลัง JSON
- ใช้ภาษาไทยธุรกิจที่อ่านง่าย
- candidateActions ต้องไม่เกิน 3 รายการ
- roomDigest ต้องสรุปบริบทจริง ไม่ใช่ประโยคกว้าง
- taskShape ต้องสรุปว่ากำลังทำ deliverable อะไร และ immediate need ตอนนี้คืออะไร
- behaviorIntent ต้องเป็นหนึ่งใน personal_friction, client_delivery, admin_task และใช้เพื่อเลือก tone ไม่ใช่เพื่อแต่งบริบทใหม่
- ถ้าผู้ใช้กำลังเตรียม proposal, scope, requirement, timeline หรือ estimate ให้เอนเอียงไปทาง client_resume
- คำว่า "ลูกค้า" อย่างเดียวไม่พอจะจัดเป็น client_response
- จัดเป็น client_response เฉพาะเมื่อ user มี intent ชัดว่าจะตอบ ส่ง หรือถามกลับตอนนี้
- ถ้า input เป็นแรงเสียดทานส่วนตัว เช่น หิว ง่วง เหนื่อย ไม่มีสมาธิ แต่ยังต้องทำงาน ให้รักษาบริบทนั้นไว้ ห้ามแต่งเป็นงานลูกค้า โปรเจกต์ ไฟล์ หรือ requirement
- taskFrame ต้องตอบว่ากำลังทำอะไร อยู่ช่วงไหน และใครเกี่ยวข้อง
- blockers เป็นสิ่งที่ขัดการตอบหรือเริ่มงานจริง
- คืน taskShape รูปแบบนี้เสมอ:
  {
    "deliverableType": "reply | proposal | timeline | estimate | execution | unknown",
    "immediateNeed": "send_reply_now | define_scope | prepare_inputs | resume_execution",
    "behaviorIntent": "personal_friction | client_delivery | admin_task",
    "missingInputs": ["string"],
    "workContext": "string",
    "confidence": 0.0
  }
`.trim();

export const PUTER_INTAKE_SYSTEM_PROMPT = `
คุณคือ intake copilot ของ MIND
OUTPUT ONLY JSON.
ห้าม Markdown, ห้าม code fence, ห้ามคำอธิบาย, ห้ามข้อความก่อนหรือหลัง JSON object.

งาน:
- classify room เป็น client_response หรือ client_resume
- สรุป roomDigest และ taskFrame จากบริบทจริง
- คืน blockers, taskShape, candidateActions 1-3 รายการ
- ถ้าบริบทเป็นแรงเสียดทานส่วนตัว เช่น เหนื่อย หิว หมดแรง ให้รักษาความจริงนั้นไว้ ห้ามแต่งเป็นงานลูกค้าเอง

คืน JSON shape นี้เท่านั้น:
{
  "workflowType": "client_response",
  "roomDigest": "ลูกค้าถามเรื่อง timeline และ scope ของ proposal ต้องตอบกลับอย่างระวัง",
  "taskFrame": {
    "objective": "เตรียมคำตอบลูกค้าเรื่อง timeline และ scope",
    "stage": "มีบริบทพอเลือกก้าวแรก",
    "stakeholders": ["ลูกค้า"]
  },
  "blockers": [],
  "requiresClarification": false,
  "clarificationQuestion": null,
  "taskShape": {
    "deliverableType": "reply",
    "immediateNeed": "send_reply_now",
    "behaviorIntent": "client_delivery",
    "missingInputs": [],
    "workContext": "ต้องตอบลูกค้าโดยไม่รับ commitment เกิน scope",
    "confidence": 0.82
  },
  "candidateActions": [
    {
      "title": "ร่างคำตอบลูกค้าเรื่อง timeline แบบยังไม่ commit เกิน scope",
      "rationale": "ตอบได้เร็วและลดความเสี่ยงจากข้อมูลที่ยังไม่ชัด",
      "kind": "reply_first"
    }
  ],
  "meta": {"model": "puter", "usedRoomFiles": [], "repairUsed": false}
}
`.trim();

export const ACTION_SYSTEM_PROMPT = `
คุณคือ action copilot ของ MIND

เป้าหมาย:
- เลือก one next action ที่เหมาะที่สุดตอนนี้
- อธิบาย why-this-now
- เสนอ alternatives แบบสั้น
- ถ้าเป็น client_response ให้ช่วย draft ข้อความตอบกลับ
- ถ้าเป็น client_resume และ taskShape ชี้ว่าเป็น proposal/timeline/estimate ให้เน้นเริ่มงานจาก requirement, scope, assumptions หรือ input ที่ยังขาด
- สรุปสถานการณ์แบบกระชับ

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- one next action ต้องเป็นสิ่งที่ user ทำจบได้จริงใน 15-30 นาที
- alternatives ไม่เกิน 3
- ห้ามวางแผนกว้าง ๆ
- ถ้ามี evidence/context เพียงพอ ห้ามเริ่ม title ของ action ด้วยคำ meta กว้าง ๆ เช่น "เตรียม...", "วางแผน...", "ทบทวน..." ให้เลือกกริยาที่ลงมือจริง เช่น "ร่างอีเมลตอบกลับเรื่องงบประมาณ X" หรือ "เติมตัวเลข Y ลงในสไลด์"
- ถ้า actionMode = ask ให้ถามคำถามเดียวที่ unlock ก้าวต่อไปได้ แทนการ propose action ยาวหรือเดา deliverable เฉพาะเอง
- ถ้ามี missing inputs หลายรายการหรือความมั่นใจต่ำ ให้ถามข้อมูลที่ขาด 1 ข้อก่อน ห้าม hallucinate ก้าวเฉพาะที่ทำไม่ได้จากหลักฐานที่มี
- ถ้ามี blocker ให้ action จัดการ blocker ก่อน
- ถ้ามี candidate action ที่เหมาะ ให้ใช้เป็นฐาน ไม่ต้องเปลี่ยนทิศงานโดยไม่จำเป็น
- ก่อนเสนอทางออก ให้ situationSummary สะท้อนคำสำคัญจาก input ผู้ใช้ 1 ครั้ง เช่น "หิวข้าวแต่ต้องทำงาน", "หมดแรง", หรือวลีเฉพาะของ room นี้
- ห้ามให้คำแนะนำ productivity generic ถ้าไม่ได้ผูกกับสถานการณ์เฉพาะใน sourceText, taskShape หรือ evidence
- ถ้า taskShape.immediateNeed = define_scope ให้ action จัด requirement, scope, unknowns ก่อน timeline หรือราคา
- ถ้า taskShape.immediateNeed = prepare_inputs ให้ action รวบข้อมูลขั้นต่ำสำหรับ timeline หรือ estimate ก่อน
- ถ้า behaviorIntent = personal_friction ให้เสนอ action ที่จัดการสภาพผู้ใช้ก่อนแล้วค่อยพากลับไปทำงานก้าวเล็ก ห้ามแต่งบริบทลูกค้าหรือไฟล์ขึ้นมาเอง
- ถ้า behaviorIntent = admin_task ให้ใช้โทนเคลียร์ภาระ/งานแอดมิน ไม่ลากเข้า proposal หรือ client delivery เอง
- ถ้า behaviorIntent = client_delivery ให้รักษาบริบทงานลูกค้าหรือ deliverable จริงจาก room memory
- ห้าม default ไปที่ "สรุปข้อความลูกค้า" หรือ "ตอบลูกค้า" ถ้างานจริงเป็น proposal/resume task
- alternatives ต้องเป็นก้าวที่ concrete และเริ่มได้จริง ไม่ใช่ชื่อกว้าง ๆ เช่น "จัดการ blocker ที่มีอยู่" หรือ "สรุปข้อมูลที่มีอยู่"
- ถ้ามี negotiation mode ให้ปรับ action ตาม mode นั้นโดยยังยึด task เดิม
- ถ้ามี constraints เรื่องเวลาและพลังงาน ให้ใช้เป็นตัวกำหนดขนาดและน้ำหนักของ action
- smaller = ทำให้เริ่มง่ายขึ้น
- faster = ลด friction และเวลาเริ่ม
- safer = ลดความเสี่ยงหรือ commitment
- reply_first = ให้เอนเอียงไปทางตอบลูกค้าก่อน
- resume_first = ให้เอนเอียงไปทางเริ่มงานก่อน
- replyDraft ต้องเป็น null ถ้า task นี้ไม่ใช่ send_reply_now จริง
- whyThisNow และ situationSummary ต้องเป็นประโยคข้อความธรรมดา 1 บรรทัด ห้ามเป็น object, array, bullet list, หรือ JSON fragment
- starterMicroSteps ต้องมี 3 รายการเท่านั้น แต่ละรายการไม่เกิน 12 คำ ใช้ภาษาหลักเดียวกับ sourceText ผูกกับบริบทจริง ห้ามใช้ "เปิดไฟล์", "เปิดบริบท", "ทำก้าวหลักนี้ทันที", "จัดการงานนี้" ถ้าไม่มีไฟล์แนบห้ามอ้าง "ไฟล์" หรือ "เอกสาร"
- รูปแบบที่ต้องคืน:
  {
    "chosenAction": {
      "title": "string",
      "rationale": "string",
      "successSignal": "string"
    },
    "alternatives": [
      { "title": "string", "rationale": "string" }
    ],
    "whyThisNow": "string",
    "replyDraft": "string หรือ null",
    "situationSummary": "string",
    "starterMicroSteps": ["string", "string", "string"],
    "meta": {
      "model": "string",
      "usedRoomFiles": [],
      "repairUsed": false
    }
  }
`.trim();

export const PUTER_ACTION_SYSTEM_PROMPT = `
คุณคือ action copilot ของ MIND
OUTPUT ONLY JSON.
ห้าม Markdown, ห้าม code fence, ห้ามคำอธิบาย, ห้ามข้อความก่อนหรือหลัง JSON object.

งาน:
- เลือก one next action ที่ทำได้จริงใน 15-30 นาที
- ใช้ taskShape, room digest, preferredCandidate, constraints, evidence summary เท่านั้น
- ห้าม productivity generic และห้ามแต่งบริบทที่ source ไม่บอก
- ถ้าไม่ใช่ send_reply_now ให้ replyDraft เป็น null
- สร้าง starterMicroSteps 3 ก้าวเริ่มต้นที่ยึดจากบริบทจริงใน sourceText/evidence

กฎ starterMicroSteps:
- ต้องมี 3 รายการเท่านั้น
- แต่ละรายการไม่เกิน 12 คำ
- ใช้ภาษาหลักเดียวกับ sourceText ของผู้ใช้
- แต่ละก้าวต้องผูกกับบริบทจริง เช่น ชื่อคน ชื่อบริษัท ข้อมูลเฉพาะจาก brain dump
- ดี: "ตอบ ABC Corp ว่าขออัปเดตใน 20 นาที"
- ดี: "เช็ก CPU spike ช่วง 9 โมงก่อน"
- ห้าม: "เปิดไฟล์ที่เกี่ยวข้อง", "ทำก้าวหลักนี้ทันที", "จัดการงานนี้", "เปิดบริบท"
- ถ้าไม่มีไฟล์แนบ ห้ามอ้าง "ไฟล์" หรือ "เอกสาร"

คืน JSON shape นี้เท่านั้น:
{
  "chosenAction": {
    "title": "ร่างคำตอบลูกค้าเรื่อง timeline แบบยังไม่ commit เกิน scope",
    "rationale": "เป็นก้าวที่ตอบลูกค้าได้ทันทีและยังกันความเสี่ยงจาก scope ที่ไม่ชัด",
    "successSignal": "มีข้อความตอบกลับสั้นที่ส่งหรือปรับต่อได้"
  },
  "alternatives": [
    {
      "title": "แยกคำถามที่ต้องยืนยันก่อนตอบ timeline",
      "rationale": "ลดความเสี่ยงถ้ายังไม่มีข้อมูลพอ"
    }
  ],
  "whyThisNow": "ตอนนี้ลูกค้ารอคำตอบและมีบริบทพอร่างข้อความที่ไม่หลุด scope",
  "replyDraft": "ขอบคุณครับ ขอเช็ก scope ที่ยังไม่ชัดอีกจุดก่อนยืนยัน timeline แล้วจะส่งกรอบ pilot ที่ปลอดภัยให้ต่อครับ",
  "situationSummary": "ลูกค้าถามเรื่อง timeline และ scope จึงควรตอบแบบคุม commitment ก่อน",
  "starterMicroSteps": ["เปิดแชตลูกค้าล่าสุดเรื่อง timeline", "ร่างข้อความตอบกลับแบบยังไม่ commit scope", "ส่งหรือบันทึก draft ตอบกลับไว้"],
  "meta": {"model": "puter", "usedRoomFiles": [], "repairUsed": false}
}
`.trim();

export const SCAFFOLD_SYSTEM_PROMPT = `
คุณคือ scaffold copilot ของ MIND

เป้าหมาย:
- ทำ action ปัจจุบันให้เป็น living scaffold
- ย่อย step ปัจจุบันให้เล็กลง
- เรียงลำดับใหม่ได้ถ้าจำเป็น
- เสนอ shortcut ได้

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- planTitle ต้องเป็นชื่อแผนสั้น ๆ ที่สอดคล้องกับ action ปัจจุบัน
- steps ต้องมี 3-5 รายการ
- คืน steps ที่เป็นการลงมือทำได้จริง
- ถ้าโจทย์คือ "make it smaller" ให้ย่อย current step โดยไม่เปลี่ยนเป้าหมายงาน
- ห้ามแค่เติม prefix, รีไรต์คำเดิม, หรือเปลี่ยนถ้อยคำเล็กน้อยแล้วถือว่าย่อยแล้ว
- อย่างน้อยหนึ่ง visible step ต้องแตกออกเป็นงานย่อยใหม่ที่เริ่มทำได้ทันที
- ถ้า current step ยังกว้าง ให้แตกเชิงโครงสร้าง เช่น เก็บข้อมูล -> ตัดสินใจ -> ร่าง -> ส่ง/เช็ก
- ถ้า current step ขึ้นกับข้อมูลที่ยังขาด ให้แปลงเป็นก้าวที่ทำได้ตอนนี้ เช่น ระบุข้อมูลที่ขาด, เปิดไฟล์ต้นทาง, หรือร่างคำถามสั้น ๆ
- ห้ามคืน step ที่เป็น generic filler เช่น "คิดก่อน", "วางแผน", "ทบทวน"
`.trim();

export const RESCUE_SYSTEM_PROMPT = `
คุณคือ rescue copilot ของ MIND

เป้าหมาย:
- บอกให้ชัดว่า user ติดเพราะอะไร
- เลือก rescue mode เดียวที่เหมาะที่สุด
- เสนอแผนสั้น ๆ ที่เริ่มได้ทันที
- ถ้าต้องถามหรือ follow up ให้ร่างข้อความสั้น ๆ ได้

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- diagnosis.primaryReason ต้องเป็นหนึ่งใน:
  missing_context, dependency, unclear_scope, too_big, low_energy, unknown
- diagnosis.explanation = 1 ประโยคสั้น
- rescuePlan.mode ต้องเป็นหนึ่งใน:
  clarify, follow_up, shrink, switch_track, pause_cleanly
- rescuePlan.steps ต้องมี 2-3 รายการและสั้น
- ให้ยึด blockerSignals เป็นสัญญาณหลักก่อนเดาเอง
- diagnosis.explanation ต้อง mirror คำสำคัญจากบริบทผู้ใช้ก่อนวินิจฉัย ห้ามเริ่มจาก template ทั่วไปถ้า sourceText ชัดอยู่แล้ว
- ถ้าบริบทเป็นแรงเสียดทานส่วนตัว เช่น หิว ง่วง เหนื่อย หมดแรง หรือไม่มีสมาธิ ให้เลือก low_energy หรือ shrink/pause_cleanly ก่อน productivity plan ที่เพิ่มภาระ
- ถ้าไม่แน่ใจ ให้เลือกแผนที่ conservative และเริ่มง่ายที่สุด
- suggestedMessage เป็น null ได้ถ้าไม่จำเป็น
- คืน object นี้เท่านั้น:
  {
    "diagnosis": {
      "primaryReason": "missing_context | dependency | unclear_scope | too_big | low_energy | unknown",
      "explanation": "string"
    },
    "rescuePlan": {
      "mode": "clarify | follow_up | shrink | switch_track | pause_cleanly",
      "steps": ["string", "string"]
    },
    "suggestedMessage": "string หรือ null"
  }
`.trim();

export const PUTER_RESCUE_SYSTEM_PROMPT = `
คุณคือ rescue copilot ของ MIND
ตอบเป็น JSON object เดียวเท่านั้น ห้าม markdown/code fence
งาน: บอกว่าติดเพราะอะไร และให้ rescue plan สั้นที่เริ่มได้ทันที
schema:
{
  "diagnosis": {"primaryReason": "missing_context | dependency | unclear_scope | too_big | low_energy | unknown", "explanation": "string"},
  "rescuePlan": {"mode": "clarify | follow_up | shrink | switch_track | pause_cleanly", "steps": ["string", "string"]},
  "suggestedMessage": "string หรือ null",
  "meta": {"model": "puter", "usedRoomFiles": [], "repairUsed": false}
}
`.trim();

export const REENTRY_SYSTEM_PROMPT = `
คุณคือ reentry copilot ของ MIND

เป้าหมาย:
- ช่วย user กลับเข้าบริบทของงานเดิมอย่างรวดเร็ว
- ตัด noise ที่ไม่ต้องสนวันนี้
- เสนอ 1-3 next moves ที่คุ้มที่สุดตอนนี้
- ระบุว่าควรกลับไปหน้า ONE_ACTION, SCAFFOLD หรือ DUMP_ENTRY

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- topActions ต้องไม่เกิน 3
- resumeTarget ต้องเป็นหนึ่งใน: ONE_ACTION, SCAFFOLD, DUMP_ENTRY
- topActions ต้องอิงงานใน room นี้เท่านั้น
- ถ้างานยังค้างอยู่จริง ให้ prefer ONE_ACTION หรือ SCAFFOLD มากกว่า DUMP_ENTRY
- ใช้ reentryConstraints เพื่อให้ next moves สอดคล้องกับข้อจำกัดและคำถามที่ยังค้างอยู่ของ user
- ห้าม resurface รายการที่อยู่ใน resolvedConcerns เป็น concern อีกครั้ง
`.trim();

export function buildOperationRepairUserPrompt(
  operationName: string,
  taskContext: string,
  invalidOutput: string,
  failureDetail?: string,
) {
  const issuesBlock = failureDetail ? `\nContract problems to fix:\n- ${failureDetail}\n` : '';

  return `
Operation:
${operationName}

Task context:
${taskContext}

Invalid model output:
${invalidOutput}
${issuesBlock}

Repair this into exactly one valid JSON object for this operation.
Return only JSON.
`.trim();
}

export function buildIntakeUserPrompt(task: TaskContext) {
  return buildOperationTaskContext(task);
}

export function buildPuterIntakeUserPrompt(task: TaskContext) {
  const taskShape = task.taskShape
    ? [
        `deliverableType: ${task.taskShape.deliverableType}`,
        `immediateNeed: ${task.taskShape.immediateNeed}`,
        `behaviorIntent: ${describeBehaviorIntent(task)}`,
        `missingInputs: ${(task.taskShape.missingInputs ?? []).join(', ') || 'ไม่มี'}`,
        `workContext: ${truncateText(task.taskShape.workContext, 180)}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `sourceText: ${truncateText(task.sourceText, 650)}`,
    `extractedText: ${truncateText(task.extractedText, 300)}`,
    `sourceFiles: ${truncateText(describeFiles(task), 260)}`,
    `pendingInputs: ${truncateText(describePendingInputs(task), 180)}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    '',
    `taskShape:`,
    taskShape,
    '',
    'Return valid JSON only.',
  ].join('\n');
}

export function buildActionUserPrompt(
  task: TaskContext,
  preferredCandidate?: { title: string; rationale: string; kind: string } | null,
  negotiation?: { mode: AiActionNegotiationMode; userNote?: string } | null,
  evidenceContext?: ActionEvidenceContext | null,
) {
  return [
    buildActionTaskContext(task),
    '',
    'preferredCandidate:',
    preferredCandidate
      ? `- title: ${preferredCandidate.title}\n- rationale: ${preferredCandidate.rationale}\n- kind: ${preferredCandidate.kind}`
      : 'ไม่มี',
    '',
    'negotiation:',
    negotiation
      ? `- mode: ${negotiation.mode}\n- userNote: ${negotiation.userNote?.trim() || 'ไม่มี'}`
      : '- mode: default',
    '',
    'actionDecision:',
    buildActionDecisionGuidance(task),
    '',
    'actionConstraints:',
    `- timeBudgetMin: ${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}`,
    `- energyLevel: ${task.constraints?.energyLevel ?? 'ไม่ระบุ'}`,
    `- preferReplyFirst: ${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    '',
    'Retrieved evidence:',
    evidenceContext?.summaryText?.trim() || 'ไม่มี retrieved evidence เพิ่มเติม',
  ].join('\n');
}

export function buildPuterActionUserPrompt(
  task: TaskContext,
  preferredCandidate?: { title: string; rationale: string; kind: string } | null,
  negotiation?: { mode: AiActionNegotiationMode; userNote?: string } | null,
  evidenceContext?: ActionEvidenceContext | null,
) {
  const taskShape = task.taskShape
    ? [
        `deliverableType: ${task.taskShape.deliverableType}`,
        `immediateNeed: ${task.taskShape.immediateNeed}`,
        `behaviorIntent: ${describeBehaviorIntent(task)}`,
        `missingInputs: ${(task.taskShape.missingInputs ?? []).join(', ') || 'ไม่มี'}`,
        `workContext: ${truncateText(task.taskShape.workContext, 160)}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n')
    : 'ไม่มี';
  const taskFrame = task.taskFrame
    ? [
        `objective: ${truncateText(task.taskFrame.objective, 150)}`,
        `stage: ${truncateText(task.taskFrame.stage, 100)}`,
        `stakeholders: ${(task.taskFrame.stakeholders ?? []).join(', ') || 'ไม่มี'}`,
      ].join('\n')
    : 'ไม่มี';

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `sourceText: ${truncateText(task.sourceText, 520)}`,
    `extractedText: ${truncateText(task.extractedText, 220)}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}, preferReplyFirst=${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    '',
    'taskShape:',
    taskShape,
    '',
    'taskFrame:',
    taskFrame,
    '',
    'preferredCandidate:',
    preferredCandidate
      ? `title=${truncateText(preferredCandidate.title, 140)}; rationale=${truncateText(preferredCandidate.rationale, 180)}; kind=${preferredCandidate.kind}`
      : 'ไม่มี',
    '',
    'negotiation:',
    negotiation ? `mode=${negotiation.mode}; userNote=${truncateText(negotiation.userNote, 120)}` : 'mode=default',
    '',
    'evidenceSummary:',
    truncateText(evidenceContext?.summaryText, 320),
    '',
    'Return valid JSON only.',
  ].join('\n');
}

export function buildScaffoldUserPrompt(
  task: TaskContext,
  action: Action,
  currentStepIndex: number,
  strategy: 'default' | 'structural_retry' = 'default',
) {
  const currentStep = action.microSteps[currentStepIndex] ?? action.microSteps[0] ?? action.title;
  const latestRescue = task.rescueHistory[task.rescueHistory.length - 1];
  const currentPlanSteps = task.currentPlan?.steps.map((step) => step.text) ?? action.microSteps;
  const structuralRetryGuidance = strategy === 'structural_retry'
    ? [
        'retryMode: structural_retry',
        'retryInstruction: previous scaffold stayed too close to the old wording. this retry must materially change the visible current step or split it into a more actionable sequence.',
        'retryHint: if current step is still broad, split it by evidence -> decision -> draft -> send/check. if current step depends on missing info, convert it into a concrete clarification or file-opening move that the user can do now.',
      ]
    : ['retryMode: default'];

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}, preferReplyFirst=${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    `sourceText: ${truncateText(task.sourceText, 900)}`,
    `extractedText: ${truncateText(task.extractedText, 500)}`,
    `pendingInputs: ${truncateText(describePendingInputs(task), 220)}`,
    latestRescue ? `latestRescue: ${latestRescue.reason} -> ${latestRescue.mode}` : 'latestRescue: ไม่มี',
    '',
    'currentAction:',
    describeAction(action),
    '',
    'currentPlanSteps:',
    currentPlanSteps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    '',
    `currentStepIndex: ${currentStepIndex}`,
    `currentStep: ${currentStep}`,
    '',
    ...structuralRetryGuidance,
    '',
    'operationGoal: make the current step smaller without changing the main task',
  ].join('\n');
}

export function buildRescueUserPrompt(task: TaskContext, action: Action | null | undefined, currentStepIndex: number) {
  const latestRescue = task.rescueHistory[task.rescueHistory.length - 1];
  const taskFrame = task.taskFrame
    ? `objective=${truncateText(task.taskFrame.objective, 120)}; stage=${truncateText(task.taskFrame.stage, 80)}`
    : 'ไม่มี';
  const currentPlan = task.currentPlan
    ? `actionTitle=${truncateText(task.currentPlan.actionTitle, 120)}; successSignal=${truncateText(task.currentPlan.successSignal, 120)}`
    : 'ไม่มี';
  const extractedText = task.extractedText.trim();
  const pendingInputs = describePendingInputs(task);

  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `currentStepIndex: ${currentStepIndex}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}, preferReplyFirst=${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    `taskFrame: ${taskFrame}`,
    `currentPlan: ${currentPlan}`,
    `sourceText: ${truncateText(task.sourceText, 320)}`,
    extractedText ? `extractedText: ${truncateText(extractedText, 120)}` : 'extractedText: ไม่มี',
    pendingInputs !== 'ไม่มี' ? `pendingInputs: ${truncateText(pendingInputs, 120)}` : 'pendingInputs: ไม่มี',
    latestRescue ? `latestRescue: ${latestRescue.reason} -> ${latestRescue.mode}` : 'latestRescue: ไม่มี',
    '',
    'currentAction:',
    describeRescueAction(action, currentStepIndex),
    '',
    'operationGoal: diagnose why the user is stuck and return the best rescue mode as valid JSON only',
  ].join('\n');
}

export function buildPuterRescueUserPrompt(task: TaskContext, action: Action | null | undefined, currentStepIndex: number) {
  const latestRescue = task.rescueHistory[task.rescueHistory.length - 1];
  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `currentStepIndex: ${currentStepIndex}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}`,
    `sourceText: ${truncateText(task.sourceText, 320)}`,
    latestRescue ? `latestRescue: ${latestRescue.reason} -> ${latestRescue.mode}` : 'latestRescue: ไม่มี',
    '',
    'currentAction:',
    describeRescueAction(action, currentStepIndex),
    '',
    'Return valid JSON only.',
  ].join('\n');
}

function buildReentryConstraintBlock(task: TaskContext): string {
  const activeBlockers = task.blockerSignals.filter((s) => {
    const lower = s.toLowerCase();
    return !lower.includes('waiting') && !lower.includes('dependency');
  });

  const lastRescue = task.rescueHistory[task.rescueHistory.length - 1];

  const unresolvedInputs = task.pendingInputs.filter((p) => !p.answer.trim());
  const resolvedInputs = task.pendingInputs.filter((p) => Boolean(p.answer.trim()));

  const lines: string[] = [];

  if (activeBlockers.length > 0) {
    lines.push(`activeBlockers: ${activeBlockers.join(', ')}`);
  }
  if (lastRescue) {
    lines.push(`lastRescueReason: ${lastRescue.reason} → mode: ${lastRescue.mode}`);
  }
  if (unresolvedInputs.length > 0) {
    lines.push(`unresolvedQuestions: ${unresolvedInputs.map((p) => p.prompt || p.kind).join(' | ')}`);
  }
  if (resolvedInputs.length > 0) {
    lines.push(`resolvedConcerns: ${resolvedInputs.map((p) => p.kind).join(', ')} (do not resurface these)`);
  }

  return lines.length > 0 ? lines.join('\n') : 'ไม่มี';
}

export function buildReentryUserPrompt(
  task: TaskContext,
  action: Action | null | undefined,
  scope: AiReentryScope,
  roomMemoryContext?: string,
) {
  return [
    buildOperationTaskContext(task),
    '',
    'reentryConstraints:',
    buildReentryConstraintBlock(task),
    '',
    'currentAction:',
    describeAction(action),
    '',
    'roomMemoryContext:',
    roomMemoryContext?.trim() || 'ไม่มี retrieved room memory เพิ่มเติม',
    '',
    `scope: ${scope}`,
    '',
    'operationGoal: build a concise reentry brief with top next moves for this task only',
  ].join('\n');
}
