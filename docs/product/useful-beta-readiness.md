# Useful Beta Plan For MIND

This plan extends the evidence-backed ONE_ACTION validation work into a useful-beta readiness gate.
It does not replace `docs/product/next-round-evidence-backed-one-action.md` or `docs/product/ux-data-collection-one-action.md`.
Use it after the manual KPI sanity check is non-zero, and before declaring MIND ready for a target-user beta.

## Summary

MIND useful beta is not just KPI validation. The goal is to prove that a target user can bring messy real-world context into a room, get a next action they can use, understand enough of the evidence/provenance behind it, and return to the same room without losing the thread.

KPI validation remains required, but it must be tied to product capability readiness:

- paste-text action
- evidence reuse
- room context retention
- rescue / alternative recovery
- first-load clarity
- defect-free happy path

## Current Phase

Phase 1b: Manual Data Quality Closeout -> Useful Beta Readiness Check.

Current state:

- The business dashboard is non-zero from a manual/synthetic browser run.
- Evidence-backed ONE_ACTION has partial signal that it works.
- Reentry and value pulse are not yet proven from dashboard data.
- OCR and file-heavy ingestion are not blockers for the first useful beta if the paste-text workflow delivers core value.
- The next step is a readiness check for the core beta promises, not OCR or broad UX implementation.

## Next Steps

### 1. Close Manual KPI Snapshot

- Capture `/business` values after refresh.
- Mark the data as manual/synthetic.
- Record missing cards, especially reentry and value pulse.
- Treat this as instrumentation sanity check, not product proof.

### 2. Run Useful Beta Readiness Scenarios

- Scenario A: paste messy client context -> ONE_ACTION -> evidence chip visible -> `ใช้ก้าวนี้`.
- Scenario B: paste context -> `ช่วยแก้ก้าวนี้` or `ขอก้าวอื่น` -> recover without getting stuck.
- Scenario C: create room -> leave/reopen room -> continue the same task with preserved context.
- Scenario D: first-load new user path -> user can identify "วาง context -> ไปต่อ" without instruction.
- Scenario E: paste-text evidence reuse -> source text remains traceable in action/scaffold.

### 3. Phase 2 Real User UX Data

- Recruit 5-8 launch-segment users.
- Each user runs one fresh intake/dump task and one stale/reentry task.
- Collect dashboard KPIs, observer notes, and capability pass/fail for each scenario.
- Do not start UX/OCR work unless real-user data or fix-now defect evidence supports it.

### 4. Phase 3 KPI + Capability Gate

- Use the KPI gate for UX/OCR decision-making.
- Use the capability map below for useful beta readiness.
- If KPIs look acceptable but room reentry or text reuse fails, prioritize capability fix over optimization.

## Product Capability Map

| Capability | Useful beta target | Current planning status | Gate before beta |
|---|---|---:|---|
| First-action generation | Must work | working / needs real-user proof | User gets one clear next action from pasted real context |
| Rescue / alternative path | Must work | partially working | User can recover via `ช่วยแก้ก้าวนี้` or `ขอก้าวอื่น` without dead end |
| Evidence-backed action | Must work for paste-text | working / partially proven | Source text appears as evidence/provenance in action flow |
| Text capture and reuse | Must work | partially working | Pasted text is retained, reused, and traceable after action/reopen |
| Room context retention / reentry | Must work | partially working / measurement gap | At least one returning-user scenario completes without losing context |
| First-load clarity | Must be acceptable | blocked by UX risk until observed | Users reach dump -> ONE_ACTION without repeated confusion |
| Analytics / KPI visibility | Must work internally | working | Dashboard shows non-zero events/tasks and core KPI cards |
| OCR / file-heavy ingestion | Not required unless launch scope depends on it | deferred | Only becomes must-have if real users are blocked by files/docs |
| Fix-now defects | Must be rare | ongoing triage | No broken happy-path control, route, state transition, or dashboard read |

## Useful Beta Exit Criteria

MIND reaches useful beta only when all of these are true:

- Paste-text happy path works end-to-end without blocking defect.
- At least 5 real-user sessions produce 8+ confirmed actions.
- At least 3 users successfully confirm a useful action from real client/project context.
- Source text is reused as evidence in at least 5 evidence-visible drafts.
- At least 1 real returning-user scenario completes without losing room context.
- First-load confusion does not block more than 1 out of 5 users before ONE_ACTION.
- No fix-now defect blocks room -> action -> confirm.
- Dashboard can show core usage/friction metrics after sessions.

