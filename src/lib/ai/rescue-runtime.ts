import type { AiRescueResponse } from '@/lib/ai/operations';
import type { Action, RescueReason, TaskContext } from '@/lib/store/idb';

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

  const repairTimeoutMs = Math.min(budget.repairTimeoutMs + 2000, budget.primaryTimeoutMs + 2000);
  const fallbackTimeoutMs = Math.min(budget.fallbackTimeoutMs + 2000, budget.primaryTimeoutMs + 2000);

  return {
    ...budget,
    repairTimeoutMs,
    fallbackTimeoutMs,
    overallBudgetMs: budget.overallBudgetMs + 5000,
  };
}

function pickCurrentStep(task: TaskContext, action: Action | undefined, currentStepIndex: number) {
  return (
    action?.microSteps[currentStepIndex] ??
    action?.microSteps[0] ??
    task.currentPlan?.steps[currentStepIndex]?.text ??
    task.currentPlan?.steps[0]?.text ??
    action?.title ??
    task.currentPlan?.actionTitle ??
    task.taskFrame?.objective ??
    'ก้าวนี้'
  );
}

function inferManualRescueReason(task: TaskContext): RescueReason {
  if (task.blockerSignals.includes('missing_file_or_context')) return 'missing_context';
  if (task.blockerSignals.includes('dependency')) return 'dependency';
  if (task.blockerSignals.includes('unclear_scope')) return 'unclear_scope';
  if (task.blockerSignals.includes('low_energy')) return 'low_energy';
  if (task.blockerSignals.includes('too_big')) return 'too_big';
  if (task.lifecycleState === 'stalled') return 'too_big';
  return 'unknown';
}

