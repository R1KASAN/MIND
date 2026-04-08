# Research: MIND vNext — Phase 0

**Branch**: `006-mind-vnext-prd`
**Date**: 2026-04-07
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## R-001: Codebase Extension Strategy

**Question**: Should vNext add to the existing `src/` codebase or be a separate app?

**Decision**: Extend the existing `src/` Next.js codebase.

**Rationale**:
- PRD §19 explicitly states: "codebase ที่จะใช้ต่อคือแอป Next.js เดิมใน `src/`"
- State machine (`page.tsx`), IDB store, and AI route are already in production and stable
- Incremental schema extension avoids data migration risk
- No new app bootstrap cost; dev server already running

**Alternatives Considered**:
- Separate Next.js app: rejected — too expensive, no data portability, violates PRD §19
- Separate directory within monorepo: rejected — unnecessary complexity for current scale

---

## R-002: Honest Ollama Recovery Flow — What Needs to Change

**Question**: What exactly is "synthetic success" in the current codebase, and what must change?

**Finding**: `src/app/api/ai/route.ts` (lines 180–193) currently calls `synthesizeLocally(dump)` silently when all Ollama models fail, and returns the local result with a `meta.source = 'local_fallback'` field. The client (`page.tsx`) does **not** check `meta.source` — it treats local_fallback output identically to Ollama output, displaying it as if AI produced it.

**Decision**: Phase 1 must restructure the failure path so:
1. `route.ts` returns a structured HTTP error response (4xx/5xx) when Ollama is unavailable or all models produce invalid output — **not** a local synthesis payload
2. The client detects this error and transitions to `MANUAL_FALLBACK` with the dump context preserved
3. Retry from `MANUAL_FALLBACK` re-submits the existing `activeDumpContext` without re-prompting the user
4. `synthesizeLocally` is removed from the route's automatic fallback path; it may be retained as an opt-in client-side helper only

**Alternatives Considered**:
- Keep local synthesis but surface a visible disclaimer to the user: rejected — misleading, violates Constitution §IV ("Robust Fallback") and PRD FR-008 / FR-010
- Remove local synthesis entirely: rejected — the function is useful as a client-side bootstrap for Manual Fallback pre-fill; keep but make explicit

---

## R-003: vNext AI Schema Extension

**Question**: How do we extend `AiSynthesisResponseSchema` (zod) for `workflow_type`, `situation_summary`, `reply_draft`, and `detected_blockers` without breaking the existing code?

**Decision**: Extend the Zod schema in `src/lib/ai/schema.ts` additively using `.optional()` fields for all vNext additions. Keep existing required fields (`requires_clarification`, `recommended_action`, `alternative_actions`) intact.

New fields:
```typescript
workflow_type: z.enum(['client_response', 'client_resume']).optional(),
situation_summary: z.string().optional(),
reply_draft: z.string().nullable().optional(),
detected_blockers: z.array(z.string()).optional(),
```

**Rationale**: Backward-compatible — existing sessions and local synthesis output won't break Zod parse. All new fields optional or nullable.

---

## R-004: System Prompt — vNext Extension

**Question**: How do we update the system prompt to support both client_response and client_resume workflows without breaking the single-dump, no-mode-selector UX?

