# MIND Project Presentation Script

Updated: 2026-04-09

This Markdown file is the spoken version of the 10-slide deck in `mind-project-presentation-deck-10.md`.  
It is written so a classmate or teammate can present the project clearly even if they did not build it.

## How to use this script

- Keep the deck slide short
- Use this file as the speaking version
- Tell the truth about readiness: controlled demo yes, broad launch no
- If a demo part is still caveated, say it directly instead of overselling it
- The safest demo story today is:
  - proposal-start task
  - sales inquiry / demo request task
  - scaffold completion summary
  - smoke and gate evidence

## Current status to say out loud

- MIND is ready for a controlled demo or a small closed beta
- MIND is not ready for a broad launch
- The current rescue baseline is still `rescue-balanced-repair-160`
- `rescue` is still caveat-managed and should not be presented as the hero flow
- Before every demo or release, `npm run gate:phase5` is mandatory

## Rubric map

| Phase | Criteria covered | Slides |
| --- | --- | --- |
| Phase 1 | Title Clarity, Problem & Introduction, Objectives, Scope, Expected Benefit / Impact, Feasibility & Background Preparedness, Presentation Design, Presentation & Communication Skills, Q&A & Readiness | 1-6 |
| Phase 2 | Implementation Progress, Initial Result, Understanding, Presentation | 7-8 |
| Phase 3 | Working System / Demo, Result + Evaluation, Report, Presentation | 9-10 |

---

## Slide 1 - Title Clarity

### On-slide meaning

- MIND
- local-first AI task copilot for solo client work
- turns scattered client context into a next move
- stays with one task until it moves forward

### What to say

Start with the simplest statement possible: MIND is a local-first AI task copilot for solo client work. Its job is not to chat in the abstract; its job is to take scattered context and turn it into a next move that the user can actually start. MIND stays with one task until it moves forward. That makes the product feel task-scoped instead of generic.

### Presenter cue

- Open with one sentence
- Do not start with architecture
- Do not call it a note app or a team workspace

---

## Slide 2 - Problem & Introduction

### On-slide meaning

- Client work goes stale before it is finished
- Feedback is long and fragmented
- Context is scattered across chats, email, PDFs, screenshots, and notes
- Restarting after a break takes too much energy
- Generic AI can answer, but it does not keep the task moving

### What to say

Explain the pain plainly. Client work often goes stale, not because people are lazy, but because the context is fragmented and hard to pick up again. The user has to reread old messages, reconnect notes, and mentally reconstruct where the work stopped. Generic AI can answer questions, but it does not stay with the task. MIND exists to reduce that restart friction.

### Presenter cue

- Start from the pain
- Mention what it feels like to come back after a break
- Make the problem sound real, not theoretical

---

## Slide 3 - Objectives & Scope

### On-slide meaning

- Turn scattered context into a next move
- Help the user start from where the task actually is
- Stay helpful until the task moves forward
- Support one task at a time, not many rooms at once
- DUMP-first: text first, files optional
- Not a team workspace, note app, or generic task manager

### What to say

The objective is narrow on purpose. MIND should take what the user has already dumped in, understand where the task really is, and offer a next move that can be started immediately. The scope is one task, one room, and a DUMP-first flow. That means text is enough to begin, while files are optional. Say clearly that MIND is not trying to become a team workspace, a note app, or a general task manager.

### Presenter cue

- Explain what is in scope and what is not
- Make the scope feel intentional, not limited by accident

---

## Slide 4 - Expected Benefit / Impact + Feasibility

### On-slide meaning

- Faster restart on client work
- Less rereading of old context
- Better continuity across breaks
- More confidence when returning to unfinished work
- Local-first privacy and trust are part of the promise
- Operation routes are already split by phase
- Smoke, benchmark, and gate already exist before demo / release
- Current state is demo-ready for a controlled demo, not broad launch

### What to say

