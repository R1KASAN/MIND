import { ZodError, type ZodSchema } from 'zod';
import {
  type AiActionResponse,
  AiActionResponseSchema,
  type AiIntakeResponse,
  AiIntakeResponseSchema,
  type AiReentryResponse,
  AiReentryResponseSchema,
  type AiRescueResponse,
  AiRescueResponseSchema,
  type AiScaffoldResponse,
  AiScaffoldResponseSchema,
} from '@/lib/ai/operations';
import {
  buildActionFallbackCopy,
  buildIntakeFallbackCandidates,
  deriveTaskShapeFromText,
  humanizeUserFacingActionText,
  inferWorkflowTypeFromTaskShape,
  type TaskShape,
} from '@/lib/ai/task-shape';
import { inferIntakeClarificationNeed } from '@/lib/ai/intake-clarification-rules';
import type { RescueReason } from '@/lib/store/idb';

export type AiOperationValidationFailureKind =
  | 'json_extraction_failed'
  | 'schema_validation_failed'
  | 'semantic_validation_failed'
  | 'repair_failed';

export class AiOperationContractError extends Error {
  kind: AiOperationValidationFailureKind;

  constructor(kind: AiOperationValidationFailureKind, message: string) {
    super(message);
    this.name = 'AiOperationContractError';
    this.kind = kind;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function firstObjectFromArray(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const object = asObject(item);
    if (object) return object;
  }
  return undefined;
}

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function pickAlias(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
}

function coerceString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

const RESCUE_REASON_VALUES: RescueReason[] = [
  'missing_context',
  'dependency',
  'unclear_scope',
  'too_big',
  'low_energy',
  'unknown',
];

const RESCUE_MODE_VALUES = [
  'clarify',
  'follow_up',
  'shrink',
  'switch_track',
  'pause_cleanly',
] as const;

type RescueMode = (typeof RESCUE_MODE_VALUES)[number];

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRescueReason(value: unknown, fallbackReason?: RescueReason): RescueReason {
  const raw = coerceString(value);
  if (!raw) return fallbackReason ?? 'unknown';

  const normalized = normalizeToken(raw);
  if ((RESCUE_REASON_VALUES as string[]).includes(normalized)) {
    return normalized as RescueReason;
  }

  const aliasMap: Record<string, RescueReason> = {
    missing_info: 'missing_context',
    need_context: 'missing_context',
    context_missing: 'missing_context',
    missing_context_info: 'missing_context',
    blocked: 'dependency',
    waiting: 'dependency',
    external_dependency: 'dependency',
    dependency_blocked: 'dependency',
    scope_unclear: 'unclear_scope',
    not_clear: 'unclear_scope',
    ambiguous: 'unclear_scope',
    unclear: 'unclear_scope',
    too_large: 'too_big',
    too_much: 'too_big',
    overwhelming: 'too_big',
    very_large: 'too_big',
    tired: 'low_energy',
    burned_out: 'low_energy',
    fatigue: 'low_energy',
    low_motivation: 'low_energy',
    exhausted: 'low_energy',
  };

  return aliasMap[normalized] ?? fallbackReason ?? 'unknown';
}

function normalizeRescueMode(value: unknown, reason: RescueReason): RescueMode {
  const raw = coerceString(value);
  if (!raw) return inferRescueModeFromReason(reason);

  const normalized = normalizeToken(raw);
  if ((RESCUE_MODE_VALUES as readonly string[]).includes(normalized)) {
    return normalized as RescueMode;
  }

  const aliasMap: Record<string, RescueMode> = {
    followup: 'follow_up',
    follow_up_message: 'follow_up',
    switchtrack: 'switch_track',
    switch_tracks: 'switch_track',
    pause: 'pause_cleanly',
    pause_clean: 'pause_cleanly',
    clarify_scope: 'clarify',
    make_smaller: 'shrink',
  };

  return aliasMap[normalized] ?? inferRescueModeFromReason(reason);
}

function unwrapEnvelope(value: unknown) {
  const object = asObject(value) ?? firstObjectFromArray(value);
  if (!object) return value;

  const direct = pickAlias(object, ['data', 'result', 'output', 'response', 'payload']);
  const parsed = tryParseJsonString(direct);
  return asObject(parsed) ?? firstObjectFromArray(parsed) ?? object;
}

function extractBalancedJsonObject(input: string) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractJsonCandidate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  return extractBalancedJsonObject(trimmed);
}

function parseExtractedJson(candidate: string): unknown {
  const parsed = JSON.parse(candidate) as unknown;
  if (typeof parsed === 'string') {
    const nested = extractJsonCandidate(parsed);
    if (!nested) return parsed;
    return JSON.parse(nested);
  }
  return parsed;
}

function isPlaceholderText(value: string | undefined) {
  if (!value) return true;
  return (
    value === '...' ||
    value === '…' ||
    /^<[^>]+>$/.test(value) ||
    /^(\.{3,}|…+)$/.test(value) ||
    /^(tbd|todo|placeholder|null)$/i.test(value)
  );
}

function isMalformedStructuredText(value: string | undefined) {
  if (!value) return false;
  return (
    ['{', '}', '[', ']'].includes(value) ||
    ((value.startsWith('{') || value.startsWith('[')) && !/[ก-๙a-zA-Z0-9]/.test(value.slice(0, 8)))
  );
}

function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('; ');
}

function normalizeTaskShapeCandidate(value: unknown, sourceText: string, fallbackTaskShape?: TaskShape) {
  const object = asObject(tryParseJsonString(value));

  return deriveTaskShapeFromText(sourceText, {
    deliverableType: pickAlias(object ?? {}, ['deliverableType', 'deliverable_type']) ?? fallbackTaskShape?.deliverableType,
    immediateNeed: pickAlias(object ?? {}, ['immediateNeed', 'immediate_need']) ?? fallbackTaskShape?.immediateNeed,
    behaviorIntent: pickAlias(object ?? {}, ['behaviorIntent', 'behavior_intent']) ?? fallbackTaskShape?.behaviorIntent,
    missingInputs: pickAlias(object ?? {}, ['missingInputs', 'missing_inputs']) ?? fallbackTaskShape?.missingInputs,
    workContext: pickAlias(object ?? {}, ['workContext', 'work_context']) ?? fallbackTaskShape?.workContext,
    confidence: pickAlias(object ?? {}, ['confidence']) ?? fallbackTaskShape?.confidence,
  });
}

