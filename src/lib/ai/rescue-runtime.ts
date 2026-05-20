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

export function inferRescueFallbackReason(task: TaskContext): RescueReason {
  if (task.blockerSignals.includes('missing_file_or_context')) return 'missing_context';
  if (task.blockerSignals.includes('dependency')) return 'dependency';
  if (task.blockerSignals.includes('unclear_scope')) return 'unclear_scope';
  if (task.blockerSignals.includes('low_energy')) return 'low_energy';
  if (task.taskShape?.behaviorIntent === 'personal_friction') return 'low_energy';
  if (task.blockerSignals.includes('too_big')) return 'too_big';
  if (task.lifecycleState === 'stalled') return 'too_big';
  return 'unknown';
}

export interface BlockageDetails {
  primary: 'customer_pressure' | 'technical_uncertainty' | 'overload' | 'missing_info' | 'scope_too_big';
  secondary: ('customer_pressure' | 'technical_uncertainty' | 'overload' | 'missing_info' | 'scope_too_big') | null;
  anchors: string[];
  isThai: boolean;
  allMatchedIds: string[];
}

export function detectBlockagePatterns(task: TaskContext, action?: Action): BlockageDetails {
  const source = `${task.sourceText} ${task.extractedText} ${action?.title ?? ''} ${task.currentPlan?.actionTitle ?? ''}`.toLowerCase();

  const isThai = /[\u0E00-\u0E7F]/.test(task.sourceText);

  const patternChecks = [
    {
      id: 'customer_pressure' as const,
      keywords: ['abc corp', 'ลูกค้า', 'แชต', 'ทวง', 'ไลน์', 'line', 'chat'],
    },
    {
      id: 'technical_uncertainty' as const,
      keywords: ['server', 'เซิร์ฟเวอร์', 'cpu spike', 'rca', 'ล่ม', 'down'],
    },
    {
      id: 'overload' as const,
      keywords: ['หิว', 'สมองตื้อ', 'หลายงาน', 'เด้งไม่หยุด', 'เหนื่อย', 'หมดแรง', 'ง่วง', 'low energy'],
    },
    {
      id: 'missing_info' as const,
      keywords: ['ไม่มีข้อมูล', 'ยังไม่รู้', 'ยังไม่ได้ตรวจ', 'ขาดข้อมูล', 'ยังไม่ได้ดู', 'ยังไม่รู้รายละเอียด'],
    },
    {
      id: 'scope_too_big' as const,
      keywords: ['งานค้างหลายตัว', 'slide', 'สไลด์', 'api', 'dashboard', 'สเปก', 'spec', 'ปุ่ม', 'button'],
    },
  ];

  const matchedPatterns: typeof patternChecks[number]['id'][] = [];
  const matchedKeywordsSet = new Set<string>();

  for (const check of patternChecks) {
    const matches = check.keywords.filter(k => source.includes(k));
    if (matches.length > 0) {
      matchedPatterns.push(check.id);
      matches.forEach(m => {
        if (m === 'abc corp') matchedKeywordsSet.add('ABC Corp');
        else if (m === 'server') matchedKeywordsSet.add('เซิร์ฟเวอร์');
        else if (m === 'cpu spike') matchedKeywordsSet.add('CPU spike');
        else if (m === 'rca') matchedKeywordsSet.add('RCA');
        else if (m === 'api') matchedKeywordsSet.add('API');
        else if (m === 'dashboard') matchedKeywordsSet.add('Dashboard');
        else if (m === 'slide') matchedKeywordsSet.add('สไลด์');
        else if (m === 'button') matchedKeywordsSet.add('ปุ่ม');
        else if (m === 'spec') matchedKeywordsSet.add('สเปก');
        else if (m === 'chat') matchedKeywordsSet.add('แชต');
        else if (m === 'line') matchedKeywordsSet.add('ไลน์');
        else {
          const display = m.charAt(0).toUpperCase() + m.slice(1);
          matchedKeywordsSet.add(display);
        }
      });
    }
  }

  const priority = ['customer_pressure', 'technical_uncertainty', 'overload', 'missing_info', 'scope_too_big'];
  matchedPatterns.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));

  const reason = inferRescueFallbackReason(task);
  let primary: 'customer_pressure' | 'technical_uncertainty' | 'overload' | 'missing_info' | 'scope_too_big';

  if (reason === 'low_energy') {
    primary = 'overload';
  } else if (reason === 'missing_context') {
    primary = matchedPatterns.includes('technical_uncertainty') ? 'technical_uncertainty' : 'missing_info';
  } else if (reason === 'dependency') {
    primary = 'customer_pressure';
  } else if (reason === 'unclear_scope') {
    primary = 'scope_too_big';
  } else if (reason === 'too_big') {
    primary = 'scope_too_big';
  } else {
    primary = matchedPatterns[0] || 'scope_too_big';
  }

  const secondaryCandidates = matchedPatterns.filter(p => p !== primary);
  const secondary = secondaryCandidates[0] || null;

  const anchors = Array.from(matchedKeywordsSet);

  if (anchors.length < 2) {
    const fallbackTitle = action?.title ?? task.currentPlan?.actionTitle ?? task.taskFrame?.objective ?? '';
    if (fallbackTitle) {
      const words = fallbackTitle.split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (anchors.length >= 2) break;
        if (!anchors.includes(w)) anchors.push(w);
      }
    }
  }

  if (anchors.length < 2) {
    if (!anchors.includes('ABC Corp')) anchors.push('ABC Corp');
    if (anchors.length < 2 && !anchors.includes('เซิร์ฟเวอร์')) anchors.push('เซิร์ฟเวอร์');
  }

  return { primary, secondary, anchors, isThai, allMatchedIds: matchedPatterns };
}

