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
const HEALTH_POLL_TIMEOUT_MS = Number(process.env.AI_HEALTH_POLL_TIMEOUT_MS || 6000) || 6000;

/**
 * Fetches /api/ai/health in the background.
 * Designed to be non-blocking: call it without await in the app shell.
 * Returns a promise that resolves to the health status.
 */
export async function checkAiHealth(): Promise<HealthCheckResult> {
  try {
    const res = await fetch('/api/ai/health', { signal: AbortSignal.timeout(HEALTH_POLL_TIMEOUT_MS) });
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'checking',
        model: CANONICAL_LOCAL_PRIMARY_MODEL,
        modelTier: 'unknown',
        reason: 'กำลังตรวจสอบโมเดล...',
        detail: `health endpoint ยังตอบไม่ทันใน ${HEALTH_POLL_TIMEOUT_MS}ms`,
        retryable: true,
        actions: [DEFAULT_AI_START_ACTION],
      };
    }
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