function normalizeIntakeCandidateWithFallback(value: unknown, options?: {
  fallbackSourceText?: string;
  fallbackTaskShape?: TaskShape;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
  fallbackRoomDigest?: string;
  fallbackObjective?: string;
  fallbackStage?: string;
}) {
  const object = asObject(unwrapEnvelope(value)) ?? firstObjectFromArray(unwrapEnvelope(value));
  if (!object) return value;

  const taskFrameObject = asObject(pickAlias(object, ['taskFrame', 'task_frame'])) ?? {};
  const sourceText = options?.fallbackSourceText ?? options?.fallbackRoomDigest ?? '';
  const taskShape = normalizeTaskShapeCandidate(
    pickAlias(object, ['taskShape', 'task_shape']),
    sourceText,
    options?.fallbackTaskShape,
  );
  const candidateActionsRaw = Array.isArray(pickAlias(object, ['candidateActions', 'candidate_actions']))
    ? pickAlias(object, ['candidateActions', 'candidate_actions']) as unknown[]
    : [];
  const metaObject = asObject(pickAlias(object, ['meta'])) ?? {};
  const fallbackWorkflowType = inferWorkflowTypeFromTaskShape(taskShape);
  const fallbackCandidates = buildIntakeFallbackCandidates(fallbackWorkflowType, taskShape);

  // --- Fallback tracking ---
  // Log whenever AI provided zero candidateActions so we can measure how
  // often Gemma truncates the JSON before writing that array.
  const usingFallbackCandidates = candidateActionsRaw.length === 0;
  if (usingFallbackCandidates) {
    console.warn(
      '[MIND][contract] intake candidateActions missing from AI output — using hardcoded fallback.',
      { behaviorIntent: taskShape.behaviorIntent, deliverableType: taskShape.deliverableType },
    );
  }

  // Salvage partial candidate entries: if AI gave some but with missing fields,
  // fill only the missing fields from fallback rather than replacing the whole entry.
  const candidateActionsSource = usingFallbackCandidates ? fallbackCandidates : candidateActionsRaw;
  const rawRequiresClarification = Boolean(pickAlias(object, ['requiresClarification', 'requires_clarification']) ?? false);
  const rawClarificationQuestion = coerceString(
    pickAlias(object, ['clarificationQuestion', 'clarification_question', 'clarification_nudge']),
  );
  const clarificationInference = inferIntakeClarificationNeed({
    sourceText,
    taskShape,
    aiRequiresClarification: rawRequiresClarification,
    aiClarificationQuestion: rawClarificationQuestion,
  });
  const clarificationQuestion =
    clarificationInference.clarificationQuestion ?? rawClarificationQuestion;

  return {
    workflowType: fallbackWorkflowType,
    roomDigest: pickAlias(object, ['roomDigest', 'room_digest', 'summary']) ?? options?.fallbackRoomDigest,
    taskFrame: {
      objective: pickAlias(taskFrameObject, ['objective', 'goal']) ?? options?.fallbackObjective,
      stage: pickAlias(taskFrameObject, ['stage', 'status']) ?? options?.fallbackStage,
      stakeholders: pickAlias(taskFrameObject, ['stakeholders', 'people']),
    },
    blockers: pickAlias(object, ['blockers', 'detected_blockers']),
    requiresClarification: clarificationInference.requiresClarification,
    clarificationQuestion,
    taskShape,
    candidateActions: candidateActionsSource.map((candidate, index) => {
      const actionObject = asObject(candidate) ?? {};
      const fallback = fallbackCandidates[index] ?? fallbackCandidates[0];
      // Keep AI-provided fields; fill gaps from typed fallback.
      const resolvedTitle = pickAlias(actionObject, ['title']) ?? fallback?.title;
      const resolvedRationale = pickAlias(actionObject, ['rationale', 'reason']) ?? fallback?.rationale;
      const resolvedKind = pickAlias(actionObject, ['kind', 'type']) ?? fallback?.kind;
      if (!usingFallbackCandidates && !(resolvedTitle && resolvedRationale)) {
        console.warn(
          '[MIND][contract] intake candidateAction entry missing title/rationale — filled from fallback.',
          { index, resolvedTitle, resolvedRationale },
        );
      }
      return { title: resolvedTitle, rationale: resolvedRationale, kind: resolvedKind };
    }),
    meta: {
      model: pickAlias(metaObject, ['model']) ?? '',
      passType: pickAlias(metaObject, ['passType', 'pass_type']),
      durationMs: pickAlias(metaObject, ['durationMs', 'duration_ms']),
      confidence: pickAlias(metaObject, ['confidence']),
      usedRoomFiles: pickAlias(metaObject, ['usedRoomFiles', 'used_room_files']),
      // repairUsed stays false here; runAiOperation overwrites it via finalize().
      repairUsed: pickAlias(metaObject, ['repairUsed', 'repair_used']) ?? false,
    },
  };
}

