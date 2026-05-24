import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type { TaskShape } from '@/lib/ai/task-shape';
import type {
  AiActionNegotiationMode,
  AiActionResponse,
  AiIntakeResponse,
  AiReentryResponse,
  AiScaffoldResponse,
} from '@/lib/ai/operations';
import type { ActionEvidenceContext } from '@/lib/orchestrator/evidence-context';
import { summarizeRoomFile, truncateRoomText } from '@/lib/room';
import type {
  Action,
  AppSession,
  TaskContext,
  UIRoute,
  WorkflowType,
  ReentryResumeTarget,
} from '@/lib/store/idb';
import {
  createDraftPlanFromCurrentPlan,
  enrichPlanWithProvenance,
} from '@/lib/orchestrator/plan-provenance';
import { createTaskContext } from '@/lib/store/idb';
import {
  buildLogoRevisionActionFallback,
  buildLogoRevisionStepFallback,
  buildOverloadedWorkActionFallback,
  buildOverloadedWorkStepFallback,
  buildPhysicalRoomResetActionFallback,
  buildPresentationPrepActionFallback,
  buildProductPostActionFallback,
  buildStudentReportActionFallback,
  buildStudentReportStepFallback,
  collectRawRoomSourceContext,
  collectTrustedSourceContext,
  hasDisallowedExternalStakeholderOutput,
  isInternalPresentationPrepText,
  isLogoRevisionText,
  isOverloadedWorkText,
  isPhysicalRoomResetText,
  isProductPostText,
  isStudentReportText,
  PHYSICAL_ROOM_RESET_STEP_FALLBACK,
  PRODUCT_POST_STEP_FALLBACK,
  PRESENTATION_PREP_STEP_FALLBACK,
  STUDENT_REPORT_STEP_FALLBACK,
} from '@/lib/source-grounding';

let sessionWorkflowHistory: WorkflowType[] = [];

export function buildPayloadFromAction(action: Action): AiSynthesisResponse {
  return {
    workflow_type: action.workflowType,
    requires_clarification: false,
    situation_summary: action.situationSummary,
    reply_draft: action.replyDraft,
    recommended_action: {
      title: action.title,
      rationale: action.rationale,
      micro_steps: action.microSteps,
      micro_steps_source: action.microStepsSource ?? 'fallback',
    },
    alternative_actions: [],
    detected_blockers: action.detectedBlockers ?? [],
  };
}

export function buildBootstrapMicroSteps(action: {
  title: string;
  successSignal?: string;
}, taskShape?: TaskShape, task?: TaskContext) {
  const grounded = buildGroundedArtifactMicroSteps(action, taskShape, task);
  if (grounded) return grounded;

  if (taskShape?.behaviorIntent === 'personal_friction') {
    return [
      'เช็กก่อนว่าตอนนี้ต้องเติมอะไรที่สุด: กิน พัก หรือเริ่มงานเบา ๆ',
      'เลือกงานก้าวแรกที่เล็กพอทำได้ โดยไม่ต้องเปิดทุกอย่างพร้อมกัน',
      'ทำแค่ก้าวแรก แล้วดูว่าพลังพอกลับไปต่อไหม',
    ];
  }

  const signal = action.successSignal?.trim() || 'เห็นความคืบหน้าหนึ่งจุดของงานนี้';
  return [
    `ดูข้อมูลที่คุณมีตอนนี้เกี่ยวกับ "${action.title}"`,
    `ทำก้าวหลักนี้ทันที: ${action.title}`,
    `เช็กผลว่าตอนนี้ ${signal}`,
  ];
}

function normalizeForStepMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueAnchors(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeForStepMatch(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

export function collectRoomArtifactAnchors(task?: TaskContext, taskShape?: TaskShape, actionTitle?: string) {
  const text = [
    task?.sourceText,
    task?.extractedText,
    task?.taskFrame?.objective,
    task?.taskFrame?.stage,
    task?.taskFrame?.stakeholders?.join(' '),
    task?.pendingInputs?.map((input) => input.answer).join(' '),
    taskShape?.workContext,
    taskShape?.missingInputs?.join(' '),
    actionTitle,
  ].filter(Boolean).join(' ');

  const lower = text.toLowerCase();
  const anchors: string[] = [];

  const customerMatches = text.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\s+(?:Corp|Co|Ltd|Inc|LLC|Bank)\b/g) ?? [];
  anchors.push(...customerMatches);

  const keywordAnchors: Array<[RegExp, string]> = [
    [/proposal/u, 'proposal'],
    [/ระบบ\s*ai.*ร้านค้าส่ง|ร้านค้าส่ง.*ระบบ\s*ai|ร้านค้าส่ง/u, 'ระบบ AI ร้านค้าส่ง'],
    [/scope|ขอบเขต/u, 'scope'],
    [/estimate|ประเมินราคา|ราคา/u, 'estimate'],
    [/\bprod(?:uction)?\b|โปรดักชัน/u, 'prod'],
    [/cpu spike/u, 'CPU spike'],
    [/\brca\b/u, 'RCA'],
    [/\bincident\b|อินซิเดนต์/u, 'incident'],
    [/dashboard/u, 'Dashboard'],
    [/payment\s+webhook/u, 'payment webhook'],
    [/payment\s+api|ระบบจ่ายเงิน/u, 'payment API'],
    [/provider\s+timeout/u, 'provider timeout'],
    [/\bapi\b/u, 'API'],
    [/server|เซิร์ฟเวอร์/u, 'server'],
    [/webhook/u, 'webhook'],
    [/\bqa\b/u, 'QA'],
    [/\bcs\b/u, 'CS'],
    [/jira/u, 'Jira'],
    [/release/u, 'release'],
    [/timeline|ไทม์ไลน์/u, 'timeline'],
    [/พรีเซนต์งานในทีม|พรีเซนต์|นำเสนอ|presentation/u, 'พรีเซนต์งานในทีม'],
    [/notes?|โน้ต/u, 'notes'],
    [/แชท|แชต|ไลน์|line|chat/u, 'แชท'],
    [/ไฟล์สไลด์|สไลด์|slide/u, 'ไฟล์สไลด์'],
    [/สมุด/u, 'สมุด'],
    [/ผลที่ทำไปแล้ว/u, 'ผลที่ทำไปแล้ว'],
    [/ปัญหาที่เจอ/u, 'ปัญหาที่เจอ'],
    [/แผนต่อไป/u, 'แผนต่อไป'],
    [/10\s*นาที|สิบ\s*นาที/u, '10 นาที'],
    [/ห้องรก|เก็บห้อง|จัดห้อง/u, 'ห้องรก'],
    [/เสื้อผ้า/u, 'เสื้อผ้า'],
    [/เก้าอี้/u, 'เก้าอี้'],
    [/โต๊ะ/u, 'โต๊ะ'],
    [/แก้วน้ำ/u, 'แก้วน้ำ'],
    [/กระดาษ/u, 'กระดาษ'],
    [/renewable energy storage/u, 'renewable energy storage'],
    [/reference links?|reference|ลิงก์/u, 'reference links'],
    [/รายงาน|report/u, 'รายงาน'],
    [/บทนำ/u, 'บทนำ'],
    [/ร้านออนไลน์/u, 'ร้านออนไลน์'],
    [/โพสต์สินค้า|สินค้าใหม่/u, 'โพสต์สินค้า'],
    [/กระเป๋าผ้า\s*canvas|canvas/u, 'กระเป๋าผ้า canvas'],
    [/caption|แคปชั่น/u, 'caption'],
    [/เบา/u, 'เบา'],
    [/ซักง่าย/u, 'ซักง่าย'],
    [/3\s*สี|สาม\s*สี/u, '3 สี'],
    [/fallback latency/u, 'fallback latency'],
    [/reentry card/u, 'reentry card'],
    [/evidence source/u, 'evidence source'],
    [/completed context/u, 'completed context'],
    [/context\s*หาย|context preservation|preserve context/u, 'context หาย'],
    [/demo\s*mind/u, 'demo MIND'],
    [/ปุ่มช่วยแก้ก้าวนี้|ช่วยแก้ก้าวนี้/u, 'ปุ่มช่วยแก้ก้าวนี้'],
    [/รายงานสรุปรายสัปดาห์|รายงานสรุป/u, 'รายงานสรุปรายสัปดาห์'],
    [/ตรวจสเปกเว็บใหม่|สเปกเว็บใหม่/u, 'ตรวจสเปกเว็บใหม่'],
    [/สเปก|spec/u, 'สเปก'],
    [/ปุ่ม|button/u, 'ปุ่ม'],
    [/สไลด์|slide/u, 'สไลด์'],
    [/แชต|ไลน์|line|chat/u, 'แชต'],
    [/ลูกค้า|client/u, 'ลูกค้า'],
  ];

  for (const [pattern, label] of keywordAnchors) {
    if (pattern.test(lower)) anchors.push(label);
  }

  return uniqueAnchors(anchors);
}

export function isGenericRoomAnchor(anchor: string) {
  return /^(?:ลูกค้า|client|งาน|task)$/iu.test(normalizeForStepMatch(anchor));
}

function concreteRoomAnchors(anchors: string[]) {
  return anchors.filter((anchor) => !isGenericRoomAnchor(anchor));
}

function hasRoomWorkAnchors(task?: TaskContext, taskShape?: TaskShape, actionTitle?: string) {
  if (!task) return false;
  return collectRoomArtifactAnchors(task, taskShape, actionTitle).length >= 2;
}

function hasExplicitCustomerContext(task?: TaskContext, taskShape?: TaskShape) {
  const text = collectTrustedSourceContext(task, taskShape);
  return /\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\s+(?:Corp|Co|Ltd|Inc|LLC|Bank)\b|ลูกค้า|client|customer|ผู้ว่าจ้าง/iu.test(text);
}

export function hasAnchorInStep(step: string, anchors: string[]) {
  const normalizedStep = normalizeForStepMatch(step);
  return anchors.some((anchor) => normalizedStep.includes(normalizeForStepMatch(anchor)));
}

function isResetOnlyStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  const resetWords = ['พัก', 'หายใจ', 'กิน', 'ดื่มน้ำ', 'เติมพลัง', 'สมองตื้อ', 'energy', 'reset'];
  const workWords = ['สรุป', 'ร่าง', 'แยก', 'เช็ก', 'จด', 'ตอบ', 'draft', 'summary', 'checklist', 'status', 'message'];
  return resetWords.some((word) => normalized.includes(word)) &&
    !workWords.some((word) => normalized.includes(word));
}

function isConcreteWorkStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  return [
    'สรุป',
    'ร่าง',
    'แยก',
    'เช็ก',
    'จด',
    'ตอบ',
    'draft',
    'summary',
    'status',
    'checklist',
    'message',
  ].some((token) => normalized.includes(token));
}

function isArtifactStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  return [
    'ร่าง',
    'ข้อความ',
    'สรุป',
    'โน้ต',
    'note',
    'status',
    'checklist',
    'draft',
    'message',
    '3 บรรทัด',
  ].some((token) => normalized.includes(token));
}

