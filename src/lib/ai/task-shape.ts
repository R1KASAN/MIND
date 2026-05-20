export const TASK_SHAPE_DELIVERABLE_TYPES = [
  'reply',
  'proposal',
  'timeline',
  'estimate',
  'execution',
  'unknown',
] as const;

export const TASK_SHAPE_IMMEDIATE_NEEDS = [
  'send_reply_now',
  'define_scope',
  'prepare_inputs',
  'resume_execution',
] as const;

export const TASK_BEHAVIOR_INTENTS = [
  'personal_friction',
  'client_delivery',
  'admin_task',
] as const;

export type TaskShapeDeliverableType = (typeof TASK_SHAPE_DELIVERABLE_TYPES)[number];
export type TaskShapeImmediateNeed = (typeof TASK_SHAPE_IMMEDIATE_NEEDS)[number];
export type TaskBehaviorIntent = (typeof TASK_BEHAVIOR_INTENTS)[number];
export type TaskShapeWorkflowType = 'client_response' | 'client_resume';

export interface TaskShape {
  deliverableType: TaskShapeDeliverableType;
  immediateNeed: TaskShapeImmediateNeed;
  missingInputs: string[];
  workContext: string;
  behaviorIntent?: TaskBehaviorIntent;
  confidence?: number;
}

interface PartialTaskShapeInput {
  deliverableType?: unknown;
  immediateNeed?: unknown;
  missingInputs?: unknown;
  workContext?: unknown;
  behaviorIntent?: unknown;
  confidence?: unknown;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeTextForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function coerceDeliverableType(value: unknown): TaskShapeDeliverableType | undefined {
  return TASK_SHAPE_DELIVERABLE_TYPES.includes(value as TaskShapeDeliverableType)
    ? value as TaskShapeDeliverableType
    : undefined;
}

function coerceImmediateNeed(value: unknown): TaskShapeImmediateNeed | undefined {
  return TASK_SHAPE_IMMEDIATE_NEEDS.includes(value as TaskShapeImmediateNeed)
    ? value as TaskShapeImmediateNeed
    : undefined;
}

function coerceBehaviorIntent(value: unknown): TaskBehaviorIntent | undefined {
  return TASK_BEHAVIOR_INTENTS.includes(value as TaskBehaviorIntent)
    ? value as TaskBehaviorIntent
    : undefined;
}

function coerceMissingInputs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeOptionalString(item))
    .filter((item): item is string => Boolean(item));
}

function coerceConfidence(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
  }
  return undefined;
}

export function hasExplicitReplyIntent(text: string) {
  const normalized = normalizeTextForMatch(text);
  return includesAny(normalized, [
    'ตอบลูกค้า',
    'ตอบกลับ',
    'reply to client',
    'reply',
    'send reply',
    'draft reply',
    'ตอบเมล',
    'ตอบ email',
    'ตอบ email ตอนนี้',
    'ตอบ chat',
    'ส่งข้อความ',
    'ส่งเมล',
    'ส่ง email',
    'ask back',
    'ถามกลับ',
    'follow up',
    'follow-up',
    'ส่งไปก่อน',
    'ตอบไปก่อน',
    'need to send',
    'ต้องตอบ',
    'ต้องส่ง',
  ]);
}

function hasDemoRequestIntent(text: string) {
  const normalized = normalizeTextForMatch(text);
  return includesAny(normalized, [
    'อยากนัด demo',
    'อยากนัดเดโม',
    'นัด demo',
    'นัดเดโม',
    'demo สั้น',
    'เดโมสั้น',
    'schedule a demo',
    'book a demo',
    'ภายในสัปดาห์หน้า',
    'ภายในสัปดาห์นี้',
  ]) && includesAny(normalized, [
    'ถ้าทีมคุณสะดวก',
    'อยาก',
    'สะดวก',
    'pilot',
    'ทดลอง',
    'workflow แบบไหน',
  ]);
}

// ---------------------------------------------------------------------------
// Signal Router v2 — intent signal detectors
// ---------------------------------------------------------------------------

function hasProposalSignal(normalized: string) {
  return includesAny(normalized, ['proposal', 'ข้อเสนอ', 'ใบเสนอ']);
}

function hasTimelineSignal(normalized: string) {
  return includesAny(normalized, [
    'timeline', 'ไทม์ไลน์', 'ระยะเวลา', 'กำหนดการ', 'กี่วัน', 'กี่สัปดาห์',
    'roadmap', 'แผนงาน', 'เวลา',
  ]);
}

function hasEstimateSignal(normalized: string) {
  return includesAny(normalized, [
    'estimate', 'pricing', 'ราคา', 'quotation', 'quote',
    'ประเมิน', 'งบ', 'budget', 'ตีราคา', 'cost',
  ]);
}

function hasScopeSignal(normalized: string) {
  return includesAny(normalized, [
    'requirement', 'requirements', 'scope', 'ขอบเขต',
    'ยังไม่นิ่ง', 'note กระจัดกระจาย', 'โน้ตกระจัดกระจาย',
    'spec', 'brief',
  ]);
}

function hasExecutionSignal(normalized: string) {
  return includesAny(normalized, [
    'rejected', 'delayed', 'delay', 'urgent', 'split work',
    'assign', 'delegate', 'handoff', 'unblock',
    'ตีกลับ', 'ดีเลย์', 'ล่าช้า', 'ด่วน',
    'แบ่งงาน', 'มอบหมาย', 'ส่งต่อ',
  ]);
}