function buildFallbackActionContent(options?: {
  fallbackChosenTitle?: string;
  fallbackChosenRationale?: string;
  fallbackSuccessSignal?: string;
  fallbackWhyThisNow?: string;
  fallbackSituationSummary?: string;
  fallbackReplyDraft?: string;
  fallbackTaskShape?: TaskShape;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
}) {
  const fallbackCopy = options?.fallbackTaskShape && options?.fallbackWorkflowType
    ? buildActionFallbackCopy(options.fallbackWorkflowType, options.fallbackTaskShape)
    : undefined;
  return {
    chosenTitle: options?.fallbackChosenTitle ?? fallbackCopy?.chosenTitle ?? 'เริ่มจากก้าวที่แตะได้ทันที',
    chosenRationale: options?.fallbackChosenRationale ?? fallbackCopy?.chosenRationale ?? 'ช่วยให้เริ่มจากส่วนที่ชัดที่สุดโดยไม่ต้องคิดใหม่ทั้งก้อน',
    successSignal: options?.fallbackSuccessSignal ?? fallbackCopy?.successSignal ?? 'เห็นความคืบหน้าหนึ่งจุดที่ตรวจได้',
    whyThisNow: options?.fallbackWhyThisNow ?? fallbackCopy?.whyThisNow ?? 'ตอนนี้ควรเริ่มจากก้าวที่ลดแรงเสียดทานก่อน เพื่อให้บริบทกลับมาเร็วที่สุด',
    situationSummary: options?.fallbackSituationSummary ?? fallbackCopy?.situationSummary ?? 'ตอนนี้ยังมีข้อมูลพอให้เริ่มจากก้าวเล็กที่ชัดเจนก่อน',
    replyDraft: options?.fallbackReplyDraft ?? fallbackCopy?.replyDraft,
  };
}

function buildFallbackActionAlternatives(
  workflowType: 'client_response' | 'client_resume' = 'client_resume',
  taskShape?: TaskShape,
) {
  return buildActionFallbackCopy(workflowType, taskShape ?? deriveTaskShapeFromText('')).alternatives;
}

function sanitizePlainTextLine(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksReplyFirstTitle(value: string | undefined) {
  const text = coerceString(value)?.toLowerCase();
  if (!text) return false;
  return (
    text.includes('ตอบลูกค้า') ||
    text.includes('ตอบกลับ') ||
    text.includes('reply') ||
    text.includes('สรุปประเด็นหลักจากข้อความลูกค้าก่อน') ||
    text.includes('ร่างข้อความถามกลับ')
  );
}

function looksGenericAlternativeTitle(value: string | undefined) {
  const text = coerceString(value)?.toLowerCase();
  if (!text) return true;
  return (
    text === 'จัดการกับ blocker ที่มีอยู่' ||
    text === 'สรุปข้อมูลที่มีอยู่' ||
    text.includes('blocker') ||
    text.includes('ข้อมูลที่มีอยู่') ||
    text.includes('สิ่งที่มีอยู่') ||
    text.includes('เคลียร์ blocker')
  );
}

function looksTooGenericForDemoRequestTitle(value: string | undefined) {
  const text = coerceString(value)?.toLowerCase();
  if (!text) return true;
  if (text.includes('สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี')) return true;
  if (text.includes('สรุปประเด็นหลักจากข้อความลูกค้าก่อน')) return true;
  return !(
    text.includes('demo') ||
    text.includes('เดโม') ||
    text.includes('pilot') ||
    text.includes('นัด') ||
    text.includes('ตอบ')
  );
}

function isDemoRequestTaskShape(taskShape: TaskShape | undefined) {
  if (!taskShape) return false;
  const contextText = [
    taskShape.workContext,
    ...taskShape.missingInputs,
  ]
    .join(' ')
    .toLowerCase();

  return (
    contextText.includes('demo') ||
    contextText.includes('เดโม') ||
    contextText.includes('pilot') ||
    contextText.includes('นัด')
  );
}

function isPersonalFrictionTaskShape(taskShape: TaskShape | undefined) {
  if (!taskShape) return false;
  return taskShape.behaviorIntent === 'personal_friction' ||
    (taskShape.deliverableType === 'unknown' && taskShape.workContext.includes('แรงเสียดทานส่วนตัว'));
}

function looksLikeDelegationAction(value: string | undefined) {
  const text = coerceString(value)?.toLowerCase();
  if (!text) return false;
  return (
    text.includes('delegate') ||
    text.includes('assign') ||
    text.includes('handoff') ||
    text.includes('team') ||
    text.includes('แบ่งงาน') ||
    text.includes('มอบหมาย') ||
    text.includes('ส่งต่อให้ทีม') ||
    text.includes('ทีมเดินต่อ') ||
    text.includes('ปลดล็อกงานที่ค้าง')
  );
}

function looksLikeSerializedJsonBlob(value: string | undefined) {
  const text = coerceString(value);
  if (!text) return false;
  const compact = text.replace(/\s+/g, ' ').trim();

  if (
    compact.startsWith('{"') ||
    compact.startsWith('{ "') ||
    compact.startsWith('[{"') ||
    compact.startsWith('[ {"')
  ) {
    return true;
  }

  return (
    compact.startsWith('{') &&
    /"(chosenAction|alternatives|whyThisNow|replyDraft|situationSummary|meta)"\s*:/.test(compact)
  );
}

function buildPlainTextActionCandidate(raw: string, options?: {
  fallbackChosenTitle?: string;
  fallbackChosenRationale?: string;
  fallbackSuccessSignal?: string;
  fallbackWhyThisNow?: string;
  fallbackSituationSummary?: string;
  fallbackReplyDraft?: string;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
  fallbackTaskShape?: TaskShape;
}) {
  const fallbackAction = buildFallbackActionContent(options);
  const fallbackAlternatives = buildFallbackActionAlternatives(options?.fallbackWorkflowType, options?.fallbackTaskShape);
  const cleaned = raw
    .replace(/```(?:json)?/gi, ' ')
    .replace(/```/g, ' ')
    .trim();
  const lines = cleaned
    .split('\n')
    .map((line) => sanitizePlainTextLine(line))
    .filter(Boolean);
  const merged = sanitizePlainTextLine(cleaned);
  const firstMeaningfulLine = lines[0];
  const safeFirstLine =
    looksLikeSerializedJsonBlob(firstMeaningfulLine) || isMalformedStructuredText(firstMeaningfulLine)
      ? undefined
      : firstMeaningfulLine;
  const safeMerged =
    looksLikeSerializedJsonBlob(merged) || isMalformedStructuredText(merged)
      ? undefined
      : merged;
  const summaryText = safeMerged || safeFirstLine;

  return {
    chosenAction: {
      title: fallbackAction.chosenTitle,
      rationale: fallbackAction.chosenRationale,
      successSignal: fallbackAction.successSignal,
    },
    alternatives: fallbackAlternatives,
    whyThisNow: safeFirstLine || fallbackAction.whyThisNow,
    replyDraft: fallbackAction.replyDraft,
    situationSummary: summaryText || fallbackAction.situationSummary,
    meta: {
      model: '',
      passType: undefined,
      durationMs: undefined,
      confidence: undefined,
      usedRoomFiles: [],
      repairUsed: false,
    },
  };
}

const GENERIC_STEP_PATTERN = /(เปิดบริบท|ทำก้าวหลักนี้ทันที|จัดการงานนี้|ขยับงานต่อ|งานนี้)/;
const FILE_REF_PATTERN = /(ไฟล์|เอกสาร)/;

/**
 * Validate AI-returned starterMicroSteps.
 * Returns a [string, string, string] tuple if valid, or undefined to signal fallback.
 */
export function validateStarterMicroSteps(
  raw: unknown,
  hasFileEvidence: boolean,
): [string, string, string] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length !== 3) return undefined;

  const steps: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return undefined;
    const trimmed = item.trim();
    if (trimmed.length === 0) return undefined;
    if (GENERIC_STEP_PATTERN.test(trimmed)) {
      console.info('[MIND][starter_microsteps_rejected_generic]', {
        reason: 'starter_microsteps_rejected_generic',
        step: trimmed,
      });
      return undefined;
    }
    if (!hasFileEvidence && FILE_REF_PATTERN.test(trimmed)) {
      console.info('[MIND][starter_microsteps_rejected_generic]', {
        reason: 'file_reference_without_evidence',
        step: trimmed,
      });
      return undefined;
    }
    steps.push(trimmed);
  }

  return steps as unknown as [string, string, string];
}

