# Implementation Plan: MIND vNext — Reply + Resume for Client Work

**Branch**: `006-mind-vnext-prd` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/006-mind-vnext-prd/spec.md` (vNext 1.1.0)

---

## Summary

MIND vNext extends the existing Next.js codebase in `src/` to support two client-work workflows:
**Client Response** (paste email/message → summary + reply draft + one next action) and
**Client Project Resume** (dump stale context → summary + one next action).

The implementation spans two phases:
- **Phase 1**: Structural honesty — remove synthetic success, preserve dump context for retry, restructure recovery UI as retry-first/manual-second
- **Phase 2**: Client intelligence — auto-classify workflow, detect blockers, add situation summary and reply draft output, lightweight pattern memory

All changes extend the existing state machine, IDB store, AI route, and component set. No new app, no new routes beyond health enrichment, no planner-oriented state.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 15 (App Router), React 19
**Primary Dependencies**: idb-keyval (IDB), zod (schema validation), Ollama (local AI runtime)
**Storage**: IndexedDB via idb-keyval — keys `mind_session` and `mind_actions` (no new keys in vNext)
**Testing**: Manual integration testing + local Ollama smoke tests (no automated test suite currently)
**Target Platform**: Browser (localhost dev, mobile-first layout)
**Performance Goals**: Time-to-action display < 12s (AI timeout bound); Health poll non-blocking (8s interval)
**Constraints**: Local-only, no external API calls, Thai UI, Ollama-first inference, no cloud sync
**Scale/Scope**: Single-user local app; state machine has 10 states, ~25 components, 1 AI route

---

## Constitution Check v3.0.0

*GATE: All checks must pass before Phase 2 implementation.*

| Gate | Status | Evidence/Rationale |
|------|--------|-------------------|
| **No Planner behavior?** | ✅ PASS | No scheduling, calendars, backlogs, or Gantt added. reply_draft and situation_summary are transient outputs, not stored lists |
| **Physical next action?** | ✅ PASS | System prompt explicitly requires `recommended_action.title` to be a physical action completable within 5 minutes; blocker detection forces action to address blocker |
| **Local-first compliance?** | ✅ PASS | All data stays in IndexedDB; Ollama runs on localhost; no external fetch in synthesis path |
| **Shame-free UX?** | ✅ PASS | No success animations, streaks, timers, or celebration screens; completion loop is silent |
| **Recovery focused?** | ✅ PASS | Phase 1 is entirely about improving honest recovery; retry-first panel, context preservation, structured failure responses |

---

## Project Structure

### Documentation (this feature)

```text
specs/006-mind-vnext-prd/
├── spec.md              # PRD vNext 1.1.0
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Schema extension reference (already written)
├── contracts/
│   └── ai-contract.md  # AI behavior contract (already written)
├── checklists/
│   └── requirements.md # Quality gate (all passing)
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code

```text
src/
├── app/
│   ├── page.tsx                        [MODIFY] — state machine, session hydration
│   ├── globals.css                     [MODIFY] — supporting output styles (Phase 2)
│   └── api/
│       └── ai/
│           ├── route.ts                [MODIFY] Phase 1 — remove synthetic success, return structured errors
│           └── health/
│               └── route.ts            [MODIFY] Phase 1 — enrich health response shape
├── lib/
│   ├── ai/
│   │   ├── schema.ts                   [MODIFY] Phase 2 — extend Zod schema with optional vNext fields
│   │   ├── prompts.ts                  [MODIFY] Phase 2 — vNext system prompt with workflow classification
│   │   ├── local-synthesis.ts          [MODIFY] Phase 1 — remove from auto-fallback path
│   │   └── ollama-runtime.ts           [MODIFY] Phase 1 — enrich getAiHealth() response shape
│   ├── store/
│   │   └── idb.ts                      [MODIFY] Phase 1 — promote activeDumpContext to struct; add vNext fields
│   └── instrumentation.ts             [MODIFY] Phase 2 — add vNext telemetry events
└── components/
    ├── BrainDump/
    │   ├── Input.tsx                   [no change — single dump input preserved]
    │   └── Fallback.tsx                [MODIFY] Phase 1 — retry-first, manual-second, show failure reason
    ├── ActionScaffold/
    │   └── OneAction.tsx               [MODIFY] Phase 2 — add situation_summary + reply_draft supporting outputs
    ├── Recovery/
    │   └── [existing components]       [no change in vNext scope]
    └── [all other components]          [no change in vNext scope]
```

