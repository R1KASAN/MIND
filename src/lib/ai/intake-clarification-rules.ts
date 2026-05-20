import type { TaskShape } from '@/lib/ai/task-shape';

export type IntakeClarificationFamily =
  | 'customer_pressure'
  | 'unresolved_incident'
  | 'unknown_latest_status'
  | 'pending_commitment'
  | 'pending_work_detail_missing'
  | 'human_overload';

export interface IntakeClarificationInferenceInput {
  sourceText: string;
  taskShape: TaskShape;
  aiRequiresClarification?: boolean;
  aiClarificationQuestion?: string | null;
}

export interface IntakeClarificationInference {
  requiresClarification: boolean;
  clarificationQuestion?: string;
  matchedFamilies: IntakeClarificationFamily[];
  anchors: string[];
  reason: string;
}

function normalizeRuleText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function collectFamilies(sourceText: string): IntakeClarificationFamily[] {
  const normalized = normalizeRuleText(sourceText);
  const families: IntakeClarificationFamily[] = [];

  if (includesAny(normalized, [
    'ลูกค้า',
    'ผู้ว่าจ้าง',
    'client',
    'customer',
    'ทวง',
    'ถามในไลน์',
    'ไลน์',
    'แชต',
    'chat',
    'รอคำตอบ',
    'ตอบลูกค้า',
  ])) {
    families.push('customer_pressure');
  }

  if (includesAny(normalized, [
    'prod',
    'production',
    'โปรดักชัน',
    'server',
    'เซิร์ฟเวอร์',
    'ระบบล่ม',
    'ล่ม',
    'incident',
    'alert',
    'webhook',
    'cpu spike',
    'rca',
  ])) {
    families.push('unresolved_incident');
  }

  if (includesAny(normalized, [
    'ยังไม่รู้สถานะล่าสุด',
    'ไม่รู้สถานะล่าสุด',
    'ยังไม่ชัด',
    'ไม่ชัด',
    'ยังไม่มี rca',
    'ไม่มี rca',
    'ยังไม่ปิด incident',
    'ยังไม่รู้ว่าเสร็จตรงไหน',
    'ยังไม่รู้ว่ากลับมาปกติหรือยัง',
    'ยังไม่รู้ root cause',
    'ไม่กล้า confirm',
    'กลัว commit',
    'ยังไม่ได้ตอบลูกค้า',
  ])) {
    families.push('unknown_latest_status');
  }

  if (includesAny(normalized, [
    'deadline',
    'บ่ายนี้',
    'วันนี้',
    'ต้องตอบ',
    'ทีมถาม',
    'รอ spec',
    'สเปก',
    'ยังไม่ deploy',
    'ต้องเช็ก response',
    'release',
    'timeline',
    'commit',
  ])) {
    families.push('pending_commitment');
  }

  if (includesAny(normalized, [
    'งานค้าง',
    'ค้าง 2 ตัว',
    'ค้างสองตัว',
    'ยังไม่เสร็จ',
    'เหลือ',
    'dashboard',
    'payment api',
    'mockup',
    'deploy',
  ])) {
    families.push('pending_work_detail_missing');
  }

  if (includesAny(normalized, [
    'หิว',
    'ตื้อ',
    'เหนื่อย',
    'สมองตื้อ',
    'เครียด',
    'ไม่รู้ควรเริ่ม',
    'ไม่รู้จะเริ่ม',
    'overload',
  ])) {
    families.push('human_overload');
  }

  return [...new Set(families)];
}

function collectAnchors(sourceText: string) {
  const anchors: string[] = [];
  const candidates = [
    /[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2}/g,
    /(ABC Corp|Beta Logistics|prod|production|โปรดักชัน|server|เซิร์ฟเวอร์|incident|RCA|CPU spike|Dashboard|payment API|webhook|แชต|ไลน์|ลูกค้า|ทีม|สไลด์|สเปกปุ่ม)/gi,
  ];

  for (const pattern of candidates) {
    const matches = sourceText.match(pattern) ?? [];
    for (const match of matches) {
      const trimmed = match.trim();
      if (trimmed.length >= 2 && !anchors.includes(trimmed)) anchors.push(trimmed);
    }
  }

  return anchors.slice(0, 8);
}