function normalizeActionCandidate(value: unknown, options?: {
  fallbackChosenTitle?: string;
  fallbackChosenRationale?: string;
  fallbackSuccessSignal?: string;
  fallbackWhyThisNow?: string;
  fallbackSituationSummary?: string;
  fallbackReplyDraft?: string;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
  fallbackTaskShape?: TaskShape;
  hasFileEvidence?: boolean;
}) {
  const object = asObject(unwrapEnvelope(value)) ?? firstObjectFromArray(unwrapEnvelope(value));
  if (!object) return value;
  const chosenObject = asObject(pickAlias(object, ['chosenAction', 'chosen_action'])) ?? {};
  const metaObject = asObject(pickAlias(object, ['meta'])) ?? {};
  const alternativesRaw = Array.isArray(pickAlias(object, ['alternatives', 'alternative_actions']))
    ? pickAlias(object, ['alternatives', 'alternative_actions']) as unknown[]
    : [];
  const fallbackAction = buildFallbackActionContent(options);
  const fallbackAlternatives = buildFallbackActionAlternatives(options?.fallbackWorkflowType, options?.fallbackTaskShape);
  const taskShapeFallback =
    options?.fallbackWorkflowType && options?.fallbackTaskShape
      ? buildActionFallbackCopy(options.fallbackWorkflowType, options.fallbackTaskShape)
      : undefined;
  const shouldKeepReplyDraft = options?.fallbackWorkflowType === 'client_response';
  const fallbackWhyThisNow = taskShapeFallback?.whyThisNow ?? fallbackAction.whyThisNow;
  const rawWhyThisNow = coerceString(pickAlias(object, ['whyThisNow', 'why_this_now', 'rationale']));
  const rawChosenTitle =
    coerceString(pickAlias(chosenObject, ['title', 'action_title'])) ??
    fallbackAction.chosenTitle;
  const shouldUseDemoRequestFallback =
    options?.fallbackWorkflowType === 'client_response' &&
    options.fallbackTaskShape?.immediateNeed === 'send_reply_now' &&
    isDemoRequestTaskShape(options.fallbackTaskShape) &&
    looksTooGenericForDemoRequestTitle(rawChosenTitle) &&
    Boolean(taskShapeFallback);
  const rawChosenRationale = coerceString(pickAlias(chosenObject, ['rationale', 'reason']));
  const rawSuccessSignal = coerceString(pickAlias(chosenObject, ['successSignal', 'success_signal']));
  const rawSituationSummary = coerceString(pickAlias(object, ['situationSummary', 'situation_summary']));
  const shouldUsePersonalFrictionFallback =
    options?.fallbackWorkflowType === 'client_resume' &&
    isPersonalFrictionTaskShape(options.fallbackTaskShape) &&
    Boolean(taskShapeFallback) &&
    [
      rawChosenTitle,
      rawChosenRationale,
      rawSuccessSignal,
      rawWhyThisNow,
      rawSituationSummary,
    ].some(looksLikeDelegationAction);
  const shouldUseTaskShapeFallback = shouldUseDemoRequestFallback || shouldUsePersonalFrictionFallback;

  // Log whenever task-shape fallback overrides the AI's own chosenAction so we
  // can monitor false-positive delegation rewrites.
  if (shouldUseTaskShapeFallback) {
    console.warn(
      '[MIND][contract] action chosenAction overridden by task-shape fallback.',
      {
        reason: shouldUseDemoRequestFallback ? 'demo_request' : 'personal_friction',
        aiTitle: rawChosenTitle,
        fallbackTitle: taskShapeFallback?.chosenTitle,
      },
    );
  }

  const normalizedAlternatives = (alternativesRaw.length > 0 ? alternativesRaw : fallbackAlternatives).map((candidate, index) => {
    const actionObject = asObject(candidate) ?? {};
    const mappedTitle =
      coerceString(pickAlias(actionObject, ['title'])) ??
      fallbackAlternatives[index]?.title ??
      fallbackAlternatives[0]?.title ??
      '';
    const mappedRationale =
      coerceString(pickAlias(actionObject, ['rationale', 'reason'])) ??
      fallbackAlternatives[index]?.rationale ??
      fallbackAlternatives[0]?.rationale ??
      '';
    const mapped = {
      title: mappedTitle,
      rationale: mappedRationale,
    };

    if (
      options?.fallbackTaskShape?.deliverableType === 'proposal' &&
      looksGenericAlternativeTitle(mappedTitle)
    ) {
      return fallbackAlternatives[index] ?? fallbackAlternatives[0];
    }

    return mapped;
  });

  // --- starterMicroSteps extraction and validation ---
  const rawSteps = pickAlias(object, ['starterMicroSteps', 'starter_micro_steps', 'starterSteps']);
  const validatedSteps = validateStarterMicroSteps(rawSteps, options?.hasFileEvidence ?? false);

  return {
    chosenAction: {
      title: shouldUseTaskShapeFallback
        ? taskShapeFallback?.chosenTitle ?? fallbackAction.chosenTitle
        : rawChosenTitle,
      rationale: shouldUseTaskShapeFallback
        ? taskShapeFallback?.chosenRationale ?? fallbackAction.chosenRationale
        : rawChosenRationale ?? fallbackAction.chosenRationale,
      successSignal: shouldUseTaskShapeFallback
        ? taskShapeFallback?.successSignal ?? fallbackAction.successSignal
        : rawSuccessSignal ?? fallbackAction.successSignal,
    },
    alternatives: shouldUseTaskShapeFallback
      ? taskShapeFallback?.alternatives ?? normalizedAlternatives
      : normalizedAlternatives,
    whyThisNow: shouldUseTaskShapeFallback
      ? fallbackWhyThisNow
      : isMalformedStructuredText(rawWhyThisNow)
        ? fallbackWhyThisNow
        : rawWhyThisNow ?? fallbackWhyThisNow,
    replyDraft: shouldKeepReplyDraft
      ? pickAlias(object, ['replyDraft', 'reply_draft']) ?? taskShapeFallback?.replyDraft ?? fallbackAction.replyDraft
      : undefined,
    situationSummary: shouldUseTaskShapeFallback
      ? taskShapeFallback?.situationSummary ?? fallbackAction.situationSummary
      : rawSituationSummary ?? fallbackAction.situationSummary,
    starterMicroSteps: validatedSteps,
    meta: {
      model: pickAlias(metaObject, ['model']) ?? '',
      passType: pickAlias(metaObject, ['passType', 'pass_type']),
      durationMs: pickAlias(metaObject, ['durationMs', 'duration_ms']),
      confidence: pickAlias(metaObject, ['confidence']),
      usedRoomFiles: pickAlias(metaObject, ['usedRoomFiles', 'used_room_files']),
      repairUsed: pickAlias(metaObject, ['repairUsed', 'repair_used']) ?? false,
    },
  };
}