**Structure Decision**: Single project extension. No new directories at the app level. All vNext logic extends existing modules inline.

---

## Phase 1: Honest Ollama Recovery Flow

**Goal**: Remove synthetic success. When Ollama is unavailable or produces invalid output, return a structured failure — not a silent local synthesis payload. Preserve dump context for retry.

**Dependency order**: `idb.ts` → `ollama-runtime.ts` → `route.ts` (health) → `route.ts` (synthesis) → `Fallback.tsx` → `page.tsx`

---

### P1-001 — `src/lib/store/idb.ts`

**What changes**:
1. Add `AiFailureReason` type union
2. Promote `activeDumpContext` from `string` to `ActiveDumpContext` interface
3. Add `lastWorkflowType` and `lastFailureReason` to `AppSession`
4. Add load-time migration shim: if stored `activeDumpContext` is a string, wrap it in `{ text, createdAt }`

```typescript
export type AiFailureReason =
  | 'service_down'
  | 'model_missing'
  | 'runtime_boot_failed'
  | 'metal_init_failed'
  | 'request_timeout'
  | 'unknown';

export interface ActiveDumpContext {
  text: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
}

// In AppSession:
activeDumpContext?: ActiveDumpContext;
lastWorkflowType?: 'client_response' | 'client_resume';
lastFailureReason?: AiFailureReason;
```

**Validation rules**:
- `ActiveDumpContext.text` must be non-empty string
- Migration shim must be idempotent (safe to run multiple times)

**Constitution gates**: Local-only ✅ | No planner behavior ✅

---

### P1-002 — `src/lib/ai/ollama-runtime.ts`

**What changes**:
1. Enrich `getAiHealth()` return shape with `reason`, `detail`, `retryable`, `actions`:

```typescript
export interface AiHealthResult {
  status: 'ready' | 'checking' | 'unavailable' | 'model_missing';
  model: string;
  reason?: string;
  detail?: string;
  retryable: boolean;
  actions?: string[];
}
```

2. Map each status to appropriate `reason` + `retryable` + `actions`:

| Status | reason | retryable | actions |
|---|---|---|---|
| `ready` | - | true | - |
| `checking` | "กำลังโหลดโมเดล..." | true | - |
| `model_missing` | "ไม่พบโมเดลในเครื่อง" | false | `['ollama pull qwen2.5:3b']` |
| `unavailable` | "Ollama ไม่พร้อมใช้งาน" | true | `['ollama serve']` |

3. Export `AiHealthResult` type for use in health route and client

**Constitution gates**: Recovery focused ✅ | Shame-free (honest status, not synthetic) ✅

---

### P1-003 — `src/app/api/ai/health/route.ts`

**What changes**:
- Return the full `AiHealthResult` shape (after `ollama-runtime.ts` is updated)
- No logic change needed — route delegates to `getAiHealth()` directly

**Constitution gates**: Local-first ✅

---

### P1-004 — `src/app/api/ai/route.ts` (synthesis POST)

**What changes**:
1. **Remove** the automatic `synthesizeLocally()` fallback (lines 180–193)
2. When all Ollama candidates fail → return structured JSON error:

```typescript
return NextResponse.json(
  {
    ok: false,
    error: {
      type: 'ollama_unavailable',
      reason: lastEndpointReason ? 'service_down' : 'unknown',
      message: 'ไม่สามารถเชื่อมต่อ Ollama ได้ในขณะนี้',
      detail: lastEndpointReason ?? lastValidationReason,
      retryable: true,
      actions: ['ollama serve', 'ollama pull qwen2.5:3b'],
    }
  },
  { status: 503 }
);
```

