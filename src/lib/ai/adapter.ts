import {
  CANONICAL_LOCAL_PRIMARY_MODEL,
  DEFAULT_AI_START_ACTION,
  type AiHealthResult,
  type AiHealthStatus,
} from '@/lib/ai/ollama-runtime';

// T043: Background health check adapter for local Ollama readiness
// This is called from the app shell on load — non-blocking (fire-and-forget pattern)

export type AiStatus = AiHealthStatus;
export type HealthCheckResult = AiHealthResult;

/**
 * Fetches /api/ai/health in the background.
 * Designed to be non-blocking: call it without await in the app shell.
 * Returns a promise that resolves to the health status.
 */
export async function checkAiHealth(): Promise<HealthCheckResult> {
  try {
    const res = await fetch('/api/ai/health', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      return {
        status: 'unavailable',
        model: CANONICAL_LOCAL_PRIMARY_MODEL,
        modelTier: 'unknown',
        reason: 'Ollama ไม่พร้อมใช้งาน',
        detail: `Health check ตอบกลับด้วยสถานะ ${res.status}`,
        retryable: true,
        actions: [DEFAULT_AI_START_ACTION],
      };
    }
    const data = await res.json() as HealthCheckResult;
    return data;
  } catch {
    return {
      status: 'unavailable',
      model: CANONICAL_LOCAL_PRIMARY_MODEL,
      modelTier: 'unknown',
      reason: 'Ollama ไม่พร้อมใช้งาน',
      detail: 'ไม่สามารถเชื่อมต่อ health endpoint ได้',
      retryable: true,
      actions: [DEFAULT_AI_START_ACTION],
    };
  }
}