export function buildManualRescueResponse(options: {
  task: TaskContext;
  action?: Action;
  currentStepIndex: number;
  durationMs?: number;
  failedModel?: string;
  failureDetail?: string;
}): AiRescueResponse {
  const { task, action, currentStepIndex, durationMs = 0 } = options;
  const currentStep = pickCurrentStep(task, action, currentStepIndex);
  const actionTitle = action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective ?? 'งานนี้';
  const reason = inferManualRescueReason(task);
  const readyFiles = task.sourceFiles
    .filter((file) => file.status === 'ready')
    .map((file) => file.name);

  if (reason === 'missing_context') {
    return {
      diagnosis: {
        primaryReason: 'missing_context',
        explanation: 'AI ยังตอบไม่ทัน แต่สัญญาณหลักคือบริบทที่จำเป็นยังไม่พอสำหรับขยับงานนี้อย่างมั่นใจ',
      },
      rescuePlan: {
        mode: 'clarify',
        steps: [
          'ระบุไฟล์ ข้อความ หรือคำตอบที่ยังขาดให้ชัดหนึ่งรายการ',
          `เปิดหรือแนบสิ่งที่ต้องใช้กับ "${currentStep}" ก่อน`,
          'ถ้ายังไม่มีไฟล์ ให้พิมพ์สรุปสิ่งที่รู้ตอนนี้ 2-3 บรรทัด',
        ],
      },
      suggestedMessage:
        'ตอนนี้ยังขาดบริบทบางส่วน ช่วยส่งไฟล์หรือสรุปข้อมูลที่เกี่ยวข้องเพิ่มอีกนิด แล้วฉันจะช่วยต่อจากตรงนั้นได้ทันที',
      meta: {
        model: options.failedModel ? `manual_rescue_after_${options.failedModel}` : 'manual_rescue',
        passType: 'fallback_pass',
        durationMs,
        confidence: 0.55,
        usedRoomFiles: readyFiles,
        repairUsed: false,
      },
    };
  }

  if (reason === 'dependency') {
    return {
      diagnosis: {
        primaryReason: 'dependency',
        explanation: 'AI ยังตอบไม่ทัน แต่รูปแบบของงานคือมี dependency ภายนอกที่ต้องปลดล็อกก่อน',
      },
      rescuePlan: {
        mode: 'follow_up',
        steps: [
          'เขียนหนึ่งประโยคว่าตอนนี้รออะไรจากใคร',
          `ร่าง follow-up สั้น ๆ เพื่อปลดล็อก "${actionTitle}"`,
          'ส่งเฉพาะคำถามที่จำเป็นต่อก้าวถัดไป ไม่รวมเรื่องรอง',
        ],
      },
      suggestedMessage:
        'ขอเช็กข้อมูลที่ยังขาดนิดหนึ่งครับ/ค่ะ เพื่อให้ผม/ฉันขยับงานต่อได้ถูกทาง: [สิ่งที่ต้องการ]',
      meta: {
        model: options.failedModel ? `manual_rescue_after_${options.failedModel}` : 'manual_rescue',
        passType: 'fallback_pass',
        durationMs,
        confidence: 0.55,
        usedRoomFiles: readyFiles,
        repairUsed: false,
      },
    };
  }

  if (reason === 'unclear_scope') {
    return {
      diagnosis: {
        primaryReason: 'unclear_scope',
        explanation: 'AI ยังตอบไม่ทัน แต่ความเสี่ยงหลักคือ scope ยังไม่ชัดพอจะเลือกก้าวต่อไป',
      },
      rescuePlan: {
        mode: 'clarify',
        steps: [
          `เขียนขอบเขตของ "${actionTitle}" เป็นหนึ่งประโยค`,
          'แยกสิ่งที่ต้องทำตอนนี้ออกจากสิ่งที่รอได้',
          `เลือกทำเฉพาะส่วนที่ทำให้ "${currentStep}" ชัดขึ้น`,
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: options.failedModel ? `manual_rescue_after_${options.failedModel}` : 'manual_rescue',
        passType: 'fallback_pass',
        durationMs,
        confidence: 0.5,
        usedRoomFiles: readyFiles,
        repairUsed: false,
      },
    };
  }

  if (reason === 'low_energy') {
    return {
      diagnosis: {
        primaryReason: 'low_energy',
        explanation: 'AI ยังตอบไม่ทัน แต่ตอนนี้ควรลดแรงเริ่มให้เล็กพอสำหรับพลังงานต่ำ',
      },
      rescuePlan: {
        mode: 'pause_cleanly',
        steps: [
          `ทำแค่ 5 นาทีแรกของ "${currentStep}"`,
          'ถ้ายังไม่ไหว ให้จดสถานะปัจจุบันหนึ่งบรรทัด',
          'วาง checkpoint ว่ากลับมาครั้งหน้าจะเริ่มจากอะไร',
        ],
      },
      suggestedMessage: undefined,
      meta: {
        model: options.failedModel ? `manual_rescue_after_${options.failedModel}` : 'manual_rescue',
        passType: 'fallback_pass',
        durationMs,
        confidence: 0.5,
        usedRoomFiles: readyFiles,
        repairUsed: false,
      },
    };
  }

  return {
    diagnosis: {
      primaryReason: reason,
      explanation: 'AI ยังตอบไม่ทัน จึงใช้แผน rescue แบบปลอดภัยเพื่อให้งานขยับได้โดยไม่ต้องเริ่มคิดใหม่',
    },
    rescuePlan: {
      mode: 'shrink',
      steps: [
        `ย่อ "${currentStep}" ให้เหลือก้าวที่ทำได้ใน 5 นาที`,
        'ทำเฉพาะสิ่งที่จะสร้างสัญญาณความคืบหน้าหนึ่งจุด',
        'ถ้ายังติด ให้จดคำถามเดียวที่ต้องตอบก่อนกลับมาทำต่อ',
      ],
    },
    suggestedMessage: undefined,
    meta: {
      model: options.failedModel ? `manual_rescue_after_${options.failedModel}` : 'manual_rescue',
      passType: 'fallback_pass',
      durationMs,
      confidence: 0.45,
      usedRoomFiles: readyFiles,
      repairUsed: false,
    },
  };
}
