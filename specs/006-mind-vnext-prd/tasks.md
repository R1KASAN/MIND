# Tasks: MIND vNext — Reply + Resume สำหรับงานลูกค้าที่ค้าง

**Branch**: `006-mind-vnext-prd`
**Spec**: `specs/006-mind-vnext-prd/spec.md` (vNext 1.1.0)
**Plan**: `specs/006-mind-vnext-prd/plan.md`
**Constitution**: MIND Constitution v3.0.0

> **Authority order**: Constitution v3.0.0 → spec.md → plan.md → research.md → this file
> No task may introduce planner-drift, backlog UI, mode selectors, synthetic success, or cloud sync.

---

## Phase 1: Setup (Existing Codebase Audit)

**Purpose**: Verify baseline before modifying existing source files. No new code written in this phase.

- [x] T001 Constitution v3.0.0 compliance review — confirm `src/` baseline has no planner-drift, no browsable backlog, no generic chat loop before beginning vNext work
- [x] T002 Confirm `specs/005-mind-full-prd` is untouched and `specs/006-mind-vnext-prd/` is the sole write target for vNext work
- [x] T003 [P] Read and internalize `specs/006-mind-vnext-prd/plan.md` — note Phase 1 dependency order: `idb.ts → ollama-runtime.ts → health/route.ts → ai/route.ts → Fallback.tsx → page.tsx`
- [x] T004 [P] Read and internalize `specs/006-mind-vnext-prd/contracts/ai-contract.md` — note success schema, failure schema, output hierarchy rule (action > summary > reply draft), and blocker detection rules
- [x] T005 [P] Read and internalize `specs/006-mind-vnext-prd/data-model.md` — note all vNext entity extensions and persistence rules
- [x] T006 Verify dev server is running (`npm run dev`) and app loads at `localhost:3000` without errors

**Checkpoint**: Codebase understood, no changes made, all specs internalized.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure changes that all user story work depends on. Must be completed before any Phase 3+ work.

**⚠️ CRITICAL**: No user story tasks may begin until this entire phase is complete.

- [x] T007 Add `AiFailureReason` type union and `ActiveDumpContext` interface to `src/lib/store/idb.ts` — add `AiFailureReason = 'service_down' | 'model_missing' | 'runtime_boot_failed' | 'metal_init_failed' | 'request_timeout' | 'unknown'` and `ActiveDumpContext { text: string; createdAt: number; lastAttemptAt?: number; lastFailureReason?: AiFailureReason }`
- [x] T008 Promote `activeDumpContext` in the `AppSession` interface in `src/lib/store/idb.ts` from `string | undefined` to `ActiveDumpContext | undefined`, and add `lastWorkflowType?: 'client_response' | 'client_resume'` and `lastFailureReason?: AiFailureReason` to `AppSession`
- [x] T009 Add load-time migration shim in `src/lib/store/idb.ts` inside `getSession()`: if stored `activeDumpContext` is a plain `string`, wrap it as `{ text: storedValue, createdAt: session.lastActive }` before returning — must be idempotent
- [x] T010 Add vNext optional fields to the `Action` interface in `src/lib/store/idb.ts`: `workflowType?: 'client_response' | 'client_resume'`, `situationSummary?: string`, `replyDraft?: string`, `detectedBlockers?: string[]`
- [x] T011 Export `AiFailureReason` and `ActiveDumpContext` types from `src/lib/store/idb.ts` so they can be imported by route files, components, and `page.tsx`
- [x] T012 Define `AiHealthResult` interface in `src/lib/ai/ollama-runtime.ts`: `{ status: 'ready' | 'checking' | 'unavailable' | 'model_missing'; model: string; reason?: string; detail?: string; retryable: boolean; actions?: string[] }`
- [x] T013 Update `getAiHealth()` in `src/lib/ai/ollama-runtime.ts` to return `AiHealthResult` — map each status to: `ready` → `{ retryable: true }`; `checking` → `{ reason: 'กำลังโหลดโมเดล...', retryable: true }`; `model_missing` → `{ reason: 'ไม่พบโมเดลในเครื่อง', retryable: false, actions: ['ollama pull qwen2.5:3b'] }`; `unavailable` → `{ reason: 'Ollama ไม่พร้อมใช้งาน', retryable: true, actions: ['ollama serve'] }`
- [x] T014 Export `AiHealthResult` type from `src/lib/ai/ollama-runtime.ts`

