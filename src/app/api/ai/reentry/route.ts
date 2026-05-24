import type { Action, TaskContext } from '@/lib/store/idb';
import { AiReentryScopeSchema } from '@/lib/ai/operations';
import { parseAiReentryResponse } from '@/lib/ai/operation-contract';
import {
  AI_OPERATION_REPAIR_PROMPT,
  buildOperationRepairUserPrompt,
  buildOperationTaskContext,
  buildReentryUserPrompt,
  REENTRY_SYSTEM_PROMPT,
} from '@/lib/ai/operation-prompts';
import { runAiOperation, handleAiRouteError } from '@/lib/ai/operation-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReentryMemoryContextItem {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  reason?: unknown;
}

function compactMemoryField(value: unknown, maxChars: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildRoomMemoryContext(value: unknown) {
  if (!Array.isArray(value)) return '';

  return value
    .slice(0, 5)
    .map((item: ReentryMemoryContextItem, index) => {
      const title = compactMemoryField(item.title, 90) || compactMemoryField(item.id, 90) || `memory-${index + 1}`;
      const kind = compactMemoryField(item.kind, 40) || 'source';
      const status = compactMemoryField(item.status, 40) || 'unknown';
      const excerpt = compactMemoryField(item.excerpt, 260) || compactMemoryField(item.summary, 260);
      const reason = compactMemoryField(item.reason, 120);

      return [
        `- ${title} (${kind}, ${status})`,
        reason ? `  reason: ${reason}` : undefined,
        excerpt ? `  excerpt: ${excerpt}` : undefined,
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const task = body?.task as TaskContext | undefined;
  const action = body?.action as Action | undefined;
  const scopeParsed = AiReentryScopeSchema.safeParse(body?.scope ?? 'bounce_back');

  if (!task?.sourceText || typeof task.sourceText !== 'string' || !scopeParsed.success) {
    return Response.json({
      ok: false,
      error: {
        type: 'invalid_reentry_input',
        reason: 'unknown',
        message: 'ข้อมูลสำหรับ reentry ไม่ครบ',
        detail: 'task and scope are required',
        retryable: false,
      },
    }, { status: 400 });
  }

  const taskContext = buildOperationTaskContext(task);
  const fallbackCurrentStep = task.currentPlan?.steps[task.currentStepIndex]?.text ?? action?.microSteps?.[task.currentStepIndex];
  const fallbackResumeTarget =
    task.lifecycleState === 'in_scaffold' || task.currentStepIndex > 0
      ? 'SCAFFOLD'
      : task.lifecycleState === 'has_one_action'
        ? 'ONE_ACTION'
        : 'DUMP_ENTRY';
  const roomMemoryContext = buildRoomMemoryContext(body?.memoryContext);
  try {
    const aiResponse = await runAiOperation({
      operationName: 'reentry',
      systemPrompt: REENTRY_SYSTEM_PROMPT,
      repairPrompt: AI_OPERATION_REPAIR_PROMPT,
      userPrompt: buildReentryUserPrompt(task, action ?? null, scopeParsed.data, roomMemoryContext),
      buildRepairUserPrompt: (invalidOutput, failureDetail) =>
        buildOperationRepairUserPrompt('reentry', [
          taskContext,
          '',
          'roomMemoryContext:',
          roomMemoryContext || 'ไม่มี',
        ].join('\n'), invalidOutput, failureDetail),
      parse: (raw) => parseAiReentryResponse(raw, {
        task,
        fallbackRoomId: task.id,
        fallbackActionTitle: action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective,
        fallbackCurrentStep,
        fallbackResumeTarget,
      }),
      numPredict: 420,
    });
    return Response.json(aiResponse);
  } catch (error) {
    return handleAiRouteError(error);
  }
}