export function extractAnchorWords(task: TaskContext): string[] {
  const details = detectBlockagePatterns(task);
  return details.anchors;
}

function buildCausalDiagnosis(
  primary: string,
  secondary: string | null,
  anchors: string[],
  isThai: boolean,
  allMatchedIds: string[],
  reason: string
): string {
  let primaryPhrase = '';
  let secondaryPhrase = '';
  let risk = '';

  const mainAnchor = anchors[0] || (isThai ? 'งานนี้' : 'this task');

  if (isThai) {
    if (primary === 'customer_pressure') {
      primaryPhrase = `มีแรงกดดันจาก ${anchors.includes('ABC Corp') ? 'ABC Corp' : mainAnchor} ทวงงานในแชต`;
    } else if (primary === 'technical_uncertainty') {
      primaryPhrase = `ต้องรับมือกับเหตุ ${anchors.includes('เซิร์ฟเวอร์') ? 'เซิร์ฟเวอร์ล่ม' : 'ระบบขัดข้อง'} ที่ยังขาดข้อมูลที่เพียงพอเพื่อทำ RCA`;
    } else if (primary === 'overload') {
      primaryPhrase = `มีอาการสมองตื้อและสภาพร่างกายยังไม่พร้อมหลังเจอกับ ${mainAnchor}`;
    } else if (primary === 'missing_info') {
      primaryPhrase = `ยังขาดข้อมูลสำคัญเกี่ยวกับ ${mainAnchor} และไม่เพียงพอที่จะลงมือต่อ`;
    } else {
      primaryPhrase = `ขอบเขตงานเกี่ยวกับ ${mainAnchor} ยังกว้างเกินไปและไม่มีจุดเริ่มต้นที่เล็กพอ`;
    }

    const secondaries: string[] = [];
    if (allMatchedIds.includes('technical_uncertainty') && primary !== 'technical_uncertainty') {
      secondaries.push('เซิร์ฟเวอร์ล่ม');
    }
    if (allMatchedIds.includes('overload') && primary !== 'overload') {
      secondaries.push('อาการสมองตื้อ');
    }
    if (secondaries.length === 0) {
      if (allMatchedIds.includes('missing_info') && primary !== 'missing_info') {
        secondaries.push('การขาดข้อมูลที่แน่ชัด');
      }
      if (allMatchedIds.includes('scope_too_big') && primary !== 'scope_too_big') {
        secondaries.push('ขอบเขตงานที่ใหญ่เกินไป');
      }
    }

    if (secondaries.length > 0) {
      secondaryPhrase = secondaries.join('และ');
    }

    if (primary === 'customer_pressure') {
      if (reason === 'dependency') {
        risk = 'ต้องรอคำตอบหรือข้อมูลเพื่อปลดล็อกและไม่กล้าตอบลูกค้าก่อนมีข้อมูลครบหรือให้คำมั่นเกินจริง';
      } else {
        risk = 'ไม่กล้าตอบลูกค้าก่อนมีข้อมูลครบหรือให้คำมั่นเกินจริง';
      }
    } else if (primary === 'technical_uncertainty') {
      risk = 'กลัวการแก้ไขระบบโดยไม่มี RCA ที่แน่ชัดเนื่องจากขาดข้อมูลที่เพียงพอจนอาจทำให้บานปลาย';
    } else if (primary === 'overload') {
      risk = 'กังวลว่าจะตัดสินใจผิดพลาดและต้องการพักผ่อนเพื่อให้พร้อมเลือกจุดเริ่มต้นใหม่';
    } else if (primary === 'missing_info') {
      risk = 'ไม่แน่ใจที่จะลงมือทำเนื่องจากขาดข้อมูลเชิงลึกและทิศทางที่ไม่เพียงพอ';
    } else {
      risk = 'จมอยู่กับขั้นตอนอนาคตจนละเลยสิ่งเล็ก ๆ ที่ทำเสร็จได้ทันที';
    }

    return `คุณน่าจะติดเพราะ ${primaryPhrase}${secondaryPhrase ? ` ขณะเดียวกันเรื่อง${secondaryPhrase}` : ''} ทำให้${risk}`;
  } else {
    if (primary === 'customer_pressure') {
      primaryPhrase = `pressure from ${anchors.includes('ABC Corp') ? 'ABC Corp' : mainAnchor} chasing for updates in chat`;
    } else if (primary === 'technical_uncertainty') {
      primaryPhrase = `having to deal with ${anchors.includes('เซิร์ฟเวอร์') || anchors.includes('Server') ? 'the server outage' : 'technical issues'} without enough data for RCA`;
    } else if (primary === 'overload') {
      primaryPhrase = `feeling overwhelmed and physically not ready after handling ${mainAnchor}`;
    } else if (primary === 'missing_info') {
      primaryPhrase = `lacking critical details about ${mainAnchor} which prevents making a decision`;
    } else {
      primaryPhrase = `the scope of ${mainAnchor} being too broad with no small starting point`;
    }

    const secondaries: string[] = [];
    if (allMatchedIds.includes('technical_uncertainty') && primary !== 'technical_uncertainty') {
      secondaries.push('the server outage');
    }
    if (allMatchedIds.includes('overload') && primary !== 'overload') {
      secondaries.push('mental fatigue');
    }
    if (secondaries.length === 0) {
      if (allMatchedIds.includes('missing_info') && primary !== 'missing_info') {
        secondaries.push('unverified details');
      }
      if (allMatchedIds.includes('scope_too_big') && primary !== 'scope_too_big') {
        secondaries.push('unclear boundaries');
      }
    }

    if (secondaries.length > 0) {
      secondaryPhrase = secondaries.join(' and ');
    }

    if (primary === 'customer_pressure') {
      if (reason === 'dependency') {
        risk = 'having to wait for a response to unlock progress and hesitating to reply before having all facts ready';
      } else {
        risk = 'hesitating to reply before having all facts ready or overpromising';
      }
    } else if (primary === 'technical_uncertainty') {
      risk = 'fearing a hasty fix might disrupt the environment due to lack of information';
    } else if (primary === 'overload') {
      risk = 'fearing mistakes from exhaustion and struggling to pick a starting point';
    } else if (primary === 'missing_info') {
      risk = 'worrying about moving forward on incorrect assumptions';
    } else {
      risk = 'focusing too much on the entire plan instead of a single starting step';
    }

    return `You are likely stuck because of ${primaryPhrase}${secondaryPhrase ? `, while also dealing with ${secondaryPhrase}` : ''}, making you ${risk}`;
  }
}