function isGenericStarterTemplateStep(step: string) {
  const normalized = normalizeForStepMatch(step);
  return [
    'สรุปสถานะล่าสุดของ ลูกค้า',
    'สรุปสถานะล่าสุดของ client',
    'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
    'ร่างข้อความตอบ ลูกค้า แบบปลอดภัย',
    'ร่างข้อความตอบ client แบบปลอดภัย',
    'เปิดแค่หน้าจอเดียว',
    'เลือกงานก้าวแรกที่เล็กพอทำได้',
  ].some((pattern) => normalized.includes(pattern));
}

export function echoesActionTitle(step: string, actionTitle?: string) {
  if (!actionTitle) return false;
  const normalizedStep = normalizeForStepMatch(step);
  const normalizedTitle = normalizeForStepMatch(actionTitle);
  if (!normalizedStep || !normalizedTitle) return false;
  if (normalizedStep.includes(normalizedTitle)) return true;
  return normalizedStep.includes('ทำก้าวเล็กชิ้นเดียวของ') ||
    normalizedStep.includes('ทำก้าวหลักนี้ทันที');
}

function shouldUseGroundedFallbackSteps(
  steps: string[] | undefined,
  action: { title: string; successSignal?: string },
  taskShape?: TaskShape,
  task?: TaskContext,
) {
  if (!steps || steps.length !== 3) return true;
  if (!hasRoomWorkAnchors(task, taskShape, action.title)) return false;

  const anchors = collectRoomArtifactAnchors(task, taskShape, action.title);
  const concreteAnchors = concreteRoomAnchors(anchors);
  const demoQaAnchors = ['fallback latency', 'reentry card', 'evidence source', 'context หาย', 'demo MIND'];
  const hasDemoQaRoom = anchors.includes('demo MIND') &&
    demoQaAnchors.filter((anchor) => anchors.includes(anchor)).length >= 3;
  const demoQaStepHits = hasDemoQaRoom
    ? demoQaAnchors.filter((anchor) => steps.some((step) => hasAnchorInStep(step, [anchor]))).length
    : 0;
  const anchoredCount = steps.filter((step) => hasAnchorInStep(step, anchors)).length;
  const resetOnlyCount = steps.filter(isResetOnlyStep).length;
  const genericCustomerOnlyCount = concreteAnchors.length > 0
    ? steps.filter((step) => /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu.test(step) && !hasAnchorInStep(step, concreteAnchors)).length
    : 0;
  const inventedCustomerContext = steps.some((step) => /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu.test(step)) &&
    !hasExplicitCustomerContext(task, taskShape);
  const hasPaymentStatusRoom = anchors.includes('Dashboard') && anchors.includes('payment API');
  const hasCustomerCommunicationContext = anchors.includes('CS');
  const genericMultiItemPaymentDrift = hasPaymentStatusRoom &&
    hasCustomerCommunicationContext &&
    steps.some((step) => /แยกงานค้าง|แต่ละรายการ/u.test(step));

  return (
    !isConcreteWorkStep(steps[0]) ||
    isResetOnlyStep(steps[0]) ||
    !isArtifactStep(steps[2]) ||
    anchoredCount < 2 ||
    inventedCustomerContext ||
    (hasDemoQaRoom && demoQaStepHits < 3) ||
    genericCustomerOnlyCount >= 2 ||
    genericMultiItemPaymentDrift ||
    resetOnlyCount > 1 ||
    steps.some((step) => echoesActionTitle(step, action.title) || isGenericStarterTemplateStep(step))
  );
}

