# Implementation Tasks: 004-core-prd

**Branch**: `004-core-prd`
**Focus**: Proving the "Start-and-Recovery" hypothesis strictly on low-cost open-weight AI.

---

## Phase 1: Foundation and Instrumentation

**Goal**: Establish the app structure, IndexedDB storage, and strict tracking events.
**Hypothesis Supported**: The 50-user closed beta can validate behavior and keep AI cost low.
**MVP Critical**: Yes.

- [ ] T001 [Setup] Initialize Next.js App Router project and clean boilerplate in `src/app/`
  - *Deliverable*: Running blank Next.js App Router shell.
  - *Verification*: `npm run dev` boots successfully.
- [ ] T002 [Setup] Install `idb-keyval` and configure local memory store in `src/lib/store/idb.ts`
  - *Deliverable*: Exact getter/setter utilities for `AppSession` and `Action`.
- [ ] T003 [P] [Setup] Configure generic frontend analytics interceptor for required events in `src/lib/instrumentation.ts`
  - *Deliverable*: Hook `useTrackEvent` mapping to local console or lightweight beta analytics sink. Ensure `app_launch` fires.
- [ ] T004 [Setup] Implement Global Layout and State Machine Context in `src/app/page.tsx`
  - *Deliverable*: A single unified React Context holding the `AppSession` status logic without multi-route navigation.
  - *Dependencies*: T001, T002.

## Phase 2: Core Dump → One-Action Flow

**Goal**: Prove the core workflow is drastically faster than GTD sorting.
**Hypothesis Supported**: The one-action engine helps overloaded users start faster than list-based tools.
**MVP Critical**: Yes.

- [ ] T005 [US1] Create the minimal Dump-First text entry component in `src/components/BrainDump/Input.tsx`
  - *Deliverable*: Single `textarea` and submit button. Must track `dump_submitted` event.
  - *Dependencies*: T004.
- [ ] T006 [US1] Connect Dump input to `api/ai` Route, handling the loading skeleton and `synthesis_started` / `synthesis_completed` events
  - *Deliverable*: Client-side trigger to transit State Machine to SYNTHESIZING then ONE_ACTION upon JSON payload.
  - *Dependencies*: T005, T018.
- [ ] T007 [US1] Build One-Action Display Component in `src/components/ActionScaffold/OneAction.tsx`
  - *Deliverable*: Display `recommended_action.title` + `rationale`. Log `action_shown`. Includes "Start", "Make it smaller", and "Not this" buttons.
  - *Dependencies*: T006.

## Phase 3: Start Scaffold & Controlled Override

**Goal**: Prevent execution freezing and test friction thresholding.
**Hypothesis Supported**: Start Scaffold makes the first step feel easier and more actionable than a plain suggestion.
**MVP Critical**: Yes.

- [ ] T008 [US3] Implement Start Scaffold view in `src/components/ActionScaffold/Scaffold.tsx`
  - *Deliverable*: Displays `micro_steps[]`, a "Make it smaller" button, and an "I'm stuck" button. Log `scaffold_started` and `action_accepted`.
  - *Dependencies*: T007.
- [ ] T009 [US3] Implement "Make it smaller" prompt override in Scaffold
  - *Deliverable*: Call `/api/ai` to recursively shrink the current micro step in `Scaffold.tsx`.
  - *Dependencies*: T008.
- [ ] T010 [P] [US1] Build Mini Decision Board in `src/components/ActionScaffold/DecisionBoard.tsx`
  - *Deliverable*: Renders up to 3 fallback `alternative_actions` from the payload.
- [ ] T011 [US1] Implement "Not This" override trigger counter in `src/components/ActionScaffold/OneAction.tsx`
  - *Deliverable*: Button logs `action_rejected`. Updates `SessionState.notThisCount`. Pushes to Mini Decision Board if count >= 3.
  - *Dependencies*: T007, T010.

## Phase 4: Rescue, Bounce-Back, and Archive Search

**Goal**: Recover stalled context safely without red-badge punishment.
**Hypothesis Supported**: Rescue and bounce-back make returning feel safe and non-shaming.
**MVP Critical**: Yes.

- [ ] T012 [US2] Implement "I'm Stuck" Rescue trigger in `src/components/Recovery/Rescue.tsx`
  - *Deliverable*: Replaces scaffold with a downgrade option. Logs `rescue_triggered`.
  - *Dependencies*: T008.
- [ ] T013 [US2] Intercept stale sessions on boot in `src/app/page.tsx`
  - *Deliverable*: Check `lastActive`, if > 24h & status is incomplete, render Bounce-Back UI asking "Where are we?". Log `bounce_back_opened`.
  - *Dependencies*: T004.
- [ ] T014 [P] [US2] Build Archive Search Overlay in `src/components/Recovery/ArchiveSearch.tsx`
  - *Deliverable*: A dedicated search text input that queries idb `Archive` items. Strictly no list rendering unless a character is typed. Logs `archive_searched`.

## Phase 5: Weekly Reset and Pinned Evergreen Rules

**Goal**: Prevent GTD-style list hoarding.
**Hypothesis Supported**: Search-only archive plus weekly reset prevents backlog anxiety without becoming a task list.
**MVP Critical**: Yes.

- [ ] T015 [US2] Write Weekly Sweep background script in `src/lib/store/memoryRules.ts`
  - *Deliverable*: Identifies week boundary. Moves unpinned `PENDING`/`IN_PROGRESS` actions to `ARCHIVED` status. Log `weekly_reset_applied`.
  - *Dependencies*: T002.
