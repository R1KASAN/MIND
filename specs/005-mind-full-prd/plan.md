# Implementation Plan: MIND Local-First MVP

## User Review Required

> [!IMPORTANT]
> **Local Ollama Optimization**: The MVP relies on a local Ollama instance. To maintain momentum, the app implements a non-blocking background health check on load. If the AI is offline or the model is missing, the app gracefully transitions to `MANUAL_FALLBACK` without interrupting the capture flow.

> [!WARNING]
> **Silent Loop**: The "Done" action in the Start Scaffold will now trigger an immediate, silent transition back to the Dump Entry screen. This is a deliberate design choice to maintain momentum, but it may feel abrupt to some users initially.

## Proposed Changes

### 1. App Shell and State-Machine Extension
- **Status**: Extending `src/app/page.tsx` and `src/lib/store/idb.ts`.
- **Changes**:
    - Add `MORNING_RITUAL` and `CLARIFICATION` to `SessionStatus`.
    - Update `AppSession` with `lastMorningShown` and `hasSeenResetNotice` persistent flags.
    - Implement a non-blocking background health check for Ollama in the app shell.
    - Add a **passive, non-clickable** status indicator for AI readiness (e.g., "Local AI ready" vs. "Capture mode active").
    - Implement the `BOUNCE_BACK` intercept in the `useEffect` load hook.

---

### 2. Dump-First Flow and One-Action Engine
- **Status**: Modifying `handleDump` in `page.tsx`.
- **Changes**:
    - Add `requires_clarification` logic to the AI response handler.
    - Implement a `CLARIFICATION` state to prompt the user for missing details.
    - Tie AI reasoning quality to the 5-minute physical action bar via the system prompt.

---

### 3. Start Scaffold and Controlled Override
- **Status**: Updating `Scaffold.tsx` and `OneAction.tsx`.
- **Changes**:
    - "Not this" (Rejection) logic: Mutate `alternative_actions` locally and persist the rotation index in `AppSession`. No new AI calls.
    - "Done" (Completion) logic: Trigger a silent, immediate transition to `DUMP_ENTRY`.
    - Pin/Unpin: Allow pinning up to 3 items, persistent in `mind_actions`. **Enforce a hard UI cap**: the Pin button MUST be disabled with a "Max 3 pinned items" cue if the limit is reached.

---

### 4. Recovery Flows: Rescue, Bounce-Back, and Manual Fallback
- **Status**: New components and state handlers.
- **Changes**:
    - `BounceBack.tsx`: A warm, non-shaming two-choice screen ("Continue" vs. "Start Fresh").
    - `Rescue.tsx`: Non-shaming stall recovery ("Make it smaller" or "Walk away").
    - `ManualFallback.tsx`: Immediate intercept if Ollama is offline or synthesis fails.
    - **Retry AI Logic**: Add a secondary "Retry AI" button to `ManualFallback`. 
        - Button is `disabled` unless `aiStatus === 'ready'`. 
        - Upon click, the user STAYS in `ManualFallback` while an inline spinner/loading state is shown.
        - It reuses the persistent `activeDumpContext` from the session state; emit `retry_clicked`.
        - **Success**: Transition **immediately** into the normal `One Action` or `Start Scaffold` flow. Do NOT show a success checkmark, animation, or transient success screen/state.
        - **Failure**: Remain in `ManualFallback` with the manual path still available and not disabled.
    - **Setup Help**: Include a small, tertiary link to "Setup local AI" inside `ManualFallback` or `TrustOverlay`. No new routes.

---

### 5. Minimal Overview and Trust Triad
- **Status**: New secondary screens.
- **Changes**:
    - `OverviewOverlay.tsx`: Read-only view of current action + pinned items.
    - `TrustOverlay.tsx`: JSON export and "Delete All Local Data" logic.

---

### 6. AI Adapter and Local Ollama Runtime
- **Status**: Modifying `src/app/api/ai/route.ts` and `src/lib/ai/adapter.ts`.
- **Changes**:
    - Proxy requests to `http://localhost:11434/api/chat`.
    - Implement model selection hierarchy: `qwen2.5:3b` (Default) -> `qwen3:4b-instruct` (High) -> `gemma3n:e2b` (Low).
    - Enforce `format: "json"` in the Ollama request.
    - Increase default timeout to **12 seconds** to account for local cold-starts and low-compute machines.
    - Implement a 1-turn retry on JSON parse failures.
    - Expose a lightweight `/api/ai/health` endpoint for the foreground status check.

---

### 7. Storage and Weekly Reset
- **Status**: Updating `src/lib/store/idb.ts` and `memoryRules.ts`.
- **Changes**:
    - `processWeeklySweep()`: Archive un-pinned items past the weekly boundary.
    - `exportAllData()`: Generate a timestamped `.json` download.
    - `clearAllData()`: Reset the IndexedDB session and actions.

## Open Questions

- **Telemetry Events**:
    - `healthcheck_passed`: Ollama and model are ready.
    - `ollama_unavailable`: Ollama endpoint timed out or failed.
    - `model_missing`: Required model weights not found in local library.
    - `timeout_fallback`: 12s limit reached during active synthesis.
    - `manual_fallback_triggered`: User routed to manual input due to any AI failure.
    - `retry_clicked`: User attempted to re-run AI from Manual Fallback.
    - `retry_success` / `retry_failed`: Outcome of the retry session.
    - Preserve existing proof metrics: `synthesis_started`, `scaffold_completed` (primary).

## Verification Plan

### Automated Tests
- Verify the app shell AI status indicator is non-clickable and awareness-only.
- Verify `ManualFallback` renders the "Retry AI" button only when `aiStatus === 'ready'`.
- Verify retry keeps the user inside `ManualFallback` with an inline spinner visible.
- Verify no success checkmark, success animation, or transient success state is shown on success.
- Verify retry reuses the stored `activeDumpContext` and fires correct telemetry.
- Verify retry success transitions **immediately** to the normal flow.
- Verify retry failure leaves the user in `ManualFallback`.
- Verify the "Setup help" link does not trigger a route change.
- Logic tests: Weekly Sweep, State Transitions.
- **Linting & Types**: `npm run lint`, `npm run build`.

### Manual Verification
1. **Ollama Integration**: Run Ollama locally, pull `qwen2.5:3b`, and verify the synthesis loop.
2. **Rejection Rotation**: Tap "Not this" and verify the rotation survives a page refresh.
3. **Silent Loop**: Complete an action and confirm the immediate return to Dump Entry.
4. **Bounce-Back**: Manually set `lastActive` in DevTools to >24h and refresh to trigger the intercept.