function validateActionContextAlignment(
  data: AiActionResponse,
  options?: {
    fallbackWorkflowType?: 'client_response' | 'client_resume';
    fallbackTaskShape?: TaskShape;
  },
) {
  if (
    options?.fallbackWorkflowType === 'client_resume' &&
    options.fallbackTaskShape?.deliverableType === 'proposal' &&
    looksReplyFirstTitle(data.chosenAction.title)
  ) {
    throw new AiOperationContractError(
      'semantic_validation_failed',
      'chosenAction must start proposal work, not reply-first',
    );
  }

  if (options?.fallbackWorkflowType === 'client_resume' && data.replyDraft) {
    throw new AiOperationContractError(
      'semantic_validation_failed',
      'replyDraft is only allowed for true send_reply_now tasks',
    );
  }

  if (
    options?.fallbackWorkflowType === 'client_response' &&
    options.fallbackTaskShape?.immediateNeed === 'send_reply_now' &&
    isDemoRequestTaskShape(options.fallbackTaskShape) &&
    looksTooGenericForDemoRequestTitle(data.chosenAction.title)
  ) {
    throw new AiOperationContractError(
      'semantic_validation_failed',
      'chosenAction must acknowledge the demo/pilot reply context',
    );
  }
}

function humanizeActionResponseCopy(data: AiActionResponse, taskShape?: TaskShape): AiActionResponse {
  return {
    ...data,
    chosenAction: {
      ...data.chosenAction,
      title: humanizeUserFacingActionText(data.chosenAction.title, taskShape),
      rationale: humanizeUserFacingActionText(data.chosenAction.rationale, taskShape),
      successSignal: humanizeUserFacingActionText(data.chosenAction.successSignal, taskShape),
    },
    alternatives: data.alternatives.map((alternative) => ({
      title: humanizeUserFacingActionText(alternative.title, taskShape),
      rationale: humanizeUserFacingActionText(alternative.rationale, taskShape),
    })),
    whyThisNow: humanizeUserFacingActionText(data.whyThisNow, taskShape),
    situationSummary: humanizeUserFacingActionText(data.situationSummary, taskShape),
  };
}

