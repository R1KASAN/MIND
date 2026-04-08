import { ZodError } from 'zod';
import { AiSynthesisResponseSchema } from '@/lib/ai/schema';
import type { AiSynthesisResponse } from '@/lib/ai/schema';

export type AiValidationFailureKind =
  | 'json_extraction_failed'
  | 'schema_validation_failed'
  | 'semantic_validation_failed'
  | 'repair_failed';

export class AiContractError extends Error {
  kind: AiValidationFailureKind;

  constructor(kind: AiValidationFailureKind, message: string) {
    super(message);
    this.name = 'AiContractError';
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
    const obj = asObject(item);
    if (obj) return obj;
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

function coerceBooleanLike(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

function coerceStringLike(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  const object = asObject(value);
  if (!object) return undefined;

  const nested = pickAlias(object, ['text', 'draft', 'message', 'content', 'step', 'title']);
  if (typeof nested !== 'string') return undefined;

  const trimmed = nested.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return coerceStringLike(value);
}

function normalizeAlternativeActions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const object = asObject(item);
      if (!object) return null;

      const title = coerceStringLike(pickAlias(object, ['title']));
      const rationale = coerceStringLike(pickAlias(object, ['rationale', 'reason']));

      if (!title || !rationale) return null;
      return { title, rationale };
    })
    .filter((item): item is { title: string; rationale: string } => Boolean(item))
    .slice(0, 2);
}