function hasResumeSignal(normalized: string) {
  return includesAny(normalized, [
    'ยังไม่ได้เริ่ม', 'resume', 'กลับมาเริ่ม', 'ลงมือ',
    'draft', 'ทำต่อ', 'เริ่มงาน',
  ]);
}

function hasPersonalFrictionSignal(normalized: string) {
  return includesAny(normalized, [
    'หิว',
    'หิวข้าว',
    'หัวข้าว',
    'ยังไม่ได้กิน',
    'ไม่ได้กินข้าว',
    'ง่วง',
    'เหนื่อย',
    'หมดแรง',
    'ไม่มีแรง',
    'ปวดหัว',
    'เครียด',
    'ไม่พร้อม',
    'ไม่มีสมาธิ',
    'ใจลอย',
    'กลัว',
    'รู้สึกผิด',
    'ไม่กล้า',
    'กังวล',
    'แพนิค',
    'ลน',
    'ท้อ',
    'ทะเลาะ',
  ]);
}

function hasAdminTaskSignal(normalized: string) {
  return includesAny(normalized, [
    'admin',
    'แอดมิน',
    'ธุรการ',
    'จ่ายบิล',
    'บิล',
    'ใบเสร็จ',
    'เอกสาร',
    'จัดไฟล์',
    'จัดตาราง',
    'นัดหมาย',
    'จอง',
    'ต่อทะเบียน',
    'เคลียร์ inbox',
    'เคลียร์อีเมล',
    'ทำบัญชี',
  ]);
}

function isPersonalFrictionTaskShape(taskShape: TaskShape) {
  return taskShape.behaviorIntent === 'personal_friction' ||
    (taskShape.deliverableType === 'unknown' && taskShape.workContext.includes('แรงเสียดทานส่วนตัว'));
}

function isAdminTaskShape(taskShape: TaskShape) {
  return taskShape.behaviorIntent === 'admin_task';
}

export function isProposalLike(deliverableType: TaskShapeDeliverableType) {
  return deliverableType === 'proposal' || deliverableType === 'timeline' || deliverableType === 'estimate';
}