function arrayify(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function buildFallbackScaffoldTexts(options?: {
  fallbackCurrentStep?: string;
  fallbackSteps?: string[];
}) {
  const normalizedCurrentStep = coerceString(options?.fallbackCurrentStep);
  const normalizedFallbackSteps = (options?.fallbackSteps ?? [])
    .map((step) => coerceString(step))
    .filter((step): step is string => Boolean(step));

  const primarySeed =
    normalizedCurrentStep ||
    normalizedFallbackSteps[0] ||
    'เริ่มจากส่วนเล็กที่สุดที่ยังชัดก่อน';

  const secondarySeed =
    normalizedFallbackSteps.find((step) => step !== primarySeed) ||
    `เก็บผลลัพธ์สั้น ๆ จาก "${primarySeed}" ไว้ก่อน`;

  const tertiarySeed =
    normalizedFallbackSteps.find((step) => step !== primarySeed && step !== secondarySeed) ||
    'เช็กว่าตอนนี้งานขยับไปหนึ่งจุดแล้ว';

  return [
    primarySeed,
    secondarySeed,
    tertiarySeed,
  ];
}

function inferRescueModeFromReason(reason: RescueReason) {
  switch (reason) {
    case 'missing_context':
    case 'unclear_scope':
      return 'clarify' as const;
    case 'dependency':
      return 'follow_up' as const;
    case 'low_energy':
      return 'pause_cleanly' as const;
    case 'too_big':
      return 'shrink' as const;
    case 'unknown':
    default:
      return 'shrink' as const;
  }
}

function buildFallbackRescueExplanation(reason: RescueReason, actionTitle?: string, currentStep?: string) {
  const focus = coerceString(currentStep) || coerceString(actionTitle) || 'ก้าวนี้';
  switch (reason) {
    case 'missing_context':
      return `ตอนนี้ยังขาดข้อมูลสำคัญสำหรับไปต่อใน "${focus}" เลยควรเก็บ context ที่หายให้ครบก่อน`;
    case 'dependency':
      return `ก้าวนี้ติดที่ต้องรอคนอื่นหรือข้อมูลภายนอกก่อน "${focus}" จะเดินต่อได้`;
    case 'unclear_scope':
      return `ตอนนี้ขอบเขตของ "${focus}" ยังไม่ชัดพอ เลยทำให้เริ่มแล้วหลุดง่าย`;
    case 'too_big':
      return `ก้าวปัจจุบันของ "${focus}" ยังใหญ่เกินไปสำหรับเริ่มทันที ควรตัดให้เล็กลงก่อน`;
    case 'low_energy':
      return `ก้าวนี้ไม่ได้ติดที่ความเข้าใจอย่างเดียว แต่สภาพตอนนี้ยังไม่พร้อมสำหรับเริ่มก้าวใหญ่`;
    case 'unknown':
    default:
      return `ตอนนี้รู้แค่ว่า "${focus}" ยังขยับไม่ออก จึงควรเลือก rescue path ที่ลดแรงเสียดทานก่อน`;
  }
}

function buildFallbackRescueSteps(mode: 'clarify' | 'follow_up' | 'shrink' | 'switch_track' | 'pause_cleanly', actionTitle?: string, currentStep?: string) {
  const focus = coerceString(currentStep) || coerceString(actionTitle) || 'ก้าวนี้';
  switch (mode) {
    case 'clarify':
      return [
        `จดคำถามเดียวที่ต้องรู้ก่อน "${focus}" จะไปต่อได้`,
        'ส่งหรือบันทึก clarification นั้นทันที แล้วค่อยกลับมาทำต่อ',
      ];
    case 'follow_up':
      return [
        `ระบุว่าใครหรือข้อมูลอะไรเป็น dependency ของ "${focus}"`,
        'ส่งข้อความ follow-up สั้น ๆ เพื่อปลดล็อก dependency นั้นตอนนี้เลย',
      ];
    case 'switch_track':
      return [
        `เปลี่ยนไปทำส่วนที่ใกล้ที่สุดของ "${focus}" ที่ไม่ติด dependency ก่อน`,
        'เก็บความคืบหน้าสั้น ๆ ไว้เพื่อกลับมาต่อทางหลักได้ง่าย',
      ];
    case 'pause_cleanly':
      return [
        `หยุด "${focus}" ไว้แบบไม่เสียบริบท โดยจดว่าติดตรงไหน`,
        'ตั้งจุดเริ่มกลับมารอบหน้าให้ชัดเป็นก้าวเดียวที่แตะได้ทันที',
      ];
    case 'shrink':
    default:
      return [
        `ตัด "${focus}" ให้เหลือก้าวเล็กที่สุดที่เริ่มได้ภายในไม่กี่นาที`,
        'ทำแค่ก้าวเล็กนั้นก่อน แล้วเช็กว่างานขยับจริงหรือยัง',
      ];
  }
}

function normalizeScaffoldCandidate(value: unknown, options?: {
  fallbackPlanTitle?: string;
  fallbackCurrentStep?: string;
  fallbackSteps?: string[];
  fallbackCurrentStepIndex?: number;
}) {
  const object = asObject(unwrapEnvelope(value)) ?? firstObjectFromArray(unwrapEnvelope(value));
  if (!object) return value;
  const stepsRaw = arrayify(pickAlias(object, ['steps', 'micro_steps', 'step', 'currentStep', 'current_step', 'nextStep']));
  const metaObject = asObject(pickAlias(object, ['meta'])) ?? {};
  const fallbackTexts = buildFallbackScaffoldTexts(options);
  const normalizedSteps = stepsRaw.map((step, index) => {
    const stepObject = asObject(step);
    if (stepObject) {
      return {
        id: pickAlias(stepObject, ['id']) ?? `step-${index + 1}`,
        text: pickAlias(stepObject, ['text', 'title', 'step']) ?? fallbackTexts[index] ?? fallbackTexts[fallbackTexts.length - 1],
        expectedOutcome: pickAlias(stepObject, ['expectedOutcome', 'expected_outcome']),
        canAutoDraft: pickAlias(stepObject, ['canAutoDraft', 'can_auto_draft']),
      };
    }

    return {
      id: `step-${index + 1}`,
      text: step,
      expectedOutcome: undefined,
      canAutoDraft: false,
    };
  });

  while (normalizedSteps.length < 3) {
    const fallbackText = fallbackTexts[normalizedSteps.length] ?? fallbackTexts[fallbackTexts.length - 1];
    normalizedSteps.push({
      id: `step-${normalizedSteps.length + 1}`,
      text: fallbackText,
      expectedOutcome: undefined,
      canAutoDraft: false,
    });
  }

  return {
    planTitle: pickAlias(object, ['planTitle', 'plan_title', 'title']) ?? options?.fallbackPlanTitle ?? fallbackTexts[0],
    steps: normalizedSteps,
    shortcutOptions: pickAlias(object, ['shortcutOptions', 'shortcut_options']),
    revisedCurrentStepIndex:
      pickAlias(object, ['revisedCurrentStepIndex', 'revised_current_step_index', 'currentStepIndex']) ??
      options?.fallbackCurrentStepIndex ??
      0,
    meta: {
      model: pickAlias(metaObject, ['model']) ?? '',
      passType: pickAlias(metaObject, ['passType', 'pass_type']),
      durationMs: pickAlias(metaObject, ['durationMs', 'duration_ms']),
      confidence: pickAlias(metaObject, ['confidence']),
      usedRoomFiles: pickAlias(metaObject, ['usedRoomFiles', 'used_room_files']),
      repairUsed: pickAlias(metaObject, ['repairUsed', 'repair_used']) ?? false,
    },
  };
}

function normalizeRescueCandidate(value: unknown, options?: {
  fallbackReason?: RescueReason;
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
}) {
  const object = asObject(unwrapEnvelope(value)) ?? firstObjectFromArray(unwrapEnvelope(value));
  if (!object) return value;
  const diagnosisObject = asObject(pickAlias(object, ['diagnosis'])) ?? {};
  const rescuePlanObject = asObject(pickAlias(object, ['rescuePlan', 'rescue_plan'])) ?? {};
  const metaObject = asObject(pickAlias(object, ['meta'])) ?? {};
  const primaryReason = normalizeRescueReason(
    pickAlias(diagnosisObject, ['primaryReason', 'primary_reason', 'reason']),
    options?.fallbackReason,
  );
  const rescueMode = normalizeRescueMode(
    pickAlias(rescuePlanObject, ['mode']),
    primaryReason,
  );
  const rescueSteps = arrayify(pickAlias(rescuePlanObject, ['steps', 'plan', 'actions']))
    .map((step) => {
      const stepObject = asObject(step);
      if (stepObject) {
        return pickAlias(stepObject, ['text', 'title', 'step']);
      }
      return step;
    });
  const fallbackSteps = buildFallbackRescueSteps(
    rescueMode,
    options?.fallbackActionTitle,
    options?.fallbackCurrentStep,
  );
  const normalizedSteps = rescueSteps.map((step, index) => step ?? fallbackSteps[index] ?? fallbackSteps[fallbackSteps.length - 1]);
  while (normalizedSteps.length < 2) {
    normalizedSteps.push(fallbackSteps[normalizedSteps.length] ?? fallbackSteps[fallbackSteps.length - 1]);
  }

  return {
    diagnosis: {
      primaryReason,
      explanation:
        pickAlias(diagnosisObject, ['explanation', 'detail']) ??
        buildFallbackRescueExplanation(primaryReason, options?.fallbackActionTitle, options?.fallbackCurrentStep),
    },
    rescuePlan: {
      mode: rescueMode,
      steps: normalizedSteps,
    },
    suggestedMessage: pickAlias(object, ['suggestedMessage', 'suggested_message']),
    meta: {
      model: pickAlias(metaObject, ['model']) ?? '',
      passType: pickAlias(metaObject, ['passType', 'pass_type']),
      durationMs: pickAlias(metaObject, ['durationMs', 'duration_ms']),
      confidence: pickAlias(metaObject, ['confidence']),
      usedRoomFiles: pickAlias(metaObject, ['usedRoomFiles', 'used_room_files']),
      repairUsed: pickAlias(metaObject, ['repairUsed', 'repair_used']) ?? false,
    },
  };
}

function buildFallbackReentrySummary(options?: {
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
}) {
  if (options?.fallbackCurrentStep) {
    return `กลับมาครั้งนี้เริ่มจาก "${options.fallbackCurrentStep}" ก่อน จะพางานนี้กลับเข้าสู่จังหวะเดิมได้เร็วสุด`;
  }
  if (options?.fallbackActionTitle) {
    return `กลับมาครั้งนี้เริ่มจาก "${options.fallbackActionTitle}" ก่อน เพื่อพางานนี้กลับเข้าสู่จังหวะทำงานได้เร็วสุด`;
  }
  return 'กลับมาครั้งนี้เริ่มจากก้าวที่ใกล้ที่สุดก่อน เพื่อให้งานนี้ขยับต่อได้โดยไม่ต้องเริ่มคิดใหม่ทั้งหมด';
}

function buildFallbackReentryAction(options?: {
  fallbackRoomId?: string;
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
  fallbackResumeTarget?: 'ONE_ACTION' | 'SCAFFOLD' | 'DUMP_ENTRY';
}) {
  const title = options?.fallbackCurrentStep
    ? `กลับไปทำต่อ: ${options.fallbackCurrentStep}`
    : options?.fallbackActionTitle
      ? options.fallbackActionTitle
      : 'กลับไปเริ่มจากก้าวแรกของงานนี้';

  return {
    roomId: options?.fallbackRoomId ?? 'current-room',
    title,
    rationale: options?.fallbackCurrentStep
      ? 'บริบทของงานยังต่อเนื่องอยู่และเป็นก้าวที่กลับไปทำได้ทันที'
      : 'เป็นก้าวที่ใช้บริบทเดิมได้ทันทีโดยไม่ต้องเริ่มใหม่ทั้งหมด',
    impact: 'high' as const,
    effort: 'low' as const,
    resumeTarget: options?.fallbackResumeTarget ?? 'ONE_ACTION',
  };
}

function normalizeReentryCandidate(value: unknown, options?: {
  fallbackRoomId?: string;
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
  fallbackResumeTarget?: 'ONE_ACTION' | 'SCAFFOLD' | 'DUMP_ENTRY';
}) {
  const object = asObject(unwrapEnvelope(value)) ?? firstObjectFromArray(unwrapEnvelope(value));
  if (!object) return value;
  const topActionsRaw = Array.isArray(pickAlias(object, ['topActions', 'top_actions']))
    ? pickAlias(object, ['topActions', 'top_actions']) as unknown[]
    : [{}];
  const metaObject = asObject(pickAlias(object, ['meta'])) ?? {};

  return {
    reentrySummary:
      pickAlias(object, ['reentrySummary', 'reentry_summary', 'summary']) ??
      buildFallbackReentrySummary(options),
    topActions: topActionsRaw.map((candidate) => {
      const actionObject = asObject(candidate) ?? {};
      const fallbackAction = buildFallbackReentryAction(options);
      return {
        roomId: pickAlias(actionObject, ['roomId', 'room_id']) ?? fallbackAction.roomId,
        title: pickAlias(actionObject, ['title']) ?? fallbackAction.title,
        rationale: pickAlias(actionObject, ['rationale', 'reason']) ?? fallbackAction.rationale,
        impact: pickAlias(actionObject, ['impact']) ?? fallbackAction.impact,
        effort: pickAlias(actionObject, ['effort']) ?? fallbackAction.effort,
        resumeTarget: pickAlias(actionObject, ['resumeTarget', 'resume_target', 'target']) ?? fallbackAction.resumeTarget,
      };
    }),
    ignoredNoise: pickAlias(object, ['ignoredNoise', 'ignored_noise']) ?? [],
    meta: {
      model: pickAlias(metaObject, ['model']) ?? '',
      passType: pickAlias(metaObject, ['passType', 'pass_type']),
      durationMs: pickAlias(metaObject, ['durationMs', 'duration_ms']),
      confidence: pickAlias(metaObject, ['confidence']),
      usedRoomFiles: pickAlias(metaObject, ['usedRoomFiles', 'used_room_files']),
      repairUsed: pickAlias(metaObject, ['repairUsed', 'repair_used']) ?? false,
    },
  };
}

function validateSemanticText(label: string, value: string | undefined) {
  const normalized = coerceString(value);
  if (normalized && isMalformedStructuredText(normalized)) {
    throw new AiOperationContractError('semantic_validation_failed', `${label} must not be malformed structured text`);
  }

  if (isPlaceholderText(normalized)) {
    throw new AiOperationContractError('semantic_validation_failed', `${label} must be real text`);
  }
}

function validateOperation<T>(schema: ZodSchema<T>, normalized: unknown) {
  const validation = schema.safeParse(normalized);
  if (!validation.success) {
    throw new AiOperationContractError('schema_validation_failed', formatZodError(validation.error));
  }
  return validation.data;
}

export function parseAiIntakeResponse(raw: string, options?: {
  fallbackSourceText?: string;
  fallbackTaskShape?: TaskShape;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
  fallbackRoomDigest?: string;
  fallbackObjective?: string;
  fallbackStage?: string;
}): AiIntakeResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeIntakeCandidateWithFallback(parsed, options);
  const data = validateOperation(AiIntakeResponseSchema, normalized);
  validateSemanticText('roomDigest', data.roomDigest);
  validateSemanticText('taskFrame.objective', data.taskFrame.objective);
  validateSemanticText('taskFrame.stage', data.taskFrame.stage);
  validateSemanticText('taskShape.workContext', data.taskShape.workContext);
  for (const candidate of data.candidateActions) {
    validateSemanticText('candidateActions.title', candidate.title);
    validateSemanticText('candidateActions.rationale', candidate.rationale);
  }
  return data;
}