function classifyQuestionRejection(question: string | null | undefined, anchors: string[]) {
  const normalized = normalizeRuleText(question ?? '');
  if (!normalized) return 'clarification_question_rejected_no_anchors' as const;
  if (includesAny(normalized, ['ข้อมูลเพิ่ม', 'รายละเอียดเพิ่ม', 'ช่วยบอกเพิ่ม', 'ช่วยเล่าเพิ่ม'])) {
    return 'clarification_question_rejected_generic' as const;
  }
  const hasAnchor = anchors.some((anchor) => normalized.includes(normalizeRuleText(anchor)));
  const hasSemanticContext = includesAny(normalized, ['สถานะ', 'status', 'งานค้าง', 'incident', 'rca', 'commit', 'ตอบลูกค้า']);
  if (!hasAnchor && !hasSemanticContext) return 'clarification_question_rejected_unrelated' as const;
  return undefined;
}

function resolveQuestion(sourceText: string, families: IntakeClarificationFamily[], anchors: string[], aiQuestion?: string) {
  const rejection = classifyQuestionRejection(aiQuestion, anchors);
  if (!rejection) return aiQuestion;
  if (aiQuestion) {
    console.info(`[MIND][${rejection}]`, {
      reason: rejection,
      anchors,
      families,
    });
  }
  return buildClarificationQuestion(sourceText, families, anchors);
}

function buildClarificationQuestion(sourceText: string, families: IntakeClarificationFamily[], anchors: string[]) {
  const normalized = normalizeRuleText(sourceText);
  const primaryAnchor = anchors.find((anchor) => /corp|logistics|ลูกค้า|client/i.test(anchor)) ?? anchors[0] ?? 'ลูกค้า/ทีม';
  const incidentLabel = includesAny(normalized, ['prod', 'production', 'โปรดักชัน'])
    ? 'prod'
    : includesAny(normalized, ['webhook'])
      ? 'webhook'
      : 'incident';

  if (families.includes('human_overload')) {
    return `ขอเช็กสั้น ๆ ก่อนเลือกก้าวแรก: ตอนนี้ ${incidentLabel}/สถานะล่าสุดยืนยันได้แค่ไหน และงานค้างไหนที่ตอบ ${primaryAnchor} ได้ปลอดภัยที่สุด?`;
  }

  return `ก่อนเลือกก้าวแรก ขอข้อมูลที่กันการ commit เกินจริง: สถานะล่าสุดของ ${incidentLabel} คืออะไร, งานค้างที่ต้องตอบ ${primaryAnchor} ค้างตรงไหน, และตอนนี้รับปากอะไรได้อย่างปลอดภัย?`;
}

export function inferIntakeClarificationNeed(input: IntakeClarificationInferenceInput): IntakeClarificationInference {
  const sourceText = input.sourceText;
  const matchedFamilies = collectFamilies(sourceText);
  const anchors = collectAnchors(sourceText);
  const forceClarification = sourceText.includes('FORCE_CLARIFICATION');
  const aiQuestion = input.aiClarificationQuestion?.trim() || undefined;

  if (forceClarification) {
    const clarificationQuestion = resolveQuestion(sourceText, matchedFamilies, anchors, aiQuestion);
    return {
      requiresClarification: true,
      clarificationQuestion,
      matchedFamilies,
      anchors,
      reason: 'force_clarification_marker',
    };
  }

  const deterministicTrigger =
    matchedFamilies.includes('unknown_latest_status') &&
    matchedFamilies.includes('customer_pressure') &&
    (
      matchedFamilies.includes('unresolved_incident') ||
      matchedFamilies.includes('pending_commitment') ||
      matchedFamilies.includes('pending_work_detail_missing')
    );

  if (deterministicTrigger) {
    const clarificationQuestion = resolveQuestion(sourceText, matchedFamilies, anchors, aiQuestion);
    const result = {
      requiresClarification: true,
      clarificationQuestion,
      matchedFamilies,
      anchors,
      reason: 'clarification_rule_triggered',
    };
    console.info('[MIND][clarification_rule_triggered]', {
      matchedFamilies,
      anchors,
      reason: result.reason,
    });
    return result;
  }

  if (input.aiRequiresClarification) {
    return {
      requiresClarification: true,
      clarificationQuestion: aiQuestion,
      matchedFamilies,
      anchors,
      reason: 'ai_requested_clarification',
    };
  }

  return {
    requiresClarification: false,
    clarificationQuestion: undefined,
    matchedFamilies,
    anchors,
    reason: 'no_clarification_needed',
  };
}