**Checkpoint**: IDB types extended, health result type enriched, migration shim in place. `npm run dev` still loads without TypeScript errors.

---

## Phase 3: User Story 1 — Honest Ollama Recovery Flow (Priority: P1) 🎯 MVP

**Goal**: Remove synthetic success. When Ollama fails, return a structured error. Preserve dump context for retry. Show retry-first recovery panel with honest failure reason.

**User Stories covered**: FR-008, FR-009, FR-010, FR-011 (spec.md §9); Workflow Support: Honest Recovery (spec.md §5)

**Independent Test**: Disable Ollama while app is running → submit dump → verify `MANUAL_FALLBACK` state is entered showing an honest Thai failure message and a prominent "Retry AI" button. Re-enable Ollama → click Retry → verify silent transition to `ONE_ACTION` with no success animation. Verify original dump text was never re-requested from the user.

### Implementation for User Story 1

- [x] T015 [US1] Update `src/app/api/ai/health/route.ts` — no logic change needed; confirm the route still delegates directly to `getAiHealth()` and returns the full `AiHealthResult` shape (which now includes `reason`, `detail`, `retryable`, `actions` after T013)
- [x] T016 [US1] Remove the automatic `synthesizeLocally()` fallback from `src/app/api/ai/route.ts` (lines approx. 180–193) — delete the silent local synthesis path and the import of `synthesizeLocally` from this file
- [x] T017 [US1] Add structured Ollama-unavailable failure response in `src/app/api/ai/route.ts`: when all model candidates fail with endpoint errors, return `NextResponse.json({ ok: false, error: { type: 'ollama_unavailable', reason: lastEndpointReason ? 'service_down' : 'unknown', message: 'ไม่สามารถเชื่อมต่อ Ollama ได้ในขณะนี้', detail: lastEndpointReason ?? lastValidationReason, retryable: true, actions: ['ollama serve', 'ollama pull qwen2.5:3b'] } }, { status: 503 })`
- [x] T018 [US1] Add structured validation-failure response in `src/app/api/ai/route.ts`: when all models produced parseable JSON that fails Zod validation, return `NextResponse.json({ ok: false, error: { type: 'validation_failed', reason: 'unknown', message: 'โมเดลตอบกลับในรูปแบบที่ไม่ถูกต้อง', detail: lastValidationReason, retryable: true } }, { status: 422 })`
- [x] T019 [US1] Add session hydration migration in `src/app/page.tsx` `load()` function: after calling `getSession()`, check if `session.activeDumpContext` is a string (legacy) and if so replace it with `{ text: session.activeDumpContext, createdAt: session.lastActive }` before setting state — call `saveSession()` with the migrated session
- [x] T020 [US1] Update synthesis failure handler in `src/app/page.tsx`: when `POST /api/ai` returns non-2xx or response body has `ok: false`, extract `error.reason` as `AiFailureReason`, write to `session.activeDumpContext.lastFailureReason` and `session.lastFailureReason`, then `saveSession()` and transition to `MANUAL_FALLBACK`
- [x] T021 [US1] Update Retry handler in `src/app/page.tsx`: when `page.tsx` handles the retry action from `Fallback.tsx`, re-submit `session.activeDumpContext.text` to `POST /api/ai` (do NOT re-prompt user); update `activeDumpContext.lastAttemptAt = Date.now()` before each retry; on success → clear `lastFailureReason` from `activeDumpContext`, save session, transition to `ONE_ACTION`; on failure → update `lastFailureReason` and stay in `MANUAL_FALLBACK`
- [x] T022 [US1] Remove any code paths in `src/app/page.tsx` that treat `meta.source === 'local_fallback'` as a successful synthesis result — the local synthesis fallback path must no longer exist in the happy path
- [x] T023 [US1] Restructure `src/components/BrainDump/Fallback.tsx` layout: put "Retry AI" button as primary CTA at top (full-width, primary color), add a horizontal rule separator, then "Continue Manually" as secondary path below (smaller, subdued styling); remove any visual parity between the two options
- [x] T024 [US1] Add failure reason display in `src/components/BrainDump/Fallback.tsx`: read `lastFailureReason` from props (passed from `page.tsx`); map to Thai label using: `service_down → 'Ollama ไม่ได้เปิดอยู่ในขณะนี้'`, `model_missing → 'ยังไม่ได้ติดตั้งโมเดล'`, `runtime_boot_failed → 'โมเดลโหลดไม่สำเร็จ'`, `metal_init_failed → 'GPU ไม่พร้อม — ลองเปิด Ollama ใหม่'`, `request_timeout → 'ใช้เวลานานเกินไป — Ollama อาจยังกำลังโหลด'`, `unknown → 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'`; display above the Retry button in muted text
- [x] T025 [US1] Add suggested actions display in `src/components/BrainDump/Fallback.tsx`: if `actions` array is provided (from the failure response), render them in a small collapsed `<details>` block with Thai label "วิธีแก้ที่แนะนำ" containing the CLI commands in a `<code>` element; do not show by default (collapsed)
- [x] T026 [US1] Pass required props to `ManualFallback` / `Fallback` component from `src/app/page.tsx`: `lastFailureReason`, `suggestedActions`, `onRetry`, `onManualContinue` — ensure `activeDumpContext.text` is never re-rendered into user-visible dump input during retry
- [x] T027 [US1] Verify no success animation exists after retry succeeds in `src/app/page.tsx` and `src/components/ActionScaffold/OneAction.tsx` — transition must be instant and silent