export function humanizeUserFacingActionText(value: string, taskShape?: TaskShape) {
  let next = value
    .replace(/productivity template/gi, 'คำแนะนำที่ฝืนเกินไป')
    .replace(/behaviorIntent/g, 'เจตนาของงาน')
    .replace(/\bblocker\b/gi, 'จุดติด')
    .replace(/\bfallback\b/gi, 'คำตอบสำรอง')
    .replace(/\breflection\b/gi, 'การสะท้อนสั้น ๆ')
    .replace(/ผู้ใช้กำลัง/g, 'ตอนนี้คุณกำลัง')
    .replace(/ผู้ใช้ติดที่/g, 'ตอนนี้คุณติดที่')
    .replace(/ผู้ใช้ให้/g, 'คุณให้')
    .replace(/ผู้ใช้/g, 'คุณ');

  if (taskShape && isPersonalFrictionTaskShape(taskShape)) {
    next = next
      .replace(/แรงเสียดทานส่วนตัว/g, 'ร่างกายกับสมาธิยังไม่เต็ม')
      .replace(/ตอนนี้คุณกำลังมีร่างกายกับสมาธิยังไม่เต็ม/g, 'ตอนนี้ร่างกายกับสมาธิยังไม่เต็ม')
      .replace(/ตอนนี้คุณติดที่ร่างกายกับสมาธิยังไม่เต็ม/g, 'ตอนนี้ร่างกายกับสมาธิยังไม่เต็ม')
      .replace(/คำตอบสำรอง/g, 'คำตอบ')
      .replace(/การสะท้อนสั้น ๆ/g, 'การฟังบริบทสั้น ๆ');
  }

  return next.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Signal Router v2 — priority-based classification
// ---------------------------------------------------------------------------

function detectDeliverableTypeFromText(text: string): TaskShapeDeliverableType | undefined {
  const normalized = normalizeTextForMatch(text);
  const hasPersonalFriction = hasPersonalFrictionSignal(normalized);

  // Priority 1: explicit reply / demo request
  if (hasExplicitReplyIntent(text) || hasDemoRequestIntent(text)) return 'reply';

  // Priority 2: proposal-like (combined signals win over individual)
  const proposal = hasProposalSignal(normalized);
  const timeline = hasTimelineSignal(normalized);
  const estimate = hasEstimateSignal(normalized);
  const scope = hasScopeSignal(normalized);

  // timeline + estimate + scope/requirement => always proposal/planning
  if (timeline && estimate && scope) return 'proposal';
  if (timeline && estimate) return 'proposal';
  if (proposal) return 'proposal';
  // scope + (timeline OR estimate) => proposal/planning, not execution
  if (scope && (timeline || estimate)) return timeline ? 'timeline' : 'estimate';
  if (timeline) return 'timeline';
  if (estimate) return 'estimate';
  // scope alone without execution signals => proposal (scoping work)
  if (scope && !hasExecutionSignal(normalized)) return 'proposal';

  if (hasPersonalFriction) return 'unknown';

  // Priority 3: execution / delegation chaos
  if (hasExecutionSignal(normalized)) return 'execution';

  // Priority 4: resume signals (weaker)
  if (hasResumeSignal(normalized)) return 'execution';

  return undefined;
}

function detectImmediateNeedFromText(
  text: string,
  deliverableType: TaskShapeDeliverableType,
): TaskShapeImmediateNeed | undefined {
  const normalized = normalizeTextForMatch(text);

  if (hasExplicitReplyIntent(text) || hasDemoRequestIntent(text)) {
    return 'send_reply_now';
  }

  if (
    includesAny(normalized, [
      'ยังไม่ได้สรุป requirement',
      'ยังไม่ได้สรุป requirements',
      'ยังไม่ชัด',
      'unclear scope',
      'scope ไม่ชัด',
      'scope unclear',
      'requirement ไม่ชัด',
      'requirement unclear',
      'note กระจัดกระจาย',
      'โน้ตกระจัดกระจาย',
      'ยังไม่ได้เริ่ม',
      'ยังไม่รู้จะเริ่มตรงไหน',
      'ต้องสรุป requirement',
      'ต้องเคลียร์ scope',
    ])
  ) {
    return 'define_scope';
  }

  if (
    includesAny(normalized, [
      'ต้องทำ timeline',
      'ต้อง estimate',
      'estimate ราคา',
      'ต้องตีราคา',
      'timeline',
      'estimate',
      'pricing',
      'ราคา',
    ])
  ) {
    return 'prepare_inputs';
  }

  if (isProposalLike(deliverableType) || deliverableType === 'execution') {
    return 'resume_execution';
  }

  return undefined;
}

function detectBehaviorIntentFromText(
  text: string,
  deliverableType: TaskShapeDeliverableType,
): TaskBehaviorIntent {
  const normalized = normalizeTextForMatch(text);
  if (hasPersonalFrictionSignal(normalized)) return 'personal_friction';
  if (
    deliverableType !== 'unknown' ||
    hasExplicitReplyIntent(text) ||
    hasDemoRequestIntent(text) ||
    includesAny(normalized, ['ลูกค้า', 'client', 'ผู้ว่าจ้าง'])
  ) return 'client_delivery';
  if (hasAdminTaskSignal(normalized)) return 'admin_task';
  return 'admin_task';
}

function deriveMissingInputsFromText(text: string, deliverableType: TaskShapeDeliverableType) {
  const normalized = normalizeTextForMatch(text);
  const missingInputs: string[] = [];

  if (includesAny(normalized, ['requirement', 'requirements', 'ยังไม่ได้สรุป', 'brief ยังไม่ชัด', 'ต้องเคลียร์ scope'])) {
    missingInputs.push('requirement ที่ต้องการจริง');
  }
  if (deliverableType === 'proposal' || includesAny(normalized, ['scope', 'proposal', 'ข้อเสนอ', 'ใบเสนอ'])) {
    missingInputs.push('ขอบเขตงานและ assumptions ของ proposal');
  }
  if (includesAny(normalized, ['timeline', 'กำหนดการ'])) {
    missingInputs.push('timeline constraints และ deadline ที่คาดหวัง');
  }
  if (includesAny(normalized, ['estimate', 'pricing', 'ราคา', 'quotation', 'quote'])) {
    missingInputs.push('ข้อมูลสำหรับ estimate ราคาและ effort');
  }
  if (includesAny(normalized, ['note กระจัดกระจาย', 'โน้ตกระจัดกระจาย', 'scattered note', 'มี note กระจัดกระจาย'])) {
    missingInputs.push('แหล่ง note หลักที่ต้องรวบก่อน');
  }
  if (deliverableType === 'reply' && hasDemoRequestIntent(text)) {
    missingInputs.push('ช่วงเวลาที่สะดวกสำหรับนัด demo');
    missingInputs.push('workflow pilot ที่ควรเสนอในการคุยรอบแรก');
  }

  return uniqueStrings(missingInputs);
}

function buildWorkContextFromText(
  text: string,
  deliverableType: TaskShapeDeliverableType,
  immediateNeed: TaskShapeImmediateNeed,
  missingInputs: string[],
) {
  const normalized = normalizeTextForMatch(text);

  if (deliverableType === 'proposal') {
    if (immediateNeed === 'define_scope') {
      return 'ลูกค้าขอ proposal แต่ requirement กับ scope ยังไม่ชัด note กระจัดกระจาย และยังเริ่มงานไม่ได้';
    }
    if (immediateNeed === 'prepare_inputs') {
      return 'ลูกค้าขอ proposal และตอนนี้ยังต้องรวบ input สำหรับทำ timeline กับ estimate ราคา';
    }
    return 'กำลังเตรียม proposal ให้ลูกค้า แต่ยังต้องล็อกข้อมูลก่อนเริ่มลงมือจริง';
  }

  if ((deliverableType === 'reply' || immediateNeed === 'send_reply_now') && hasDemoRequestIntent(text)) {
    return 'ลูกค้ากำลังสนใจใช้ MIND ขอ pilot เล็ก ๆ และอยากนัด demo ภายในสัปดาห์หน้า';
  }

  if (deliverableType === 'reply' || immediateNeed === 'send_reply_now') {
    return 'ตอนนี้ผู้ใช้ต้องตอบหรือส่งข้อความกลับให้ลูกค้าในรอบนี้';
  }

  if (deliverableType === 'timeline') {
    return 'ตอนนี้งานติดที่ยังต้องจัด timeline ให้ชัดก่อนขยับต่อ';
  }

  if (deliverableType === 'estimate') {
    return 'ตอนนี้งานติดที่ยังต้องตีราคาและรวบข้อมูลสำหรับ estimate ให้พอ';
  }

  if (hasPersonalFrictionSignal(normalized)) {
    return 'ตอนนี้ร่างกายหรือสมาธิยังไม่เต็ม เช่น หิว เหนื่อย หรือยังไม่พร้อม แต่ยังอยากให้งานขยับต่อ';
  }

  if (hasAdminTaskSignal(normalized)) {
    return 'ผู้ใช้กำลังจัดการงานแอดมินหรืองานส่วนตัวที่ต้องเคลียร์ให้เดินต่อได้';
  }

  if (missingInputs.length > 0 || includesAny(normalized, ['ยังไม่ได้เริ่ม', 'ค้างอยู่', 'resume'])) {
    return 'งานนี้ยังเริ่มหรือกลับมาเริ่มได้ไม่เต็มที่ เพราะข้อมูลและจุดตั้งต้นยังไม่ถูกล็อก';
  }

  return 'กำลังกลับเข้าบริบทของงานนี้เพื่อหาก้าวแรกที่เริ่มได้จริง';
}

function inferConfidence(text: string, deliverableType: TaskShapeDeliverableType, immediateNeed: TaskShapeImmediateNeed) {
  const normalized = normalizeTextForMatch(text);
  let score = 0.45;

  if (deliverableType !== 'unknown') score += 0.18;
  if (immediateNeed !== 'resume_execution') score += 0.14;
  if (hasExplicitReplyIntent(text)) score += 0.12;
  if (includesAny(normalized, ['proposal', 'requirement', 'timeline', 'estimate'])) score += 0.08;
  if (includesAny(normalized, ['ยังไม่ได้เริ่ม', 'ยังไม่ชัด', 'กระจัดกระจาย'])) score += 0.08;

  return Math.min(0.95, Number(score.toFixed(2)));
}

export function deriveTaskShapeFromText(text: string, partial?: PartialTaskShapeInput): TaskShape {
  const normalizedText = normalizeOptionalString(text) ?? '';
  const deliverableType =
    detectDeliverableTypeFromText(normalizedText) ??
    coerceDeliverableType(partial?.deliverableType) ??
    'unknown';
  const immediateNeed =
    detectImmediateNeedFromText(normalizedText, deliverableType) ??
    coerceImmediateNeed(partial?.immediateNeed) ??
    (deliverableType === 'reply' ? 'send_reply_now' : 'resume_execution');
  const missingInputs = uniqueStrings([
    ...deriveMissingInputsFromText(normalizedText, deliverableType),
    ...coerceMissingInputs(partial?.missingInputs),
  ]);
  const detectedBehaviorIntent = detectBehaviorIntentFromText(normalizedText, deliverableType);
  const detectedWorkContext = buildWorkContextFromText(normalizedText, deliverableType, immediateNeed, missingInputs);
  const strongPersonalFrictionSignal = detectedBehaviorIntent === 'personal_friction';
  const workContext =
    strongPersonalFrictionSignal
      ? detectedWorkContext
      : normalizeOptionalString(partial?.workContext) ?? detectedWorkContext;
  const behaviorIntent =
    strongPersonalFrictionSignal
      ? detectedBehaviorIntent
      : coerceBehaviorIntent(partial?.behaviorIntent) ?? detectedBehaviorIntent;
  const confidence = coerceConfidence(partial?.confidence) ?? inferConfidence(normalizedText, deliverableType, immediateNeed);

  return {
    deliverableType,
    immediateNeed,
    missingInputs,
    workContext,
    behaviorIntent,
    confidence,
  };
}

export function inferWorkflowTypeFromTaskShape(taskShape: TaskShape): TaskShapeWorkflowType {
  if (taskShape.immediateNeed === 'send_reply_now' || taskShape.deliverableType === 'reply') {
    return 'client_response';
  }
  return 'client_resume';
}

export function shouldGenerateReplyDraft(workflowType: TaskShapeWorkflowType, taskShape: TaskShape) {
  return workflowType === 'client_response' && taskShape.immediateNeed === 'send_reply_now';
}

export function buildTaskFrameFallback(
  workflowType: TaskShapeWorkflowType,
  taskShape: TaskShape,
) {
  if (workflowType === 'client_response') {
    const isDemoRequest = taskShape.workContext.includes('นัด demo') || taskShape.workContext.includes('pilot');
    if (isDemoRequest) {
      return {
        objective: 'สรุป pain point ของลูกค้าและเตรียมตอบนัด demo',
        stage: 'กำลังจัดคำตอบรอบแรกให้ชัดว่าควรคุย pilot ไหนและเดโม workflow อะไรก่อน',
      };
    }
    return {
      objective: 'สรุปสิ่งที่ลูกค้าต้องการและเตรียมตอบกลับ',
      stage: 'กำลังตีความข้อความและเตรียมส่ง reply ที่ชัดเจน',
    };
  }

  const _plk = isProposalLike(taskShape.deliverableType);

  if (_plk && taskShape.immediateNeed === 'define_scope') {
    return {
      objective: 'รวบ requirement และ scope ที่ยังไม่ชัดก่อนทำ proposal',
      stage: 'กำลังล็อกข้อมูลตั้งต้นเพื่อเริ่ม timeline และ estimate ได้จริง',
    };
  }

  if (_plk && taskShape.immediateNeed === 'prepare_inputs') {
    return {
      objective: 'รวบ input ขั้นต่ำสำหรับทำ timeline และ estimate ของ proposal',
      stage: 'กำลังเตรียมข้อมูลก่อนแตก proposal เป็นก้าวทำงานจริง',
    };
  }

  if (_plk) {
    return {
      objective: 'รวบข้อมูลตั้งต้นเพื่อเริ่มประเมิน timeline และ estimate',
      stage: 'กำลังจัดข้อมูลที่มีให้พอเริ่มประเมินราคาและระยะเวลาคร่าว ๆ',
    };
  }

  if (isPersonalFrictionTaskShape(taskShape)) {
    return {
      objective: 'จัดการสิ่งที่ทำให้เริ่มงานไม่ออกก่อนกลับไปทำงานต่อ',
      stage: 'กำลังลดแรงเสียดทานให้เหลือก้าวเล็กที่เริ่มได้ทันที',
    };
  }

  if (isAdminTaskShape(taskShape)) {
    return {
      objective: 'เคลียร์งานแอดมินหรือภาระเล็กที่ค้างอยู่ให้เริ่มต่อได้',
      stage: 'กำลังเลือกก้าวสั้น ๆ ที่ทำให้เรื่องนี้ขยับโดยไม่ต้องวางแผนใหญ่',
    };
  }

  return {
    objective: 'หาก้าวแรกที่เริ่มได้ทันทีจากบริบทที่ผู้ใช้ให้มา',
    stage: 'กำลังลดบริบทให้เหลือหนึ่งก้าวที่เริ่มได้จริง',
  };
}

export function buildIntakeFallbackCandidates(
  workflowType: TaskShapeWorkflowType,
  taskShape: TaskShape,
) {
  if (workflowType === 'client_response') {
    const isDemoRequest = taskShape.workContext.includes('นัด demo') || taskShape.workContext.includes('pilot');
    if (isDemoRequest) {
      return [
        {
          title: 'สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน',
          rationale: 'ช่วยให้ตอบกลับได้ทั้งเรื่อง pain หลักของทีมขาย pilot แรก และการนัดคุยภายในสัปดาห์หน้า',
          kind: 'reply_first' as const,
        },
        {
          title: 'เลือก use case pilot ที่ควรหยิบไปเดโมก่อน',
          rationale: 'ช่วยให้เดโมคุยตรง use case ของลูกค้า แทนการเล่าระบบกว้างเกินไป',
          kind: 'dependency_first' as const,
        },
      ];
    }
    return [
      {
        title: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
        rationale: 'ช่วยให้เห็นว่าต้องตอบเรื่องไหนก่อนโดยไม่ต้องอ่านวนหลายรอบ',
        kind: 'reply_first' as const,
      },
      {
        title: 'ร่างข้อความถามกลับเพื่อเก็บข้อมูลที่ยังขาด',
        rationale: 'เหมาะเมื่อ feedback หรือคำขอยังไม่ชัดพอจะลงมือแก้งานทันที',
        kind: 'dependency_first' as const,
      },
    ];
  }

  const _plk = isProposalLike(taskShape.deliverableType);

  if (_plk && taskShape.immediateNeed === 'define_scope') {
    return [
      {
        title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
        rationale: 'จะทำให้ proposal, timeline และ estimate มีฐานที่ชัดก่อนลงมือ',
        kind: 'resume_first' as const,
      },
      {
        title: 'ตั้งสมมติฐาน scope เพื่อทำ timeline และ estimate รอบแรก',
        rationale: 'เหมาะเมื่ออยากขยับ proposal ต่อได้ แม้ requirement ยังไม่ครบทุกข้อ',
        kind: 'dependency_first' as const,
      },
    ];
  }

  if (_plk && taskShape.immediateNeed === 'prepare_inputs') {
    return [
      {
        title: 'แยกสิ่งที่ต้องรู้ก่อนตีราคา proposal',
        rationale: 'ช่วยให้ estimate กับ timeline ไม่หลุดจากข้อมูลตั้งต้นที่จำเป็น',
        kind: 'resume_first' as const,
      },
      {
        title: 'รวบ input ขั้นต่ำสำหรับทำ timeline รอบแรก',
        rationale: 'เหมาะเมื่ออยากเริ่มจากภาพรวมของงานก่อนลงรายละเอียดราคา',
        kind: 'dependency_first' as const,
      },
    ];
  }

  // Catch-all for proposal-like types with other immediateNeed values
  if (_plk) {
    return [
      {
        title: 'รวบข้อมูลตั้งต้นสำหรับ timeline และ estimate เบื้องต้น',
        rationale: 'ช่วยให้เริ่มประเมินราคาและระยะเวลาได้โดยไม่ต้องรอข้อมูลครบ 100%',
        kind: 'resume_first' as const,
      },
      {
        title: 'ตั้งสมมติฐาน scope เพื่อเริ่ม estimate รอบแรก',
        rationale: 'เหมาะเมื่อต้องการตัวเลขคร่าว ๆ ก่อนเพื่อตัดสินใจขั้นต่อไป',
        kind: 'dependency_first' as const,
      },
    ];
  }

  if (isPersonalFrictionTaskShape(taskShape)) {
    return [
      {
        title: 'เช็กว่าต้องเติมอะไรก่อน แล้วเลือกก้าวงานที่เล็กที่สุด',
        rationale: 'โจทย์ตอนนี้ไม่ใช่ขาดแผนงาน แต่ร่างกายหรือสมาธิยังไม่พร้อมพอจะเริ่มเต็มแรง',
        kind: 'resume_first' as const,
      },
      {
        title: 'ถามตัวเองหนึ่งข้อว่าต้องเติมอะไรก่อนกลับไปทำงาน',
        rationale: 'ช่วยให้คำแนะนำไม่ฝืนสภาพตอนนี้ และยังรักษาบริบทจริงของคุณไว้',
        kind: 'dependency_first' as const,
      },
    ];
  }

  if (taskShape.deliverableType === 'execution') {
    return [
      {
        title: 'แบ่งงานและมอบหมายให้ทีมก่อนเพื่อปลดล็อกงานที่ค้าง',
        rationale: 'เมื่อมีหลายชิ้นงานกระจัดกระจาย การ delegate ชัด ๆ ช่วยให้ทีมเดินต่อได้ทันที',
        kind: 'resume_first' as const,
      },
      {
        title: 'ระบุงานที่บล็อกอยู่และส่งต่อให้คนรับผิดชอบโดยตรง',
        rationale: 'เหมาะเมื่อมี dependency หลายจุดและต้องการปลดล็อกพร้อมกันหลายทาง',
        kind: 'dependency_first' as const,
      },
    ];
  }

  if (isAdminTaskShape(taskShape)) {
    return [
      {
        title: 'เลือกงานแอดมินหนึ่งชิ้นที่ปิดได้ใน 15 นาที',
        rationale: 'ช่วยให้ภาระเล็กที่ค้างอยู่ขยับจริงโดยไม่ต้องจัดระบบใหม่ทั้งหมด',
        kind: 'resume_first' as const,
      },
      {
        title: 'แยกว่าต้องเปิดแอป เอกสาร หรือข้อมูลไหนก่อน',
        rationale: 'เหมาะเมื่อยังติดที่จุดเริ่มมากกว่าติดที่แผนงาน',
        kind: 'dependency_first' as const,
      },
    ];
  }

  return [
    {
      title: 'สะท้อนสิ่งที่ผู้ใช้บอก แล้วเลือกก้าวแรกที่เล็กพอเริ่มได้',
      rationale: 'ช่วยให้คำตอบเกาะบริบทจริงแทนการเติมภาษางานลูกค้าหรือโปรเจกต์เอง',
      kind: 'resume_first' as const,
    },
    {
      title: 'ถามกลับสั้น ๆ ว่าต้องการขยับเรื่องไหนก่อน',
      rationale: 'เหมาะเมื่อบริบทสั้นเกินกว่าจะเดาก้าวเฉพาะโดยไม่หลุดจากเจตนา',
      kind: 'dependency_first' as const,
    },
  ];
}

export function buildActionFallbackCopy(
  workflowType: TaskShapeWorkflowType,
  taskShape: TaskShape,
) {
  if (workflowType === 'client_response') {
    const isDemoRequest = taskShape.workContext.includes('นัด demo') || taskShape.workContext.includes('pilot');
    if (isDemoRequest) {
      return {
        chosenTitle: 'สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน',
        chosenRationale: 'ลูกค้าบอก pain point ชัดแล้วและอยากเริ่ม pilot เล็กพร้อมนัด demo ดังนั้นก้าวแรกที่คุ้มที่สุดคือจัดคำตอบรอบแรกให้พร้อมคุยต่อ',
        successSignal: 'ได้ draft ตอบกลับที่ยืนยัน demo next step และชี้ use case pilot ที่เหมาะกับเคสนี้',
        whyThisNow: 'ตอนนี้ลูกค้าเปิดบทสนทนาไว้ชัดเจนและขอคุยต่อภายในสัปดาห์หน้า จึงควรตอบกลับพร้อมกรอบเดโมก่อนที่ momentum จะหาย',
        situationSummary: 'ลูกค้าทีมขายมีข้อมูลดีลกระจัดกระจาย อยากเริ่ม pilot เล็กด้วยการวางข้อมูลลงใน MIND และขอนัด demo ภายในสัปดาห์หน้า',
        replyDraft: 'ขอบคุณมากครับสำหรับบริบทที่ละเอียดมาก เคสนี้ตรงกับสิ่งที่ MIND ช่วยได้ดี โดยเฉพาะการเริ่มจากการวางข้อมูลที่กระจัดกระจายลงไปก่อน เพื่อสรุปดีลสำคัญและชี้ 1-2 งานที่ควรโฟกัสในแต่ละวันครับ ถ้าสะดวก เรายินดีนัด demo 30 นาทีภายในสัปดาห์หน้า และจะเตรียม use case pilot ที่เหมาะกับทีมย่อยให้ดูเป็นตัวอย่างครับ',
        alternatives: [
          {
            title: 'เลือก use case pilot ที่ควรหยิบไปเดโมก่อน',
            rationale: 'ช่วยให้เดโมคุยตรง pain หลัก เช่น deal summary, next action และ deadline follow-up',
          },
          {
            title: 'ร่างคำตอบที่ยืนยันเดโมพร้อมขอข้อมูลเพิ่มเท่าที่จำเป็น',
            rationale: 'เหมาะเมื่ออยากตอบกลับเร็วแต่ยังต้องเก็บข้อมูลเพิ่มบางจุดก่อนเดโมจริง',
          },
        ],
      };
    }
    return {
      chosenTitle: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
      chosenRationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวนหลายรอบ',
      successSignal: 'ได้สรุปที่ใช้ตอบหรือถามกลับได้ทันที',
      whyThisNow: 'ตอนนี้ควรลด uncertainty ในข้อความที่จะส่งให้ลูกค้าก่อน เพื่อให้คุยต่อได้ง่าย',
      situationSummary: 'ตอนนี้ผู้ใช้กำลังต้องตอบลูกค้าหรือส่งข้อความกลับในรอบนี้',
      replyDraft: 'ขอผมสรุปประเด็นหลักจากข้อความนี้ก่อน แล้วจะกลับมาพร้อมคำตอบที่ชัดเจนให้ทันทีครับ',
      alternatives: [
        {
          title: 'สรุปประเด็นหลักของลูกค้าก่อนแล้วค่อยตอบ',
          rationale: 'ช่วยตัด noise ก่อน เพื่อให้ตอบกลับได้ตรงโดยไม่ต้องอ่านวน',
        },
        {
          title: 'ร่างข้อความถามกลับเฉพาะจุดที่ยังไม่ชัด',
          rationale: 'เหมาะเมื่อยังมีข้อมูลที่ต้องเคลียร์ก่อน commit คำตอบหรือ scope',
        },
      ],
    };
  }

  const _plk = isProposalLike(taskShape.deliverableType);

  if (_plk && taskShape.immediateNeed === 'define_scope') {
    return {
      chosenTitle: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
      chosenRationale: 'proposal, timeline และ estimate จะเริ่มได้จริงก็ต่อเมื่อ requirement กับ scope ถูกล็อกพอประมาณก่อน',
      successSignal: 'ได้ requirement และ assumptions ชุดแรกที่ใช้ร่าง proposal รอบแรกได้',
      whyThisNow: 'ตอนนี้ยังไม่ควรกระโดดไปทำ timeline หรือ estimate เพราะ requirement และ scope ยังไม่ชัดพอ',
      situationSummary: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่สรุป note กระจัดกระจาย และ timeline กับ estimate ยังติดข้อมูลไม่ครบ',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'ตั้งสมมติฐาน scope เพื่อทำ timeline และ estimate รอบแรก',
          rationale: 'เหมาะเมื่ออยากขยับ proposal ต่อได้ แม้ requirement ยังไม่ครบทุกข้อ',
        },
        {
          title: 'แยกสิ่งที่ต้องรู้ก่อนตีราคา proposal',
          rationale: 'ช่วยกันไม่ให้ estimate หลุดจากข้อมูลที่ยังไม่ชัด',
        },
      ],
    };
  }

  if (_plk && taskShape.immediateNeed === 'prepare_inputs') {
    return {
      chosenTitle: 'แยกสิ่งที่ต้องรู้ก่อนตีราคา proposal',
      chosenRationale: 'จะช่วยให้ timeline และ estimate มีฐานข้อมูลขั้นต่ำก่อนลงมือร่างข้อเสนอ',
      successSignal: 'ได้ input ขั้นต่ำสำหรับทำ timeline และ estimate รอบแรก',
      whyThisNow: 'ตอนนี้งานยังติดที่ input สำหรับ timeline กับ estimate มากกว่าการลงมือเขียน proposal ทันที',
      situationSummary: 'ลูกค้าขอ proposal AI และตอนนี้ยังต้องรวบ input สำหรับ timeline กับ estimate ราคาให้ครบพอ',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
          rationale: 'เหมาะเมื่อยังรู้สึกว่า scope ของ proposal ยังไม่พอสำหรับตีราคา',
        },
        {
          title: 'ตั้งสมมติฐาน scope เพื่อทำ timeline และ estimate รอบแรก',
          rationale: 'ช่วยให้มี working draft โดยไม่ต้องรอข้อมูลครบ 100%',
        },
      ],
    };
  }

  // Catch-all for proposal-like types with other immediateNeed values
  if (_plk) {
    return {
      chosenTitle: 'รวบข้อมูลตั้งต้นสำหรับ timeline และ estimate เบื้องต้น',
      chosenRationale: 'เริ่มจากการจัดข้อมูลที่มีให้พอประเมินราคาและระยะเวลาคร่าว ๆ ได้ก่อน',
      successSignal: 'ได้ตัวเลข estimate เบื้องต้นที่ใช้ตัดสินใจขั้นต่อไปได้',
      whyThisNow: 'ตอนนี้ข้อมูลยังกระจาย การรวบให้พอประเมินได้จะช่วยขยับโปรเจกต์ต่อเร็วที่สุด',
      situationSummary: 'ต้องการ estimate หรือ timeline แต่ข้อมูลตั้งต้นยังไม่ครบ จึงต้องรวบก่อนเริ่มประเมิน',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'ตั้งสมมติฐาน scope เพื่อเริ่ม estimate รอบแรก',
          rationale: 'เหมาะเมื่อต้องการตัวเลขคร่าว ๆ ก่อนเพื่อตัดสินใจขั้นต่อไป',
        },
        {
          title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
          rationale: 'เหมาะเมื่อ scope ยังกว้างเกินจะเริ่ม estimate ทันที',
        },
      ],
    };
  }

  if (isPersonalFrictionTaskShape(taskShape)) {
    return {
      chosenTitle: 'เติมสิ่งที่ขาด แล้วเริ่มงานจากก้าวเล็กที่สุด',
      chosenRationale: 'จากบริบท ตอนนี้แรงกายหรือสมาธิยังไม่เต็ม ไม่ใช่ขาดแผนงานใหม่ จึงควรลดก้าวให้เบาที่สุดก่อน',
      successSignal: 'รู้สิ่งเล็ก ๆ ที่ต้องเติมตอนนี้ และมีก้าวงานหนึ่งก้าวที่เริ่มต่อได้',
      whyThisNow: 'ถ้าข้ามเรื่องหิว เหนื่อย หรือหมดแรงไปเลย คำแนะนำจะฝืนเกินไป ก้าวนี้เลยเริ่มจากสิ่งที่คุณพอทำได้ในสภาพตอนนี้',
      situationSummary: 'ตอนนี้ร่างกายกับสมาธิยังไม่เต็ม แต่คุณยังอยากให้งานขยับต่อ จึงควรลดภาระก่อนกลับไปก้าวเล็ก',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'ถามกลับสั้น ๆ ว่าตอนนี้ต้องกิน พัก หรือเริ่มงานเบา ๆ ก่อน',
          rationale: 'เหมาะเมื่อไม่ควรเดาแทนคุณว่าสิ่งที่ต้องเติมก่อนคืออะไร',
        },
        {
          title: 'เลือกงานจุดเล็กที่สุดที่ทำได้หลังเติมพลัง',
          rationale: 'ช่วยให้ยังขยับงานต่อได้โดยไม่ฝืนเริ่มจากก้อนใหญ่',
        },
      ],
    };
  }

  if (taskShape.deliverableType === 'execution') {
    return {
      chosenTitle: 'แบ่งงานและส่งต่อให้ทีมเพื่อปลดล็อกงานที่ค้างอยู่',
      chosenRationale: 'มีหลายชิ้นงานกระจัดกระจาย การ delegate ชัด ๆ ทันทีช่วยให้ทีมเดินต่อได้โดยไม่รอ',
      successSignal: 'ทีมแต่ละคนรู้ว่างานของตัวเองคืออะไรและเริ่มได้เลย',
      whyThisNow: 'ตอนนี้มีหลายงานค้างพร้อมกัน การ delegate และกำหนดลำดับก่อนหลังจะช่วยให้ขยับได้เร็วที่สุด',
      situationSummary: 'มีงานกระจัดกระจายหลายชิ้นที่ต้องแบ่งและมอบหมายให้ทีมก่อนจะขยับต่อได้',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'ระบุงานที่บล็อกอยู่และส่งต่อให้คนรับผิดชอบโดยตรง',
          rationale: 'เหมาะเมื่อมี dependency หลายจุดและต้องปลดล็อกพร้อมกันหลายทาง',
        },
        {
          title: 'ลิสต์งานทุกชิ้นและจัดลำดับว่าอะไรด่วนที่สุด',
          rationale: 'ช่วยให้เห็นภาพรวมก่อนเริ่ม delegate เพื่อไม่ให้งานสำคัญหลุด',
        },
      ],
    };
  }

  if (isAdminTaskShape(taskShape)) {
    return {
      chosenTitle: 'เลือกงานแอดมินหนึ่งชิ้นแล้วปิดให้จบในรอบสั้น',
      chosenRationale: 'บริบทนี้เป็นงานจัดการภาระ จึงควรลดให้เหลือสิ่งเดียวที่ทำจบได้เร็ว',
      successSignal: 'ปิดภาระหนึ่งชิ้นหรือรู้ข้อมูลเดียวที่ต้องเปิดต่อ',
      whyThisNow: 'งานแอดมินมักค้างเพราะจุดเริ่มไม่ชัด การเลือกหนึ่งชิ้นเล็กช่วยให้ขยับโดยไม่ต้องจัดระบบใหญ่',
      situationSummary: 'ผู้ใช้กำลังจัดการงานแอดมินหรือภาระส่วนตัว จึงควรเลือกก้าวเล็กที่ปิดได้จริงก่อน',
      replyDraft: undefined,
      alternatives: [
        {
          title: 'เปิดแหล่งข้อมูลที่เกี่ยวข้องก่อน แล้วค่อยเลือกงานหนึ่งชิ้น',
          rationale: 'เหมาะเมื่อยังไม่รู้ว่าต้องเริ่มจากแอปหรือเอกสารไหน',
        },
        {
          title: 'ถามกลับว่าภาระนี้ต้องปิดวันนี้หรือแค่จัดคิวไว้',
          rationale: 'เหมาะเมื่อ deadline ยังไม่ชัดและไม่ควรเดางานแทนผู้ใช้',
        },
      ],
    };
  }

  return {
    chosenTitle: 'สะท้อนสิ่งที่ผู้ใช้บอก แล้วเลือกก้าวแรกที่เล็กที่สุด',
    chosenRationale: 'เมื่อบริบทสั้นหรือยังไม่เข้าหมวดชัด ควรฟังคำของผู้ใช้ก่อนแทนการเติมโลกงานลูกค้าขึ้นมาเอง',
    successSignal: 'ได้ก้าวเดียวที่ยังเกาะบริบทจริงและไม่เพิ่มภาระเกินจำเป็น',
    whyThisNow: 'การเริ่มจาก reflection สั้น ๆ ช่วยกันไม่ให้ fallback กลายเป็น template ที่กลบเสียงผู้ใช้',
    situationSummary: 'ผู้ใช้ให้บริบทสั้น ๆ จึงควรสะท้อนเจตนานั้นก่อนเสนอหนึ่งก้าวเล็ก',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'ถามกลับหนึ่งคำถามเพื่อจับเจตนาหลัก',
        rationale: 'เหมาะเมื่อยังไม่ควรเดางานเฉพาะเอง',
      },
      {
        title: 'เลือกสิ่งเดียวที่ทำได้ใน 15 นาทีจากบริบทที่มี',
        rationale: 'เหมาะเมื่อมีทิศพอแต่ต้องลดขนาดก้าว',
      },
    ],
  };
}
