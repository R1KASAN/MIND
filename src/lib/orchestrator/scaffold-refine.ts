import type { RescueReason } from '@/lib/store/idb';

export type ScaffoldRefineResult = 'success' | 'no_change' | 'failed';
export type ScaffoldRefineFailureReason = Exclude<ScaffoldRefineResult, 'success'>;
export type ScaffoldRefineFallbackRoute = 'retry' | 'rescue' | 'clarification';

export interface ScaffoldRefineFeedback {
  kind: 'error';
  reason: ScaffoldRefineFailureReason;
  message: string;
  diagnostic: string;
  suggestedRoute: ScaffoldRefineFallbackRoute;
  suggestedRouteLabel?: string;
  suggestedReasonLabel?: string;
}

export const SCAFFOLD_REFINE_LOADING_COPY = 'MIND กำลังหาวิธีย่อยให้เล็กลงที่ยังมีความหมายอยู่…';
export const SCAFFOLD_REFINE_NO_CHANGE_COPY =
  'MIND ลองย่อยก้าวนี้แล้ว แต่สิ่งที่ได้ยังไม่ต่างพอจะช่วยให้เริ่มง่ายขึ้น';
export const SCAFFOLD_REFINE_FAILED_COPY =
  'รอบนี้เรียก AI เพื่อย่อยก้าวนี้ไม่สำเร็จ งานเดิมยังอยู่ครบ';

const CLARIFICATION_STEP_PATTERN = /(ถาม|ยืนยัน|clarif|scope|feedback|brief|requirement|ต้องการให้|ขอข้อมูล|ขอบเขต|ไม่ชัด)/iu;

export interface ScaffoldRefineFallbackDecision {
  route: 'clarification' | 'rescue';
  prompt?: string;
  rescueReason?: RescueReason;
  routeLabel: string;
  reasonLabel: string;
}

export function buildClarificationPromptFromStep(step: string) {
  const compactStep = step.replace(/\s+/g, ' ').trim();
  if (!compactStep) {
    return 'ก่อนย่อยก้าวนี้ต่อ MIND ต้องรู้เพิ่มอีกนิดว่า ตอนนี้ควรตอบหรือขยับส่วนไหนก่อน';
  }

  return `ก่อนย่อยก้าว "${compactStep}" ต่อ MIND ต้องรู้เพิ่มอีกนิดว่า ตอนนี้ยังมีอะไรไม่ชัดหรือรอคำตอบจากลูกค้าอยู่บ้าง`;
}

export function inferScaffoldRefineFallback(
  blockerSignals: string[],
  currentStep: string,
): ScaffoldRefineFallbackDecision {
  const blockerSet = new Set(blockerSignals);
  const shouldClarify =
    blockerSet.has('unclear_scope') ||
    blockerSet.has('missing_context') ||
    CLARIFICATION_STEP_PATTERN.test(currentStep);

  if (shouldClarify) {
    return {
      route: 'clarification',
      prompt: buildClarificationPromptFromStep(currentStep),
      routeLabel: 'ไป Clarification',
      reasonLabel: blockerSet.has('missing_context') ? 'ข้อมูลยังไม่พอ' : 'โจทย์ยังไม่ชัด',
    };
  }

  const rescueReason: RescueReason = blockerSet.has('too_big')
    ? 'too_big'
    : blockerSet.has('low_energy')
      ? 'low_energy'
      : blockerSet.has('dependency')
        ? 'dependency'
        : 'unknown';

  return {
    route: 'rescue',
    rescueReason,
    routeLabel: 'ไป Rescue',
    reasonLabel: rescueReason === 'dependency'
      ? 'ติดที่ dependency'
      : rescueReason === 'too_big'
        ? 'ก้าวนี้ยังใหญ่เกิน'
        : rescueReason === 'low_energy'
          ? 'ต้องลดแรงก่อน'
          : 'ยังต้องวินิจฉัยต่อ',
  };
}

export function buildScaffoldRefineFeedback(
  reason: ScaffoldRefineFailureReason,
  options?: {
    suggestedRoute?: ScaffoldRefineFallbackRoute;
    attemptedStructuralRetry?: boolean;
    suggestedRouteLabel?: string;
    suggestedReasonLabel?: string;
  },
): ScaffoldRefineFeedback {
  if (reason === 'no_change') {
    return {
      kind: 'error',
      reason,
      message: SCAFFOLD_REFINE_NO_CHANGE_COPY,
      diagnostic: options?.attemptedStructuralRetry
        ? 'AI ตอบกลับมาแล้ว 2 รอบ แต่ก้าวที่เห็นยังแทบเหมือนเดิม จึงพาไปทางที่เหมาะกว่าตามลักษณะงาน'
        : 'AI ตอบกลับมาแล้ว แต่ก้าวที่เห็นยังแทบเหมือนเดิม จึงยังไม่ถือว่าเล็กลงอย่างมีความหมาย',
      suggestedRoute: options?.suggestedRoute ?? 'rescue',
      suggestedRouteLabel: options?.suggestedRouteLabel,
      suggestedReasonLabel: options?.suggestedReasonLabel,
    };
  }

  return {
    kind: 'error',
    reason,
    message: SCAFFOLD_REFINE_FAILED_COPY,
    diagnostic: 'คำขอ scaffold รอบนี้ไม่สำเร็จ หรือ output ใช้ต่อไม่ได้ จึงยังไม่เปลี่ยนแผนงานปัจจุบัน',
    suggestedRoute: options?.suggestedRoute ?? 'retry',
    suggestedRouteLabel: options?.suggestedRouteLabel,
    suggestedReasonLabel: options?.suggestedReasonLabel,
  };
}

const SCAFFOLD_PREFIX_PATTERN = /^(?:ขยับอีกนิด:\s*)+/u;

export function normalizeComparableScaffoldStep(step: string): string {
  return step
    .trimStart()
    .replace(SCAFFOLD_PREFIX_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeComparableScaffoldSteps(steps: string[]): string[] {
  return steps.map((step) => normalizeComparableScaffoldStep(step));
}

export function getVisibleScaffoldStep(steps: string[], currentStepIndex: number): string {
  if (steps.length === 0) return '';
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), steps.length - 1);
  return steps[safeIndex] ?? '';
}

export function getVisibleScaffoldSteps(steps: string[], currentStepIndex: number): string[] {
  if (steps.length === 0) return [];
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), steps.length - 1);
  return steps.slice(safeIndex);
}

export function classifyScaffoldRefineResult(previousVisibleSteps: string[], nextVisibleSteps: string[]): ScaffoldRefineResult {
  const previousComparable = normalizeComparableScaffoldSteps(previousVisibleSteps);
  const nextComparable = normalizeComparableScaffoldSteps(nextVisibleSteps);

  if (previousComparable.length !== nextComparable.length) {
    return 'success';
  }

  for (let index = 0; index < previousComparable.length; index += 1) {
    if ((previousComparable[index] ?? '') !== (nextComparable[index] ?? '')) {
      return 'success';
    }
  }

  return 'no_change';
}
