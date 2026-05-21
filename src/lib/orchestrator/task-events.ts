import {
  AiActionResponseSchema,
  type AiActionNegotiationMode,
  type AiActionResponse,
  AiIntakeResponseSchema,
  type AiIntakeResponse,
  type AiReentryResponse,
  AiReentryResponseSchema,
  type AiReentryScope,
  AiRescueResponseSchema,
  type AiRescueResponse,
  AiScaffoldResponseSchema,
  type AiScaffoldResponse,
} from '@/lib/ai/operations';
import { parseAiReentryResponse, parseAiRescueResponse } from '@/lib/ai/operation-contract';
import type { AiOpsFailureTelemetry } from '@/lib/ai/ai-ops-debug';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import { AiSynthesisResponseSchema } from '@/lib/ai/schema';
import { trackEvent } from '@/lib/instrumentation';
import { composeRoomSourceText } from '@/lib/room';
import { buildRoomDataSources, createMetadataRetrievalEngine, type RoomDataSource } from '@/lib/retrieval/room-data';
import {
  buildActionEvidenceContext,
  type ActionEvidenceContext,
} from '@/lib/orchestrator/evidence-context';
import {
  appendRoomMemoryEvent,
  buildRoomMemoryReplayContext,
  ensureRoomMemoryBackfilled,
  type RoomMemoryEvent,
  type RoomMemoryEventType,
  type RoomMemoryRef,
} from '@/lib/store/room-memory-db';
import type {
  Action,
  AiFailureReason,
  TaskContext,
} from '@/lib/store/idb';
import { buildSynthesisInput } from '@/lib/orchestrator/task-machine';

type IntakeRequestTask = Pick<TaskContext, 'sourceText'> & Partial<Pick<
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

export interface ActionRequestResult {
  actionResponse: AiActionResponse;
  evidenceContext: ActionEvidenceContext;
}

function sourceTextIsCanonicalMergedRoomText(task: TaskContext) {
  const normalizedSourceText = task.sourceText.trim();
  const canonicalFileContext = composeRoomSourceText('', task.extractedText, task.sourceFiles).trim();

  if (!canonicalFileContext) return true;
  if (normalizedSourceText === canonicalFileContext) return true;

  return normalizedSourceText.endsWith(`\n\n${canonicalFileContext}`);
}

function buildIntakeRequestTask(task: TaskContext): IntakeRequestTask {
  const requestTask: IntakeRequestTask = {
    sourceText: task.sourceText,
  };

  if (task.workflowType) requestTask.workflowType = task.workflowType;
  if (task.taskShape) requestTask.taskShape = task.taskShape;
  if (task.taskFrame) requestTask.taskFrame = task.taskFrame;
  if (task.pendingInputs && task.pendingInputs.length > 0) requestTask.pendingInputs = task.pendingInputs;
  if (task.blockerSignals && task.blockerSignals.length > 0) requestTask.blockerSignals = task.blockerSignals;
  if (task.constraints) requestTask.constraints = task.constraints;
  if (task.assistantMode) requestTask.assistantMode = task.assistantMode;
  if (task.lastAiOperation) requestTask.lastAiOperation = task.lastAiOperation;

  const hasFileContext = task.extractedText.trim().length > 0 || task.sourceFiles.length > 0;
  if (!hasFileContext) return requestTask;

  if (sourceTextIsCanonicalMergedRoomText(task)) return requestTask;

  if (task.extractedText.trim()) {
    requestTask.extractedText = task.extractedText;
  }
  if (task.sourceFiles.length > 0) {
    requestTask.sourceFiles = task.sourceFiles;
  }

  return requestTask;
}

export class SynthesisFailure extends Error {
  reason: AiFailureReason;
  actions: string[];
  retryable: boolean;
  operationName?: string;
  telemetry?: AiOpsFailureTelemetry;
  statusCode?: number;
  retryAttempted?: boolean;
  retrySucceeded?: boolean;

