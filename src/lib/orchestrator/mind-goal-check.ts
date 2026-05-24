import type { AssistantMode, TaskContext, TaskLifecycleState, UIRoute } from '@/lib/store/idb';
import { trackEvent } from '@/lib/instrumentation';
import {
  hasExternalStakeholderTerm,
  hasExplicitExternalStakeholderSource,
  isInternalPresentationPrepText,
} from '@/lib/source-grounding';

export type MindGoalStage =
  | 'one_action'
  | 'working_steps'
  | 'rescue'
  | 'active_reentry'
  | 'completed_context'
  | 'fallback';

export type MindGoalVerdict = 'pass' | 'warn' | 'fail';
export type MindGoalSourceKind = 'ai' | 'fallback' | 'manual' | 'mixed' | 'unknown';

export interface MindGoalCheckInput {
  stage: MindGoalStage;
  sourceText?: string;
  actionTitle?: string;
  actionCount?: number;
  steps?: string[];
  sourceKind?: MindGoalSourceKind;
  lifecycleState?: TaskLifecycleState;
  label?: string;
  cta?: string;
  contextSourceLabel?: string;
}

export interface MindGoalSemanticCheck {
  stage: MindGoalStage;
  verdict: MindGoalVerdict;
  reason_codes: string[];
  anchor_hits: string[];
  missing_anchors: string[];
  action_count: number;
  step_count: number;
  source_kind: MindGoalSourceKind;
}

const ANCHOR_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'ABC Corp', pattern: /\bABC\s+Corp\b/i },
  { label: 'payment API', pattern: /\bpayment\s+API\b/i },
  { label: 'Dashboard', pattern: /\bDashboard\b/i },
  { label: 'CS', pattern: /\bCS\b/i },
  { label: 'incident', pattern: /\bincident\b/i },
  { label: 'CPU spike', pattern: /\bCPU\s+spike\b/i },
  { label: '10:20', pattern: /\b10:20\b/ },
  { label: 'ลูกค้า', pattern: /ลูกค้า/u },
  { label: 'พรีเซนต์งานในทีม', pattern: /พรีเซนต์งานในทีม|พรีเซนต์|นำเสนอ|presentation/iu },
  { label: 'notes', pattern: /notes?|โน้ต/iu },
  { label: 'แชท', pattern: /แชท|แชต|chat/iu },
  { label: 'ไฟล์สไลด์', pattern: /ไฟล์สไลด์|สไลด์|slide/iu },
  { label: 'สมุด', pattern: /สมุด/u },
  { label: 'ผลที่ทำไปแล้ว', pattern: /ผลที่ทำไปแล้ว/u },
  { label: 'ปัญหาที่เจอ', pattern: /ปัญหาที่เจอ/u },
  { label: 'แผนต่อไป', pattern: /แผนต่อไป/u },
  { label: '10 นาที', pattern: /10\s*นาที|สิบ\s*นาที/u },
  { label: 'ห้องรก', pattern: /ห้องรก|เก็บห้อง|จัดห้อง/u },
  { label: 'เสื้อผ้า', pattern: /เสื้อผ้า/u },
  { label: 'เก้าอี้', pattern: /เก้าอี้/u },
  { label: 'โต๊ะ', pattern: /โต๊ะ/u },
  { label: 'แก้วน้ำ', pattern: /แก้วน้ำ/u },
  { label: 'กระดาษ', pattern: /กระดาษ/u },
  { label: 'โลโก้', pattern: /โลโก้|logo/iu },
  { label: 'สีหลัก', pattern: /สีหลัก/u },
  { label: 'แบรนด์', pattern: /แบรนด์|brand/iu },
  { label: 'minimal', pattern: /minimal/iu },
  { label: 'รายงาน', pattern: /รายงาน|report/iu },
  { label: 'renewable energy storage', pattern: /renewable energy storage/iu },
  { label: 'reference links', pattern: /reference links?|reference|ลิงก์/iu },
  { label: 'บทนำ', pattern: /บทนำ/u },
  { label: 'ร้านออนไลน์', pattern: /ร้านออนไลน์/u },
  { label: 'โพสต์สินค้า', pattern: /โพสต์สินค้า|สินค้าใหม่/u },
  { label: 'กระเป๋าผ้า canvas', pattern: /กระเป๋าผ้า\s*canvas|canvas/iu },
  { label: 'caption', pattern: /caption|แคปชั่น/iu },
  { label: 'เบา', pattern: /เบา/u },
  { label: 'ซักง่าย', pattern: /ซักง่าย/u },
  { label: '3 สี', pattern: /3\s*สี|สาม\s*สี/u },
  { label: 'fallback latency', pattern: /fallback latency/i },
  { label: 'reentry card', pattern: /reentry card/i },
  { label: 'evidence source', pattern: /evidence source/i },
  { label: 'completed context', pattern: /completed context/i },
  { label: 'context หาย', pattern: /context\s*หาย|context preservation|preserve context/iu },
  { label: 'demo MIND', pattern: /demo\s*MIND/i },
  { label: 'ปุ่มช่วยแก้ก้าวนี้', pattern: /ปุ่มช่วยแก้ก้าวนี้|ช่วยแก้ก้าวนี้/u },
  { label: 'ปุ่ม', pattern: /ปุ่ม/u },
  { label: 'deadline', pattern: /\bdeadline\b|วันนี้|บ่ายนี้/u },
];