export function parseAiActionResponse(raw: string, options?: {
  fallbackChosenTitle?: string;
  fallbackChosenRationale?: string;
  fallbackSuccessSignal?: string;
  fallbackWhyThisNow?: string;
  fallbackSituationSummary?: string;
  fallbackReplyDraft?: string;
  fallbackWorkflowType?: 'client_response' | 'client_resume';
  fallbackTaskShape?: TaskShape;
  hasFileEvidence?: boolean;
}): AiActionResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) {
    const normalized = buildPlainTextActionCandidate(raw, options);
    const data = humanizeActionResponseCopy(
      validateOperation(AiActionResponseSchema, normalized),
      options?.fallbackTaskShape,
    );
    validateSemanticText('chosenAction.title', data.chosenAction.title);
    validateSemanticText('chosenAction.rationale', data.chosenAction.rationale);
    validateSemanticText('chosenAction.successSignal', data.chosenAction.successSignal);
    validateSemanticText('whyThisNow', data.whyThisNow);
    validateSemanticText('situationSummary', data.situationSummary);
    validateActionContextAlignment(data, options);
    return data;
  }

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeActionCandidate(parsed, options);
  const data = humanizeActionResponseCopy(
    validateOperation(AiActionResponseSchema, normalized),
    options?.fallbackTaskShape,
  );
  validateSemanticText('chosenAction.title', data.chosenAction.title);
  validateSemanticText('chosenAction.rationale', data.chosenAction.rationale);
  validateSemanticText('chosenAction.successSignal', data.chosenAction.successSignal);
  validateSemanticText('whyThisNow', data.whyThisNow);
  validateSemanticText('situationSummary', data.situationSummary);
  validateActionContextAlignment(data, options);
  return data;
}

