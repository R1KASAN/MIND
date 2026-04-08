import type { AiFailureReason } from '@/lib/store/idb';
import type { AiOperationMeta } from '@/lib/ai/operations';
import type { AiOperationPassType } from '@/lib/ai/operation-telemetry';

export interface AiOpsDebugEntry {
  id: string;
  operationName: string;
  passType: AiOperationPassType;
  model?: string;
  durationMs?: number;
  repairUsed?: boolean;
  detail?: string;
  createdAt: number;
}

export interface AiOpsFailureTelemetry {
  passType?: AiOperationPassType;
  durationMs?: number;
  repairUsed?: boolean;
  model?: string;
}

export interface AiOpsDebugFilters {
  query?: string;
  passTypes?: AiOperationPassType[];
}

export function buildAiOpsSuccessEntry(
  operationName: string,
  meta: AiOperationMeta | undefined,
): AiOpsDebugEntry {
  return {
    id: `${operationName}-${Date.now()}`,
    operationName,
    passType: meta?.passType ?? 'primary_pass',
    model: meta?.model,
    durationMs: meta?.durationMs,
    repairUsed: meta?.repairUsed,
    createdAt: Date.now(),
  };
}

export function inferAiOpsFailurePassType(
  reason: AiFailureReason,
  telemetry?: AiOpsFailureTelemetry,
): Extract<AiOperationPassType, 'timeout' | 'validation_failed' | 'endpoint_failed'> {
  if (telemetry?.passType === 'timeout' || reason === 'request_timeout') {
    return 'timeout';
  }
  if (telemetry?.passType === 'validation_failed') {
    return 'validation_failed';
  }
  return 'endpoint_failed';
}

export function buildAiOpsFailureEntry(input: {
  operationName: string;
  reason: AiFailureReason;
  detail?: string;
  telemetry?: AiOpsFailureTelemetry;
}): AiOpsDebugEntry {
  return {
    id: `${input.operationName}-${Date.now()}`,
    operationName: input.operationName,
    passType: inferAiOpsFailurePassType(input.reason, input.telemetry),
    model: input.telemetry?.model,
    durationMs: input.telemetry?.durationMs,
    repairUsed: input.telemetry?.repairUsed,
    detail: input.detail,
    createdAt: Date.now(),
  };
}

export function summarizeAiOpsEntries(entries: AiOpsDebugEntry[]): Partial<Record<AiOperationPassType, number>> {
  return entries.reduce<Partial<Record<AiOperationPassType, number>>>((acc, entry) => {
    acc[entry.passType] = (acc[entry.passType] ?? 0) + 1;
    return acc;
  }, {});
}

export function filterAiOpsEntries(
  entries: AiOpsDebugEntry[],
  filters: AiOpsDebugFilters = {},
): AiOpsDebugEntry[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const allowedPassTypes = new Set(filters.passTypes ?? []);

  return entries.filter((entry) => {
    if (allowedPassTypes.size > 0 && !allowedPassTypes.has(entry.passType)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystacks = [entry.operationName, entry.model, entry.detail]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());

    return haystacks.some((value) => value.includes(query));
  });
}