function buildGroundedArtifactMicroSteps(
  action: { title: string; successSignal?: string },
  taskShape?: TaskShape,
  task?: TaskContext,
) {
  if (!hasRoomWorkAnchors(task, taskShape, action.title)) return undefined;

  const anchors = collectRoomArtifactAnchors(task, taskShape, action.title);
  const concreteAnchors = concreteRoomAnchors(anchors);
  const customerAnchor = anchors.find((anchor) => /corp|co|ltd|inc|llc|bank/i.test(anchor)) ??
    (hasExplicitCustomerContext(task, taskShape) ? 'ลูกค้า' : 'ตัวเอง');
  const hasIncident = anchors.some((anchor) => ['prod', 'CPU spike', 'RCA', 'incident', 'server', 'webhook'].includes(anchor));
  const hasDashboard = anchors.includes('Dashboard');
  const hasPayment = anchors.includes('payment API');
  const hasChat = anchors.includes('CS') || anchors.includes('แชต') || anchors.includes('ลูกค้า');
  const hasProposal = taskShape?.deliverableType === 'proposal' ||
    anchors.includes('proposal') ||
    anchors.includes('ระบบ AI ร้านค้าส่ง') ||
    (anchors.includes('scope') && (anchors.includes('estimate') || anchors.includes('timeline')));
  const hasRelease = anchors.some((anchor) => ['QA', 'release', 'payment webhook', 'provider timeout', 'Jira'].includes(anchor));
  const hasDemoQa = anchors.includes('demo MIND') &&
    ['fallback latency', 'reentry card', 'evidence source', 'context หาย'].filter((anchor) => anchors.includes(anchor)).length >= 3;
  const hasInternalPresentationPrep = anchors.includes('พรีเซนต์งานในทีม') &&
    ['notes', 'แชท', 'ไฟล์สไลด์', 'สมุด'].filter((anchor) => anchors.includes(anchor)).length >= 2;
  const hasPhysicalRoomReset = anchors.includes('ห้องรก') &&
    ['เสื้อผ้า', 'เก้าอี้', 'โต๊ะ', 'แก้วน้ำ', 'กระดาษ', '10 นาที'].filter((anchor) => anchors.includes(anchor)).length >= 2;
  const hasStudentReport = anchors.includes('รายงาน') &&
    ['renewable energy storage', 'reference links', 'บทนำ', '10 นาที'].filter((anchor) => anchors.includes(anchor)).length >= 2;
  const hasProductPost = anchors.includes('โพสต์สินค้า') &&
    ['ร้านออนไลน์', 'กระเป๋าผ้า canvas', 'caption', 'เบา', 'ซักง่าย', '3 สี'].filter((anchor) => anchors.includes(anchor)).length >= 2;
  const hasMixedOverloadWork = taskShape?.behaviorIntent === 'personal_friction' &&
    anchors.some((anchor) => ['รายงานสรุปรายสัปดาห์', 'ตรวจสเปกเว็บใหม่'].includes(anchor));

  if (hasDashboard && hasPayment && anchors.includes('CS')) {
    return [
      'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
      'เติมอัปเดต 3 บรรทัดให้ CS',
      `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลาเกินข้อมูลที่เห็น`,
    ];
  }

  if (hasDemoQa) {
    return [
      'จด fallback latency, reentry card, evidence source เป็น 3 จุด demo',
      'เช็กปุ่มช่วยแก้ก้าวนี้กับ completed context ว่ายังต่อเนื่อง',
      'ร่าง demo checklist ที่กัน context หายหลังจบงาน',
    ];
  }

  if (hasInternalPresentationPrep) {
    return [...PRESENTATION_PREP_STEP_FALLBACK];
  }

  if (hasPhysicalRoomReset) {
    return [...PHYSICAL_ROOM_RESET_STEP_FALLBACK];
  }

  if (hasStudentReport) {
    return buildStudentReportStepFallback(task?.sourceText);
  }

  const rawContext = collectRawRoomSourceContext(task);
  const hasLogoRevision = isLogoRevisionText(rawContext);
  if (hasLogoRevision) {
    const isReentry = taskShape?.immediateNeed === 'resume_execution';
    return buildLogoRevisionStepFallback(task?.sourceText, isReentry);
  }

  const hasOverloadedWork = isOverloadedWorkText(rawContext);
  if (hasOverloadedWork) {
    return buildOverloadedWorkStepFallback(task?.sourceText);
  }

  if (hasProductPost) {
    return [...PRODUCT_POST_STEP_FALLBACK];
  }

  if (hasRelease) {
    return [
      anchors.includes('payment webhook') || anchors.includes('provider timeout')
        ? 'สรุป payment webhook/provider timeout เป็น 3 บรรทัด'
        : 'สรุปสถานะ release/QA เป็น 3 บรรทัด',
      'แยก QA/release/Jira ที่ตรวจแล้วกับยังไม่ชัด',
      'ร่าง update ผู้จัดการแบบยังไม่ยืนยัน release',
    ];
  }

  if (hasMixedOverloadWork) {
    return [
      'ทำ checklist รายงานสรุปรายสัปดาห์กับสเปกเว็บ',
      'แยกงานที่เริ่มได้ใน 10 นาทีแรก',
      'จด checkpoint ว่าจะเริ่มรายงานหรือสเปกเว็บ',
    ];
  }

  if (hasIncident) {
    return [
      anchors.includes('CPU spike')
        ? 'สรุปสถานะ prod/CPU spike เป็น 3 บรรทัด'
        : 'สรุปสถานะ incident เป็น 3 บรรทัด',
      hasDashboard && hasPayment
        ? 'แยก Dashboard กับ payment API ว่าค้างตรงไหน'
        : 'จดสิ่งที่ตรวจแล้วกับสิ่งที่ยังไม่ชัด',
      hasChat
        ? `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลา`
        : 'ร่าง status note ที่ไม่ commit เวลา',
    ];
  }

  if (hasProposal) {
    const proposalSubject = anchors.includes('ระบบ AI ร้านค้าส่ง') ? 'ระบบ AI ร้านค้าส่ง' : 'proposal';
    return [
      `สรุป scope ${proposalSubject} เป็น 3 bullet`,
      'แยก estimate/timeline ที่มีแล้วกับยังขาด',
      'ร่างคำถามกลับเรื่อง proposal ก่อนประเมินราคา',
    ];
  }

  if (hasDashboard || hasPayment || anchors.includes('API')) {
    return [
      `แยกงานค้างของ ${customerAnchor} เป็นรายการสั้น`,
      'จดสถานะล่าสุดของแต่ละรายการ',
      `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลา`,
    ];
  }

  if (concreteAnchors.length > 0) {
    const primary = concreteAnchors[0];
    const secondary = concreteAnchors.find((anchor) => normalizeForStepMatch(anchor) !== normalizeForStepMatch(primary));
    const anchorLabel = secondary ? `${primary}/${secondary}` : primary;
    return [
      `สรุป ${anchorLabel} เป็น 3 บรรทัด`,
      `แยกข้อมูลที่รู้แล้วกับที่ยังขาดของ ${primary}`,
      `ร่าง note ถัดไปเกี่ยวกับ ${anchorLabel}`,
    ];
  }

  return [
    `สรุปสถานะล่าสุดของ ${customerAnchor} เป็น 3 บรรทัด`,
    'แยกสิ่งที่รู้แล้วกับสิ่งที่ยังขาด',
    `ร่างข้อความตอบ ${customerAnchor} แบบปลอดภัย`,
  ];
}

