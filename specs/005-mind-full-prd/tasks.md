# Tasks: MIND Full PRD (005-mind-full-prd)

> [ARCHIVAL] This task list describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

**Input**: `specs/005-mind-full-prd/` — plan.md, spec.md, research.md, data-model.md, contracts/ai-contract.md, quickstart.md, checklists/implementation-readiness.md
**Stack**: Next.js 16 (App Router), React 19, TypeScript 5, idb-keyval 6, Zod 4, Vanilla CSS
**Hypotheses**: H1 (One trusted action), H2 (Start Scaffold), H3 (Rescue/Bounce-back), H4 (Overview trust), H5 (Local-first trust), H6 (AI explainability), H7 (Morning Ritual), H8 (Safe extension), H9 (Silent loop momentum), H10 (Cheap rejection rotation), H11 (ManualFallback retry momentum), H12 (Passive AI feedback)

---

## Phase 1: App Shell and State-Machine Extension
**Story Goal**: Extend current single-route state machine without a new route structure.
**Test Criteria**: All new states render and handle transitions correctly.

- [x] T001 Audit `src/app/page.tsx` — document all current state machine branches and confirm zero dead states
- [x] T002 Verify `npm run build` passes with zero type errors on current codebase
- [x] T003 Extend `SessionStatus` type in `src/lib/store/idb.ts` to add `'MORNING_RITUAL'` and `'CLARIFICATION'`
- [x] T004 Extend `AppSession` interface in `src/lib/store/idb.ts` to add `lastMorningShown?: string` and `hasSeenResetNotice?: boolean`
- [x] T005 [P] Implement `BOUNCE_BACK` intercept in the `useEffect` load hook of `page.tsx`
- [x] T006 [P] Add `CLARIFICATION` state handler to `page.tsx` switch to render `<Clarification>`
- [x] T007 [P] Confirm mobile viewport renders correctly (375px width, no horizontal scroll) in `src/app/layout.tsx`

---

## Phase 2: Dump-First Flow and One-Action Engine
**Story Goal**: Reduce decision paralysis by converting dump to one trusted physical action.
**Test Criteria**: Submitting a dump produces exactly one action and rationalized micro-steps.

- [x] T000 [P] Final Constitution v3.0.0 compliance review
    - Ensure no browsable backlog or "task list management" logic.
    - Confirm recovery flows (rescue/bounce-back) are prioritized in design.
    - Verify all artifacts (spec, plan, contract) are aligned to MIND v3.0.0.
- [x] T008 [US1] Create `src/components/Recovery/Clarification.tsx` with single-question nudge and confirm input
- [x] T009 [US1] Update `handleDump()` in `page.tsx` to handle `parsed.data.requires_clarification === true`
- [x] T010 [US1] Ensure `OneAction.tsx` ALWAYS renders the rationale from the AI contract for explainability (H6)
- [x] T011 [US1] Bind dump submission in `page.tsx` to fire `synthesis_started` and transition to `ONE_ACTION`
- [x] T012 [US1] Verify `handleDump()` resets the textarea only after successful submission confirmation

---

## Phase 3: Start Scaffold and Controlled Rejection Rotation
**Story Goal**: Help users start faster than a plain recommendation while keeping rejection "cheap".
**Test Criteria**: "Not this" rotates local alternatives instantly; "Done" resets silently.

- [x] T013 [US2] Update "Not this" handler in `page.tsx`: Rotate the first alternative from `session.currentPayload.alternative_actions` locally. No network call.
- [x] T014 [US2] Persist mutated alternatives array and rotation index in `saveSession()` to ensure rotation survives refresh
- [x] T015 [US2] Update "Done" handler in `Scaffold.tsx`: Trigger immediate and silent transition to `DUMP_ENTRY`. No celebration. (H9)
- [x] T016 [US2] Verify `Scaffold.tsx` contains NO timers, tracking badges, or planner-like metadata
- [x] T017 [US2] Implement Pin/Unpin control on the active action surface with **hard UI cap of 3**; disable Pin button and show "Max 3 pinned items" cue if limit reached. Persist in `src/lib/store/idb.ts`.

---

## Phase 4: Rescue, Bounce-Back, and Manual Fallback
**Story Goal**: Reduce shame and improve re-entry via non-shaming recovery states.
**Test Criteria**: States trigger correctly based on inactivity or AI failure without guilt framing.