**Checkpoint**: Phase 3 complete. With Ollama offline, dump → honest retry panel (service_down label). Re-enable Ollama → retry → silent ONE_ACTION. No local synthesis output shown as AI. `npm run dev` builds without TypeScript errors.

---

## Phase 4: User Story 2 — Client Response & Resume AI Intelligence (Priority: P2)

**Goal**: Enable auto-classified workflow output (client_response vs client_resume), situation summary, reply draft for client_response, blocker detection, and vNext action persistence — all while keeping one next action as the primary output.

**User Stories covered**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-012 (spec.md §9); Workflow 1: Client Response, Workflow 2: Client Project Resume (spec.md §5)

**Independent Test**: Paste a real client email feedback → verify `workflow_type = client_response`, `situation_summary` present, `reply_draft` present and rendered below action card, action card is visually dominant. Paste stale project notes → verify `workflow_type = client_resume`, no `reply_draft` rendered, `situation_summary` present, action card dominant. Paste dump with "รอลูกค้าส่งไฟล์" → verify `detected_blockers` non-empty and action addresses the blocker.

### Implementation for User Story 2

- [x] T028 [P] [US2] Extend `AiSynthesisResponseSchema` in `src/lib/ai/schema.ts` with optional vNext fields: `workflow_type: z.enum(['client_response', 'client_resume']).optional()`, `situation_summary: z.string().optional()`, `reply_draft: z.string().nullable().optional()`, `detected_blockers: z.array(z.string()).optional()` — all existing required fields (`requires_clarification`, `recommended_action`, `alternative_actions`) must remain unchanged and required
- [x] T029 [US2] Replace `SYSTEM_PROMPT` in `src/lib/ai/prompts.ts` with the vNext version that: (1) auto-classifies input as `client_response` or `client_resume` based on content signals (client feedback/email language → response; stale notes/project fragments → resume); (2) always produces `situation_summary` (≤ 3 sentences); (3) produces `reply_draft` only for `client_response`, absent or null for `client_resume`; (4) detects blockers and forces `recommended_action` to address the blocker first; (5) is limited to max 1 clarification question total; (6) includes the updated JSON schema in the prompt with all vNext fields; (7) keeps all Thai language, physical ≤5-minute action rules, and quality constraints from the existing prompt
- [x] T030 [US2] Confirm `src/app/api/ai/route.ts` passes through the vNext schema fields without modification — Zod schema extension in T028 is additive so no route logic change is required, but verify the route does not strip or ignore optional fields from the validated payload before returning `NextResponse.json(validated)`
- [x] T031 [P] [US2] Add optional vNext fields to action creation in `src/app/page.tsx`: when `createAction()` or equivalent builds a new `Action` from synthesis response, populate `workflowType` from `payload.workflow_type`, `situationSummary` from `payload.situation_summary`, `replyDraft` from `payload.reply_draft ?? undefined`, `detectedBlockers` from `payload.detected_blockers ?? []`; call `saveAction()` with the enriched record
- [x] T032 [US2] Add conditional `situation_summary` rendering in `src/components/ActionScaffold/OneAction.tsx`: render `situationSummary` string from the current `Action` record **below** the action card and CTA button, in a `<section>` with muted color, `font-size: 0.85rem`, `font-weight: 400`; do not render this section if `situationSummary` is absent or empty; auto-expand after 2 seconds of idle using a `setTimeout` with a collapsed-by-default CSS class toggle
- [x] T033 [US2] Add conditional `reply_draft` rendering in `src/components/ActionScaffold/OneAction.tsx`: render `replyDraft` from the current `Action` record **only when** `workflowType === 'client_response'` AND `replyDraft` is non-empty; place it as a `<textarea>` below the `situation_summary` block; pre-fill with the reply draft text; mark it `readOnly={false}` (user may edit); add a "Copy ↗" button that calls `navigator.clipboard.writeText(replyDraft)` with fallback to `select + execCommand('copy')`; never render above or alongside the action card
- [x] T034 [US2] Enforce visual hierarchy in `src/app/globals.css` (or inline styles in OneAction.tsx): action card must have highest visual weight (`font-size: 1.25rem, font-weight: 600, high contrast`); `situation_summary` block must be visually subordinate (`font-size: 0.85rem, muted color`); `reply_draft` textarea must be visually subordinate (`font-size: 0.9rem, secondary border color`); add guard comment in component: `{/* HIERARCHY RULE: action card must always render first — do not reorder */}`