**Decision**: The system prompt in `src/lib/ai/prompts.ts` should be updated to:
1. Auto-classify input as `client_response` or `client_resume` based on content signals
2. Produce `situation_summary` always
3. Produce `reply_draft` only when `workflow_type === 'client_response'`
4. Keep `recommended_action` as primary — explicitly instruct model to put it last in JSON, so the client always renders it first visually (position in JSON doesn't dictate UI hierarchy but ensures model priority)
5. Detect blockers and force next action to address them first
6. Max 1 clarification question total

**Rationale**: Single prompt update; no new API endpoints or multi-step prompt chains needed. Consistent with "single dump input" (FR-010) — no mode selector.

---

## R-005: `activeDumpContext` — Structured Persistence

**Question**: Should `activeDumpContext` remain a `string` or become a structured object?

**Decision**: Promote to a structured `ActiveDumpContext` object per the data model:
```typescript
interface ActiveDumpContext {
  text: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
}
```

**Rationale**:
- `lastFailureReason` enables the recovery panel to show honest diagnostic messages without a separate store key
- `lastAttemptAt` is needed for comeback/low-energy detection in Phase 2
- Backward compatible: `idb.ts` can handle `string | ActiveDumpContext` via a migration shim on load

---

## R-006: Health Route — Structured Failure Response

**Question**: Does `GET /api/ai/health` need to change for vNext?

**Decision**: Yes. The current health response is `{ status, model }`. vNext needs richer diagnostic data to power the Recovery UI:
```typescript
{
  status: 'ready' | 'checking' | 'unavailable' | 'model_missing',
  model: string,
  reason?: string,         // human-readable explanation
  detail?: string,         // technical detail for recovery panel
  retryable: boolean,
  actions?: string[],      // suggested CLI commands (e.g., 'ollama serve')
}
```

**Rationale**: The AI contract (contracts/ai-contract.md §7) requires health responses to include `reason`, `detail`, `retryable`, and `actions`. The current response omits all of these.

---

## R-007: UI Hierarchy — OneAction.tsx and OneActionvNext

**Question**: How do we add `situation_summary` and `reply_draft` display to the existing `ONE_ACTION` state without violating the output hierarchy rule?

**Decision**: Modify `OneAction.tsx` to conditionally render supporting outputs **below** the primary action card:
- `situation_summary` → small, muted collapsible text (collapsed by default on first render, auto-expands after 2s)
- `reply_draft` → shown only when `workflow_type === 'client_response'`; rendered as a pre-filled textarea with a "Copy" button, placed below the action card

**Rationale**: 
- Next Action card occupies top position and largest visual weight
- Supporting content collapses do not compete with the call-to-action
- Pre-filled textarea with Copy avoids need for external email client integration

---

## R-008: ManualFallback — Retry-First, Manual-Second

**Question**: What does the current `ManualFallback` state look like and what needs to change?

**Finding**: `src/components/BrainDump/Fallback.tsx` currently shows a form for user to type their own action. It has a "Retry" button. The retry logic in `page.tsx` re-fetches from the API using the stored `activeDumpContext`.

**Decision for Phase 1**:
1. `Fallback.tsx` must show **retry as the primary CTA** — prominent button at top
2. Manual input should be secondary — smaller, below the retry button with a separator
3. Honest failure reason from `activeDumpContext.lastFailureReason` must be displayed plainly
4. No success animation on retry success — silent transition to `ONE_ACTION`
5. On retry success, `activeDumpContext.lastFailureReason` is cleared

---

## R-009: Telemetry — vNext New Events

**Question**: What new events are needed for the two vNext workflows?

**Decision**: Add to `src/lib/instrumentation.ts`:
```typescript
| 'client_response_submitted'
| 'client_resume_submitted'
| 'reply_draft_copied'
| 'blocker_detected'
| 'blocker_addressed'
| 'workflow_classified'
| 'recovery_retry_shown'
| 'recovery_manual_chosen'
| 'active_context_preserved'
```

**Rationale**: These events are the minimum needed to measure the two primary success metrics: Time-to-First-Action per workflow, and Retry AI Success Rate.

---

## R-010: Pattern Memory (Phase 2)

**Question**: What is "lightweight pattern memory" in vNext and where does it live?

**Decision**: Pattern memory = a simple in-memory (session scope) accumulator that tracks:
- Which workflow type appeared in the last N sessions
- Whether the user previously rejected actions for similar blocker signals

Storage: does **not** persist to IndexedDB in Phase 2 MVP — memory-only, resets on page reload.
Exposure: **zero UI surface** — only used by the system prompt builder to append a context hint to the dump before sending to Ollama.

**Rationale**: Avoids IDB schema complexity for Phase 2. Satisfies FR-012 ("internal behavior only"). Can be promoted to IDB storage in a later phase without UI changes.

---

## R-011: Extensions Hooks

**Finding**: `.specify/extensions.yml` does not exist in the project root. No before_plan or after_plan hooks to execute.

---

## Summary Table

| Research ID | Question | Resolution |
|---|---|---|
| R-001 | Codebase strategy | Extend existing `src/` |
| R-002 | Synthetic success removal | Route returns structured error; client routes to MANUAL_FALLBACK |
| R-003 | Schema extension | Additive optional fields on `AiSynthesisResponseSchema` |
| R-004 | System prompt update | Auto-classify + situation_summary + reply_draft + blocker detection |
| R-005 | activeDumpContext shape | Promote to `ActiveDumpContext` struct with failure reason |
| R-006 | Health route enrichment | Add `reason`, `detail`, `retryable`, `actions` fields |
| R-007 | UI hierarchy in OneAction | Supporting outputs below action card, collapsed by default |
| R-008 | ManualFallback restructure | Retry-first, manual-second; honest failure reason shown |
| R-009 | Telemetry additions | 9 new events for vNext workflows |
| R-010 | Pattern memory | Memory-only accumulator, zero UI surface, Phase 2 |
| R-011 | Extension hooks | None — `.specify/extensions.yml` does not exist |
