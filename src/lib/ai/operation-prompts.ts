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
    actionMode === 'ask'
      ? `modeInstruction: ask exactly one focused clarifying question before proposing a detailed concrete action; reason=${askReasons.join(', ')}`
      : 'modeInstruction: propose one concrete 5-20 minute next action grounded in available evidence and constraints',
  ].join('\n');
}

export function buildOperationTaskContext(task: TaskContext) {
  const blockerSignals = task.blockerSignals ?? [];
  const rescueHistory = task.rescueHistory ?? [];
  const taskShape = task.taskShape
    ? [
        `deliverableType: ${task.taskShape.deliverableType}`,
        `immediateNeed: ${task.taskShape.immediateNeed}`,
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
- ถ้าผู้ใช้กำลังเตรียม proposal, scope, requirement, timeline หรือ estimate ให้เอนเอียงไปทาง client_resume
- คำว่า "ลูกค้า" อย่างเดียวไม่พอจะจัดเป็น client_response
- จัดเป็น client_response เฉพาะเมื่อ user มี intent ชัดว่าจะตอบ ส่ง หรือถามกลับตอนนี้
- taskFrame ต้องตอบว่ากำลังทำอะไร อยู่ช่วงไหน และใครเกี่ยวข้อง
- blockers เป็นสิ่งที่ขัดการตอบหรือเริ่มงานจริง
- คืน taskShape รูปแบบนี้เสมอ:
  {
    "deliverableType": "reply | proposal | timeline | estimate | execution | unknown",
    "immediateNeed": "send_reply_now | define_scope | prepare_inputs | resume_execution",
    "missingInputs": ["string"],
    "workContext": "string",
    "confidence": 0.0
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
- one next action ต้องเป็นสิ่งที่ user ทำจบได้จริงใน 5-20 นาที
- alternatives ไม่เกิน 3
- ห้ามวางแผนกว้าง ๆ
- ถ้ามี evidence/context เพียงพอ ห้ามเริ่ม title ของ action ด้วยคำ meta กว้าง ๆ เช่น "เตรียม...", "วางแผน...", "ทบทวน..." ให้เลือกกริยาที่ลงมือจริง เช่น "ร่างอีเมลตอบกลับเรื่องงบประมาณ X" หรือ "เติมตัวเลข Y ลงในสไลด์"
- ถ้า actionMode = ask ให้ถามคำถามเดียวที่ unlock ก้าวต่อไปได้ แทนการ propose action ยาวหรือเดา deliverable เฉพาะเอง
- ถ้ามี missing inputs หลายรายการหรือความมั่นใจต่ำ ให้ถามข้อมูลที่ขาด 1 ข้อก่อน ห้าม hallucinate ก้าวเฉพาะที่ทำไม่ได้จากหลักฐานที่มี
- ถ้ามี blocker ให้ action จัดการ blocker ก่อน
- ถ้ามี candidate action ที่เหมาะ ให้ใช้เป็นฐาน ไม่ต้องเปลี่ยนทิศงานโดยไม่จำเป็น
- ถ้า taskShape.immediateNeed = define_scope ให้ action จัด requirement, scope, unknowns ก่อน timeline หรือราคา
- ถ้า taskShape.immediateNeed = prepare_inputs ให้ action รวบข้อมูลขั้นต่ำสำหรับ timeline หรือ estimate ก่อน
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
    "meta": {
      "model": "string",
      "usedRoomFiles": [],
      "repairUsed": false
    }
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

export function buildActionUserPrompt(
  task: TaskContext,
  preferredCandidate?: { title: string; rationale: string; kind: string } | null,
  negotiation?: { mode: AiActionNegotiationMode; userNote?: string } | null,
  evidenceContext?: ActionEvidenceContext | null,
) {
  return [
    buildOperationTaskContext(task),
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
