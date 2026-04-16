# MIND E2E Flow Checklist

Run this checklist for any branch that touches runtime, task lifecycle, rescue, reentry, or demo-critical UI.

Metadata:

- Branch: `<branch-name>`
- Commit: `<hash>`
- Date: `<YYYY-MM-DD>`
- Environment: `<local-dev|preview|other>`
- Runtime host: `http://127.0.0.1:11437`
- Notes: `<notes>`

## Preflight

- [ ] `npm run ollama:serve:cpu-safe` is running, or the guarded startup path has already brought up the canonical runtime.
- [ ] `npm run runtime:ollama:check:gemma` passes.
- [ ] `npm run smoke:ai-routes:gemma` passes.
- [ ] If this is a demo / release check, `npm run gate:phase5` passes or failures are explicitly documented.

## Flow: Dev Boot / Runtime Check

- [ ] Start the app with `npm run dev` or `npm run start`.
- [ ] The app boots against the canonical local AI path without manual port rewrites.
- [ ] The health rail reflects real runtime state instead of a generic failure.
- [ ] No unexpected runtime mismatch appears in console output.

Notes:

- Expected canonical runtime: `http://127.0.0.1:11437`
- Non-canonical debug escape hatch: `npm run dev:raw` / `npm run start:raw`

## Flow: Normal Task Lifecycle

- [ ] Open the app and create or open a task room from `sourceText`.
- [ ] Intake completes without crashing the UI.
- [ ] The room moves into the expected task lifecycle path.
- [ ] Primary task output is visible and actionable.
- [ ] No infinite spinner, blank panel, or obvious state mismatch appears.

Record:

- Start state: `<state>`
- Expected result: `<result>`
- Actual result: `<result>`

## Flow: Rescue

- [ ] Start from a task that is stuck, blocked, or needs recovery.
- [ ] Enter the rescue path.
- [ ] Rescue view renders with usable context and next-step guidance.
- [ ] The room remains usable after rescue output appears.
- [ ] No broken transition occurs when moving back into the task flow.

Record:

- Trigger used: `<trigger>`
- Expected rescue behavior: `<behavior>`
- Actual rescue behavior: `<behavior>`

## Flow: Reentry

- [ ] Reopen a room with saved context or a last-known-good state.
- [ ] Reentry content appears before forcing the user to reread everything.
- [ ] The room can continue from the saved point without losing context.
- [ ] Refreshing or reopening the room does not drop the reentry summary unexpectedly.

Record:

- Entry point: `<entry>`
- Expected reentry result: `<result>`
- Actual reentry result: `<result>`

## Flow: Morning Ritual

- [ ] Open the morning ritual path on the current branch.
- [ ] The screen shows the intended room/task guidance for the current product behavior.
- [ ] The CTA path from morning ritual leads into a usable room state.
- [ ] The copy on the screen is consistent with current specs and not obviously stale.

Record:

- Expected ritual behavior: `<behavior>`
- Actual ritual behavior: `<behavior>`

## Flow: Error / Retry

- [ ] Trigger or observe one retry-capable path.
- [ ] Retry behavior does not trap the user in a broken or silent state.
- [ ] Error messaging stays understandable and does not expose raw runtime confusion to the user.

Record:

- Scenario used: `<scenario>`
- Expected retry result: `<result>`
- Actual retry result: `<result>`

## Review Notes

- [ ] No experimental-only component or route leaked into the primary user path.
- [ ] UI text in the critical path still matches current product direction.
- [ ] Any deviations are written below before merge.

Findings:

- `<finding 1>`
- `<finding 2>`
- `<finding 3>`