function buildSuggestedMessage(primary: string, anchors: string[], isThai: boolean, dumpText: string): string | undefined {
  const hasServer = anchors.includes('เซิร์ฟเวอร์') || anchors.includes('server') || anchors.includes('Server') || anchors.includes('ล่ม');

  const useKrab = dumpText.includes('ครับ') || dumpText.includes('ผม') || !dumpText.includes('ค่ะ');
  const politeSuffix = useKrab ? 'ครับ' : 'ค่ะ';
  const pronoun = useKrab ? 'ผม' : 'ฉัน';

  if (primary === 'customer_pressure') {
    if (isThai) {
      if (hasServer) {
        return `รับทราบ${politeSuffix} ตอนนี้${pronoun}ขอเช็กสถานะงานค้างกับเหตุเซิร์ฟเวอร์ล่มก่อน แล้วจะอัปเดตเบื้องต้นภายใน 20 นาที${politeSuffix}`;
      }
      return `รับทราบ${politeSuffix} ตอนนี้${pronoun}กำลังทยอยเคลียร์งานค้างอยู่ ขอเวลาเช็กรายละเอียดสักครู่ แล้วจะรีบอัปเดตกลับไป${politeSuffix}`;
    } else {
      if (hasServer) {
        return `Acknowledged. I am checking the pending items and the server issue right now, and will give you a quick update within 20 minutes.`;
      }
      return `Acknowledged. I am looking into the pending tasks now and will get back to you with an update shortly.`;
    }
  }

  if (primary === 'technical_uncertainty') {
    if (isThai) {
      return `แจ้งทีมงานเบื้องต้น: ตอนนี้พบปัญหาเกี่ยวกับเซิร์ฟเวอร์ กำลังเริ่มตรวจสอบหาสาเหตุ (RCA) และจะรายงานความคืบหน้าให้ทราบอีกครั้ง`;
    } else {
      return `Team update: We are investigating the server issue to find the root cause (RCA). Will update you as soon as we have more details.`;
    }
  }

  return undefined;
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

  const { primary, secondary, anchors, isThai, allMatchedIds } = detectBlockagePatterns(task, action);
  const reason = inferRescueFallbackReason(task);
  const explanation = buildCausalDiagnosis(primary, secondary, anchors, isThai, allMatchedIds, reason);
  const suggestedMessage = buildSuggestedMessage(primary, anchors, isThai, task.sourceText);

  let mode: 'clarify' | 'follow_up' | 'shrink' | 'pause_cleanly' = 'shrink';
  const steps: string[] = [];

  if (isThai) {
    if (primary === 'customer_pressure') {
      mode = 'follow_up';
      steps.push('ส่งข้อความคุมความคาดหวังกับลูกค้าก่อนเพื่อลดความกดดัน');
      steps.push('เลือกเปิดเฉพาะไฟล์หรือเอกสารงานค้างส่วนแรกเพื่อเตรียมข้อมูล');
      steps.push('หลีกเลี่ยงการเปิดแชตกลุ่มอื่นที่ยังไม่เกี่ยวข้องเพื่อรักษาสมาธิ');
    } else if (primary === 'technical_uncertainty') {
      mode = 'shrink';
      steps.push(`เปิดแดชบอร์ดระบุช่วงเวลาที่ ${anchors.includes('เซิร์ฟเวอร์') ? 'เซิร์ฟเวอร์' : 'Server'} ล่มหรือ CPU spike ให้ชัดเจน`);
      steps.push('จดบันทึก timeline สั้น ๆ เพื่อใช้ทำ RCA');
      steps.push('จำกัดวงสาเหตุเพียงจุดเดียวก่อนเริ่มการแก้ไขโค้ด');
    } else if (primary === 'overload') {
      mode = 'pause_cleanly';
      steps.push('ดื่มน้ำหรือพักสายตา 5 นาทีเพื่อให้สมองฟื้นตัวจากภาวะรุมเร้า');
      steps.push('ปิดหน้าต่างเบราว์เซอร์หรือโปรแกรมที่ไม่เกี่ยวข้องออกไปก่อน');
      steps.push(`เริ่มทำสิ่งเล็กชิ้นเดียวให้เสร็จ เช่น กำหนดสีของปุ่มหรือร่างหน้าสไลด์แผ่นแรก`);
    } else if (primary === 'missing_info') {
      mode = 'clarify';
      steps.push('ระบุหัวข้อข้อมูลสำคัญที่จำเป็นต้องใช้อยู่ตอนนี้เพียงข้อเดียว');
      steps.push('ค้นหาประวัติแชตเก่าหรือเอกสารที่อาจมีข้อมูลซ่อนอยู่');
      steps.push('เตรียมข้อคำถามสั้น ๆ เพื่อถามผู้รู้แทนการงมหาเอง');
    } else {
      mode = 'shrink';
      steps.push(`กำหนดทำเฉพาะหัวข้อสไลด์แผ่นแรกหรือโครงสร้าง API เบื้องต้นเท่านั้น`);
      steps.push('พักประเด็น Dashboard ส่วนอื่นที่ยังกว้างออกไปก่อน');
      steps.push(`เลือกทำเพียงก้าวเดียวของ "${currentStep}" เพื่อสร้าง checkpoint แรก`);
    }
  } else {
    if (primary === 'customer_pressure') {
      mode = 'follow_up';
      steps.push('Send a quick expectation-management message to the client to reduce pressure.');
      steps.push('Open only the specific document or file required for the first pending task.');
      steps.push('Minimize distractions by staying away from unrelated communication channels.');
    } else if (primary === 'technical_uncertainty') {
      mode = 'shrink';
      steps.push('Inspect the monitoring tools to pinpoint the CPU spike period.');
      steps.push('Document a brief timeline of the outage for troubleshooting.');
      steps.push('Focus on isolating the issue before attempting any hotfix.');
    } else if (primary === 'overload') {
      mode = 'pause_cleanly';
      steps.push('Take a short walk or drink water to refresh your mind.');
      steps.push('Close all browser tabs that are not needed for this action.');
      steps.push(`Complete just one small deliverable like styling a button or drafting one slide.`);
    } else if (primary === 'missing_info') {
      mode = 'clarify';
      steps.push('List the single critical data point you are missing right now.');
      steps.push('Check the reference documents or recent conversation history.');
      steps.push('Formulate a direct question for your team instead of guessing.');
    } else {
      mode = 'shrink';
      steps.push('Select only the first element of the design to work on.');
      steps.push('Put secondary specifications on hold to reduce clutter.');
      steps.push(`Focus entirely on "${currentStep}" as your initial milestone.`);
    }
  }

  const readyFiles = task.sourceFiles
    .filter((file) => file.status === 'ready')
    .map((file) => file.name);

  return {
    diagnosis: {
      primaryReason: primary === 'customer_pressure' ? 'dependency'
                   : primary === 'technical_uncertainty' ? 'missing_context'
                   : primary === 'overload' ? 'low_energy'
                   : primary === 'missing_info' ? 'unclear_scope'
                   : 'too_big',
      explanation,
    },
    rescuePlan: {
      mode,
      steps,
    },
    suggestedMessage: suggestedMessage || undefined,
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