- [x] T018 [US3] Create `src/components/Recovery/BounceBack.tsx` with "Continue" vs "Start Fresh" buttons and zero elapsed-time text
- [x] T019 [US3] Create `src/components/Recovery/Rescue.tsx` with "Make it smaller" or "Walk away" recovery options
- [x] T020 [US3] Create `src/components/BrainDump/ManualFallback.tsx` to intercept synthesis errors or Ollama offline state
- [x] T021 [US3] Implement `handleManualRescue()` in `page.tsx` to bypass AI and generate generic physical micro-steps locally
- [x] T022 [US3] Ensure `BounceBack.tsx` only offers "Continue" if a valid previous action exists in `AppSession`

---

## Phase 5: Minimal Overview and Trust Triad
**Story Goal**: Increase trust without causing backlog browsing via read-only, capped surfaces.
**Test Criteria**: Overview shows only current and pinned items; Trust overlay handles data safely.

- [x] T023 [US4] Create `src/components/Overview/OverviewOverlay.tsx` — read-only list of current action + max 3 pinned items
- [x] T024 [US4] Add `showOverview` state and trigger button to app shell; must not allow editing or list-browsing
- [x] T025 [US4] Create `src/components/Trust/TrustOverlay.tsx` with rationale visibility and Triad controls
- [x] T026 [US4] Verify `ArchiveSearch.tsx` results appear only after query entry (Search-only archive rule)

---

## Phase 6: Morning Ritual
**Story Goal**: Improve retention without turning the app into a planner.
**Test Criteria**: Ritual shows once per day on first load and is skippable.

- [x] T027 [US5] Create `src/components/Ritual/MorningRitual.tsx` — lightweight greeting and "Start my day" trigger
- [x] T028 [US5] Implement `lastMorningShown` day-string check in `page.tsx` load hook; transition to `MORNING_RITUAL` if first load
- [x] T029 [US5] Ensure Morning Ritual is lightweight, in-app only, and uses local timezone comparisons

---

## Phase 7: Weekly reset, archive search-only, and pinned items
**Story Goal**: Drop debt automatically while allowing essential items to survive.
**Test Criteria**: Weekly sweep archives non-pinned items and flags the reset notice.

- [x] T030 [US6] Add `getArchivedActions()` to `src/lib/store/idb.ts` filter by `state === 'ARCHIVED'`
- [x] T031 [US6] Update `processWeeklySweep()` in `memoryRules.ts` to archive non-pinned items and set `hasSeenResetNotice = false`
- [x] T032 [US6] Add dismissal banner to `DUMP_ENTRY` state when `hasSeenResetNotice === false`

---

## Phase 8: AI Adapter, Schema Validation, and Fallback Handling
**Story Goal**: Ensure AI contract is resilient and handles connection failures cleanly.
**Test Criteria**: Zod schema validation enforces strict physical action bar; 1-turn retry on parse failure.

- [x] T033 [US7] Sync `src/lib/ai/schema.ts` with `contracts/ai-contract.md` specifically for `alternative_actions` shape
- [x] T034 [US7] Implement Zod validation in `src/app/api/ai/route.ts` with 1-turn retry on JSON parse failure
- [x] T035 [US7] Configure `route.ts` to immediately trip Manual Fallback on 503, 404, or ConnectionRefused
- [x] T036 [US7] Enforce `format: "json"`, `temperature: 0.1`, and `max_tokens: 300` in the Ollama request body

---

## Phase 9: Local-first storage, JSON export, and Delete All Local Data
**Story Goal**: Prevent trust collapse via full data sovereignty.
**Test Criteria**: Export produces valid JSON; Delete All resets all IDB keys and state.

- [x] T037 Add `exportAllData(): Promise<MindExport>` to `src/lib/store/idb.ts`
- [x] T038 Add `clearAllData(): Promise<void>` to `src/lib/store/idb.ts` to wipe both session and action keys
- [x] T039 Wire Export button in `TrustOverlay.tsx` to trigger `.json` browser download
- [x] T040 Wire Delete button in `TrustOverlay.tsx` to trigger immediate IDB wipe and page reset

---

## Phase 10: AI runtime strategy for local Ollama models
**Story Goal**: Zero recurring model cost and local/offline resilience in MVP.
**Test Criteria**: API proxies requests to `http://localhost:11434/api/chat`.