  constructor(
    reason: AiFailureReason,
    detail?: string,
    actions: string[] = [],
    retryable = true,
    operationName?: string,
    telemetry?: AiOpsFailureTelemetry,
  ) {
    super(detail || reason);
    this.name = 'SynthesisFailure';
    this.reason = reason;
    this.actions = actions;
    this.retryable = retryable;
    this.operationName = operationName;
    this.telemetry = telemetry;
  }
}

export function normalizeFailureReason(reason: unknown): AiFailureReason {
  if (
    reason === 'service_down' ||
    reason === 'model_missing' ||
    reason === 'runtime_boot_failed' ||
    reason === 'metal_init_failed' ||
    reason === 'request_timeout' ||
    reason === 'unknown'
  ) {
    return reason;
  }
  return 'unknown';
}

async function parseOperationResponse<T>(
  response: Response,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  fallbackMessage: string,
  operationName: string,
) {
  const responseBody = await response.json().catch(() => null);
  if (!response.ok || responseBody?.ok === false) {
    const reason = normalizeFailureReason(responseBody?.error?.reason);
    const detail =
      responseBody?.error?.detail ||
      responseBody?.error?.message ||
      fallbackMessage;
    const actions = Array.isArray(responseBody?.error?.actions) ? responseBody.error.actions : [];
    const retryable = typeof responseBody?.error?.retryable === 'boolean' ? responseBody.error.retryable : true;
    const telemetry = responseBody?.error?.telemetry && typeof responseBody.error.telemetry === 'object'
      ? {
          passType: typeof responseBody.error.telemetry.passType === 'string' ? responseBody.error.telemetry.passType : undefined,
          durationMs: typeof responseBody.error.telemetry.durationMs === 'number' ? responseBody.error.telemetry.durationMs : undefined,
          repairUsed: typeof responseBody.error.telemetry.repairUsed === 'boolean' ? responseBody.error.telemetry.repairUsed : undefined,
          model: typeof responseBody?.error?.model === 'string' ? responseBody.error.model : undefined,
        }
      : undefined;
    const failure = new SynthesisFailure(reason, detail, actions, retryable, operationName, telemetry);
    failure.statusCode = response.status;
    throw failure;
  }

  const parsed = schema.safeParse(responseBody);
  if (!parsed.success) {
    throw new SynthesisFailure('unknown', fallbackMessage, [], true, operationName, {
      passType: 'validation_failed',
    });
  }

  return parsed.data;
}