**Checkpoint**: Phase 4 complete. Client email → 3 outputs with action card dominant. Stale notes → 2 outputs, no reply draft. Blocker dump → action addresses blocker. Visual hierarchy confirmed in browser.

---

## Phase 5: User Story 3 — Telemetry & Pattern Memory (Priority: P2)

**Goal**: Add vNext telemetry events, wire them to the state machine, and implement memory-only lightweight pattern accumulator (zero UI surface, zero IDB persistence).

**User Stories covered**: FR-012 (spec.md §9); Telemetry & Success Metrics (spec.md §13)

**Independent Test**: Open browser console → submit client email dump → verify console logs include `workflow_classified`, `client_response_submitted`, `action_shown` events. Click Copy on reply draft → verify `reply_draft_copied` logged. Dump with rออ-blocker → verify `blocker_detected` logged. Complete action (Done) → verify `active_context_preserved` not logged (context was consumed). Retry after Ollama failure → verify `recovery_retry_shown` logged on panel mount, `retry_clicked` logged on button press.

### Implementation for User Story 3

- [x] T035 [P] [US3] Add 9 new events to `EventName` union in `src/lib/instrumentation.ts`: `'client_response_submitted'`, `'client_resume_submitted'`, `'reply_draft_copied'`, `'blocker_detected'`, `'blocker_addressed'`, `'workflow_classified'`, `'recovery_retry_shown'`, `'recovery_manual_chosen'`, `'active_context_preserved'`
- [x] T036 [US3] Wire workflow telemetry in `src/app/page.tsx` after successful synthesis: emit `trackEvent('workflow_classified', { workflow_type })`, then emit `trackEvent('client_response_submitted')` if `workflow_type === 'client_response'` or `trackEvent('client_resume_submitted')` if `workflow_type === 'client_resume'`
- [x] T037 [US3] Wire blocker telemetry in `src/app/page.tsx` after action creation: if `payload.detected_blockers?.length > 0`, emit `trackEvent('blocker_detected', { count: payload.detected_blockers.length })`; if `payload.recommended_action.title` contains any of the detected blocker keywords, emit `trackEvent('blocker_addressed')`
- [x] T038 [US3] Wire recovery telemetry in `src/components/BrainDump/Fallback.tsx`: emit `trackEvent('recovery_retry_shown')` on component mount (`useEffect` with empty deps); emit `trackEvent('retry_clicked')` on Retry button click; emit `trackEvent('recovery_manual_chosen')` when user selects manual path
- [x] T039 [US3] Wire copy telemetry in `src/components/ActionScaffold/OneAction.tsx`: emit `trackEvent('reply_draft_copied')` when the Copy button is clicked and clipboard write succeeds
- [x] T040 [US3] Wire context preservation telemetry in `src/app/page.tsx`: if synthesis succeeds AND `session.activeDumpContext` was non-null (i.e., this was a retry from a preserved context), emit `trackEvent('active_context_preserved')` before clearing the context
- [x] T041 [US3] Implement memory-only pattern accumulator in `src/app/page.tsx`: add a module-level (not component-state) `let sessionWorkflowHistory: Array<'client_response' | 'client_resume'> = []`; after each successful classification, push `workflow_type` to this array (cap at last 5); before submitting dump to `POST /api/ai`, check if `sessionWorkflowHistory.length >= 3` and the last 3 are the same type, then append a single hint line to the dump string (e.g., `'\n\n(บริบท: ผู้ใช้มักทำงานประเภท client_response ใน session นี้)'`); this must NOT be stored in IDB, NOT shown in UI, and NOT affect the user-visible dump input value

