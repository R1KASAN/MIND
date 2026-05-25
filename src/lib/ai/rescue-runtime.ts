import type { AiRescueResponse } from '@/lib/ai/operations';
import type { Action, RescueReason, TaskContext } from '@/lib/store/idb';
import {
  collectRawRoomSourceContext,
  isInternalPresentationPrepText,
  isPhysicalRoomResetText,
  isProductPostText,
  isStudentReportText,
  PHYSICAL_ROOM_RESCUE_STEP,
  PRODUCT_POST_RESCUE_STEP,
  PRESENTATION_PREP_RESCUE_STEP,
  buildStudentReportRescueStep,
} from '@/lib/source-grounding';

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

function normalizeContextText(task: TaskContext, action?: Action, currentStepIndex = 0) {
  return [
    task.sourceText,
    task.extractedText,
    task.taskFrame?.objective,
    task.taskFrame?.stage,
    task.taskFrame?.stakeholders?.join(' '),
    task.currentPlan?.actionTitle,
    task.currentPlan?.steps[currentStepIndex]?.text,
    action?.title,
    action?.microSteps[currentStepIndex],
  ].filter(Boolean).join(' ');
}

function normalizeTrustedContextText(task: TaskContext) {
  return [
    task.sourceText,
    task.extractedText,
    task.taskFrame?.objective,
    task.taskFrame?.stage,
    task.taskFrame?.stakeholders?.join(' '),
    task.pendingInputs?.map((input) => input.answer).join(' '),
    task.taskShape?.workContext,
  ].filter(Boolean).join(' ');
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function compactStep(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

interface FileBackedRescueStep {
  step: string;
  explanation?: string;
  usedRoomFiles: string[];
}

function extractLogoDetail(text: string, patterns: RegExp[]) {
  const lines = text
    .split(/\r?\n|[•]/u)
    .map((line) => compactStep(line))
    .filter((line) => !/^subject\s*:/iu.test(line))
    .filter(Boolean);

  for (const pattern of patterns) {
    const lineIndex = lines.findIndex((candidate) => pattern.test(candidate));
    if (lineIndex < 0) continue;
    const line = lines[lineIndex];

    const detail = line
      .replace(/^\d+\.\s*/u, '')
      .replace(/^(?:[-*]\s*)?(?:color|สี|font|ฟอนต์|logo\s*size|ขนาดโลโก้|ขนาด)\s*[:：\-–]\s*/iu, '')
      .replace(/^change\s+/iu, 'ปรับ ')
      .replace(/^use\s+/iu, 'ใช้ ')
      .replace(/^make\s+/iu, 'ทำ ')
      .trim();

    // If the heading has useful detail after stripping, use it
    if (detail && detail !== line && hasSpecificLogoDetail(detail)) return detail;

    // Otherwise look at the next 1–2 lines for actual content
    for (let offset = 1; offset <= 2 && lineIndex + offset < lines.length; offset++) {
      const nextLine = lines[lineIndex + offset];
      // Stop if we hit another section heading
      if (/^\d+\.\s/u.test(nextLine)) break;
      const nextDetail = nextLine
        .replace(/^(?:please\s+)?/iu, '')
        .replace(/^change\s+/iu, 'ปรับ ')
        .replace(/^use\s+/iu, 'ใช้ ')
        .replace(/^make\s+/iu, 'ทำ ')
        .trim();
      if (nextDetail && hasSpecificLogoDetail(nextDetail)) return nextDetail;
    }

    // Fall back to the original detail if nothing better found
    if (detail && detail !== line) return detail;
    return line;
  }

  return '';
}

function hasSpecificLogoDetail(value: string) {
  return /[:：\-–]|จาก .+ เป็น|from .+ to|ประมาณ\s*\d+|\d+\s*(?:%|percent)|smaller|warmer|rounded|brand|header/iu.test(value);
}

function buildLogoRescueFromAvailableFiles(task: TaskContext, action?: Action, currentStepIndex = 0): FileBackedRescueStep | null {
  const currentStep = compactStep(pickCurrentStep(task, action, currentStepIndex));
  const stepLooksLogoSpecific = /สี|color|ฟอนต์|font|ขนาดโลโก้|logo\s*size/u.test(currentStep) &&
    /โลโก้|logo/u.test(`${currentStep} ${task.currentPlan?.actionTitle ?? ''} ${action?.title ?? ''}`);

  if (!stepLooksLogoSpecific) return null;

  const readyFiles = task.sourceFiles.filter((file) => file.status === 'ready');
  const relevantFiles = readyFiles.filter((file) => {
    const text = `${file.name} ${file.extractedText ?? ''}`.toLowerCase();
    return /logo|โลโก้|font|ฟอนต์|color|สี|size|ขนาด/u.test(text);
  });
  const fileTexts = relevantFiles
    .map((file) => ({ name: file.name, text: file.extractedText?.trim() ?? '' }))
    .filter((file) => file.text);

  const combinedFileText = fileTexts.map((file) => file.text).join('\n');
  const trustedSummary = task.extractedText;
  const sourceForSummary = combinedFileText || trustedSummary;
  const hasRelevantFileContext = fileTexts.length > 0 || /สรุปจากไฟล์|file summary/iu.test(trustedSummary);

  if (!hasRelevantFileContext) {
    return {
      step: 'เขียนหัวข้อเปล่า 3 ช่องใน Notes ก่อน:\n- สี\n- ฟอนต์\n- ขนาดโลโก้',
      usedRoomFiles: [],
    };
  }

  const color = extractLogoDetail(sourceForSummary, [
    /(?:^|[\s:：\-–])(?:สี|color)(?:[\s:：\-–]|$)/iu,
    /dark\s*navy|warmer\s*green|brand\s*color/iu,
  ]);
  const font = extractLogoDetail(sourceForSummary, [
    /(?:^|[\s:：\-–])(?:ฟอนต์|font)(?:[\s:：\-–]|$)/iu,
    /rounded\s*font|brand\s*name|corporate/iu,
  ]);
  const logoSize = extractLogoDetail(sourceForSummary, [
    /(?:ขนาดโลโก้|logo\s*size|icon\s*mark|header)/iu,
    /\d+\s*%|smaller/iu,
  ]);

  const isSummaryOnly = /สรุปจากไฟล์|สรุปไฟล์|file summary/iu.test(sourceForSummary);
  const hasSpecificDetails = !isSummaryOnly && [color, font, logoSize].every((detail) => detail && hasSpecificLogoDetail(detail));
  const usedRoomFiles = fileTexts.map((file) => file.name);

  if (hasSpecificDetails) {
    return {
      explanation: 'ยังไม่ได้แปลง brief จากลูกค้าให้เป็นรายการแก้โลโก้ที่ชัดเจน จึงยังไม่พร้อมร่างคำตอบลูกค้า',
      step: [
        'จด 3 รายการนี้ลง Notes:',
        `- สี: ${color}`,
        `- ฟอนต์: ${font}`,
        `- ขนาดโลโก้: ${logoSize}`,
      ].join('\n'),
      usedRoomFiles,
    };
  }

  if (hasRelevantFileContext) {
    return {
      step: [
        'จากสรุปไฟล์ที่มีตอนนี้ จดหัวข้อที่พบใน Notes:',
        '- สี: มีการพูดถึงการปรับสี',
        '- ฟอนต์: มีการพูดถึงฟอนต์',
        '- ขนาดโลโก้: มีการพูดถึงขนาดโลโก้',
      ].join('\n'),
      usedRoomFiles,
    };
  }

  return null;
}

function looksLikeBroadPlan(value: string) {
  const normalized = value.toLowerCase();
  return includesAny(normalized, [
    /root cause|rca|วิเคราะห์.*สาเหตุ|หาสาเหตุ/u,
    /plan|แผน|หลายขั้น|sequence|roadmap/u,
    /troubleshoot|แก้ไขโค้ด|hotfix/u,
  ]);
}

function buildGroundedSingleRescueStep(task: TaskContext, action?: Action, currentStepIndex = 0) {
  const fileBackedStep = buildLogoRescueFromAvailableFiles(task, action, currentStepIndex);
  if (fileBackedStep) return fileBackedStep.step;

  const context = normalizeContextText(task, action, currentStepIndex);
  const lower = context.toLowerCase();
  const trustedLower = normalizeTrustedContextText(task).toLowerCase();
  const isThai = /[\u0E00-\u0E7F]/.test(context);
  const hasDashboard = /dashboard/u.test(lower);
  const hasPaymentApi = /payment\s*api|ระบบจ่ายเงิน/u.test(lower);
  const hasCs = /\bcs\b|ทีม\s*cs/u.test(lower);
  const hasIncident = /\bincident\b|อินซิเดนต์|timeout|ล่ม/u.test(lower);
  const hasCustomer = /\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\s+(?:Corp|Co|Ltd|Inc|LLC|Bank)\b|ลูกค้า|client|customer/iu.test(collectRawRoomSourceContext(task));
  const hasReplyPressure = /ตอบ|reply|update|อัปเดต|status/u.test(lower);
  const hasDemoMind = /demo\s*mind/u.test(trustedLower);
  const hasDemoQaAnchors = hasDemoMind &&
    /fallback latency/u.test(trustedLower) &&
    /reentry card/u.test(trustedLower) &&
    /evidence source/u.test(trustedLower);
  const hasInternalPresentationPrep = isInternalPresentationPrepText(normalizeTrustedContextText(task));
  const hasPhysicalRoomReset = isPhysicalRoomResetText(normalizeTrustedContextText(task));
  const hasStudentReport = isStudentReportText(normalizeTrustedContextText(task));
  const hasProductPost = isProductPostText(normalizeTrustedContextText(task));
  const currentStep = compactStep(pickCurrentStep(task, action, currentStepIndex));
  const firstProvidedStep = compactStep(task.currentPlan?.steps[currentStepIndex]?.text ?? action?.microSteps[currentStepIndex] ?? '');

  if (isThai) {
    if (hasDemoQaAnchors) {
      return 'จด 3 จุดที่ต้องโชว์ใน demo: fallback latency, reentry card, evidence source';
    }
    if (hasInternalPresentationPrep) {
      return PRESENTATION_PREP_RESCUE_STEP;
    }
    if (hasPhysicalRoomReset) {
      return PHYSICAL_ROOM_RESCUE_STEP;
    }
    if (hasStudentReport) {
      return buildStudentReportRescueStep(normalizeTrustedContextText(task));
    }
    if (hasProductPost) {
      return PRODUCT_POST_RESCUE_STEP;
    }
    if (hasDashboard && hasPaymentApi && hasCs) {
      return 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วเติมอัปเดต 3 บรรทัดให้ CS';
    }
    if (hasDashboard && hasPaymentApi) {
      return 'เปิด Dashboard เช็กสถานะล่าสุดของ payment API แล้วจดอัปเดต 3 บรรทัด';
    }
    if (hasIncident && hasCs) {
      return 'เช็กสถานะล่าสุดของ incident แล้วร่างอัปเดต 3 บรรทัดให้ CS';
    }
    if (hasCustomer && hasReplyPressure) {
      return 'ร่างอัปเดตลูกค้า 3 บรรทัดจากข้อมูลที่มีตอนนี้';
    }
    if (task.blockerSignals.includes('missing_file_or_context')) {
      return 'เติมข้อมูลที่ขาดที่สุด 1 จุดในห้องนี้ก่อนให้ MIND ไปต่อ';
    }
    if (firstProvidedStep && !looksLikeBroadPlan(firstProvidedStep)) {
      return firstProvidedStep;
    }
    return `ทำเฉพาะก้าวเล็กสุดของ "${currentStep}" ให้เห็นผลหนึ่งจุด`;
  }

  if (hasDemoQaAnchors) {
    return 'Write the three demo points to show: fallback latency, reentry card, and evidence source.';
  }
  if (hasDashboard && hasPaymentApi && hasCs) {
    return 'Open the Dashboard, check the latest payment API status, then draft a three-line update for CS.';
  }
  if (hasDashboard && hasPaymentApi) {
    return 'Open the Dashboard, check the latest payment API status, then write a three-line update.';
  }
  if (hasIncident && hasCs) {
    return 'Check the latest incident status, then draft a three-line update for CS.';
  }
  if (hasCustomer && hasReplyPressure) {
    return 'Draft a three-line customer update from the facts available now.';
  }
  if (task.blockerSignals.includes('missing_file_or_context')) {
    return 'Add the single missing context detail this room needs before continuing.';
  }
  if (firstProvidedStep && !looksLikeBroadPlan(firstProvidedStep)) {
    return firstProvidedStep;
  }
  return `Do only the smallest visible part of "${currentStep}" first.`;
}

export function normalizeRescueResponse(options: {
  task: TaskContext;
  action?: Action;
  currentStepIndex: number;
  rescue: AiRescueResponse;
}): AiRescueResponse {
  const { task, action, currentStepIndex, rescue } = options;
  const fileBackedStep = buildLogoRescueFromAvailableFiles(task, action, currentStepIndex);
  const singleStep = fileBackedStep?.step ?? buildGroundedSingleRescueStep(task, action, currentStepIndex);
  const reason = rescue.diagnosis.primaryReason;
  const mode = reason === 'missing_context'
    ? 'clarify'
    : reason === 'dependency'
      ? 'follow_up'
      : 'shrink';
  const usedRoomFiles = fileBackedStep
    ? fileBackedStep.usedRoomFiles
    : rescue.meta.usedRoomFiles;

  return {
    ...rescue,
    diagnosis: {
      ...rescue.diagnosis,
      explanation: fileBackedStep?.explanation ?? rescue.diagnosis.explanation,
    },
    rescuePlan: {
      ...rescue.rescuePlan,
      mode,
      steps: [singleStep],
    },
    meta: {
      ...rescue.meta,
      usedRoomFiles,
    },
  };
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

  const { primary, secondary, anchors, isThai, allMatchedIds } = detectBlockagePatterns(task, action);
  const reason = inferRescueFallbackReason(task);
  const explanation = buildCausalDiagnosis(primary, secondary, anchors, isThai, allMatchedIds, reason);
  const suggestedMessage = buildSuggestedMessage(primary, anchors, isThai, task.sourceText);
  const fallbackReason = (options.failureDetail ?? options.failedModel ?? reason)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  let mode: 'clarify' | 'follow_up' | 'shrink' | 'pause_cleanly' = 'shrink';
  const fileBackedStep = buildLogoRescueFromAvailableFiles(task, action, currentStepIndex);
  const steps = [fileBackedStep?.step ?? buildGroundedSingleRescueStep(task, action, currentStepIndex)];

  if (isThai) {
    if (primary === 'customer_pressure') {
      mode = 'follow_up';
    } else if (primary === 'technical_uncertainty') {
      mode = 'shrink';
    } else if (primary === 'overload') {
      mode = 'shrink';
    } else if (primary === 'missing_info') {
      mode = 'clarify';
    } else {
      mode = 'shrink';
    }
  } else {
    if (primary === 'customer_pressure') {
      mode = 'follow_up';
    } else if (primary === 'technical_uncertainty') {
      mode = 'shrink';
    } else if (primary === 'overload') {
      mode = 'shrink';
    } else if (primary === 'missing_info') {
      mode = 'clarify';
    } else {
      mode = 'shrink';
    }
  }

  return {
    diagnosis: {
      primaryReason: primary === 'customer_pressure' ? 'dependency'
                   : primary === 'technical_uncertainty' ? 'missing_context'
                   : primary === 'overload' ? 'low_energy'
                   : primary === 'missing_info' ? 'unclear_scope'
                   : 'too_big',
      explanation: fileBackedStep?.explanation ?? explanation,
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
      usedRoomFiles: fileBackedStep?.usedRoomFiles ?? [],
      repairUsed: false,
    },
    source: 'manual_fallback',
    aiProvider: null,
    aiAnalysisUsed: false,
    fallbackReason,
  };
}