const GENERIC_MULTI_ITEM_PATTERNS = [
  /แยกงานค้าง/u,
  /แต่ละรายการ/u,
  /รายการสั้น/u,
  /\bbacklog\b/i,
  /\btask list\b/i,
];

const BROAD_ACTION_PATTERNS = [
  /รวบรวมข้อมูลเกี่ยวกับ/u,
  /รวบรวมข้อมูล/u,
  /จัดการทั้งหมด/u,
  /วางแผนทั้งหมด/u,
  /วางแผนจัดห้องทั้งหมด/u,
  /จัดห้องทั้งหมด/u,
  /ทำรายการ/u,
  /\bcollect information\b/i,
  /\bplan everything\b/i,
  /\bmake a task list\b/i,
];

const STRONG_ANCHORS = [
  'ABC Corp',
  'payment API',
  'Dashboard',
  'CS',
  'incident',
  'fallback latency',
  'reentry card',
  'evidence source',
  'completed context',
  'context หาย',
  'demo MIND',
  'พรีเซนต์งานในทีม',
  'notes',
  'ไฟล์สไลด์',
  'ผลที่ทำไปแล้ว',
  'ปัญหาที่เจอ',
  'แผนต่อไป',
];

function normalizeText(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function collectAnchors(text: string) {
  return ANCHOR_PATTERNS
    .filter((anchor) => anchor.pattern.test(text))
    .map((anchor) => anchor.label);
}

function textContainsAnyAnchor(text: string, anchors: string[]) {
  const normalized = text.toLowerCase();
  return anchors.some((anchor) => normalized.includes(anchor.toLowerCase()));
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasStaleOutputAnchor(sourceText: string, outputText: string) {
  return ANCHOR_PATTERNS.some((anchor) => !anchor.pattern.test(sourceText) && anchor.pattern.test(outputText));
}

function isSingleIncidentPaymentRoom(sourceText: string) {
  return /\bpayment\s+API\b/i.test(sourceText) &&
    (/timeout/i.test(sourceText) || /incident/i.test(sourceText)) &&
    !/หลายรายการ|หลายงาน|many items|multiple items/i.test(sourceText);
}

function hasCustomerContext(text: string) {
  return hasExplicitExternalStakeholderSource(text);
}

function verdictFromReasons(reasonCodes: string[]): MindGoalVerdict {
  if (reasonCodes.some((reason) => reason.startsWith('fail:') || [
    'action_must_be_single',
    'rescue_must_be_one_step',
    'completed_room_cannot_be_active_reentry',
    'completed_context_requires_done_state',
    'fallback_reported_as_ai',
    'stale_context_anchor',
    'generic_multi_item_scaffold',
    'invented_customer_context',
    'external_stakeholder_not_in_source',
    'presentation_prep_customer_drift',
    'source_summary_contaminated',
    'dropped_strong_room_anchors',
    'weak_anchor_overfocus',
    'broad_task_list_action',
    ].includes(reason))) {
    return 'fail';
  }
  return reasonCodes.length > 0 ? 'warn' : 'pass';
}

export function inferMindGoalSourceKind(input: {
  model?: string;
  passType?: string;
  source?: string;
}): MindGoalSourceKind {
  const model = input.model?.toLowerCase() ?? '';
  const source = input.source?.toLowerCase() ?? '';
  if (model.includes('manual') || source.includes('manual')) return 'manual';
  if (input.passType === 'fallback_pass' || source.includes('fallback')) return 'fallback';
  if (model || input.passType === 'primary_pass' || input.passType === 'repair_pass') return 'ai';
  return 'unknown';
}

export function evaluateMindGoalStage(input: MindGoalCheckInput): MindGoalSemanticCheck {
  const sourceText = normalizeText(input.sourceText);
  const actionTitle = normalizeText(input.actionTitle);
  const steps = (input.steps ?? []).map(normalizeText).filter(Boolean);
  const stepsText = steps.join(' ');
  const outputText = [actionTitle, ...steps, input.label, input.cta].map(normalizeText).join(' ');
  const sourceAnchors = collectAnchors(sourceText);
  const stageAnchorText = input.stage === 'working_steps' || input.stage === 'rescue'
    ? stepsText
    : outputText;
  const outputAnchors = collectAnchors(stageAnchorText);
  const anchorHits = unique(outputAnchors.filter((anchor) => sourceAnchors.includes(anchor)));
  const missingAnchors = sourceAnchors.filter((anchor) => !anchorHits.includes(anchor));
  const missingStrongAnchors = sourceAnchors
    .filter((anchor) => STRONG_ANCHORS.includes(anchor))
    .filter((anchor) => !anchorHits.includes(anchor));
  const reasonCodes: string[] = [];
  const actionCount = input.actionCount ?? (actionTitle ? 1 : 0);
  const inventedCustomerContext = hasExternalStakeholderTerm(outputText) && !hasCustomerContext(sourceText);
  const presentationPrepCustomerDrift = inventedCustomerContext && isInternalPresentationPrepText(sourceText);

  if (inventedCustomerContext) {
    reasonCodes.push('external_stakeholder_not_in_source');
    reasonCodes.push('source_summary_contaminated');
  }
  if (presentationPrepCustomerDrift) {
    reasonCodes.push('presentation_prep_customer_drift');
  }

  if (input.stage === 'one_action') {
    if (actionCount !== 1) reasonCodes.push('action_must_be_single');
    if (!actionTitle) reasonCodes.push('missing_action_title');
    if (hasPattern(actionTitle, BROAD_ACTION_PATTERNS)) reasonCodes.push('broad_task_list_action');
    if (/รวบรวมข้อมูลเกี่ยวกับ/u.test(actionTitle)) reasonCodes.push('broad_collection_action');
    if (inventedCustomerContext) reasonCodes.push('invented_customer_context');
    if (sourceAnchors.length > 0 && !textContainsAnyAnchor(actionTitle, sourceAnchors)) reasonCodes.push('missing_room_anchor');
  }

  if (input.stage === 'working_steps') {
    if (steps.length === 0) reasonCodes.push('missing_working_steps');
    if (isSingleIncidentPaymentRoom(sourceText) && steps.some((step) => hasPattern(step, GENERIC_MULTI_ITEM_PATTERNS))) {
      reasonCodes.push('generic_multi_item_scaffold');
    }
    if (hasStaleOutputAnchor(sourceText, outputText)) reasonCodes.push('stale_context_anchor');
    if (inventedCustomerContext) reasonCodes.push('invented_customer_context');
    if (missingStrongAnchors.length >= 2) reasonCodes.push('dropped_strong_room_anchors');
    if (anchorHits.includes('ปุ่ม') && missingStrongAnchors.length >= 2) reasonCodes.push('weak_anchor_overfocus');
    if (sourceAnchors.length > 0 && steps.some((step) => !textContainsAnyAnchor(step, sourceAnchors) && !textContainsAnyAnchor(step, [actionTitle]))) {
      reasonCodes.push('step_missing_room_or_action_anchor');
    }
  }

  if (input.stage === 'rescue') {
    if (steps.length !== 1) reasonCodes.push('rescue_must_be_one_step');
    if (inventedCustomerContext) reasonCodes.push('invented_customer_context');
    if (sourceAnchors.length > 0 && !textContainsAnyAnchor(outputText, sourceAnchors)) reasonCodes.push('rescue_missing_room_anchor');
    if (hasStaleOutputAnchor(sourceText, outputText)) reasonCodes.push('stale_context_anchor');
  }

  if (input.stage === 'active_reentry') {
    if (input.lifecycleState === 'done') reasonCodes.push('completed_room_cannot_be_active_reentry');
    if (input.label !== 'มีก้าวถัดไปชัดอยู่แล้ว') reasonCodes.push('active_reentry_label_mismatch');
    if (input.cta !== 'ไปต่อ') reasonCodes.push('active_reentry_cta_mismatch');
    if (!normalizeText(input.contextSourceLabel)) reasonCodes.push('missing_context_source_label');
  }

  if (input.stage === 'completed_context') {
    if (input.lifecycleState !== 'done') reasonCodes.push('completed_context_requires_done_state');
    if (input.label !== 'งานนี้เสร็จแล้ว') reasonCodes.push('completed_context_label_mismatch');
    if (input.cta !== 'ทำงานต่อจากบริบทนี้') reasonCodes.push('completed_context_cta_mismatch');
  }

  if (input.stage === 'fallback') {
    if (input.sourceKind === 'ai') reasonCodes.push('fallback_reported_as_ai');
  }

  return {
    stage: input.stage,
    verdict: verdictFromReasons(reasonCodes),
    reason_codes: reasonCodes,
    anchor_hits: anchorHits,
    missing_anchors: missingAnchors,
    action_count: actionCount,
    step_count: steps.length,
    source_kind: input.sourceKind ?? 'unknown',
  };
}

export function trackMindGoalSemanticCheck(input: MindGoalCheckInput & {
  task?: TaskContext | null;
  uiRoute?: UIRoute;
}) {
  const check = evaluateMindGoalStage(input);
  const task = input.task ?? undefined;
  trackEvent('mind_goal_semantic_check', {
    ...check,
    room_id: task?.roomId,
    task_id: task?.id,
    ui_route: input.uiRoute,
    assistant_mode: task?.assistantMode as AssistantMode | undefined,
  });
  return check;
}