function normalizeDetectedBlockers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceStringLike(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeStepText(value: unknown) {
  const text = coerceStringLike(value);
  if (!text) return undefined;

  return text
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
}

function buildFallbackSituationSummary(context: {
  workflowType: 'client_response' | 'client_resume';
  requiresClarification: boolean;
}) {
  if (context.workflowType === 'client_response') {
    return context.requiresClarification
      ? 'มีข้อความจากลูกค้าที่ต้องตอบกลับ แต่ยังมีจุดที่ต้องเช็กให้ชัดก่อนเริ่มงาน'
      : 'ลูกค้าส่งข้อความหรือ feedback มาแล้ว และผู้ใช้ต้องตอบกลับให้ชัดก่อนเริ่มงานต่อ';
  }

  return 'โปรเจกต์ค้างและต้องคืนบริบทก่อนเลือกก้าวแรกที่เริ่มได้ทันที';
}

function buildFallbackReplyDraft(context: {
  workflowType: 'client_response' | 'client_resume';
  requiresClarification: boolean;
  situationSummary?: string;
}) {
  if (context.workflowType !== 'client_response') return undefined;

  if (context.requiresClarification) {
    return 'ขอบคุณครับ ผมขอเช็กอีก 1 จุดที่ยังไม่ชัดก่อนเริ่มแก้เพื่อให้รอบนี้ตรงที่สุดครับ';
  }

  const summary = context.situationSummary || 'ข้อมูลตอนนี้';
  return `ขอบคุณครับ ผมสรุปจาก${summary} และเดี๋ยวจะตอบกลับให้ชัดก่อนเริ่มลงมือแก้ต่อครับ`;
}

function buildFallbackRecommendedAction(context: {
  workflowType: 'client_response' | 'client_resume';
  requiresClarification: boolean;
  situationSummary?: string;
}) {
  if (context.workflowType === 'client_response') {
    return {
      title: context.requiresClarification
        ? 'ร่างข้อความตอบกลับลูกค้าและถาม 1 จุดที่ยังไม่ชัด'
        : 'ร่างข้อความตอบกลับลูกค้าให้ส่งได้',
      rationale: context.requiresClarification
        ? 'การถามกลับให้ชัดก่อนจะช่วยให้เริ่มแก้หรือสรุปงานต่อได้โดยไม่เดา'
        : 'การตอบกลับให้ชัดก่อนจะช่วยให้ลูกค้าเห็นสถานะและเปิดทางให้ขยับงานต่อได้',
      micro_steps: [
        'เปิดข้อความลูกค้าล่าสุด',
        context.requiresClarification
          ? 'สรุป 1 จุดที่ยังไม่ชัดแล้วร่างคำถามสั้น ๆ'
          : 'ร่างข้อความตอบกลับฉบับแรกให้พร้อมส่ง',
        'ตรวจข้อความอีกครั้งก่อนส่งหรือก่อนเริ่มงานต่อ',
      ],
    };
  }

  return {
    title: 'สรุปสถานะโปรเจกต์แล้วเลือกก้าวแรกที่ทำได้ทันที',
    rationale: 'การคืนบริบทก่อนจะช่วยให้กลับมาเริ่มงานต่อได้เร็วที่สุด',
    micro_steps: [
      'เปิดโน้ตหรือไฟล์ล่าสุดของโปรเจกต์',
      'จดว่างานคืบถึงจุดไหนแล้วและมีอะไรค้างอยู่บ้าง',
      'เลือก 1 ก้าวเล็กที่ลงมือทำต่อได้ทันที',
    ],
  };
}

function ensureMicroSteps(
  value: unknown,
  fallbackSource: Record<string, unknown> | undefined,
  context: {
    workflowType: 'client_response' | 'client_resume';
    requiresClarification: boolean;
    title?: string;
    situationSummary?: string;
    replyDraft?: string;
  },
) {
  const normalizedSteps = normalizeMicroSteps(value, fallbackSource);
  const rawSteps = Array.isArray(normalizedSteps)
    ? normalizedSteps
        .map((item) => normalizeStepText(item))
        .filter((item): item is string => Boolean(item))
    : [];

  const uniqueSteps: string[] = [];
  for (const step of rawSteps) {
    if (!uniqueSteps.includes(step)) uniqueSteps.push(step);
  }

  const fallbackSteps = buildFallbackRecommendedAction({
    workflowType: context.workflowType,
    requiresClarification: context.requiresClarification,
    situationSummary: context.situationSummary,
  }).micro_steps;

  while (uniqueSteps.length < 3) {
    const nextStep =
      fallbackSteps[uniqueSteps.length] ||
      fallbackSteps[fallbackSteps.length - 1] ||
      'หยุดไว้ตรงจุดที่ทำได้จริงก่อน';
    if (!uniqueSteps.includes(nextStep)) {
      uniqueSteps.push(nextStep);
    } else {
      uniqueSteps.push(`ตรวจผลลัพธ์ของ "${context.title || 'งานที่ค้าง'}" อีกครั้ง`);
    }
  }

  return uniqueSteps.slice(0, 3);
}

function collectStepFields(source: Record<string, unknown>) {
  const candidates = [
    pickAlias(source, ['micro_steps', 'microSteps', 'steps', 'step_list', 'stepList', 'checklist']),
    pickAlias(source, ['step_1', 'step1', 'first_step', 'firstStep']),
    pickAlias(source, ['step_2', 'step2', 'second_step', 'secondStep']),
    pickAlias(source, ['step_3', 'step3', 'third_step', 'thirdStep']),
  ];

  return candidates.flatMap((candidate) => {
    if (candidate === undefined || candidate === null) return [];
    if (Array.isArray(candidate)) return candidate;
    return [candidate];
  });
}

function normalizeMicroSteps(value: unknown, fallbackSource?: Record<string, unknown>) {
  if (typeof value === 'string') {
    return value
      .split(/\n|;|,/g)
      .map((item) => item.trim())
      .map((item) => item.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''))
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => coerceStringLike(item))
      .filter((item): item is string => Boolean(item));
  }

  const object = asObject(value);
  if (object) {
    return collectStepFields(object)
      .map((item) => coerceStringLike(item))
      .filter((item): item is string => Boolean(item));
  }

  if (fallbackSource) {
    return collectStepFields(fallbackSource)
      .map((item) => coerceStringLike(item))
      .filter((item): item is string => Boolean(item));
  }

  return value;
}

