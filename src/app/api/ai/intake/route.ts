import { createTaskContext, type TaskContext } from '@/lib/store/idb';
import { parseAiIntakeResponse } from '@/lib/ai/operation-contract';
import {
  buildTaskFrameFallback,
  deriveTaskShapeFromText,
  inferWorkflowTypeFromTaskShape,
} from '@/lib/ai/task-shape';
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

type IntakeTaskRequest = Pick<TaskContext, 'sourceText'> & Partial<Pick<
  TaskContext,
  | 'workflowType'
  | 'taskShape'
  | 'taskFrame'
  | 'sourceFiles'
  | 'extractedText'
  | 'pendingInputs'
  | 'blockerSignals'
  | 'constraints'
  | 'assistantMode'
  | 'lastAiOperation'
>>;

function normalizeIntakeTaskRequest(task: IntakeTaskRequest): TaskContext {
  return {
    ...createTaskContext({
      sourceText: task.sourceText,
      workflowType: task.workflowType,
      taskShape: task.taskShape,
      sourceFiles: task.sourceFiles,
      extractedText: task.extractedText,
      pendingInputs: task.pendingInputs,
      blockerSignals: task.blockerSignals,
    }),
    taskFrame: task.taskFrame,
    constraints: task.constraints,
    assistantMode: task.assistantMode,
    lastAiOperation: task.lastAiOperation,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const taskInput = body?.task as IntakeTaskRequest | undefined;

  if (!taskInput?.sourceText || typeof taskInput.sourceText !== 'string') {
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

  const task = normalizeIntakeTaskRequest(taskInput);
  const taskContext = buildOperationTaskContext(task);
  const fallbackTaskShape = task.taskShape ?? deriveTaskShapeFromText(task.sourceText);
  const fallbackWorkflowType = task.workflowType ?? inferWorkflowTypeFromTaskShape(fallbackTaskShape);
  const fallbackTaskFrame = buildTaskFrameFallback(fallbackWorkflowType, fallbackTaskShape);
  const fallbackRoomDigest = task.sourceText.trim().slice(0, 220) || 'สรุป room นี้จากบริบทที่มีอยู่';
  const fallbackObjective = task.taskFrame?.objective ?? fallbackTaskFrame.objective;
  const fallbackStage = task.taskFrame?.stage ?? fallbackTaskFrame.stage;
  return runAiOperation({
    operationName: 'intake',
    systemPrompt: INTAKE_SYSTEM_PROMPT,
    repairPrompt: AI_OPERATION_REPAIR_PROMPT,
    userPrompt: buildIntakeUserPrompt(task),
    buildRepairUserPrompt: (invalidOutput, failureDetail) =>
      buildOperationRepairUserPrompt('intake', taskContext, invalidOutput, failureDetail),
    parse: (raw) => parseAiIntakeResponse(raw, {
      fallbackSourceText: task.sourceText,
      fallbackTaskShape,
      fallbackWorkflowType,
      fallbackRoomDigest,
      fallbackObjective,
      fallbackStage,
    }),
    numPredict: 360,
  });
}