The expected impact is practical. MIND should help people restart faster, reread less, and continue a task without losing their place. The local-first aspect matters because privacy and trust are not polishing details here; they are part of the product promise. Then switch into feasibility: the system already has separate operation routes, smoke coverage, benchmark coverage, and a release gate. That is why we can honestly say it is demo-ready now, but not broad-launch ready yet.

### Presenter cue

- Tie the benefit directly back to the pain
- Mention that the engineering structure already exists

---

## Slide 5 - Presentation Design + Communication Skills

### On-slide meaning

- One idea per slide
- Short headings instead of paragraphs
- Show before / after transformations clearly
- Use flow diagrams instead of clutter
- Keep terminology consistent: intake, action, scaffold, rescue, reentry
- Say what is ready and what is still caveat-managed

### What to say

This slide is about how to explain the product well. The deck should not feel like a text wall. It should feel like the product itself: clear, step-based, and easy to follow. Use one idea per slide, keep the terms consistent, and show before/after examples where possible. Most importantly, speak honestly about caveats. If something is still weak, say so directly. That makes the presentation more credible.

### Presenter cue

- Keep each slide to one message
- Do not over-elaborate
- Use the same words every time: intake, one action, scaffold, rescue, reentry

---

## Slide 6 - Q&A & Readiness

### On-slide meaning

- Controlled demo / small closed beta: yes
- Broad launch: no
- Current readiness snapshot: product / UX 80%, architecture 74%, AI behavior 60%
- `npm run gate:phase5` is mandatory before every demo / release
- Gate failure means stop, fix, and do not release
- Rescue is still caveat-managed and should not be sold as a hero flow

### What to say

Be direct. MIND is ready for a controlled demo or a small closed beta, but not for a broad launch. If someone asks about readiness, give the current snapshot: product / UX around 80%, architecture around 74%, and AI behavior around 60%. Then explain the gate: `npm run gate:phase5` must pass before any demo or release. That gate includes runtime preflight, tests, build, Gemma route smoke, and demo browser smoke. If any of those go red, we hold the release.

### Presenter cue

- Say the gate in one sentence
- Say the caveat in one sentence
- Do not imply rescue is promoted

---

## Slide 7 - Implementation Progress + Initial Result

### On-slide meaning

- Task shape reading now follows real context, not keywords alone
- Proposal-start and sales inquiry / demo request are separated correctly
- Scaffold now uses `currentPlan.steps` and supports completion summary
- `เสร็จแล้ว` advances step-by-step instead of resetting immediately
- `make_smaller` now checks the visible plan slice, not just one line
- `diagnosis.primaryReason` 422 issue and raw JSON summary issue are closed
- `smoke:sales-inquiry` is now part of the gate
- Rescue hardening and retry / timeout work continue in a narrow scope

### What to say

This is the part where you explain what has already been built. The current implementation is not just a prototype—it already reads task shape, separates proposal-start from demo-request intent, and uses the current scaffold plan as the real source of truth. A major usability fix is that pressing `เสร็จแล้ว` now advances the scaffold step-by-step, and only after the final step does it show the completion summary. Another important fix is that `make_smaller` now checks the visible scaffold slice, so it can succeed even if the first step still looks similar but the overall plan became more detailed. Also mention that the old `diagnosis.primaryReason` 422 issue and the raw JSON summary leak are closed, and that `smoke:sales-inquiry` is now part of the gate because that protects the newer intent-reading behavior from regressing.

### Presenter cue

- Mention the scaffold completion summary explicitly
- Mention that the system now respects the actual user intent more reliably
- Keep rescue framed as ongoing hardening, not the headline win

---

## Slide 8 - Understanding + Presentation

### On-slide meaning

- Lifecycle: `DUMP -> intake -> ONE_ACTION -> scaffold -> rescue -> reentry`
- `taskShape` helps MIND read the real intent of the input
- `client_resume` and `client_response` are still the only two workflows
- `scaffold_completion` is an internal scaffold subphase, not a new top-level route
- Reentry means coming back without rebuilding the task from zero
- If a demo part is not ready, say it directly instead of overclaiming