- [x] T041 [US7] Configure `src/app/api/ai/route.ts` to proxy requests to the local Ollama endpoint
- [x] T042 [US7] Implement 12-second timeout in `route.ts` for local inference headroom
- [x] T043 [US7] Add background health check logic in `src/lib/ai/adapter.ts` to ping Ollama on load

---

## Phase 11: Model selection and fallback hierarchy
**Story Goal**: Fast iteration and quality on varied local hardware.
**Test Criteria**: Model hierarchy correctly selects available model or falls back gracefully.

- [x] T044 [US7] Implement model priority logic: `qwen2.5:3b` -> `qwen3:4b-instruct` -> `gemma3n:e2b`
- [x] T045 [US7] Update system prompt in `src/lib/ai/prompts.ts` to mandate physical actions (completable in 5m)

---

## Phase 12: Passive AI status indicator
**Story Goal**: Inform without interrupting the momentum flow.
**Test Criteria**: Indicator is non-clickable, awareness-only, and accurately reflects health check.

- [x] T046 [P] Build `aiStatus` state in `page.tsx` fed by background health check
- [x] T047 [P] Create header status UI in app shell (Green/Grey/Amber) as defined in `plan.md`
- [x] T048 [P] Verify status indicator is Strictly non-clickable and does not trigger setup routes

---

## Phase 13: ManualFallback inline Retry AI flow
**Story Goal**: Preserve momentum without re-entry or success theatrics on failure.
**Test Criteria**: Retry occurs inline with spinner; success jump is immediate and silent.

- [x] T049 [US3] Add "Retry AI" button to `ManualFallback.tsx`, disabled unless `aiStatus === 'ready'`
- [x] T050 [US3] Implement inline loading state in `ManualFallback.tsx` during retry session
- [x] T051 [US3] Bind Retry to reuse persistent `activeDumpContext` from `AppSession`
- [x] T052 [US3] Ensure successful retry transitions IMMEDIATELY and SILENTLY to `ONE_ACTION` or `SCAFFOLD`.
    - **CRITICAL**: No checkmarks, no success animations, no transient success screens or success-state theatrics.
- [x] T053 [US3] Verify manual input path remains enabled and usable if retry fails again

---

## Phase 14: Metrics, telemetry, and beta validation
**Story Goal**: Prove product hypotheses via specific event tracking.
**Test Criteria**: All specified events fire with correct metadata.

- [x] T054 [P] Bind `scaffold_completed` emit to the "Done" handler in `Scaffold.tsx` (Hypothesis H9)
- [x] T055 [P] Implement `retry_clicked`, `retry_success`, and `retry_failed` telemetry in `ManualFallback`
- [x] T056 [P] Implement `healthcheck_passed`, `ollama_unavailable`, and `model_missing` readiness events
- [x] T057 [P] Implement `time_to_action_ms` tracking from dump start to `SCAFFOLD` entry

---

## Phase 15: Tests and QA (Emotional Safety & Momentum)
**Story Goal**: Guarantee compliance with momentum-first and non-shaming rules.
**Test Criteria**: QA suite passes all boundary condition checks.

- [x] T058 Validate Rejection Rotate: Submit dump → receive action → tap "Not this" → verify instant local swap
- [x] T059 Validate Silent Loop: Tap "Done" → verify immediate return to DUMP_ENTRY with NO celebration
- [x] T060 Validate Retry UX: Fail AI → Retry in ManualFallback → verify inline spinner and no success theatrics
- [x] T061 Validate Passive Status: Verify indicator is non-clickable and awareness-only
- [x] T062 Validate 5-Minute Prompt: Test AI against vague dumps to ensure specific physical next steps

---

## Dependencies & Strategy

### Execution Hierarchy
- **Groups 1, 8, 10, 11** are Foundational blocks for the local-first architecture.
- **Groups 2, 3, 13** are P1 MVP critical for the core momentum loop.
- **Groups 12, 14, 15** provide the validation layer for the beta phase.

### Implementation Strategy
Start with the App Shell and Ollama Proxy (Phases 1, 10) to establish the local health-check loop. Move to the One-Action engine (Phase 2, 8) to prove the physical-action hypothesis. Then layer the ManualFallback retry (Phase 4, 13) and Rejection rotation (Phase 3) to harden the momentum.
