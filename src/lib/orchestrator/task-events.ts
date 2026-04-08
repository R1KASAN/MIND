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
import type { AiOpsFailureTelemetry } from '@/lib/ai/ai-ops-debug';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import { AiSynthesisResponseSchema } from '@/lib/ai/schema';
import { trackEvent } from '@/lib/instrumentation';
import type {
  Action,
  AiFailureReason,
  TaskContext,
} from '@/lib/store/idb';
import { buildSynthesisInput } from '@/lib/orchestrator/task-machine';

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
    body: JSON.stringify({ task }),
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
  const body = JSON.stringify({ task, action, currentStepIndex });
  let retryAttempted = false;
  let initialFailureStatus: number | undefined;
  let initialFailureReason: AiFailureReason | 'network' | 'unknown' = 'unknown';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
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
          recoveredFromStatus: initialFailureStatus,
          recoveredFromReason: initialFailureReason,
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
      const canRetry = attempt === 0 && shouldRetryRescueFailure(error);

      if (canRetry) {
        retryAttempted = true;
        initialFailureStatus = statusCode;
        initialFailureReason = failureReason;
        trackEvent('synthesis_failed', {
          operation: 'rescue',
          status: statusCode,
          reason: failureReason,
          retryAttempted: true,
          retrySucceeded: false,
          willRetry: true,
        });
        await waitForBackoff(600);
        continue;
      }

      trackEvent('synthesis_failed', {
        operation: 'rescue',
        status: statusCode,
        reason: failureReason,
        retryAttempted,
        retrySucceeded: false,
      });

      if (error instanceof SynthesisFailure) {
        error.retryAttempted = retryAttempted;
        error.retrySucceeded = false;
      }

      throw error;
    }
  }

  throw new SynthesisFailure('unknown', 'AI rescue ไม่สำเร็จ');
}

export async function requestReentry(task: TaskContext, action: Action | null, scope: AiReentryScope): Promise<AiReentryResponse> {
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