- [ ] T016 [US2] Implement Pinned Item UI toggle in OneAction / Scaffold views
  - *Deliverable*: Allows setting `is_pinned` parameter. Enforces hard maximum of 3 pinned items per weekly context. Logs `pinned_item_created`.
  - *Dependencies*: T007.

## Phase 6: Emotional-Dump Safety Rail

**Goal**: Ensure users aren't met with robotic responses when anxious.
**Hypothesis Supported**: Emotional-dump handling prevents the app from feeling cold or judgmental.
**MVP Critical**: Yes.

- [ ] T017 [US1] Author System Prompt Validation wrapper for physical grounding in `src/lib/ai/prompts.ts`
  - *Deliverable*: Output constraint that defaults to a tiny physical step (e.g. "Take a breath", "Drink water") if catastrophic emotional distress is detected in the text dump.

## Phase 7: AI Adapter, Schema Validation, and Fallbacks

**Goal**: Create a model-agnostic, zero-shot stable AI backend for open-weight models.
**Hypothesis Supported**: The AI pipeline works reliably with open-weight models and a strict JSON contract.
**MVP Critical**: Yes.

- [ ] T018 [Setup] Implement unified open-weight AI adapter Route in `src/app/api/ai/route.ts`
  - *Deliverable*: Node endpoint that can point via ENV to `localhost:11434` (Ollama) or a compatible remote endpoint. No OpenAI specific SDKs that break with alternative models.
- [ ] T019 [US1] Enforce Zod JSON Validation and 1-Retry Logic in `src/app/api/ai/route.ts`
  - *Deliverable*: If parsing `contracts/ai-synthesis.json` fails, resubmit immediately with formatting instructions. If fails twice, throw JSON Parse Exception. Log `synthesis_failed`.
  - *Dependencies*: T018.
- [ ] T020 [US1] Implement "Manual Sort" Safety Fallback UI in `src/components/BrainDump/Fallback.tsx`
  - *Deliverable*: When `synthesis_failed` is captured by frontend, gracefully prompt user to manually select one next active and bypass the AI cleanly. Log `fallback_manual_sort_shown`.
  - *Dependencies*: T006, T019.
- [ ] T021 [P] [US1] Prevent Archive Summarization in Prompt Context
  - *Deliverable*: Force the backend `src/app/api/ai/route.ts` to strictly disregard `Archive` items, receiving only the immediate dump text block to protect short context windows.

## Phase 8: Beta Validation and Cost Controls

**Goal**: Keep token abuse down to ensure system scale stability.
**Hypothesis Supported**: The 50-user closed beta can validate behavior and keep AI cost low.
**MVP Critical**: Yes.

- [ ] T022 [P] [Setup] Enforce tight model constraints and token caps in `src/app/api/ai/route.ts`
  - *Deliverable*: Hard cap `max_output_tokens` explicitly, restricting models from hallucinating infinitely.
  - *Dependencies*: T018.

## Phase 9: Telemetry Aggregation & Safety Validation

**Goal**: Prove that time-to-start drops, and that safety guardrails hold under stress.
**Hypothesis Supported**: The beta can measure what happened, not just log it locally.
**MVP Critical**: T023, T024, T025.

- [ ] T023 [P] [US1] Calculate and emit time-to-start velocity constraint in `src/app/page.tsx`
  - *Deliverable*: Compute the delta `(Time of action_accepted) - (Time of dump_submitted)`. Emit as a strict millisecond metric inside the `action_accepted` track payload. Must be captured natively to avoid retrospective inference.
- [ ] T024 [P] [Setup] Build Local Dev Telemetry Export View in `src/app/dev/metrics/page.tsx`
  - *Deliverable*: A hidden JSON-formatted export screen aggregating IndexedDB session events. Must summarize total sessions, rescue frequency, bounce-back usage, archive access, and time-to-start.
- [ ] T025 [P] [US1] Create Automated Emotional-Dump Regression Test Suite
  - *Deliverable*: Implement `scripts/test-emotional-safety.ts` containing a set of 5 mock prompts representing panic, distress, burnout, and shame. It must query `/api/ai` directly and assert the recommendation favors physical grounding rather than productivity escalation.
- [ ] T026 [Setup] Store telemetry event array persistently (Nice-to-Have)
  - *Deliverable*: Sync the `trackEvent` memory pool to `idb-keyval` so abruptly terminated sessions don't lose the pre-export beta metrics array. Nice-to-have, must not block beta launch.

---

## Dependencies Map

- **T001, T002** -> Block all frontend logic.
- **T004** -> Blocks T005, T013.
- **T018** -> Blocks API/Route infrastructure (T019, T022).
- **T019** -> Blocks Frontend execution flow connection (T006).
- **T007** -> Blocks T008, T011, T016.

## Parallel Execution Opportunities

- [P] **T003** (Analytics hook), **T010** (Decision Board view), **T014** (Archive Search view), **T021** (Archive Prompt blocker), **T022** (Token output limit cap definition), **T023** (Time-to-start tracker), **T024** (Metrics Export), **T025** (Emotional safety script) can all be built concurrently while core flow transitions are being wired.

## Deferred / Out of Scope
- Direct Integration with `calendar` or native Task SDKs.
- Pomodoro timers or desktop execution blocking tools.
- Multi-device auth synchronization.
- Complex user authentication beyond the hard-coded 50 beta ID interceptor.
- T026 telemetry persistence (can be deferred post-beta launch).
