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

function waitForBackoff(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
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

  return parseOperationResponse(
    response,
    AiIntakeResponseSchema,
    `AI intake ไม่สำเร็จ (${response.status})`,
    'intake',
  );
}

export async function requestAction(options: {
  task: TaskContext;
  preferredCandidate?: AiIntakeResponse['candidateActions'][number];
  negotiation?: { mode: AiActionNegotiationMode; userNote?: string };
}): Promise<AiActionResponse> {
  const response = await fetch('/api/ai/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  return parseOperationResponse(
    response,
    AiActionResponseSchema,
    `AI action ไม่สำเร็จ (${response.status})`,
    'action',
  );
}

export async function requestScaffold(task: TaskContext, action: Action, currentStepIndex: number): Promise<AiScaffoldResponse> {
  const response = await fetch('/api/ai/scaffold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, action, currentStepIndex }),
  });

  return parseOperationResponse(
    response,
    AiScaffoldResponseSchema,
    `AI scaffold ไม่สำเร็จ (${response.status})`,
    'scaffold',
  );
}

export async function requestRescue(task: TaskContext, action: Action | null, currentStepIndex: number): Promise<AiRescueResponse> {
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
        await waitForBackoff(retryBackoffMs);
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

      return parseAiRescueResponse(
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
  try {
    const response = await fetch('/api/ai/reentry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, action, scope }),
    });

    return parseOperationResponse(
      response,
      AiReentryResponseSchema,
      `AI reentry ไม่สำเร็จ (${response.status})`,
      'reentry',
    );
  } catch {
    return parseAiReentryResponse(
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

  if (intake.requiresClarification) {
    return {
      kind: 'clarification',
      intake,
      intakeTask,
      clarificationQuestion: intake.clarificationQuestion || 'ช่วยบอกอีกนิดว่าตอนนี้ต้องตอบหรือขยับส่วนไหนก่อน',
    };
  }

  const actionResponse = await requestAction({
    task: intakeTask,
    preferredCandidate: intake.candidateActions[0],
  });

  return {
    kind: 'action',
    intake,
    intakeTask,
    actionResponse,
  };
}