export function parseAiScaffoldResponse(raw: string, options?: {
  fallbackPlanTitle?: string;
  fallbackCurrentStep?: string;
  fallbackSteps?: string[];
  fallbackCurrentStepIndex?: number;
}): AiScaffoldResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeScaffoldCandidate(parsed, options);
  const data = validateOperation(AiScaffoldResponseSchema, normalized);
  validateSemanticText('planTitle', data.planTitle);
  for (const step of data.steps) {
    validateSemanticText('steps.text', step.text);
  }
  return data;
}

export function parseAiRescueResponse(raw: string, options?: {
  fallbackReason?: RescueReason;
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
}): AiRescueResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeRescueCandidate(parsed, options);
  const data = validateOperation(AiRescueResponseSchema, normalized);
  validateSemanticText('diagnosis.explanation', data.diagnosis.explanation);
  for (const step of data.rescuePlan.steps) {
    validateSemanticText('rescuePlan.steps', step);
  }
  return data;
}

export function parseAiReentryResponse(raw: string, options?: {
  fallbackRoomId?: string;
  fallbackActionTitle?: string;
  fallbackCurrentStep?: string;
  fallbackResumeTarget?: 'ONE_ACTION' | 'SCAFFOLD' | 'DUMP_ENTRY';
}): AiReentryResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiOperationContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeReentryCandidate(parsed, options);
  const data = validateOperation(AiReentryResponseSchema, normalized);
  validateSemanticText('reentrySummary', data.reentrySummary);
  for (const action of data.topActions) {
    validateSemanticText('topActions.title', action.title);
    validateSemanticText('topActions.rationale', action.rationale);
  }
  return data;
}
