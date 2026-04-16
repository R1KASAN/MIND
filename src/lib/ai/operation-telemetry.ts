export type AiOperationPassType = 'primary_pass' | 'repair_pass' | 'fallback_pass' | 'timeout' | 'validation_failed' | 'endpoint_failed';
export type AiOperationModelTier = 'primary' | 'fallback';
export type AiOperationAttemptStage = 'primary' | 'repair' | 'fallback';

export interface AiOperationTelemetryEntry {
  operationName: string;
  passType: AiOperationPassType;
  model?: string;
  modelTier?: AiOperationModelTier;
  attemptStage?: AiOperationAttemptStage;
  repairUsed?: boolean;
  durationMs: number;
  detail?: string;
}

export function isAiTimeoutDetail(detail?: string | null) {
  if (!detail) return false;
  return detail.toLowerCase().includes('timed out');
}

export function resolveAiOperationPassType(options: {
  repairUsed: boolean;
  modelTier: AiOperationModelTier;
}): Extract<AiOperationPassType, 'primary_pass' | 'repair_pass' | 'fallback_pass'> {
  const { repairUsed, modelTier } = options;
  if (repairUsed) return 'repair_pass';
  if (modelTier === 'fallback') return 'fallback_pass';
  return 'primary_pass';
}

export function logAiOperationTelemetry(entry: AiOperationTelemetryEntry) {
  console.info('[MIND][AI_OP]', {
    operation: entry.operationName,
    pass_type: entry.passType,
    model: entry.model,
    model_tier: entry.modelTier,
    attempt_stage: entry.attemptStage,
    repair_used: entry.repairUsed ?? false,
    duration_ms: entry.durationMs,
    detail: entry.detail,
  });
}