3. On validation failure (all models produced unparseable JSON) → return:
```typescript
{ ok: false, error: { type: 'validation_failed', reason: 'unknown', retryable: true } }
// status: 422
```

4. Add `workflow_type` passthrough in happy path: if validated payload contains `workflow_type`, return it (schema will be optional so no breakage now, enriched in Phase 2)

**What stays the same**:
- Model iteration loop (outer `for` loop over candidates)
- Auto-retry on parse failure (inner retry)
- `markModelSuccess` / `markModelFailure` bookkeeping
- 400 on empty dump

**Constitution gates**: No synthetic success ✅ | Recovery focused ✅

---

### P1-005 — `src/components/BrainDump/Fallback.tsx`

**What changes**:
1. Restructure layout: **Retry AI** is the primary CTA (top, prominent)
2. **Continue Manually** is secondary (smaller, below a visual separator)
3. Display `failureReason` from `activeDumpContext.lastFailureReason` in plain Thai:

```typescript
const reasonLabels: Record<AiFailureReason, string> = {
  service_down: 'Ollama ไม่ได้เปิดอยู่ในขณะนี้',
  model_missing: 'ยังไม่ได้ติดตั้งโมเดล',
  runtime_boot_failed: 'โมเดลโหลดไม่สำเร็จ',
  metal_init_failed: 'GPU ไม่พร้อม — ลองเปิด Ollama ใหม่',
  request_timeout: 'ใช้เวลานานเกินไป — Ollama อาจยังกำลังโหลด',
  unknown: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ',
};
```

4. Show suggested `actions` (CLI commands) in a small collapsible code block
5. No success animation when retry succeeds — silent transition to `ONE_ACTION`
6. Retry button must re-use existing `activeDumpContext.text` without re-prompting user

**Telemetry**:
- `recovery_retry_shown` on mount
- `recovery_manual_chosen` when user picks manual path
- `retry_clicked` on retry
- `retry_success` / `retry_failed` on result

**Constitution gates**: Shame-free ✅ | Recovery focused ✅ | No synthetic success ✅

---

### P1-006 — `src/app/page.tsx` (state machine hydration)

**What changes**:
1. **Read `activeDumpContext` migration**: on session hydration, migrate `string → ActiveDumpContext` if needed
2. **Synthesis failure handling**: when `POST /api/ai` returns non-2xx or `{ ok: false }`, extract `error.reason` as `AiFailureReason`, write to `activeDumpContext.lastFailureReason`, then transition to `MANUAL_FALLBACK`
3. **Retry path**: when user clicks Retry in `Fallback.tsx`, re-submit `activeDumpContext.text` to `POST /api/ai`; on success → `ONE_ACTION`; on failure → stay in `MANUAL_FALLBACK`, update `lastFailureReason`
4. **Remove**: any code paths that silently consume local_fallback output as if it were AI

**State transitions that change**:
```
SYNTHESIZING → MANUAL_FALLBACK  (previously: SYNTHESIZING → ONE_ACTION via local fallback)
MANUAL_FALLBACK + retry → SYNTHESIZING → ONE_ACTION  (unchanged)
MANUAL_FALLBACK + manual → ONE_ACTION  (unchanged, but manual_bypass flagged)
```

**Constitution gates**: Inline retries ✅ | Robust fallback ✅

---

### P1 Dependency Order

```
P1-001 idb.ts
  └── P1-002 ollama-runtime.ts
        └── P1-003 health/route.ts
        └── P1-004 ai/route.ts
              └── P1-005 Fallback.tsx
                    └── P1-006 page.tsx
```

---

## Phase 2: Client Response & Resume Intelligence

**Goal**: Add workflow classification, situation summary, reply draft, blocker auto-detection, and vNext telemetry. All without adding new routes, new states, or mode selectors.

**Dependency order**: `schema.ts` → `prompts.ts` → `route.ts` (schema passthrough auto-included) → `idb.ts` (Action vNext fields) → `OneAction.tsx` → `instrumentation.ts` → `page.tsx` (telemetry wiring)

---

### P2-001 — `src/lib/ai/schema.ts`

