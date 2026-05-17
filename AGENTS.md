# AGENTS.md

## Source Of Truth
- Always read and follow [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md).
- Treat [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md) as the source of truth for prototype scope, acceptance, verification habit, and demo/handoff habit.
- If this file and other notes disagree, follow [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md).

## Prototype Goal
This repository is working toward a narrow prototype-ready MIND demo.

The prototype must prove one Room-based story end to end:
- create or select one Room for one client/project context
- paste context and/or attach supported files
- read `txt/md`, PDF, and image inputs
- use OCR fallback when scanned PDF/image has no usable text layer
- push extracted text into Room memory
- show evidence/source connection inside the Room
- generate summary / next action / save point from Room context
- reopen the same Room and continue without feeling reset

## In Scope
Keep work narrow to this prototype only:
- Room-based file ingestion
- evidence visibility and source/provenance reveal
- Room memory for task continuity
- summary / next action / save point generation
- Room reentry / return / continuation
- small UI/copy/test fixes that directly improve the prototype acceptance path
- manual and synthetic verification that supports the prototype path
- short demo/handoff packaging that matches the prototype scope

## Out Of Scope
Do not expand beyond this prototype scope.

Explicitly out of scope:
- `/business` as an acceptance gate, release gate, or normal demo workflow
- PMF validation
- user research
- real-user KPI gates
- value pulse work
- dashboard-led product decisions
- broad OCR/PDF/file-ingestion expansion beyond the accepted prototype path
- product breadth beyond one client-facing Room workflow
- unrelated sidebar/nav redesign
- archive/overview expansion
- unrelated UX cleanup not tied to the acceptance gate

## Hard Do-Not-Touch
Unless a proven blocking defect requires a tiny fix, do not propose or modify:
- prompts
- retrieval schema
- analytics contract
- OCR provider or OCR setup
- smoke harness
- architecture or orchestration refactors
- unrelated routing/product breadth changes

If a task would require touching one of these areas, default to:
- `defer`, or
- propose a narrower in-scope alternative

## Acceptance Gate
Treat the prototype as successful only if the Room-based acceptance path works.

Required acceptance outcomes:
- Room-based file ingestion works for the demo path
- evidence is visible and connected to Room context
- Room memory supports reopening or returning to the same task
- the Room can produce a generated summary / next action / save point
- reentry reads as continuing the same task, not starting over
- `/business` remains internal instrumentation only and is not required for prototype acceptance

## Default Working Mode
Act within guardrails.

If a task is clear, narrow, in scope, and low risk, execute directly without waiting for a separate approval step.

If a task is ambiguous, broad, risky, touches multiple surfaces, or may approach a do-not-touch area, switch to Plan First mode.

For direct execution tasks:
- state a short scope check
- state the minimal intended change
- perform the work
- report what changed
- report verification results

For Plan First tasks:
- keep the structured planning format
- wait for approval before making changes

## If No Task Is Given
If the user does not provide a specific task, choose the next best in-scope task yourself.

Selection rules:
- choose only from open work, remaining checklist items, known risks, or verification gaps already implied by [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md)
- prefer the smallest high-value task with the lowest regression risk
- prefer tasks that directly improve:
  - Room-based file ingestion
  - evidence visibility
  - Room memory
  - summary / next action / save point
  - reentry
- do not invent new roadmap items
- do not pick work already marked done unless a clear remaining gap justifies follow-up

Priority order for self-chosen tasks:
1. broken flow / dead end on the prototype path
2. Room save point / return / reentry continuity
3. evidence visibility or source clarity
4. file-ingestion status clarity
5. narrow label/copy cleanup on the demo path
6. verification gaps on the accepted prototype flow

## Plan First
Use Plan First only when the task is not clearly safe for direct execution.

Plan First tasks should use this structure:
### Scope Check
### Chosen Task
### Goal
### Proposed Changes
### Do Not Touch
### Verification
### Demo Impact
### Risks
### Fallback

End every planning response with exactly:
`Awaiting approval before implementation.`

## Verification Habit
Prefer existing checks and habits already used in the prototype plan.

When relevant, reuse:
- `git diff --check`
- `npm run typecheck:app`
- `npm run smoke:evidence-one-action`
- `npm run smoke:demo-browser`
- targeted browser manual checks for:
  - fresh intake
  - evidence reveal
  - rescue / alternative path
  - Room reentry / continuation
  - Room save point / return
  - file attach states for `txt/md`, PDF, and image

Do not start smoke harness repair work just because a harness is flaky.
Treat known blocked harness behavior as a tooling gap unless it is reproduced in the visible browser and clearly blocks the prototype acceptance path.

## Demo / Handoff Habit
Keep the prototype story narrow during demo and handoff.

Normal demo path:
- open `/`
- create or select a Room
- paste context
- optionally attach a file
- click `ไปต่อ`
- show evidence/source detail
- show summary / next action
- confirm or recover
- return to the same Room via save point / reentry

Do not use `/business` or `/pmf-guide` as part of the normal prototype demo.
They remain internal/reference-only surfaces.

When suggesting demo steps:
- prefer one clean story over broad product coverage
- prefer one recovery path, not many
- prefer one rehearsed Room for reentry
- prefer `txt/md` as the safest primary demo file, with PDF/image as optional background-work examples

## Writing / Suggestion Style
When proposing work:
- be concrete
- be minimal
- be testable
- avoid broad brainstorming unless explicitly requested
- convert vague ideas into small acceptance-oriented tasks
- optimize for prototype completion, not product expansion

If a request does not clearly help the current acceptance gate, default to:
- `defer`, or
- suggest a narrower version that does
