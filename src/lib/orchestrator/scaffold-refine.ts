export type ScaffoldRefineResult = 'success' | 'no_change' | 'failed';

export interface ScaffoldRefineFeedback {
  kind: 'error';
  message: string;
}

export const SCAFFOLD_REFINE_LOADING_COPY = 'MIND กำลังหาวิธีย่อยให้เล็กลงที่ยังมีความหมายอยู่…';
export const SCAFFOLD_REFINE_FAILURE_COPY =
  'รอบนี้ MIND ยังย่อยก้าวนี้ให้เล็กลงแบบมีความหมายไม่ได้ ลองใหม่อีกครั้ง หรือกด “ฉันติดอยู่”';

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