**What changes**:
Extend `AiSynthesisResponseSchema` with optional vNext fields:

```typescript
export const AiSynthesisResponseSchema = z.object({
  // Existing (unchanged)
  requires_clarification: z.boolean(),
  clarification_nudge: z.string().optional(),
  recommended_action: z.object({
    title: z.string(),
    rationale: z.string(),
    micro_steps: z.array(z.string()).length(3),
  }),
  alternative_actions: z.array(z.object({
    title: z.string(),
    rationale: z.string(),
  })).max(2),

  // vNext additions (all optional — backward safe)
  workflow_type: z.enum(['client_response', 'client_resume']).optional(),
  situation_summary: z.string().optional(),
  reply_draft: z.string().nullable().optional(),
  detected_blockers: z.array(z.string()).optional(),
});
```

**Validation rules**:
- `reply_draft` must be null or absent if `workflow_type === 'client_resume'` — enforced by prompt, not schema (schema accepts null)
- All new fields are optional → zero breakage on existing local synthesis output

**Constitution gates**: No planner behavior (no new state-management fields) ✅

---

### P2-002 — `src/lib/ai/prompts.ts`

**What changes**:
Replace `SYSTEM_PROMPT` with vNext version that:
1. Auto-classifies `workflow_type` from input content signals
2. Produces `situation_summary` always (≤ 3 sentences)
3. Produces `reply_draft` only for `client_response`
4. Detects blockers and forces next action to address them first
5. Single clarification question max

Updated schema in prompt:
```json
{
  "workflow_type": "client_response | client_resume",
  "requires_clarification": false,
  "clarification_nudge": null,
  "situation_summary": "...",
  "reply_draft": "...",
  "recommended_action": {
    "title": "one next physical action within 5 minutes",
    "rationale": "...",
    "micro_steps": ["...", "...", "..."]
  },
  "alternative_actions": [
    { "title": "...", "rationale": "..." }
  ],
  "detected_blockers": ["..."]
}
```

**Workflow classification signals (in prompt)**:
- `client_response`: presence of email-like language, "feedback", "แก้", "revision", "ตอบกลับ", delayed reply patterns
- `client_resume`: stale notes, "ค้าง", "ยังไม่ได้", progress fragments, project status dumps
- Ambiguous → ask clarification (1 question max)

**Blocker signals (in prompt)**:
- "รอ", "ยังไม่ได้รับ", "รอ approve", "scope ไม่ชัด", "ไม่มีไฟล์"
- If blocker detected: next action = address the blocker, not skip to other work

**Constitution gates**: Physical next action ✅ | No generic chat ✅ | 5-minute rule ✅

---

### P2-003 — `src/lib/store/idb.ts` (Action vNext extension)

**What changes**:
Add optional vNext fields to `Action` interface:

```typescript
export interface Action {
  // Existing (unchanged)
  id: string; createdAt: number; title: string;
  rationale: string; microSteps: string[];
  isPinned: boolean; state: ActionState;

  // vNext additions
  workflowType?: 'client_response' | 'client_resume';
  situationSummary?: string;
  replyDraft?: string;
  detectedBlockers?: string[];
}
```

**Persist strategy**: When a new action is created from vNext AI output, persist `workflowType`, `situationSummary`, `replyDraft`, `detectedBlockers` into the `Action` record. This allows `OneAction.tsx` to render supporting outputs from the stored action rather than transient state.

**Constitution gates**: No browsable history (fields are per-action, not a separate list) ✅

---

### P2-004 — `src/components/ActionScaffold/OneAction.tsx`

**What changes**:
Add conditional rendering of supporting outputs **below** the primary action card:

```
[Primary — Action Card]           ← largest, always first
[Situation Summary]               ← muted, small, auto-expands after 2s idle
[Reply Draft]                     ← textarea + Copy button, client_response only
```

