import type { TaskContext } from '@/lib/store/idb';
import { parseAiIntakeResponse } from '@/lib/ai/operation-contract';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildIntakeUserPrompt,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  INTAKE_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { runAiOperation } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;

  if (!task?.sourceText || typeof task.sourceText !== 'string') {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_task',
        reason: 'unknown',
        message: 'task context ไม่ถูกต้อง',
        detail: 'sourceText is required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  const fallbackWorkflowType = task.workflowType ?? (
    /ลูกค้า|feedback|reply|ตอบ|email|chat/i.test(task.sourceText)
      ? 'client_response'
      : 'client_resume'
  );
  const fallbackRoomDigest = task.sourceText.trim().slice(0, 220) || 'สรุป room นี้จากบริบทที่มีอยู่';
  const fallbackObjective =
    task.taskFrame?.objective ||
    (fallbackWorkflowType === 'client_response'
      ? 'สรุปสิ่งที่ลูกค้าต้องการและเตรียมตอบกลับ'
      : 'สรุปสถานะของงานค้างและหาก้าวแรกที่เริ่มได้ทันที');
  const fallbackStage =
    task.taskFrame?.stage ||
    (fallbackWorkflowType === 'client_response'
      ? 'กำลังตีความ feedback หรือคำขอจากลูกค้า'
      : 'กำลังกลับเข้าบริบทของโปรเจกต์ที่ค้างอยู่');
  return runAiOperation({
    operationName: 'intake',
    systemPrompt: INTAKE_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildIntakeUserPrompt(task),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('intake', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiIntakeResponse(raw, {
      fallbackWorkflowType,
      fallbackRoomDigest,
      fallbackObjective,
      fallbackStage,
    }),
    numPredict: 360,
  });
}