function buildSourceGroundedActionResponse(
  response: AiActionResponse,
  taskShape?: TaskShape,
  task?: TaskContext,
): AiActionResponse {
  const trustedContext = collectTrustedSourceContext(task, taskShape);
  const outputTexts = [
    response.chosenAction.title,
    response.chosenAction.rationale,
    response.chosenAction.successSignal,
    response.whyThisNow,
    response.situationSummary,
    response.replyDraft,
    response.alternatives.map((alternative) => `${alternative.title} ${alternative.rationale}`).join(' '),
    response.starterMicroSteps?.join(' '),
  ];
  const hasExternalStakeholderDrift = hasDisallowedExternalStakeholderOutput({
    sourceContext: collectRawRoomSourceContext(task),
    outputTexts,
  });

  if (hasExternalStakeholderDrift && isInternalPresentationPrepText(trustedContext)) {
    const fallback = buildPresentationPrepActionFallback();
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  const rawContext = collectRawRoomSourceContext(task);
  if (isPhysicalRoomResetText(rawContext)) {
    const fallback = buildPhysicalRoomResetActionFallback();
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  if (isStudentReportText(rawContext)) {
    const fallback = buildStudentReportActionFallback(rawContext);
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  if (isLogoRevisionText(rawContext)) {
    const isReentry = taskShape?.immediateNeed === 'resume_execution';
    const fallback = buildLogoRevisionActionFallback(rawContext, isReentry);
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  if (isOverloadedWorkText(rawContext)) {
    const fallback = buildOverloadedWorkActionFallback(rawContext);
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  if (isProductPostText(rawContext)) {
    const fallback = buildProductPostActionFallback();
    return {
      ...response,
      chosenAction: {
        title: fallback.chosenTitle,
        rationale: fallback.chosenRationale,
        successSignal: fallback.successSignal,
      },
      alternatives: fallback.alternatives,
      whyThisNow: fallback.whyThisNow,
      replyDraft: fallback.replyDraft,
      situationSummary: fallback.situationSummary,
      starterMicroSteps: undefined,
      meta: {
        ...response.meta,
        repairUsed: response.meta.repairUsed,
      },
    };
  }

  return response;
}

function buildPresentationPrepTaskFrame() {
  return {
    objective: 'เตรียมพรีเซนต์งานในทีมจาก notes หลายแหล่ง',
    stage: 'กำลังแปลง notes จากแชท ไฟล์สไลด์ และสมุดให้เป็นหัวข้อพูด 3 ช่อง',
    stakeholders: ['ทีม'],
  };
}

function buildSourceGroundedIntake(intake: AiIntakeResponse, task: TaskContext): AiIntakeResponse {
  const rawContext = collectRawRoomSourceContext(task);
  if (isInternalPresentationPrepText(rawContext)) {
    const fallback = buildPresentationPrepActionFallback();
    return {
      ...intake,
      roomDigest: fallback.situationSummary,
      taskFrame: buildPresentationPrepTaskFrame(),
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: 'resume_execution',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: [
          'notes จากแชท ไฟล์สไลด์ และสมุด',
          'หัวข้อผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
        ],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  if (isPhysicalRoomResetText(rawContext)) {
    const fallback = buildPhysicalRoomResetActionFallback();
    return {
      ...intake,
      workflowType: 'client_resume',
      roomDigest: fallback.situationSummary,
      taskFrame: {
        objective: 'เคลียร์พื้นที่ใช้งานหนึ่งจุดในห้องรก',
        stage: 'กำลังลดงานเก็บห้องให้เหลือก้าวกายภาพที่ทำได้ใน 10 นาที',
        stakeholders: ['ตัวเอง'],
      },
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: 'resume_execution',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: ['พื้นที่กายภาพจุดแรกที่ต้องเคลียร์ในห้อง'],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  if (isStudentReportText(rawContext)) {
    const fallback = buildStudentReportActionFallback(rawContext);
    const hasRenewable = /renewable energy storage/i.test(rawContext);
    const topicLabel = hasRenewable ? ' renewable energy storage' : '';
    const refLinkLabel = /reference link/i.test(rawContext) ? 'reference link' : 'ลิงก์อ้างอิง';
    return {
      ...intake,
      workflowType: 'client_resume',
      roomDigest: fallback.situationSummary,
      taskFrame: {
        objective: `เริ่มบทนำรายงาน${topicLabel} จาก ${refLinkLabel} แรก`,
        stage: 'กำลังลดรายงานให้เหลือก้าวเริ่มเขียนบทนำใน 10 นาที',
        stakeholders: ['ตัวเอง'],
      },
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: 'resume_execution',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: [`${refLinkLabel} แรกที่ใช้เริ่มบทนำรายงาน`],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  if (isProductPostText(rawContext)) {
    const fallback = buildProductPostActionFallback();
    return {
      ...intake,
      workflowType: 'client_resume',
      roomDigest: fallback.situationSummary,
      taskFrame: {
        objective: 'ร่าง caption สินค้าจากจุดขายที่มีอยู่',
        stage: 'กำลังเปลี่ยนจุดขายกระเป๋าผ้า canvas ให้เป็น caption ที่โพสต์ได้คืนนี้',
        stakeholders: ['ตัวเอง'],
      },
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: 'resume_execution',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: ['caption สินค้าที่เริ่มจากจุดขายพร้อมใช้'],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  if (isLogoRevisionText(rawContext)) {
    const isReentry = intake.taskShape?.immediateNeed === 'resume_execution';
    const fallback = buildLogoRevisionActionFallback(rawContext, isReentry);
    return {
      ...intake,
      workflowType: 'client_resume',
      roomDigest: fallback.situationSummary,
      taskFrame: {
        objective: isReentry ? 'ร่างคำตอบลูกค้าจากรายการที่จดไว้' : 'จัดการงานแก้โลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้)',
        stage: isReentry ? 'กำลังเตรียมข้อความตอบกลับลูกค้า' : 'เริ่มดำเนินการจดรายละเอียด',
        stakeholders: isReentry ? ['ลูกค้า', 'ตัวเอง'] : ['ตัวเอง'],
      },
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: isReentry ? 'resume_execution' : 'send_reply_now',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: isReentry ? 'resume_execution' : 'send_reply_now',
        missingInputs: ['รายการแก้โลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้)'],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  if (isOverloadedWorkText(rawContext)) {
    const fallback = buildOverloadedWorkActionFallback(rawContext);
    return {
      ...intake,
      workflowType: 'client_resume',
      roomDigest: fallback.situationSummary,
      taskFrame: {
        objective: 'เลือกเคลียร์งานค้าง 1 อย่างจากที่มีอยู่ (พอร์ต/ใบเสนอราคา/เรซูเม่/แชทงาน)',
        stage: 'ลดความสับสนและโฟกัสงานชิ้นเดียว',
        stakeholders: ['ตัวเอง'],
      },
      taskShape: {
        ...(intake.taskShape ?? {
          deliverableType: 'execution',
          immediateNeed: 'resume_execution',
          missingInputs: [],
          workContext: fallback.situationSummary,
        }),
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: ['งานค้างที่เลือกทำเป็นอย่างแรก'],
        workContext: fallback.situationSummary,
        behaviorIntent: 'admin_task',
      },
    };
  }

  return intake;
}

export function buildPayloadFromAiActionResponse(
  workflowType: WorkflowType,
  response: AiActionResponse,
  blockers: string[],
  taskShape?: TaskShape,
  task?: TaskContext,
): AiSynthesisResponse {
  const groundedResponse = buildSourceGroundedActionResponse(response, taskShape, task);
  const aiSteps = groundedResponse.starterMicroSteps;
  const useAiSteps =
    aiSteps &&
    aiSteps.length === 3 &&
    aiSteps.every((s) => s.trim().length > 0) &&
    !shouldUseGroundedFallbackSteps(aiSteps, groundedResponse.chosenAction, taskShape, task);
  const microSteps = useAiSteps ? [...aiSteps] : buildBootstrapMicroSteps(groundedResponse.chosenAction, taskShape, task);
  const microStepsSource: 'ai' | 'fallback' = useAiSteps ? 'ai' : 'fallback';

  return {
    workflow_type: workflowType,
    requires_clarification: false,
    clarification_nudge: undefined,
    situation_summary: groundedResponse.situationSummary,
    reply_draft: workflowType === 'client_response' ? groundedResponse.replyDraft ?? undefined : undefined,
    recommended_action: {
      title: groundedResponse.chosenAction.title,
      rationale: groundedResponse.chosenAction.rationale,
      micro_steps: microSteps,
      micro_steps_source: microStepsSource,
    },
    alternative_actions: groundedResponse.alternatives.slice(0, 2).map((alternative) => ({
      title: alternative.title,
      rationale: alternative.rationale,
    })),
    detected_blockers: blockers,
    task_shape: taskShape,
  };
}

export function resolveWorkflowType(data: AiSynthesisResponse): WorkflowType {
  if (data.workflow_type === 'client_response' || data.workflow_type === 'client_resume') {
    return data.workflow_type;
  }
  return data.reply_draft ? 'client_response' : 'client_resume';
}

export function addressesBlocker(title: string, blockers: string[]) {
  const normalizedTitle = title.toLowerCase();
  return blockers.some((blocker) => {
    const normalizedBlocker = blocker.toLowerCase();
    if (!normalizedBlocker.trim()) return false;
    if (normalizedTitle.includes(normalizedBlocker)) return true;
    return normalizedBlocker
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .some((token) => normalizedTitle.includes(token));
  });
}

function appendWorkflowHint(dump: string) {
  if (sessionWorkflowHistory.length < 3) return dump;
  const lastThree = sessionWorkflowHistory.slice(-3);
  if (!lastThree.every((item) => item === lastThree[0])) return dump;
  return `${dump}\n\n(บริบท: ผู้ใช้มักทำงานประเภท ${lastThree[0]} ใน session นี้)`;
}

export function rememberWorkflow(workflowType: WorkflowType) {
  sessionWorkflowHistory = [...sessionWorkflowHistory, workflowType].slice(-5);
}

export function getSessionTask(base: AppSession): TaskContext {
  if (base.task) return base.task;
  const sourceText = base.activeDumpContext?.text;
  if (!sourceText) {
    throw new Error('ไม่พบ task context');
  }
  return createTaskContext(sourceText, base.lastWorkflowType, base.lastActive);
}

export function buildSynthesisInput(task: TaskContext): string {
  const sections: string[] = [truncateRoomText(task.sourceText)];
  const structuredContext: string[] = [];

  if (task.workflowType) {
    structuredContext.push(`workflow_type: ${task.workflowType}`);
  }
  if (task.taskShape) {
    structuredContext.push(
      [
        'task_shape:',
        `deliverable_type: ${task.taskShape.deliverableType}`,
        `immediate_need: ${task.taskShape.immediateNeed}`,
        `behavior_intent: ${task.taskShape.behaviorIntent ?? 'admin_task'}`,
        `missing_inputs: ${task.taskShape.missingInputs.join(', ') || 'ไม่มี'}`,
        `work_context: ${task.taskShape.workContext}`,
        `confidence: ${task.taskShape.confidence ?? 'ไม่ระบุ'}`,
      ].join('\n'),
    );
  }
  if (task.currentStepIndex > 0) {
    structuredContext.push(`current_step_index: ${task.currentStepIndex}`);
  }
  if (task.lastFailureReason) {
    structuredContext.push(`last_failure_reason: ${task.lastFailureReason}`);
  }
  if (task.blockerSignals.length > 0) {
    structuredContext.push(`blocker_signals:\n- ${task.blockerSignals.join('\n- ')}`);
  }

  if (task.sourceFiles.length > 0) {
    structuredContext.push(`room_files:\n- ${task.sourceFiles.map((file) => summarizeRoomFile(file)).join('\n- ')}`);
  }

  const clarificationAnswers = task.pendingInputs
    .filter((input) => input.kind === 'clarification')
    .map((input) => input.answer.trim())
    .filter((answer) => Boolean(answer));
  if (clarificationAnswers.length > 0) {
    structuredContext.push(`clarification_answers:\n- ${clarificationAnswers.join('\n- ')}`);
  }

  const manualNotes = task.pendingInputs
    .filter((input) => input.kind === 'manual_rescue')
    .map((input) => input.answer.trim())
    .filter((answer) => Boolean(answer));
  if (manualNotes.length > 0) {
    structuredContext.push(`manual_notes:\n- ${manualNotes.join('\n- ')}`);
  }

  if (task.lastSynthesis?.situation_summary) {
    structuredContext.push(`previous_summary: ${task.lastSynthesis.situation_summary}`);
  }

  if (structuredContext.length > 0) {
    sections.push(`\n\nบริบทงาน:\n${structuredContext.join('\n')}`);
  }

  return appendWorkflowHint(sections.join(''));
}

export function deriveRoomBlockers(task: TaskContext): string[] {
  const blockers = new Set(task.blockerSignals);
  if (task.sourceFiles.some((file) => file.status !== 'ready')) {
    blockers.add('missing_file_or_context');
  }
  return [...blockers];
}

export function deriveBounceBackRoute(task: TaskContext | undefined, action: Action | null): UIRoute {
  if (!task) return action ? 'ONE_ACTION' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'in_scaffold') return 'SCAFFOLD';
  if (task.currentStepIndex > 0) return 'SCAFFOLD';
  if (task.lifecycleState === 'clarification_needed') return 'CLARIFICATION';
  if (task.lifecycleState === 'synthesizing') return 'SYNTHESIZING';
  if (task.lifecycleState === 'has_one_action') return action ? 'ONE_ACTION' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'stalled') return action ? 'SCAFFOLD' : 'DUMP_ENTRY';
  if (task.lifecycleState === 'failed') return 'MANUAL_FALLBACK';
  return 'DUMP_ENTRY';
}

export function routeFromResumeTarget(target: ReentryResumeTarget): UIRoute {
  if (target === 'ONE_ACTION' || target === 'SCAFFOLD' || target === 'DUMP_ENTRY') {
    return target;
  }
  return 'DUMP_ENTRY';
}

export function toSmallerMicroStep(step: string): string {
  const normalized = step
    .replace(/^(?:ขยับอีกนิด:\s*)+/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'ขยับอีกนิด: ทำแค่ส่วนแรกที่แตะได้ก่อน';
  }

  return `ขยับอีกนิด: ${normalized}`;
}

function buildActionStateFromPayload(
  workflowType: WorkflowType,
  payload: AiSynthesisResponse,
  roomId?: string,
  existingAction?: Action | null,
): Action {
  if (existingAction) {
    return {
      ...existingAction,
      title: payload.recommended_action.title,
      rationale: payload.recommended_action.rationale,
      microSteps: payload.recommended_action.micro_steps,
      microStepsSource: payload.recommended_action.micro_steps_source ?? 'fallback',
      workflowType,
      situationSummary: payload.situation_summary,
      replyDraft: payload.reply_draft ?? undefined,
      detectedBlockers: payload.detected_blockers ?? [],
    };
  }

  return {
    id: Date.now().toString(),
    roomId,
    createdAt: Date.now(),
    title: payload.recommended_action.title,
    rationale: payload.recommended_action.rationale,
    microSteps: payload.recommended_action.micro_steps,
    microStepsSource: payload.recommended_action.micro_steps_source ?? 'fallback',
    isPinned: false,
    state: 'PENDING',
    workflowType,
    situationSummary: payload.situation_summary,
    replyDraft: payload.reply_draft ?? undefined,
    detectedBlockers: payload.detected_blockers ?? [],
  };
}

export function buildActionSuccessArtifacts(input: {
  task: TaskContext;
  intake: AiIntakeResponse;
  actionResponse: AiActionResponse;
  evidenceContext?: ActionEvidenceContext;
  existingAction?: Action | null;
  persistedNegotiationMode?: Extract<AiActionNegotiationMode, 'reply_first' | 'resume_first'>;
}) {
  const { task, intake, actionResponse, evidenceContext, existingAction, persistedNegotiationMode } = input;
  const groundedIntake = buildSourceGroundedIntake(intake, task);
  const workflowType = groundedIntake.workflowType;
  const groundedActionResponse = buildSourceGroundedActionResponse(actionResponse, groundedIntake.taskShape, task);
  const payload = buildPayloadFromAiActionResponse(workflowType, groundedActionResponse, groundedIntake.blockers, groundedIntake.taskShape, task);
  const actionState = buildActionStateFromPayload(workflowType, payload, task.roomId, existingAction);

  let constraints = task.constraints
    ? { ...task.constraints }
    : undefined;
  if (persistedNegotiationMode === 'reply_first') {
    (constraints ??= {}).preferReplyFirst = true;
  } else if (persistedNegotiationMode === 'resume_first') {
    (constraints ??= {}).preferReplyFirst = false;
  }

  const generatedAt = Date.now();
  const actionEvidence = evidenceContext?.selectionMethod === 'retrieval' && evidenceContext.evidenceChips.length > 0
    ? evidenceContext.evidenceChips
    : undefined;
  const currentPlan = enrichPlanWithProvenance({
    actionTitle: payload.recommended_action.title,
    successSignal: groundedActionResponse.chosenAction.successSignal,
    steps: payload.recommended_action.micro_steps.map((step, index) => ({
      id: `step-${index + 1}`,
      text: step,
      evidence: actionEvidence,
    })),
  }, task, 'action', generatedAt);

  const nextTask: TaskContext = {
    ...task,
    workflowType,
    taskShape: groundedIntake.taskShape,
    blockerSignals: groundedIntake.blockers,
    taskFrame: groundedIntake.taskFrame,
    lifecycleState: 'has_one_action',
    assistantMode: 'action_negotiation',
    lastAiOperation: 'action',
    currentActionId: actionState.id,
    currentStepIndex: 0,
    lastSynthesis: payload,
    lastFailureReason: undefined,
    actionExplanation: groundedActionResponse.whyThisNow,
    currentPlan,
    pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'action', generatedAt),
    planHistory: [
      ...(task.planHistory ?? []),
      {
        id: `revision-${generatedAt}`,
        planId: `draft-${generatedAt}`,
        status: 'draft' as const,
        actionTitle: currentPlan.actionTitle,
        steps: currentPlan.steps,
        createdAt: generatedAt,
      },
    ].slice(-20),
    constraints,
    oneActionTracking: {
      hasViewedAlternative: false,
      hasAdjusted: false,
    },
  };

  return {
    workflowType,
    payload,
    actionState,
    whyThisNow: groundedActionResponse.whyThisNow,
    nextTask,
    blockerCount: actionState.detectedBlockers?.length ?? 0,
    addressesDetectedBlocker: actionState.detectedBlockers
      ? addressesBlocker(actionState.title, actionState.detectedBlockers)
      : false,
  };
}

export function buildScaffoldSuccessArtifacts(input: {
  task: TaskContext;
  action: Action;
  payload: AiSynthesisResponse;
  scaffold: AiScaffoldResponse;
}) {
  const { task, action, payload, scaffold } = input;
  const nextMicroSteps = scaffold.steps.slice(0, 3).map((step) => step.text);
  const nextPayload: AiSynthesisResponse = {
    ...payload,
    recommended_action: {
      ...payload.recommended_action,
      title: scaffold.planTitle,
      micro_steps: [
        nextMicroSteps[0] ?? payload.recommended_action.micro_steps[0],
        nextMicroSteps[1] ?? payload.recommended_action.micro_steps[1],
        nextMicroSteps[2] ?? payload.recommended_action.micro_steps[2],
      ],
    },
  };

  const nextActionState: Action = {
    ...action,
    title: nextPayload.recommended_action.title,
    microSteps: nextPayload.recommended_action.micro_steps,
  };

  const generatedAt = Date.now();
  const currentPlan = enrichPlanWithProvenance({
    actionTitle: nextActionState.title,
    successSignal: task.currentPlan?.successSignal,
    steps: scaffold.steps,
  }, task, 'scaffold', generatedAt);

  const nextTask: TaskContext = {
    ...task,
    lifecycleState: 'in_scaffold',
    assistantMode: 'scaffold_refinement',
    lastAiOperation: 'scaffold',
    currentStepIndex: Math.min(
      scaffold.revisedCurrentStepIndex,
      currentPlan.steps.length - 1,
    ),
    currentPlan,
    pendingPlan: createDraftPlanFromCurrentPlan(currentPlan, 'scaffold', generatedAt),
    planHistory: [
      ...(task.planHistory ?? []),
      {
        id: `revision-${generatedAt}`,
        planId: `draft-${generatedAt}`,
        status: 'draft' as const,
        actionTitle: currentPlan.actionTitle,
        steps: currentPlan.steps,
        createdAt: generatedAt,
      },
    ].slice(-20),
    lastSynthesis: nextPayload,
  };

  return { nextPayload, nextActionState, nextTask };
}

export function buildReentryTaskArtifacts(task: TaskContext, reentry: AiReentryResponse) {
  const failedFileNames = task.sourceFiles
    .filter((f) => f.status === 'failed_extraction' || f.status === 'unreadable' || f.status === 'failed')
    .map((f) => f.name);

  // Derive used source IDs from the current plan's evidence chips if available
  const usedSourceIds = task.currentPlan?.steps
    ?.flatMap((step) => step.evidence ?? [])
    .map((chip) => chip.sourceId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    ?? [];

  const nextTask: TaskContext = {
    ...task,
    assistantMode: 'reentry_brief',
    lastAiOperation: 'reentry',
    reentryBrief: {
      summary: reentry.reentrySummary,
      topActions: reentry.topActions,
      ignoredNoise: reentry.ignoredNoise,
      createdAt: Date.now(),
      ...(usedSourceIds.length > 0 ? { usedSourceIds } : {}),
      ...(failedFileNames.length > 0 ? { failedFileNames } : {}),
    },
  };

  return { nextTask };
}

export function hasResumableTask(task?: TaskContext) {
  if (!task) return false;
  return task.lifecycleState !== 'dumped' && task.lifecycleState !== 'done';
}
