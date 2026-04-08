import type { Action, TaskContext } from '@/lib/store/idb';
import type { AiActionNegotiationMode, AiReentryScope } from '@/lib/ai/operations';

function truncateText(value: string | undefined, maxChars: number) {
  if (!value) return 'ไม่มี';
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

function describeFiles(task: TaskContext) {
  if (task.sourceFiles.length === 0) return 'ไม่มีไฟล์แนบ';
  return task.sourceFiles
    .map((file) => `- ${file.name} (${file.kind}, ${file.status})`)
    .join('\n');
}

function describePendingInputs(task: TaskContext) {
  if (task.pendingInputs.length === 0) return 'ไม่มี';
  return task.pendingInputs
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

export function buildOperationTaskContext(task: TaskContext) {
  const taskFrame = task.taskFrame
    ? [
        `objective: ${task.taskFrame.objective}`,
        `stage: ${task.taskFrame.stage}`,
        `stakeholders: ${task.taskFrame.stakeholders.join(', ') || 'ไม่มี'}`,
      ].join('\n')
    : 'ไม่มี';
  const currentPlan = task.currentPlan
    ? [
        `actionTitle: ${task.currentPlan.actionTitle}`,
        `successSignal: ${task.currentPlan.successSignal ?? 'ไม่มี'}`,
        `steps:`,
        ...task.currentPlan.steps.map((step, index) => `  ${index + 1}. ${step.text}`),
      ].join('\n')
    : 'ไม่มี';
  const rescueHistory = task.rescueHistory.length > 0
    ? task.rescueHistory.map((entry) => `- ${entry.reason} -> ${entry.mode}`).join('\n')
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
    `sourceFiles:`,
    describeFiles(task),
    '',
    `pendingInputs:`,
    describePendingInputs(task),
    '',
    `blockerSignals:`,
    task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี',
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
    rescueHistory,
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
- taskFrame ต้องตอบว่ากำลังทำอะไร อยู่ช่วงไหน และใครเกี่ยวข้อง
- blockers เป็นสิ่งที่ขัดการตอบหรือเริ่มงานจริง
`.trim();

export const ACTION_SYSTEM_PROMPT = `
คุณคือ action copilot ของ MIND

เป้าหมาย:
- เลือก one next action ที่เหมาะที่สุดตอนนี้
- อธิบาย why-this-now
- เสนอ alternatives แบบสั้น
- ถ้าเป็น client_response ให้ช่วย draft ข้อความตอบกลับ
- สรุปสถานการณ์แบบกระชับ

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- one next action ต้องเริ่มได้จริงภายในไม่กี่นาที
- alternatives ไม่เกิน 3
- ห้ามวางแผนกว้าง ๆ
- ถ้ามี blocker ให้ action จัดการ blocker ก่อน
- ถ้ามี candidate action ที่เหมาะ ให้ใช้เป็นฐาน ไม่ต้องเปลี่ยนทิศงานโดยไม่จำเป็น
- ถ้ามี negotiation mode ให้ปรับ action ตาม mode นั้นโดยยังยึด task เดิม
- ถ้ามี constraints เรื่องเวลาและพลังงาน ให้ใช้เป็นตัวกำหนดขนาดและน้ำหนักของ action
- smaller = ทำให้เริ่มง่ายขึ้น
- faster = ลด friction และเวลาเริ่ม
- safer = ลดความเสี่ยงหรือ commitment
- reply_first = ให้เอนเอียงไปทางตอบลูกค้าก่อน
- resume_first = ให้เอนเอียงไปทางเริ่มงานก่อน
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
- ห้ามคืน step ที่เป็น generic filler เช่น "คิดก่อน", "วางแผน", "ทบทวน"
`.trim();

export const RESCUE_SYSTEM_PROMPT = `
คุณคือ rescue copilot ของ MIND

เป้าหมาย:
- วินิจฉัยว่า user ติดเพราะอะไร
- เลือก rescue mode ที่เหมาะ
- เสนอ rescue plan ที่ทำได้จริง
- ถ้าเกี่ยวกับ dependency หรือ clarification ให้ร่างข้อความสั้น ๆ ได้

กฎ:
- ตอบเป็น JSON object เดียวเท่านั้น
- diagnosis.primaryReason ต้องเป็นหนึ่งใน:
  missing_context, dependency, unclear_scope, too_big, low_energy, unknown
- diagnosis.explanation ต้องอธิบายสาเหตุจริง 1-2 ประโยค
- rescuePlan.mode ต้องเป็นหนึ่งใน:
  clarify, follow_up, shrink, switch_track, pause_cleanly
- rescuePlan.steps ต้องมี 2-4 รายการ
- rescuePlan.steps ต้องพา user ขยับต่อได้จริง ไม่ใช่แค่ปลอบใจ
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
    'actionConstraints:',
    `- timeBudgetMin: ${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}`,
    `- energyLevel: ${task.constraints?.energyLevel ?? 'ไม่ระบุ'}`,
    `- preferReplyFirst: ${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
  ].join('\n');
}

export function buildScaffoldUserPrompt(task: TaskContext, action: Action, currentStepIndex: number) {
  const currentStep = action.microSteps[currentStepIndex] ?? action.microSteps[0] ?? action.title;
  const latestRescue = task.rescueHistory[task.rescueHistory.length - 1];
  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}, preferReplyFirst=${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    `sourceText: ${truncateText(task.sourceText, 900)}`,
    `extractedText: ${truncateText(task.extractedText, 500)}`,
    latestRescue ? `latestRescue: ${latestRescue.reason} -> ${latestRescue.mode}` : 'latestRescue: ไม่มี',
    '',
    'currentAction:',
    describeAction(action),
    '',
    `currentStepIndex: ${currentStepIndex}`,
    `currentStep: ${currentStep}`,
    '',
    'operationGoal: make the current step smaller without changing the main task',
  ].join('\n');
}

export function buildRescueUserPrompt(task: TaskContext, action: Action | null | undefined, currentStepIndex: number) {
  return [
    `workflowType: ${task.workflowType ?? 'unknown'}`,
    `lifecycleState: ${task.lifecycleState}`,
    `currentStepIndex: ${currentStepIndex}`,
    `blockerSignals: ${task.blockerSignals.length > 0 ? task.blockerSignals.join(', ') : 'ไม่มี'}`,
    `constraints: timeBudgetMin=${task.constraints?.timeBudgetMin ?? 'ไม่ระบุ'}, energyLevel=${task.constraints?.energyLevel ?? 'ไม่ระบุ'}, preferReplyFirst=${task.constraints?.preferReplyFirst ?? 'ไม่ระบุ'}`,
    `sourceText: ${truncateText(task.sourceText, 900)}`,
    `extractedText: ${truncateText(task.extractedText, 500)}`,
    `pendingInputs: ${truncateText(describePendingInputs(task), 400)}`,
    '',
    'currentAction:',
    describeAction(action),
    '',
    'operationGoal: diagnose why the user is stuck and return the best rescue mode',
  ].join('\n');
}

export function buildReentryUserPrompt(
  task: TaskContext,
  action: Action | null | undefined,
  scope: AiReentryScope,
) {
  return [
    buildOperationTaskContext(task),
    '',
    'currentAction:',
    describeAction(action),
    '',
    `scope: ${scope}`,
    '',
    'operationGoal: build a concise reentry brief with top next moves for this task only',
  ].join('\n');
}