function normalizeRecommendedAction(
  value: unknown,
  fallbackSource: Record<string, unknown> | undefined,
  context: {
    workflowType: 'client_response' | 'client_resume';
    requiresClarification: boolean;
    situationSummary?: string;
    replyDraft?: string;
  },
) {
  const parsed = tryParseJsonString(value);
  const object = asObject(parsed) ?? firstObjectFromArray(parsed);
  if (object) {
    const title = coerceStringLike(pickAlias(object, ['title', 'action_title', 'actionTitle']));
    const rationale = coerceStringLike(pickAlias(object, ['rationale', 'reason', 'why']));
    const microSteps = ensureMicroSteps(
      pickAlias(object, ['micro_steps', 'microSteps', 'steps', 'step_list', 'checklist']),
      fallbackSource ?? object,
      {
        workflowType: context.workflowType,
        requiresClarification: context.requiresClarification,
        title,
        situationSummary: context.situationSummary,
        replyDraft: context.replyDraft,
      },
    );

    return {
      title:
        title ||
        buildFallbackRecommendedAction({
          workflowType: context.workflowType,
          requiresClarification: context.requiresClarification,
          situationSummary: context.situationSummary,
        }).title,
      rationale:
        rationale ||
        buildFallbackRecommendedAction({
          workflowType: context.workflowType,
          requiresClarification: context.requiresClarification,
          situationSummary: context.situationSummary,
        }).rationale,
      micro_steps: microSteps,
    };
  }

  const titleFromString = coerceStringLike(parsed);
  if (titleFromString && fallbackSource) {
    const fallbackAction = buildFallbackRecommendedAction({
      workflowType: context.workflowType,
      requiresClarification: context.requiresClarification,
      situationSummary: context.situationSummary,
    });
    return {
      title: titleFromString,
      rationale:
        coerceStringLike(
          pickAlias(fallbackSource, ['rationale', 'reason', 'why', 'recommended_action_rationale']),
        ) || fallbackAction.rationale,
      micro_steps: ensureMicroSteps(
        pickAlias(fallbackSource, ['micro_steps', 'microSteps', 'steps', 'step_list', 'checklist']),
        fallbackSource,
        {
          workflowType: context.workflowType,
          requiresClarification: context.requiresClarification,
          title: titleFromString,
          situationSummary: context.situationSummary,
          replyDraft: context.replyDraft,
        },
      ),
    };
  }

  if (fallbackSource) {
    const fallbackAction = buildFallbackRecommendedAction({
      workflowType: context.workflowType,
      requiresClarification: context.requiresClarification,
      situationSummary: context.situationSummary,
    });

    return {
      title:
        coerceStringLike(pickAlias(fallbackSource, ['title', 'action_title', 'actionTitle'])) ||
        fallbackAction.title,
      rationale:
        coerceStringLike(pickAlias(fallbackSource, ['rationale', 'reason', 'why'])) ||
        fallbackAction.rationale,
      micro_steps: ensureMicroSteps(
        pickAlias(fallbackSource, ['micro_steps', 'microSteps', 'steps', 'step_list', 'checklist']),
        fallbackSource,
        {
          workflowType: context.workflowType,
          requiresClarification: context.requiresClarification,
          situationSummary: context.situationSummary,
          replyDraft: context.replyDraft,
        },
      ),
    };
  }

  return value;
}

function unwrapEnvelope(value: unknown) {
  const object = asObject(value) ?? firstObjectFromArray(value);
  if (!object) return value;

  const directData = pickAlias(object, ['data', 'result', 'output', 'response', 'payload']);
  const parsedData = tryParseJsonString(directData);
  const nestedData = asObject(parsedData) ?? firstObjectFromArray(parsedData);
  if (nestedData) return nestedData;

  return object;
}

