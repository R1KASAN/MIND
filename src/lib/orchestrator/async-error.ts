/**
 * Converts unknown/undefined rejection reasons into a standard Error object with a clear message.
 */
export function normalizeAsyncError(reason: unknown, label: string): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const message = typeof reason === 'string' && reason.trim() !== ''
    ? reason
    : (reason === undefined ? 'undefined' : JSON.stringify(reason));
  const err = new Error(`[normalizeAsyncError] Client async failure in ${label}: ${message}`);
  // Keep track of the original reason
  (err as any).originalReason = reason;
  return err;
}

/**
 * Logs a client async error cleanly to the console.
 */
export function reportClientAsyncError(label: string, reason: unknown): void {
  const normalized = normalizeAsyncError(reason, label);
  console.error(`[MIND] ${label}:`, normalized.message);
  if ((normalized as any).originalReason !== undefined) {
    console.error(`[MIND] ${label} Original Reason:`, (normalized as any).originalReason);
  }
}
