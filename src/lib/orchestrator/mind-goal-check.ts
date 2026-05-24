import type { AssistantMode, TaskContext, TaskLifecycleState, UIRoute } from '@/lib/store/idb';
import { trackEvent } from '@/lib/instrumentation';

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
  /จัดการทั้งหมด/u,
  /วางแผนทั้งหมด/u,
  /ทำรายการ/u,
  /\bplan everything\b/i,
  /\bmake a task list\b/i,
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

function verdictFromReasons(reasonCodes: string[]): MindGoalVerdict {
  if (reasonCodes.some((reason) => reason.startsWith('fail:') || [
    'action_must_be_single',
    'rescue_must_be_one_step',
    'completed_room_cannot_be_active_reentry',
    'completed_context_requires_done_state',
    'fallback_reported_as_ai',
    'stale_context_anchor',
    'generic_multi_item_scaffold',
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
  const outputText = [actionTitle, ...steps, input.label, input.cta].map(normalizeText).join(' ');
  const sourceAnchors = collectAnchors(sourceText);
  const outputAnchors = collectAnchors(outputText);
  const anchorHits = unique(outputAnchors.filter((anchor) => sourceAnchors.includes(anchor)));
  const missingAnchors = sourceAnchors.filter((anchor) => !anchorHits.includes(anchor));
  const reasonCodes: string[] = [];
  const actionCount = input.actionCount ?? (actionTitle ? 1 : 0);

  if (input.stage === 'one_action') {
    if (actionCount !== 1) reasonCodes.push('action_must_be_single');
    if (!actionTitle) reasonCodes.push('missing_action_title');
    if (hasPattern(actionTitle, BROAD_ACTION_PATTERNS)) reasonCodes.push('broad_task_list_action');
    if (sourceAnchors.length > 0 && !textContainsAnyAnchor(actionTitle, sourceAnchors)) reasonCodes.push('missing_room_anchor');
  }

  if (input.stage === 'working_steps') {
    if (steps.length === 0) reasonCodes.push('missing_working_steps');
    if (isSingleIncidentPaymentRoom(sourceText) && steps.some((step) => hasPattern(step, GENERIC_MULTI_ITEM_PATTERNS))) {
      reasonCodes.push('generic_multi_item_scaffold');
    }
    if (hasStaleOutputAnchor(sourceText, outputText)) reasonCodes.push('stale_context_anchor');
    if (sourceAnchors.length > 0 && steps.some((step) => !textContainsAnyAnchor(step, sourceAnchors) && !textContainsAnyAnchor(step, [actionTitle]))) {
      reasonCodes.push('step_missing_room_or_action_anchor');
    }
  }

  if (input.stage === 'rescue') {
    if (steps.length !== 1) reasonCodes.push('rescue_must_be_one_step');
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
