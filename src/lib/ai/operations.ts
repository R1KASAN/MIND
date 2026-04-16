import { z } from 'zod';
import {
  TASK_SHAPE_DELIVERABLE_TYPES,
  TASK_SHAPE_IMMEDIATE_NEEDS,
} from '@/lib/ai/task-shape';

const NullableOptionalString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  return value;
}, z.string().optional());

function stringArrayField(maxItems?: number) {
  const schema = maxItems ? z.array(z.string()).max(maxItems).default([]) : z.array(z.string()).default([]);
  return z.preprocess((value) => {
    if (value === null || value === undefined) return [];
    return value;
  }, schema);
}

export const AiOperationMetaSchema = z.object({
  model: z.string(),
  passType: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  }, z.enum(['primary_pass', 'repair_pass', 'fallback_pass']).optional()),
  durationMs: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return value;
  }, z.number().int().min(0).optional()),
  confidence: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return value;
  }, z.number().min(0).max(1).optional()),
  usedRoomFiles: stringArrayField(),
  repairUsed: z.boolean(),
});

export const AiTaskShapeSchema = z.object({
  deliverableType: z.enum(TASK_SHAPE_DELIVERABLE_TYPES),
  immediateNeed: z.enum(TASK_SHAPE_IMMEDIATE_NEEDS),
  missingInputs: stringArrayField(),
  workContext: z.string(),
  confidence: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return value;
  }, z.number().min(0).max(1).optional()),
});

export const AiIntakeResponseSchema = z.object({
  workflowType: z.enum(['client_response', 'client_resume']),
  roomDigest: z.string(),
  taskFrame: z.object({
    objective: z.string(),
    stage: z.string(),
    stakeholders: stringArrayField(),
  }),
  blockers: stringArrayField(),
  requiresClarification: z.boolean(),
  clarificationQuestion: NullableOptionalString,
  taskShape: AiTaskShapeSchema,
  candidateActions: z.array(z.object({
    title: z.string(),
    rationale: z.string(),
    kind: z.enum(['reply_first', 'resume_first', 'dependency_first']),
  })).min(1).max(3),
  meta: AiOperationMetaSchema,
});

export const AiActionResponseSchema = z.object({
  chosenAction: z.object({
    title: z.string(),
    rationale: z.string(),
    successSignal: z.string(),
  }),
  alternatives: z.preprocess((value) => {
    if (value === null || value === undefined) return [];
    return value;
  }, z.array(z.object({
    title: z.string(),
    rationale: z.string(),
  })).max(3)).default([]),
  whyThisNow: z.string(),
  replyDraft: NullableOptionalString,
  situationSummary: z.string(),
  meta: AiOperationMetaSchema,
});

export const AiScaffoldResponseSchema = z.object({
  planTitle: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    text: z.string(),
    expectedOutcome: NullableOptionalString,
    canAutoDraft: z.preprocess((value) => {
      if (value === null || value === undefined) return undefined;
      return value;
    }, z.boolean().optional()),
  })).min(3).max(7),
  shortcutOptions: stringArrayField(3),
  revisedCurrentStepIndex: z.number().int().min(0),
  meta: AiOperationMetaSchema,
});

export const AiRescueResponseSchema = z.object({
  diagnosis: z.object({
    primaryReason: z.enum(['missing_context', 'dependency', 'unclear_scope', 'too_big', 'low_energy', 'unknown']),
    explanation: z.string(),
  }),
  rescuePlan: z.object({
    mode: z.enum(['clarify', 'follow_up', 'shrink', 'switch_track', 'pause_cleanly']),
    steps: z.array(z.string()).min(2).max(4),
  }),
  suggestedMessage: NullableOptionalString,
  meta: AiOperationMetaSchema,
});

export const AiReentryResponseSchema = z.object({
  reentrySummary: z.string(),
  topActions: z.array(z.object({
    roomId: z.string(),
    title: z.string(),
    rationale: z.string(),
    impact: z.enum(['high', 'medium']),
    effort: z.enum(['low', 'medium']),
    resumeTarget: z.enum(['ONE_ACTION', 'SCAFFOLD', 'DUMP_ENTRY']),
  })).min(1).max(3),
  ignoredNoise: stringArrayField(3),
  meta: AiOperationMetaSchema,
});

export const AiActionNegotiationModeSchema = z.enum([
  'default',
  'smaller',
  'faster',
  'safer',
  'reply_first',
  'resume_first',
]);

export const AiReentryScopeSchema = z.enum(['bounce_back', 'morning_ritual']);

export type AiOperationMeta = z.infer<typeof AiOperationMetaSchema>;
export type AiTaskShape = z.infer<typeof AiTaskShapeSchema>;
export type AiIntakeResponse = z.infer<typeof AiIntakeResponseSchema>;
export type AiActionResponse = z.infer<typeof AiActionResponseSchema>;
export type AiScaffoldResponse = z.infer<typeof AiScaffoldResponseSchema>;
export type AiRescueResponse = z.infer<typeof AiRescueResponseSchema>;
export type AiReentryResponse = z.infer<typeof AiReentryResponseSchema>;
export type AiActionNegotiationMode = z.infer<typeof AiActionNegotiationModeSchema>;
export type AiReentryScope = z.infer<typeof AiReentryScopeSchema>;
