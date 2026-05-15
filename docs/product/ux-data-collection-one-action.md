# UX Data Collection Plan For Evidence-Backed ONE_ACTION

This plan extends the active evidence-backed ONE_ACTION round with real usage data collection.
It does not replace `docs/product/next-round-evidence-backed-one-action.md`; it defines what to do after the smoke gate is green but the live dashboard still has too little data to justify UX, OCR, or prompt changes.
When the manual dashboard sanity check is non-zero, continue into `docs/product/useful-beta-readiness.md` to connect KPI validation to MIND's paste-text-first useful beta bar.

## Current Phase

Phase C: stop at validation until real usage data exists.

The current dashboard can show the KPI set, but an empty local event log means the next move is data collection, not product changes. Keep architecture, evidence retrieval, prompt contracts, analytics contracts, and the smoke harness unchanged while this plan runs.

## What We Already Have

MIND already tracks the core ONE_ACTION funnel:

- `step_draft_shown`
- `first_action_selected`
- `time_to_action_ms`
- `one_action_accepted_first_try`
- `step_confirmed`
- `step_not_like_this`

These events let us observe:

- whether users accept the first action
- how long users take to accept a next action
- how often users ask for rescue through `ช่วยแก้ก้าวนี้`
- whether drafted steps convert into confirmed steps

Evidence trust is partly observable through:

- `step_evidence_clicked`
- `step_confirmed.retrieval_enabled`
- `evidenceClickRate`
- `evidenceBackedActionRate`

Reentry is observable through:

- `reentry_brief_shown`
- `catch_up_mode_opened`
- `reentryToConfirmedActionRate5m`

Lightweight qualitative value data already exists through:

- `value_pulse_shown`
- `value_pulse_submitted`
- `value_pulse_dismissed`
- value-pulse minutes saved
- value-pulse signal type
- value-pulse note text

## What Is Missing For UX Learning

The current instrumentation cannot fully answer these reluctant-adapter questions by itself:

- whether a fast accept means confidence or blind click-through
- whether a slow accept means careful reading, hesitation, confusion, or distraction
- why users avoid evidence chips
- whether users miss evidence, dislike reading evidence, or do not understand source labels
- whether `ช่วยแก้ก้าวนี้` means wrong suggestion, too hard, stuck, or wrong kind of help
- whether users abandon after `step_draft_shown` without confirming, rescuing, or choosing an alternative
- whether reentry friction comes from stale context, resume copy, action quality, or general confusion

Do not add new analytics events yet. First collect structured usage sessions and observer notes using the existing event set.

## Phase 1: Manual Test Data Collection

Run 12-20 scripted ONE_ACTION sessions before inviting real users.

Required run mix:

- happy-path accept-first runs
- evidence-click accepts
- evidence-visible but evidence-ignored accepts
- `ช่วยแก้ก้าวนี้` before accepting
- `ขอก้าวอื่น` before accepting
- clarification flow if the app surfaces it
- 1-2 reentry runs after a short wait

Minimum useful volume:

- at least 12 `step_draft_shown`
- at least 8 `step_confirmed`
- at least 3 evidence-visible runs
- at least 2 `step_evidence_clicked`
- at least 2 `step_not_like_this`

Exit criteria:

- business dashboard shows non-zero `EVENTS`
- business dashboard shows non-zero `TASKS`
- `notLikeThisRate` has a value when rescue/not-like-this runs occurred
- evidence metrics have values when evidence-visible/evidence-click runs occurred
- confirmed-action timing has a value

## Phase 2: Real User UX Data Collection

Recruit 5-8 target users from the launch segment:

- freelancers
- consultants
- boutique agency leads
- client-facing designers or developers
- coaches or strategists

Ask each user to run two real client-work scenarios:

- one fresh intake/dump task
- one stale or reentry task

Compare these segments:

- `client_response` vs `client_resume`
- evidence clicked vs evidence ignored
- accept-first vs rescue/alternative
- pasted text only vs file/context-heavy task
- first-time user vs returning user

Monitor these quantitative signals continuously:

- `oneActionAcceptedFirstTryRate`
- `timeToNextActionMs.median`
- `timeToNextActionMs.p75`
- `notLikeThisRate`
- `draftToConfirmConversionRate`
- `evidenceBackedActionRate`
- `evidenceClickRate`
- `reentryToConfirmedActionRate5m`
- `valuePulseCaptureRate`
- dominant value-pulse signal
- value-pulse minutes saved

Collect these qualitative signals without code changes:

- first visible hesitation point
- whether the user reads or ignores evidence chips
- whether the user understands `ช่วยแก้ก้าวนี้`
- whether the user understands `ขอก้าวอื่น`
- whether the user understands `ใช้ก้าวนี้`
- one post-session answer to: `ตรงไหนทำให้ลังเลก่อนกดใช้ก้าวนี้?`

Minimum useful real-user volume:

- at least 10 real ONE_ACTION drafts
- at least 8 confirmed actions
- at least 5 evidence-visible drafts
- at least 3 reentry attempts
- at least 5 value-pulse responses or observer notes

Review cadence:

- after every 5 users, or
- after every 20 confirmed actions,
- whichever comes first.

## Phase 3: KPI Review And Decision Gate

Review first-touch UX first.

Also review useful-beta capability readiness from `docs/product/useful-beta-readiness.md`. KPI numbers alone are not enough to call MIND beta-ready if paste-text action, evidence reuse, room reentry, rescue/alternative recovery, first-load clarity, or fix-now defect criteria fail.

Choose Phase A: UX/UI tuning if:

- `oneActionAcceptedFirstTryRate` is low
- `timeToNextActionMs` median or p75 is high
- `notLikeThisRate` is high
- `draftToConfirmConversionRate` is weak

Review evidence behavior second.

Choose Phase B only if first-touch metrics are acceptable but:

- evidence-backed confirmations are low in evidence-visible tasks
- evidence clicks are low when evidence chips are visible
- users report missing or unclear source trust
- real document/context handling is the observed blocker

Review reentry third.

If `reentryToConfirmedActionRate5m` is weak, inspect whether the issue is:

- resume copy
- stale context
- action quality
- general reentry confusion

Stay in Phase C if:

- accept-first is healthy
- time-to-action is low enough for the easy-next-move promise
- not-like-this is not elevated
- evidence-backed confirmations appear when evidence exists
- qualitative notes do not show repeated confusion

## What Should Not Change Yet

- Do not change prompts.
- Do not change retrieval or evidence ranking.
- Do not change schema.
- Do not change analytics contracts.
- Do not change the smoke harness.
- Do not start OCR/PDF work unless real-user evidence shows users are blocked specifically by missing or unreadable document context.
- Do not add new events until the current event set has been exercised with real usage and the remaining measurement gap is proven.