**Checkpoint**: Phase 5 complete. All 9 events emit in console during relevant flows. No new UI surface for pattern memory. Pattern hint appended to outgoing dump payload only (not visible to user).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, privacy audit, and final quality pass across all stories.

- [x] T042 [P] Privacy audit — verify no `fetch()` call in synthesis or health path targets any external URL; verify `dump` text is never logged via `console.log` in `route.ts`; verify no IDB keys store client data beyond `mind_session` and `mind_actions`
- [x] T043 [P] Export/delete-all coverage — verify `exportAllData()` in `src/lib/store/idb.ts` includes all vNext Action fields (`workflowType`, `situationSummary`, `replyDraft`, `detectedBlockers`) in the export payload; verify `clearAllData()` still clears all keys completely
- [x] T044 Run all 14 quickstart smoke tests from `specs/006-mind-vnext-prd/quickstart.md` manually and fix any failures
- [x] T045 [P] Constitution drift guard — manually verify: no UI element asks user to choose client_response vs client_resume before submitting dump; no list of past client interactions is browsable; no date/deadline fields anywhere in the UI; no streak, badge, or counter shown after action completion
- [x] T046 TypeScript compile check — run `npx tsc --noEmit` in `/Users/ark1/Public/MIND` and fix all type errors introduced by vNext changes
- [x] T047 [P] UI hierarchy final review — open app in browser, submit a client email dump, and visually confirm: action card is largest and rendered first; situation summary is smaller/muted and below; reply draft textarea is below summary; no competing hero elements
- [x] T048 Silent completion loop verification — complete an action (click Done from SCAFFOLD) and verify immediate return to `DUMP_ENTRY` with no animation, no celebration, no sound, no delay
- [x] T049 Update `specs/006-mind-vnext-prd/checklists/requirements.md` — mark completed items, note any items deferred to a later phase

Note on `T044` as of 2026-04-07: official `Ollama.app` runtime on this Apple M5 machine now boots and serves both `llama3.2:1b` and `qwen2.5:3b`, `/api/ai/health` returns `ready` with `qwen2.5:3b`, canonical `client_resume` now succeeds on qwen primary, and canonical `client_response` now succeeds through the qwen repair layer without falling through to llama. Browser hierarchy review (`T047`), silent completion (`T048`), honest recovery validation, `npx tsc --noEmit`, `npm run lint`, and `npm run build` are all green, so the quickstart smoke gate is now closed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately, no code changes
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 — Recovery Flow)**: Depends on Phase 2 — can start as soon as Foundational is complete
- **Phase 4 (US2 — AI Intelligence)**: Depends on Phase 2 — can start in parallel with Phase 3, but `OneAction.tsx` changes (T032, T033) must come after `idb.ts` Action fields (T010)
- **Phase 5 (US3 — Telemetry)**: Depends on Phase 3 and Phase 4 — all events depend on the workflows they instrument being implemented first
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5 all being complete

### User Story Dependencies

| Story | Blocked By | Can Parallelize With |
|---|---|---|
| US1 — Honest Recovery | Phase 2 complete | US2 (different files, T028 is [P]) |
| US2 — AI Intelligence | Phase 2 complete; T010 (Action fields) | US1 (different files mostly) |
| US3 — Telemetry | US1 complete (retry events); US2 complete (workflow events) | T035 is [P] — event types can be added early |

### Within Each Phase

- Foundational tasks T007–T014 must execute in order (each depends on the previous)
- Within Phase 3: T015 → T016 → T017 → T018 (route changes in order) → T019 → T020 → T021 → T022 (page.tsx in order) → T023 → T024 → T025 → T026 → T027 (Fallback in order)
- Within Phase 4: T028 [P] and T031 [P] can start as soon as Phase 2 is done; T029 depends on T028; T030 depends on T029; T032, T033, T034 depend on T031
- Within Phase 5: T035 [P] can be done anytime after Phase 2; T036–T040 depend on US1 and US2 being implemented; T041 depends on Phase 4