Implementation details:
- Read `situationSummary` and `replyDraft` from the current `Action` record (hydrated from IDB)
- `reply_draft` textarea: pre-filled, user editable, `Copy` button emits `reply_draft_copied` event
- `situation_summary` block: plain text, no interactive elements, styled as secondary
- Neither element has a prominence score approaching the action card (font size, weight, color hierarchy enforced via CSS)
- "Copy" button on `reply_draft`: uses `navigator.clipboard.writeText`, fallback `select + execCommand`

**Telemetry**:
- `reply_draft_copied` on copy
- `blocker_detected` if `detectedBlockers.length > 0` (emit on mount)
- `blocker_addressed` if `recommended_action.title` semantically targets a blocker (heuristic: title contains a blocker keyword)

**Constitution gates**: One-action-by-default ✅ | No planner behavior ✅

---

### P2-005 — `src/lib/instrumentation.ts`

**What changes**:
Add 9 new events to `EventName` union:

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

**Constitution gates**: No shame-inducing metrics ✅ (no streak, no duration shame)

---

### P2-006 — `src/app/page.tsx` (telemetry wiring + vNext action creation)

**What changes**:
1. After successful synthesis, extract `workflow_type` and emit `workflow_classified`
2. If `workflow_type === 'client_response'` → emit `client_response_submitted`
3. If `workflow_type === 'client_resume'` → emit `client_resume_submitted`
4. When creating a new `Action` from synthesis response, populate `workflowType`, `situationSummary`, `replyDraft`, `detectedBlockers`
5. If `detectedBlockers?.length > 0` → emit `blocker_detected`
6. If synthesis succeeds from preserved `activeDumpContext` → emit `active_context_preserved`
7. Pattern memory accumulator (Phase 2 MVP — memory-only):
   - Track last workflow type seen this session
   - If recurring workflow detected, append a 1-sentence hint to dump before sending to AI (e.g., "หมายเหตุ: ผู้ใช้มักทำงานประเภท client_response")
   - No UI, no IDB, no visible surface

**Constitution gates**: Lightweight pattern memory — internal only ✅ | No browsable backlog ✅

---

### P2 Dependency Order

```
P2-001 schema.ts
  └── P2-002 prompts.ts
        └── (route.ts handles schema passthrough automatically)
P2-003 idb.ts (Action vNext fields)
  └── P2-004 OneAction.tsx
P2-005 instrumentation.ts
  └── P2-006 page.tsx (telemetry wiring + action creation)
```

---

## UI Output Hierarchy — Implementation Contract

This must be enforced in both CSS and component render order:

```
[ONE_ACTION state]
┌─────────────────────────────────────┐
│  ★ Action Card (HERO)               │  ← font-size: 1.25rem, high contrast
│    title (BOLD)                     │
│    rationale (muted)                │
│    micro_steps (numbered list)      │
│  [เริ่มเลย] button (primary CTA)   │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  Situation Summary (SUPPORTING)     │  ← font-size: 0.85rem, muted color
│    auto-expand after 2s, collapsible│
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  Reply Draft (SUPPORTING, optional)  │  ← only client_response workflow
│  [textarea — pre-filled]            │
│  [Copy ↗] button (secondary)       │
└─────────────────────────────────────┘
```

**Anti-pattern enforcement**:
- `reply_draft` must never be rendered before the action card — enforced by component order
- `situation_summary` must never use heading or hero styling — enforced by CSS class
- Both supporting blocks must be visually subordinate (smaller font, lower contrast, thinner weight)

---

## Data Model Changes Summary

| Entity | Field | Type | Phase | Change |
|---|---|---|---|---|
| `AppSession` | `activeDumpContext` | `ActiveDumpContext` | P1 | Promoted from `string` |
| `AppSession` | `lastWorkflowType` | `workflow_type?` | P2 | New optional field |
| `AppSession` | `lastFailureReason` | `AiFailureReason?` | P1 | New optional field |
| `Action` | `workflowType` | `workflow_type?` | P2 | New optional field |
| `Action` | `situationSummary` | `string?` | P2 | New optional field |
| `Action` | `replyDraft` | `string?` | P2 | New optional field |
| `Action` | `detectedBlockers` | `string[]?` | P2 | New optional field |
| `AiSynthesisResponse` | `workflow_type` | `enum?` | P2 | New optional field |
| `AiSynthesisResponse` | `situation_summary` | `string?` | P2 | New optional field |
| `AiSynthesisResponse` | `reply_draft` | `string \| null?` | P2 | New optional field |
| `AiSynthesisResponse` | `detected_blockers` | `string[]?` | P2 | New optional field |

