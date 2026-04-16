export interface RescueRetryContext {
  attempt?: number;
  previousStatus?: number;
  previousReason?: string;
  previousPassType?: string;
}

export interface RescueRouteBudgetConfig {
  primaryTimeoutMs: number;
  repairTimeoutMs: number;
  fallbackTimeoutMs: number;
  overallBudgetMs: number;
}

function isTimeoutRecoveryRetry(retryContext?: RescueRetryContext) {
  if (!retryContext || (retryContext.attempt ?? 1) <= 1) return false;

  return (
    retryContext.previousPassType === 'timeout' ||
    retryContext.previousReason === 'request_timeout' ||
    retryContext.previousStatus === 503
  );
}

export function resolveRescueRouteBudget(
  budget: RescueRouteBudgetConfig,
  retryContext?: RescueRetryContext,
): RescueRouteBudgetConfig {
  if (!isTimeoutRecoveryRetry(retryContext)) {
    return budget;
  }

  const repairTimeoutMs = Math.min(budget.repairTimeoutMs + 1000, budget.primaryTimeoutMs);
  const fallbackTimeoutMs = Math.min(budget.fallbackTimeoutMs + 1000, budget.primaryTimeoutMs);

  return {
    ...budget,
    repairTimeoutMs,
    fallbackTimeoutMs,
    overallBudgetMs: budget.overallBudgetMs + 3000,
  };
}