### Parallel Opportunities

```bash
# Phase 2 — run all in strict order (each depends on previous)
T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014

# Phase 3 vs Phase 4 — partial parallel (different primary files)
[Phase 3 route changes: T015-T018]  ← parallel with →  [T028 schema.ts]
[Phase 3 page.tsx: T019-T022]       ← then: T029 prompts.ts →
[Phase 3 Fallback.tsx: T023-T027]   ← parallel with →  [T031 page.tsx vNext action creation]

# Phase 5 — T035 can start early
T035 (add EventName types) ← add anytime after Phase 2
T036-T041 ← after Phases 3 & 4
```

---

## Parallel Example: User Story 1 (Recovery Flow)

```bash
# Start Phase 2 foundational block first (sequential, 8 tasks)
# Then begin US1 + US2 in parallel:

# Terminal A — US1 route changes
Task T015: health/route.ts — confirm shape passthrough
Task T016: ai/route.ts — remove synthesizeLocally fallback
Task T017: ai/route.ts — add 503 structured error
Task T018: ai/route.ts — add 422 validation error

# Terminal B (parallel) — US2 schema
Task T028: schema.ts — extend Zod with vNext optional fields

# After T015-T018 done → page.tsx recovery wiring:
Task T019: page.tsx — migration shim
Task T020: page.tsx — synthesis failure handler
Task T021: page.tsx — retry handler
Task T022: page.tsx — remove local fallback path

# After T028 done → prompts.ts:
Task T029: prompts.ts — vNext system prompt

# After page.tsx done → Fallback.tsx:
Task T023-T027: Fallback.tsx — retry-first layout, failure reason, actions
```

---

## Implementation Strategy

### MVP First (US1 Only — Phase 3)

1. Complete Phase 1: Setup (no code changes)
2. Complete Phase 2: Foundational `idb.ts` + `ollama-runtime.ts` type extensions (T007–T014)
3. Complete Phase 3: Honest Ollama Recovery Flow (T015–T027)
4. **STOP and VALIDATE**: Disable Ollama → dump → verify honest recovery → re-enable → retry → verify ONE_ACTION
5. This MVP alone satisfies FR-008, FR-009, FR-010, FR-011

### Incremental Delivery

1. Setup + Foundational → baseline types stable
2. US1 (Phase 3) → honest recovery validated → demo-able
3. US2 (Phase 4) → client intelligence added → client workflows validated
4. US3 (Phase 5) → telemetry wired → metrics traceable
5. Polish (Phase 6) → privacy, hierarchy, drift audited

### Anti-Drift Checklist (check before each task)

Before implementing any task, verify the change does NOT:
- [ ] Add a UI element that lets users choose `client_response` vs `client_resume` mode
- [ ] Display `reply_draft` or `situation_summary` above or at the same level as the action card
- [ ] Call `synthesizeLocally()` silently and return the result as if AI produced it
- [ ] Add any date, deadline, or calendar field to any interface or component
- [ ] Create a browsable list of past client interactions
- [ ] Add any streak, badge, or success animation
- [ ] Make any `fetch()` call to a non-localhost URL
- [ ] Add a new `SessionStatus` for client_response or client_resume (workflow differentiation lives in `workflow_type` field, not new states)

---

## Task Summary

| Phase | Tasks | Parallelizable | Blocking |
|---|---|---|---|
| Phase 1: Setup | T001–T006 | T003, T004, T005, T006 | Must complete before any code |
| Phase 2: Foundational | T007–T014 | None (sequential chain) | Blocks all user stories |
| Phase 3: US1 Recovery | T015–T027 | T015 only | Blocks Phase 6 |
| Phase 4: US2 Intelligence | T028–T034 | T028, T031 | Blocks Phase 5 telemetry |
| Phase 5: US3 Telemetry | T035–T041 | T035 | Depends on US1 + US2 |
| Phase 6: Polish | T042–T049 | T042, T043, T045, T046, T047 | Final gate |

**Total tasks**: 49
**Parallelizable tasks**: 16 (marked [P])
**Critical path**: T007 → T008 → T009 → T010 → T012 → T013 → T016 → T017 → T020 → T021 → T029 → T031 → T032 → T033 → T036 → T044

**MVP scope**: Phases 1–3 only (T001–T027) — delivers honest Ollama recovery without any synthetic success, as a self-contained, independently testable milestone.