**Storage keys**: No new IDB keys. `mind_session` and `mind_actions` are extended in-place.

---

## Rejected Approaches (Anti-Pattern Log)

| Rejected Approach | Why Rejected |
|---|---|
| Mode selector before dump input (client_response vs client_resume) | Violates FR-010, increases friction, conflates product with mode-based apps |
| Synthetic success via local_synthesis auto-fallback | Violates honest recovery principle (Constitution §IV, FR-008) |
| Multi-step clarification dialog | Violates FR-005 (max 1 clarification question) |
| Success animation after Done | Violates FR-009 / Constitution §III Silent Completion Loop |
| `reply_draft` displayed before or at same level as action card | Violates UI Output Hierarchy Rule |
| New IDB key for pattern memory | Unnecessary complexity for Phase 2 MVP; memory-only is sufficient |
| New SessionStatus states for client_response / client_resume | No new states needed; `workflow_type` field carries differentiation within existing `ONE_ACTION` state |
| Cloud sync for context transfer | Rejected per Constitution §V, PRD §18 |
| CRM-style client record storage | Rejected; blocker signals are read-only inference, not user-managed lists |

---

## Telemetry Coverage

| Metric | Events Required |
|---|---|
| Time-to-First-Action (Client Response) | `client_response_submitted` → `action_accepted` / `reply_draft_copied` |
| Time-to-First-Action (Client Resume) | `client_resume_submitted` → `action_accepted` |
| Retry AI Success Rate | `retry_clicked` → `retry_success` |
| Manual Bypass Rate | `recovery_retry_shown` → `recovery_manual_chosen` |
| Blocker Detection Rate | `blocker_detected` |
| Comeback Success | `active_context_preserved` → `action_accepted` |
| One-Action Acceptance | `action_accepted` where `source` = 'ai' |

---

## Verification Plan

### Phase 1 Smoke Tests

1. **Ollama offline**: disable Ollama → submit dump → verify `MANUAL_FALLBACK` shown with honest failure message, no local-synthesis output displayed as AI
2. **Retry success**: Ollama offline → MANUAL_FALLBACK → re-enable Ollama → click Retry → verify silent transition to `ONE_ACTION`
3. **Dump context preserved**: submit dump → Ollama offline → MANUAL_FALLBACK → verify `activeDumpContext.text` matches original dump
4. **Health route enrichment**: `GET /api/ai/health` when Ollama offline → verify response has `reason`, `detail`, `retryable: true`, `actions` array

### Phase 2 Smoke Tests

5. **Client Response workflow**: paste sample client email → verify `workflow_type === 'client_response'`, `situation_summary` present, `reply_draft` present, action card displayed first
6. **Client Resume workflow**: paste stale project notes → verify `workflow_type === 'client_resume'`, `situation_summary` present, `reply_draft` absent, action card displayed first
7. **Blocker detection**: paste dump with "รอลูกค้าส่งไฟล์" → verify `detected_blockers` non-empty, `recommended_action.title` addresses the blocker
8. **UI hierarchy**: verify `reply_draft` textarea renders below action card, never above; verify `situation_summary` uses smaller/muted typography
9. **Copy reply draft**: click Copy button → verify clipboard contains draft text, `reply_draft_copied` event emitted
10. **Silent completion**: click "Done" from `SCAFFOLD` → verify immediate return to `DUMP_ENTRY` with no celebration

### Constitution Drift Guard Tests

11. **No mode selector**: verify no UI element asks user to choose client_response vs client_resume before submitting dump
12. **No backlog**: verify no list of past client interactions is browsable
13. **No planner behavior**: verify no date fields, deadline fields, or calendar-like UI rendered
14. **No streak/gamification**: verify no counter, badge, or progress bar displayed after completion
