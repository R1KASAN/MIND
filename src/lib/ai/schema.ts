import { z } from 'zod';

const NullableOptionalString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  return value;
}, z.string().optional());

export const AiSynthesisResponseSchema = z.object({
  workflow_type: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    return value;
  }, z.enum(['client_response', 'client_resume']).optional()),
  requires_clarification: z.boolean(),
  clarification_nudge: NullableOptionalString,
  situation_summary: NullableOptionalString,
  reply_draft: NullableOptionalString,
  recommended_action: z.object({
    title: z.string(),
    rationale: z.string(),
    micro_steps: z.array(z.string()).length(3)
  }),
  alternative_actions: z.preprocess((value) => {
    if (value === null || value === undefined) return [];
    return value;
  }, z.array(z.object({
    title: z.string(),
    rationale: z.string()
  })).max(2)).default([]),
  detected_blockers: z.preprocess((value) => {
    if (value === null || value === undefined) return [];
    return value;
  }, z.array(z.string())).default([]),
});

export type AiSynthesisResponse = z.infer<typeof AiSynthesisResponseSchema>;