function normalizeTopLevelCandidate(value: unknown) {
  const unwrapped = unwrapEnvelope(value);
  const object = asObject(unwrapped) ?? firstObjectFromArray(unwrapped);
  if (!object) return value;

  const requiresClarification =
    coerceBooleanLike(pickAlias(object, ['requires_clarification', 'requiresClarification'])) ?? false;
  const workflowTypeCandidate = pickAlias(object, ['workflow_type', 'workflowType']);
  const replyDraft = normalizeOptionalString(pickAlias(object, ['reply_draft', 'replyDraft']));
  const explicitWorkflowType =
    workflowTypeCandidate === 'client_response' || workflowTypeCandidate === 'client_resume'
      ? workflowTypeCandidate
      : undefined;
  const inferredWorkflowType = explicitWorkflowType || (replyDraft ? 'client_response' : 'client_resume');
  const situationSummary = normalizeOptionalString(
    pickAlias(object, ['situation_summary', 'situationSummary']),
  );
  const contextualSituationSummary =
    situationSummary ||
    buildFallbackSituationSummary({
      workflowType: inferredWorkflowType,
      requiresClarification,
    });
  const contextualReplyDraft =
    replyDraft ||
    buildFallbackReplyDraft({
      workflowType: inferredWorkflowType,
      requiresClarification,
      situationSummary: contextualSituationSummary,
    });
  const recommendedActionCandidate =
    pickAlias(object, [
      'recommended_action',
      'recommendedAction',
      'next_action',
      'nextAction',
      'one_action',
      'oneAction',
      'action',
      'action_title',
      'actionTitle',
    ]) ??
    (pickAlias(object, ['title', 'rationale', 'micro_steps', 'microSteps']) !== undefined ? object : undefined);

  const normalized = {
    workflow_type: inferredWorkflowType,
    requires_clarification: requiresClarification,
    clarification_nudge: normalizeOptionalString(
      pickAlias(object, ['clarification_nudge', 'clarificationNudge']),
    ),
    situation_summary: contextualSituationSummary,
    reply_draft: contextualReplyDraft,
    recommended_action: normalizeRecommendedAction(recommendedActionCandidate, object, {
      workflowType: inferredWorkflowType,
      requiresClarification,
      situationSummary: contextualSituationSummary,
      replyDraft: contextualReplyDraft,
    }),
    alternative_actions: normalizeAlternativeActions(
      pickAlias(object, ['alternative_actions', 'alternativeActions']),
    ),
    detected_blockers: normalizeDetectedBlockers(
      pickAlias(object, ['detected_blockers', 'detectedBlockers']),
    ),
  } satisfies Record<string, unknown>;

  return normalized;
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
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  return extractBalancedJsonObject(trimmed);
}

function parseExtractedJson(candidate: string): unknown {
  const parsed = JSON.parse(candidate) as unknown;

  if (typeof parsed === 'string') {
    const nestedCandidate = extractJsonCandidate(parsed);
    if (!nestedCandidate) return parsed;
    return JSON.parse(nestedCandidate);
  }

  return parsed;
}

function isPlaceholderText(value: string | null | undefined) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  return (
    trimmed === '...' ||
    trimmed === '…' ||
    /^<[^>]+>$/.test(trimmed) ||
    /^(\.{3,}|…+)$/.test(trimmed) ||
    /^(tbd|todo|placeholder|null)$/i.test(trimmed)
  );
}

function validateSemanticContent(payload: AiSynthesisResponse) {
  if (isPlaceholderText(payload.recommended_action.title)) {
    throw new AiContractError('semantic_validation_failed', 'recommended_action.title must be a real action');
  }

  if (isPlaceholderText(payload.recommended_action.rationale)) {
    throw new AiContractError(
      'semantic_validation_failed',
      'recommended_action.rationale must explain the action',
    );
  }

  if (payload.recommended_action.micro_steps.length !== 3) {
    throw new AiContractError(
      'semantic_validation_failed',
      'recommended_action.micro_steps must contain exactly 3 steps',
    );
  }

  if (payload.recommended_action.micro_steps.some((step) => isPlaceholderText(step))) {
    throw new AiContractError(
      'semantic_validation_failed',
      'recommended_action.micro_steps must contain real physical steps',
    );
  }

  if (isPlaceholderText(payload.situation_summary)) {
    throw new AiContractError(
      'semantic_validation_failed',
      'situation_summary must contain a real summary',
    );
  }

  if (payload.workflow_type === 'client_response' && isPlaceholderText(payload.reply_draft)) {
    throw new AiContractError(
      'semantic_validation_failed',
      'client_response requires a real reply_draft',
    );
  }
}

function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function parseAiSynthesisResponse(raw: string): AiSynthesisResponse {
  const extracted = extractJsonCandidate(raw);
  if (!extracted) {
    throw new AiContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  let parsed: unknown;
  try {
    parsed = parseExtractedJson(extracted);
  } catch {
    throw new AiContractError('json_extraction_failed', 'AI output was not valid JSON');
  }

  const normalized = normalizeTopLevelCandidate(parsed);
  const validation = AiSynthesisResponseSchema.safeParse(normalized);

  if (!validation.success) {
    throw new AiContractError('schema_validation_failed', formatZodError(validation.error));
  }

  validateSemanticContent(validation.data);
  return validation.data;
}