## KPI Gate

Use this gate only after the minimum real-user volume exists:

- 10 real ONE_ACTION drafts
- 8 confirmed actions
- 5 evidence-visible drafts
- 3 reentry attempts
- 5 observer notes or value-pulse responses

### Phase A: UX/UI tuning

Choose Phase A if any of these are true:

- `oneActionAcceptedFirstTryRate < 70%`
- `timeToNextActionMs.median > 120s` or `timeToNextActionMs.p75 > 300s`
- `notLikeThisRate > 20%`
- `draftToConfirmConversionRate < 65%`
- 3 or more users show repeated first-load, CTA, evidence, or rescue confusion

### Phase B: OCR / evidence input work

Choose Phase B only if first-touch UX is acceptable but file/document input blocks usage:

- document/file-heavy tasks confirm rate is 25 percentage points lower than pasted-text tasks
- document/file-heavy median time-to-action is 50% higher than pasted-text tasks
- `evidenceBackedActionRate < 60%` in tasks where evidence should exist
- 3 or more users are blocked because file/document text is missing, unreadable, or not surfaced

### Phase C: Stop / continue validation

Choose Phase C if all of these are true:

- `oneActionAcceptedFirstTryRate >= 75%`
- `timeToNextActionMs.median <= 90s` and `timeToNextActionMs.p75 <= 240s`
- `notLikeThisRate <= 15%`
- `draftToConfirmConversionRate >= 70%`
- `evidenceBackedActionRate >= 70%` when evidence exists
- no repeated observer-note confusion pattern

If useful-beta capability gates fail, do not call MIND useful beta even if KPI numbers look acceptable.

## Defect Triage: Fix-Now Rules

Fix immediately if:

- user cannot complete paste-text room -> action -> confirm
- button, route, form, or state transition is broken
- UI promises an action but does not perform it
- expected existing analytics event does not fire in the intended flow
- dashboard misreads stored local event data
- reentry is intended to surface but fails due to a reproducible state bug
- layout hides or disables primary controls

Send through KPI/UX gate if:

- copy feels unclear but flow still works
- label preference is subjective
- evidence is visible but ignored
- first screen feels busy but does not block action
- layout could be better but happy path works

Every fix-now defect needs repro steps, expected vs actual behavior, smallest patch, and verification.

## UX Confusion & First-Impression Notes

During real-user sessions, capture:

- first hesitation point
- first click path
- labels/buttons the user misinterprets
- whether user understands `ใช้ก้าวนี้`, `ช่วยแก้ก้าวนี้`, and `ขอก้าวอื่น`
- whether evidence chip is clicked, ignored, missed, or distrusted
- whether returning user understands they are continuing an existing room
- post-session question: `ตรงไหนทำให้ลังเลก่อนกดใช้ก้าวนี้?`

Classify notes as:

- `UI confusion`
- `Action quality`
- `Evidence trust`
- `Input pipeline`
- `Room memory / reentry`
- `No issue`

Do not mix UI confusion with OCR/input pipeline problems.

## Delivery Priorities After Validation

Must-have before useful beta:

- paste-text intake -> ONE_ACTION -> confirm
- evidence reuse for pasted text
- room context retention/reentry for at least one real returning-user scenario
- rescue/alternative recovery path
- no fix-now defect on happy path
- first-load clarity acceptable for target users

Should-fix soon after:

- file/OCR ingestion reliability if real users need it
- reentry quality if continuity is weak
- rescue copy/flow if users misinterpret it
- evidence presentation if users ignore or mistrust visible evidence

Later optimization:

- full OCR coverage across many document types
- advanced retrieval/vector search
- polished onboarding for every segment
- richer dashboards
- team collaboration
- broad external-tool automation

## What Not To Change Yet

- Do not change prompts, retrieval, schema, analytics contracts, or smoke harness unless fixing a proven defect.
- Do not start OCR/PDF work unless real-user file/document scenarios prove it is blocking useful beta.
- Do not do broad UX redesign from synthetic/manual data.
- Do not treat dashboard non-zero as product readiness.
- Do not call MIND useful beta until capability gates and real-user evidence both pass.

## Assumptions

- Initial useful beta can be paste-text first.
- OCR/file-heavy ingestion is optional for first beta unless launch scope explicitly depends on file workflows.
- Manual browser data validates instrumentation, not product value.
- Real-user sessions are required before non-defect UX/OCR delivery decisions.
- MIND's beta bar is task continuity, not feature breadth.