### What to say

Now explain the mental model. MIND is not a one-shot generator; it is a lifecycle. The user dumps context, MIND summarizes and classifies it, it suggests one action, it can scaffold that action into steps, it can rescue when the user is stuck, and it can help them reenter the task later. The `taskShape` layer is important because it lets MIND read the real intent instead of relying on one keyword. Also explain that `scaffold_completion` is only an internal scaffold subphase, not a new top-level route. If some demo path is still not ready, say that openly.

### Presenter cue

- Use a simple flow explanation
- Do not make the audience learn implementation jargon all at once
- Reassure them that the task stays in one place

---

## Slide 9 - Working System / Demo + Result / Evaluation

### On-slide meaning

- Demo A: proposal-start input
  - paste a messy client request with unclear requirements
  - show MIND reading it as proposal-start, not generic resume
  - show `1 Action` focused on requirements, assumptions, and inputs for timeline / price
  - show scaffold steps, then press `เสร็จแล้ว` through them
  - show the completion summary, then click `เริ่มงานใหม่` only when you want to reset
- Demo B: sales inquiry / demo request
  - paste a customer email asking for a pilot or demo
  - show the reply-first path only when the intent is truly to answer now
  - show that the system does not fall back to a generic project resume title
- Ready today: proposal-start, sales inquiry, scaffold completion, reentry
- Caveat today: rescue can be shown, but it should not be framed as the main hero demo
- Evidence today: desktop and mobile smoke are green, sales-inquiry smoke is green, task-flow repeat passes `5/5`

### What to say

This is the main live demo, and it should be run in a very specific order. First, paste a proposal-start input. Use a messy real example: a client wants a proposal, the requirements are unclear, notes are scattered, and timeline plus pricing are still blocked. Show that MIND reads it as proposal-start instead of generic resume. Then point to the `1 Action` output and explain that the first move is to lock requirements, assumptions, and the missing inputs before timeline or pricing.

Next, move into scaffold. Show that the current scaffold is step-based, not just a static three-bullet list. Press `เสร็จแล้ว` through the steps and tell the audience what happens: it advances step-by-step, and when the last step is done it does not jump back to the first input page. Instead, it shows a completion summary in the same task, and only then should you click `เริ่มงานใหม่` if you want to reset.

Then show the sales inquiry or demo-request input. This is important because it proves MIND is reading intent, not just keywords. For a customer asking for a pilot or demo, the output should feel like a reply-first case, not a generic project resume. Mention that this path is already covered by smoke, so the wording is protected from regressing.

If you choose to mention rescue, do it as a secondary path. Say clearly that rescue is available and useful, but it is still the caveat-managed part of the product and should not be sold as the main hero demo. If rescue happens to fail in live demo, do not hide it; explain that this is the part the team is still hardening.

### Presenter cue

- Demo order to follow:
  1. proposal-start example
  2. scaffold completion example
  3. sales inquiry / demo request example
  4. rescue only if needed
- If a demo part is not ready or not behaving as expected, say it directly
- Never overclaim rescue as a hero feature

---

## Slide 10 - Report + Closing Presentation

### On-slide meaning

- The report should prove the problem, scope, architecture, implementation, evidence, and limitations
- MIND turns client chaos into a next move
- MIND keeps helping through scaffold, rescue, and reentry
- MIND stays local-first and task-scoped
- The current release posture is controlled demo only, not broad launch
- The next step is a small closed beta with strict gate discipline, not scope expansion

### What to say

Close by bringing the story back to the report and the product direction. The report should not just say that MIND exists; it should prove the problem, the scope, the architecture, the implementation progress, the demo evidence, and the limitations. End with the product truth: MIND turns client chaos into a next move, stays with the task through scaffold, rescue, and reentry, and remains local-first and task-scoped. The right next step is a controlled demo or small closed beta, not broad launch yet.

### Presenter cue

- End with the product promise
- End with the current posture honestly
- Leave the audience with a clear next step