function waitForBackoff(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Rescue request aborted', 'AbortError'));
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException('Rescue request aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function getRescueRetryConfig() {
  const maxAttempts = Number(process.env.MIND_RESCUE_RETRY_MAX_ATTEMPTS || 3) || 3;
  const baseBackoffMs = Number(process.env.MIND_RESCUE_RETRY_BACKOFF_MS || 700) || 700;
  const timeoutBackoffMs = Number(process.env.MIND_RESCUE_TIMEOUT_BACKOFF_MS || 1400) || 1400;

  return {
    maxAttempts: Math.max(1, Math.min(3, maxAttempts)),
    baseBackoffMs: Math.max(100, baseBackoffMs),
    timeoutBackoffMs: Math.max(200, timeoutBackoffMs),
  };
}

function readFailureStatusCode(error: unknown) {
  if (error instanceof SynthesisFailure && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  if (error instanceof SynthesisFailure) {
    const match = error.message.match(/\((\d{3})\)/);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function shouldRetryRescueFailure(error: unknown) {
  if (error instanceof SynthesisFailure) {
    return error.reason === 'request_timeout' || readFailureStatusCode(error) === 503;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('fetch') || message.includes('network');
  }
  return false;
}

function resolveRescueRetryBackoffMs(attemptIndex: number, error: unknown) {
  const { baseBackoffMs, timeoutBackoffMs } = getRescueRetryConfig();
  const statusCode = readFailureStatusCode(error);
  const isTimeoutLike =
    (error instanceof SynthesisFailure && error.reason === 'request_timeout') ||
    statusCode === 503 ||
    (error instanceof TypeError);
  const baseDelay = isTimeoutLike ? timeoutBackoffMs : baseBackoffMs;

  return Math.min(baseDelay + attemptIndex * 500, baseDelay + 1000);
}

function makeRoomMemoryEventId(roomId: string, type: RoomMemoryEventType) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `room-memory:${roomId}:${type}:${crypto.randomUUID()}`;
  }
  return `room-memory:${roomId}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function roomMemoryRefsFromSources(sources: RoomDataSource[]): RoomMemoryRef[] {
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind ?? source.type,
    label: source.title,
    excerpt: source.excerpt,
  }));
}

async function safeAppendLiveRoomMemoryEvent(event: RoomMemoryEvent) {
  try {
    await appendRoomMemoryEvent(event);
  } catch {
    // Room memory must never block the primary lifecycle while Dexie is unavailable.
  }
}

async function safeAppendLiveSourceAddedEvents(
  task: TaskContext,
  refs: RoomMemoryRef[],
  sourceOperationId: string,
) {
  const roomId = task.roomId ?? task.id;
  for (const ref of refs) {
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'source_added',
      summary: `Source entered room: ${ref.label ?? ref.id}`,
      refs: [ref],
      payload: { sourceRef: ref },
      actor: 'system',
      intent: { kind: 'context_entered', reason: sourceOperationId, confidence: 'medium' },
      sourceOperationId,
      dedupeKey: `live:${roomId}:source_added:${ref.id}`,
    }));
  }
}

export async function recordTaskSourcesInRoomMemory(
  task: TaskContext,
  sourceOperationId = 'source_update',
): Promise<RoomMemoryRef[]> {
  const refs = roomMemoryRefsFromSources(buildRoomDataSources(task).filter((source) => source.status === 'ready'));
  await safeAppendLiveSourceAddedEvents(task, refs, sourceOperationId);
  return refs;
}

export async function recordCompletedCycleInRoomMemory(task: TaskContext) {
  const refs = roomMemoryRefsFromSources(buildRoomDataSources(task).filter((source) => source.status === 'ready'));
  await safeAppendLiveSourceAddedEvents(task, refs, 'cycle_completed');

  const summary =
    task.lastSynthesis?.situation_summary?.trim() ||
    task.lastStableSummary?.trim() ||
    task.currentPlan?.actionTitle?.trim() ||
    task.sourceText.replace(/\s+/g, ' ').trim().slice(0, 220);

  if (summary) {
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'summary_updated',
      summary,
      refs,
      payload: {
        summary,
        completedAt: Date.now(),
      },
      sourceOperationId: 'cycle_completed',
    }));
  }

  if (task.currentPlan?.actionTitle) {
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'plan_updated',
      summary: `Plan: ${task.currentPlan.actionTitle}`,
      refs,
      payload: {
        plan: task.currentPlan,
        completedAt: Date.now(),
      },
      intent: {
        kind: 'user_adjusted_plan',
        reason: 'cycle_completed',
        confidence: 'medium',
      },
      sourceOperationId: 'cycle_completed',
    }));
  }
}

function buildLiveRoomMemoryEvent(input: {
  task: TaskContext;
  type: RoomMemoryEventType;
  summary: string;
  refs?: RoomMemoryRef[];
  payload?: Record<string, unknown>;
  actor?: RoomMemoryEvent['actor'];
  intent?: RoomMemoryEvent['intent'];
  sourceOperationId?: string;
  dedupeKey?: string;
}): RoomMemoryEvent {
  const roomId = input.task.roomId ?? input.task.id;
  const createdAt = Date.now();
  return {
    id: makeRoomMemoryEventId(roomId, input.type),
    roomId,
    type: input.type,
    createdAt,
    actor: input.actor ?? 'ai',
    origin: 'live',
    summary: input.summary,
    refs: input.refs ?? [],
    payloadVersion: 1,
    sourceOperationId: input.sourceOperationId,
    dedupeKey: input.dedupeKey,
    intent: input.intent,
    payload: input.payload,
  };
}

export async function requestLegacySynthesis(task: TaskContext): Promise<AiSynthesisResponse> {
  const dump = buildSynthesisInput(task);
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dump }),
  });

  return parseOperationResponse(
    response,
    AiSynthesisResponseSchema,
    `AI สรุปไม่สำเร็จ (${response.status})`,
    'legacy_synthesis',
  );
}

export async function requestIntake(task: TaskContext): Promise<AiIntakeResponse> {
  const response = await fetch('/api/ai/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: buildIntakeRequestTask(task) }),
  });

  const intake = await parseOperationResponse(
    response,
    AiIntakeResponseSchema,
    `AI intake ไม่สำเร็จ (${response.status})`,
    'intake',
  );
  const refs = await recordTaskSourcesInRoomMemory(task, 'intake');
  await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
    task,
    type: 'summary_updated',
    summary: intake.roomDigest,
    refs,
    payload: { summary: intake.roomDigest },
    sourceOperationId: 'intake',
  }));
  if (intake.blockers.length > 0) {
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'blocker_updated',
      summary: `Current blockers: ${intake.blockers.join(', ')}`,
      refs,
      payload: { blockers: intake.blockers },
      intent: { kind: 'ai_detected_blocker', reason: intake.blockers.join(', '), confidence: 'medium' },
      sourceOperationId: 'intake',
    }));
  }
  return intake;
}

export async function requestAction(options: {
  task: TaskContext;
  preferredCandidate?: AiIntakeResponse['candidateActions'][number];
  negotiation?: { mode: AiActionNegotiationMode; userNote?: string };
}): Promise<ActionRequestResult> {
  const evidenceContext = await buildActionEvidenceContext(options);
  const response = await fetch('/api/ai/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, evidenceContext }),
  });

  const action = await parseOperationResponse(
    response,
    AiActionResponseSchema,
    `AI action ไม่สำเร็จ (${response.status})`,
    'action',
  );
  const refs = roomMemoryRefsFromSources(buildRoomDataSources(options.task).filter((source) => source.status === 'ready'));
  await safeAppendLiveSourceAddedEvents(options.task, refs, 'action');
  await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
    task: options.task,
    type: 'action_selected',
    summary: action.chosenAction.title,
    refs,
    payload: {
      action: {
        title: action.chosenAction.title,
        rationale: action.chosenAction.rationale,
        successSignal: action.chosenAction.successSignal,
      },
    },
    intent: {
      kind: options.negotiation ? 'user_selected_action' : 'ai_recommended_start',
      reason: options.negotiation?.userNote ?? action.chosenAction.rationale,
      confidence: 'medium',
    },
    sourceOperationId: 'action',
  }));
  if (action.situationSummary) {
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task: options.task,
      type: 'summary_updated',
      summary: action.situationSummary,
      refs,
      payload: { summary: action.situationSummary },
      sourceOperationId: 'action',
    }));
  }
  return { actionResponse: action, evidenceContext };
}

export async function requestScaffold(
  task: TaskContext,
  action: Action,
  currentStepIndex: number,
  options?: { strategy?: 'default' | 'structural_retry' },
): Promise<AiScaffoldResponse> {
  const response = await fetch('/api/ai/scaffold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, action, currentStepIndex, strategy: options?.strategy ?? 'default' }),
  });

  const scaffold = await parseOperationResponse(
    response,
    AiScaffoldResponseSchema,
    `AI scaffold ไม่สำเร็จ (${response.status})`,
    'scaffold',
  );
  const refs = roomMemoryRefsFromSources(buildRoomDataSources(task).filter((source) => source.status === 'ready'));
  await safeAppendLiveSourceAddedEvents(task, refs, 'scaffold');
  await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
    task,
    type: 'plan_updated',
    summary: `Plan: ${scaffold.planTitle}`,
    refs,
    payload: {
      plan: {
        actionTitle: scaffold.planTitle,
        steps: scaffold.steps,
      },
    },
    intent: options?.strategy === 'structural_retry'
      ? { kind: 'user_adjusted_plan', reason: 'structural_retry', confidence: 'medium' }
      : undefined,
    sourceOperationId: 'scaffold',
  }));
  return scaffold;
}

export async function requestRescue(task: TaskContext, action: Action | null, currentStepIndex: number, options?: { signal?: AbortSignal }): Promise<AiRescueResponse> {
  const { maxAttempts } = getRescueRetryConfig();
  let retryAttempted = false;
  let retryCount = 0;
  let initialFailureStatus: number | undefined;
  let initialFailureReason: AiFailureReason | 'network' | 'unknown' = 'unknown';
  let initialFailurePassType: string | undefined;
  let previousFailureStatus: number | undefined;
  let previousFailureReason: AiFailureReason | 'network' | 'unknown' = 'unknown';
  let previousFailurePassType: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const body = JSON.stringify({
        task,
        action,
        currentStepIndex,
        retryContext: attempt > 0
          ? {
              attempt: attempt + 1,
              previousStatus: previousFailureStatus,
              previousReason: previousFailureReason,
              previousPassType: previousFailurePassType,
            }
          : undefined,
      });
      const response = await fetch('/api/ai/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: options?.signal,
      });

      const parsed = await parseOperationResponse(
        response,
        AiRescueResponseSchema,
        `AI rescue ไม่สำเร็จ (${response.status})`,
        'rescue',
      );

      if (retryAttempted) {
        trackEvent('synthesis_completed', {
          operation: 'rescue',
          retryAttempted: true,
          retrySucceeded: true,
          retryCount,
          maxAttempts,
          recoveredFromStatus: initialFailureStatus,
          recoveredFromReason: initialFailureReason,
          recoveredFromPassType: initialFailurePassType,
        });
      }

      const refs = roomMemoryRefsFromSources(buildRoomDataSources(task).filter((source) => source.status === 'ready'));
      await safeAppendLiveSourceAddedEvents(task, refs, 'rescue');
      await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
        task,
        type: 'rescue_created',
        summary: `Rescue: ${parsed.diagnosis.primaryReason} -> ${parsed.rescuePlan.mode}`,
        refs,
        payload: {
          rescue: {
            reason: parsed.diagnosis.primaryReason,
            mode: parsed.rescuePlan.mode,
            explanation: parsed.diagnosis.explanation,
            steps: parsed.rescuePlan.steps,
            createdAt: Date.now(),
          },
        },
        intent: {
          kind: 'ai_created_rescue',
          reason: parsed.diagnosis.primaryReason,
          confidence: parsed.diagnosis.primaryReason === 'unknown' ? 'low' : 'medium',
        },
        sourceOperationId: 'rescue',
      }));
      await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
        task,
        type: 'blocker_updated',
        summary: `Current blockers: ${parsed.diagnosis.primaryReason}`,
        refs,
        payload: { blockers: [parsed.diagnosis.primaryReason] },
        intent: {
          kind: 'ai_detected_blocker',
          reason: parsed.diagnosis.primaryReason,
          confidence: parsed.diagnosis.primaryReason === 'unknown' ? 'low' : 'medium',
        },
        sourceOperationId: 'rescue',
      }));

      return parsed;
    } catch (error) {
      const statusCode = readFailureStatusCode(error);
      const failureReason = error instanceof SynthesisFailure
        ? error.reason
        : error instanceof TypeError
          ? 'network'
          : 'unknown';
      const failurePassType = error instanceof SynthesisFailure ? error.telemetry?.passType : undefined;
      const canRetry = attempt < maxAttempts - 1 && shouldRetryRescueFailure(error);

      previousFailureStatus = statusCode;
      previousFailureReason = failureReason;
      previousFailurePassType = failurePassType;

      if (canRetry) {
        retryAttempted = true;
        retryCount += 1;
        initialFailureStatus ??= statusCode;
        if (initialFailureReason === 'unknown') {
          initialFailureReason = failureReason;
        }
        initialFailurePassType ??= failurePassType;
        const retryBackoffMs = resolveRescueRetryBackoffMs(attempt, error);
        trackEvent('synthesis_failed', {
          operation: 'rescue',
          status: statusCode,
          reason: failureReason,
          failurePassType: initialFailurePassType,
          retryAttempted: true,
          retrySucceeded: false,
          retryCount,
          maxAttempts,
          willRetry: true,
          retryBackoffMs,
        });
        await waitForBackoff(retryBackoffMs, options?.signal);
        continue;
      }

      trackEvent('synthesis_failed', {
        operation: 'rescue',
        status: statusCode,
        reason: failureReason,
        failurePassType,
        retryAttempted,
        retrySucceeded: false,
        retryCount,
        maxAttempts,
      });

      if (error instanceof SynthesisFailure) {
        error.retryAttempted = retryAttempted;
        error.retrySucceeded = false;
      }

      if (!shouldRetryRescueFailure(error)) {
        throw error;
      }

      const fallbackRescue = parseAiRescueResponse(
        JSON.stringify({
          diagnosis: {
            primaryReason: 'unknown',
            explanation:
              'MIND ยังวินิจฉัยไม่สำเร็จในรอบนี้ แต่บริบทงานและข้อความเดิมของคุณยังอยู่ครบ ลองย่อยให้เล็กลงอีก หรือพักไว้แล้วกลับมาลอง rescue ใหม่ได้',
          },
          rescuePlan: {
            mode: 'shrink',
            steps: [
              'กลับไปทำแค่ส่วนเล็กที่สุดของ step นี้ก่อน',
              'ถ้ายังติดอยู่จริง งานนี้ยังถูกเก็บไว้เหมือนเดิม ค่อยกลับมาลองใหม่เมื่อพร้อม',
            ],
          },
        }),
        {
          fallbackReason: 'unknown',
          fallbackActionTitle: action?.title ?? task.currentPlan?.actionTitle,
          fallbackCurrentStep:
            task.currentPlan?.steps[currentStepIndex]?.text ??
            action?.microSteps?.[currentStepIndex],
        },
      );
      const refs = roomMemoryRefsFromSources(buildRoomDataSources(task).filter((source) => source.status === 'ready'));
      await safeAppendLiveSourceAddedEvents(task, refs, 'rescue:fallback');
      await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
        task,
        type: 'rescue_created',
        summary: `Rescue: ${fallbackRescue.diagnosis.primaryReason} -> ${fallbackRescue.rescuePlan.mode}`,
        refs,
        payload: {
          rescue: {
            reason: fallbackRescue.diagnosis.primaryReason,
            mode: fallbackRescue.rescuePlan.mode,
            explanation: fallbackRescue.diagnosis.explanation,
            steps: fallbackRescue.rescuePlan.steps,
            createdAt: Date.now(),
          },
          fallback: true,
        },
        intent: { kind: 'ai_created_rescue', reason: 'unknown', confidence: 'low' },
        sourceOperationId: 'rescue:fallback',
      }));
      await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
        task,
        type: 'blocker_updated',
        summary: `Current blockers: ${fallbackRescue.diagnosis.primaryReason}`,
        refs,
        payload: { blockers: [fallbackRescue.diagnosis.primaryReason] },
        intent: { kind: 'ai_detected_blocker', reason: fallbackRescue.diagnosis.primaryReason, confidence: 'low' },
        sourceOperationId: 'rescue:fallback',
      }));
      return fallbackRescue;
    }
  }

  throw new SynthesisFailure('unknown', 'AI rescue ไม่สำเร็จ');
}

export async function requestReentry(
  task: TaskContext,
  action: Action | null,
  scope: AiReentryScope,
  currentStepIndex: number,
): Promise<AiReentryResponse> {
  const roomId = task.roomId ?? task.id;
  const currentStep =
    task.currentPlan?.steps[currentStepIndex]?.text ??
    action?.microSteps?.[currentStepIndex] ??
    '';
  const memoryQuery = [
    action?.title,
    task.currentPlan?.actionTitle,
    currentStep,
    task.taskFrame?.objective,
    task.lastStableSummary,
    task.lastSynthesis?.situation_summary,
  ].filter((value): value is string => Boolean(value?.trim())).join(' ');
  const roomSources = buildRoomDataSources(task).filter((source) => source.status === 'ready');
  const retrievalEngine = await createMetadataRetrievalEngine(roomSources);
  const memoryHits = await retrievalEngine.retrieveHits(memoryQuery, roomId, 5);
  const sourceMemoryContext = memoryHits.map(({ item: source, reason }: { item: RoomDataSource; reason: string }) => ({
    id: source.id,
    title: source.title,
    kind: source.kind ?? source.type,
    status: source.status,
    excerpt: source.excerpt,
    summary: source.summary,
    reason: source.usedInPlanCount > 0
      ? `used_in_plan:${source.usedInPlanCount}`
      : source.lastUsedAt
        ? 'recently_used'
        : reason,
  }));
  const roomMemoryReplay = await (async () => {
    try {
      await ensureRoomMemoryBackfilled({ task });
      return buildRoomMemoryReplayContext({
        roomId,
        query: memoryQuery,
        eventLimit: 10,
        refLimit: 5,
        availableSources: roomSources,
      });
    } catch {
      return null;
    }
  })();
  const memoryContext = [
    ...(roomMemoryReplay?.snapshot
      ? [{
          id: `snapshot:${roomId}`,
          title: 'Room memory snapshot',
          kind: 'room_snapshot',
          status: 'derived',
          summary: roomMemoryReplay.snapshot.currentSummary,
          excerpt: [
            roomMemoryReplay.snapshot.currentAction?.title,
            roomMemoryReplay.snapshot.currentPlan?.actionTitle,
            roomMemoryReplay.snapshot.currentBlockers.length > 0
              ? `blockers: ${roomMemoryReplay.snapshot.currentBlockers.join(', ')}`
              : undefined,
            roomMemoryReplay.snapshot.cognitiveState
              ? `preferredStartFormat: ${roomMemoryReplay.snapshot.cognitiveState.preferredStartFormat}`
              : undefined,
            roomMemoryReplay.snapshot.cognitiveState
              ? `lastStuckSignal: ${roomMemoryReplay.snapshot.cognitiveState.lastStuckSignal}`
              : undefined,
            roomMemoryReplay.snapshot.cognitiveState?.driftWarnings.length
              ? `driftWarnings: ${roomMemoryReplay.snapshot.cognitiveState.driftWarnings.join(' | ')}`
              : undefined,
            roomMemoryReplay.snapshot.latestRescue
              ? `latestRescue: ${roomMemoryReplay.snapshot.latestRescue.reason}`
              : undefined,
            roomMemoryReplay.snapshot.latestReentry?.summary,
          ].filter(Boolean).join(' · '),
          reason: `snapshot_version:${roomMemoryReplay.snapshot.version}`,
        }]
      : []),
    ...(roomMemoryReplay?.recentEvents ?? []).map((event) => ({
      id: event.id,
      title: event.type,
      kind: 'room_event',
      status: event.origin,
      summary: event.summary,
      excerpt: event.summary,
      reason: `event:${event.type}`,
    })),
    ...(roomMemoryReplay?.relevantRefs ?? []).map((ref) => ({
      id: ref.id,
      title: ref.label ?? ref.id,
      kind: ref.kind,
      status: ref.status,
      summary: ref.excerpt,
      excerpt: ref.excerpt,
      reason: `ref:${ref.status}`,
    })),
    ...sourceMemoryContext,
  ];

  try {
    const response = await fetch('/api/ai/reentry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, action, scope, memoryContext }),
    });

    const reentry = await parseOperationResponse(
      response,
      AiReentryResponseSchema,
      `AI reentry ไม่สำเร็จ (${response.status})`,
      'reentry',
    );
    const refs = roomMemoryRefsFromSources(roomSources);
    await safeAppendLiveSourceAddedEvents(task, refs, 'reentry');
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'reentry_created',
      summary: reentry.reentrySummary,
      refs,
      payload: {
        reentry: {
          summary: reentry.reentrySummary,
          topActions: reentry.topActions,
          createdAt: Date.now(),
        },
      },
      intent: { kind: 'ai_created_reentry', reason: scope, confidence: 'medium' },
      sourceOperationId: 'reentry',
    }));
    return reentry;
  } catch {
    const fallbackReentry = parseAiReentryResponse(
      JSON.stringify({
        reentrySummary:
          scope === 'morning_ritual'
            ? 'กลับมาเช็กภาพรวมวันนี้ก่อน แล้วค่อยเลือกงานที่สำคัญที่สุด'
            : 'กลับมาครั้งนี้เริ่มจากก้าวที่ใกล้ที่สุดก่อน เพื่อพางานนี้กลับเข้าสู่จังหวะเดิมได้เร็วสุด',
        topActions: [
          {
            roomId: task.currentActionId ?? 'current-room',
            title: action?.title ?? task.currentPlan?.actionTitle ?? 'สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี',
            rationale: 'ช่วยกลับเข้าสู่งานค้างได้เร็วโดยไม่ต้องอ่านใหม่ทั้งหมด',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
      }),
      {
        fallbackRoomId: task.currentActionId ?? 'current-room',
        fallbackActionTitle: action?.title ?? task.currentPlan?.actionTitle,
        fallbackCurrentStep:
          task.currentPlan?.steps[currentStepIndex]?.text ??
          action?.microSteps?.[currentStepIndex],
        fallbackResumeTarget: 'ONE_ACTION',
      },
    );
    const refs = roomMemoryRefsFromSources(roomSources);
    await safeAppendLiveSourceAddedEvents(task, refs, 'reentry:fallback');
    await safeAppendLiveRoomMemoryEvent(buildLiveRoomMemoryEvent({
      task,
      type: 'reentry_created',
      summary: fallbackReentry.reentrySummary,
      refs,
      payload: {
        reentry: {
          summary: fallbackReentry.reentrySummary,
          topActions: fallbackReentry.topActions,
          createdAt: Date.now(),
        },
        fallback: true,
      },
      intent: { kind: 'ai_created_reentry', reason: scope, confidence: 'low' },
      sourceOperationId: 'reentry:fallback',
    }));
    return fallbackReentry;
  }
}

export async function runIntakeActionFlow(task: TaskContext): Promise<
  | {
      kind: 'clarification';
      intake: AiIntakeResponse;
      intakeTask: TaskContext;
      clarificationQuestion: string;
    }
  | {
      kind: 'action';
      intake: AiIntakeResponse;
      intakeTask: TaskContext;
      actionResponse: AiActionResponse;
      evidenceContext: ActionEvidenceContext;
    }
> {
  const intake = await requestIntake(task);
  const intakeTask: TaskContext = {
    ...task,
    workflowType: intake.workflowType,
    taskShape: intake.taskShape,
    blockerSignals: intake.blockers,
    taskFrame: intake.taskFrame,
    assistantMode: 'intake_review',
    lastAiOperation: 'intake',
  };

  const hasClarificationAnswer = task.pendingInputs.some(
    (input) => input.kind === 'clarification'
  );

  if (intake.requiresClarification && !hasClarificationAnswer) {
    return {
      kind: 'clarification',
      intake,
      intakeTask,
      clarificationQuestion: intake.clarificationQuestion || 'ช่วยบอกอีกนิดว่าตอนนี้ต้องตอบหรือขยับส่วนไหนก่อน',
    };
  }

  const { actionResponse, evidenceContext } = await requestAction({
    task: intakeTask,
    preferredCandidate: intake.candidateActions[0],
  });

  return {
    kind: 'action',
    intake,
    intakeTask,
    actionResponse,
    evidenceContext,
  };
}
