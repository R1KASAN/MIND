<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MIND Product Doctrine

Use this file as standing context whenever you work on code, UX, architecture, copy, or docs for MIND.

## Active Plan

Current prototype sprint: `docs/product/prototype-completion-plan.md`.
Evidence-loop reference plan: `docs/product/next-round-evidence-backed-one-action.md`.
Read the prototype sprint first unless the task is specifically about evidence-loop internals.

## Product Definition

MIND is a **local-first AI task copilot for solo client-facing knowledge workers**.

MIND should take a user from:
- scattered context for one task
- to a next move they can actually start
- and stay helpful until that task moves forward

MIND is not:
- a generic to-do app
- a second brain or note-taking app
- a team project workspace
- a generic chatbot

## Launch Segment

Primary users:
- freelancers
- consultants
- boutique agency leads
- coaches / strategists
- designers / developers with multiple clients

Primary pains:
- client work goes stale
- long feedback or unclear scope
- context is scattered across chat, email, PDFs, screenshots, notes
- users have low energy and struggle to restart a task

Do not optimize v1 for:
- students
- team workspace use cases
- generic second-brain workflows
- planner/task-manager breadth
- document workspace or file-manager behavior

## How MIND Wins

MIND does not win on breadth. It wins on depth of one task.

Prioritize these differentiators:
1. **Task-scoped memory**
   - The system should remember where a task actually is, not just what files or chats exist.
2. **AI across the whole task lifecycle**
   - AI must help across intake, action, scaffold, rescue, and reentry.
3. **Rescue + reentry**
   - The product must help when the user is stuck or returning after a break.
4. **Local-first trust**
   - Privacy and on-device processing are part of the product promise, not optional polish.

Every product and implementation decision should support at least one of these jobs:
- Help me reply to a client without rereading everything.
- Help me restart this task without forcing me to think from zero.
- Help me when I am stuck, not only when I begin.

## AI Lifecycle Model

AI should behave as a **persistent copilot**, not a one-shot generator.

Human-AI boundary:
- AI is responsible for synthesis, prioritization, decomposition, diagnosis, rescue options, and reentry briefs.
- Humans are responsible for final sending, acceptance/rejection, sensitive decisions, judgment calls, and execution.

### Phases

1. **Intake / Dump**
   - AI classifies the workflow, summarizes the room, detects blockers, and extracts candidate tasks.
   - Use `sourceText`, `extractedText`, `sourceFiles`, `pendingInputs`, and `lastFailureReason`.

2. **ONE_ACTION**
   - AI proposes a primary action, explains tradeoffs, and supports negotiation against user constraints.
   - Use room digest, blockers, constraints, and prior attempts.

3. **SCAFFOLD**
   - AI breaks work into executable steps, refines them, reorders them, suggests shortcuts, and can produce lightweight draft artifacts.
   - `micro_steps` should evolve into a living scaffold.
   - “Make it smaller” must be an AI-backed refinement operation, not string decoration.

4. **RESCUE**
   - AI diagnoses why the user is stuck and returns a rescue mode that fits the actual failure.
   - Supported stall reasons:
     - `missing_context`
     - `dependency`
     - `unclear_scope`
     - `too_big`
     - `low_energy`
     - `unknown`

5. **MORNING_RITUAL / BOUNCE_BACK**
   - AI should create a reentry brief, cut noise, and suggest the highest-value next rooms or actions.

## Architecture Direction

Prefer an **operation-based AI architecture**, not a single synthesis pipeline.

Expected AI routes:
- `/api/ai/intake`
- `/api/ai/action`
- `/api/ai/scaffold`
- `/api/ai/rescue`
- `/api/ai/reentry`
- `/api/ai/health`

Each operation should have:
- its own prompt and contract
- its own timeout / repair behavior
- its own eval and fallback expectations

### Task and State Model

Keep two levels of state:

1. `uiRoute`
- `DUMP_ENTRY`
- `SYNTHESIZING`
- `ONE_ACTION`
- `SCAFFOLD`
- `RESCUE`
- `BOUNCE_BACK`
- `MANUAL_FALLBACK`

2. task-level `assistantMode` or subphase
- `intake_review`
- `action_negotiation`
- `scaffold_refinement`
- `rescue_diagnosis`
- `reentry_brief`

Do not grow `page.tsx` with many more top-level routes.

### Layered Architecture

Prefer this structure:
- UI layer: components, route shell, panels
- Orchestration layer: task events, transitions, operation selection
- AI services layer: prompt builders, operation handlers, contracts, repair
- Persistence layer: IndexedDB, selectors, normalization

Target direction:
- `src/app/page.tsx` should be a shell
- orchestration should move into task-machine / task-events style modules
- AI contracts and operations should be separate by phase

## UX Principles

Use an **embedded copilot** model, not a chat-first model.

Preferred interaction shape:
- main canvas = the task / room
- AI = sidekick panel or assistant layer tied to the current phase
- clear action buttons beat empty chat prompts

Preferred quick actions:
- summarize this
- propose the next move
- make it smaller
- help me when I am stuck
- help me get back into this task

### Trust and Provenance

When AI gives output, show lightweight provenance where helpful:
- what context it used
- what changed from the last round
- why this was recommended
- when it is uncertain

Useful trust-loop actions:
- use this
- revise
- make it smaller
- not like this
- why this

## Copy and Narrative

Write for **solo client-facing knowledge workers**.

Anchor copy in these ideas:
- client chaos -> next move
- local-first privacy
- task continuity
- rescue and reentry

Useful narrative lines:
- “Paste your client chaos. Get the next move.”
- “ตอบลูกค้าและกลับมาเริ่มงานค้างได้ในไม่กี่นาที โดยไม่ส่งข้อมูลออกนอกเครื่อง”
- “AI ที่อยู่กับงานหนึ่งชิ้นจนมันขยับ ไม่ใช่แค่ช่วยคิดตอนเริ่ม”

Avoid copy that makes MIND sound like:
- a productivity suite
- a note app
- a generic assistant
- a team collaboration tool

## Roadmap Priority Order

When proposing scope or implementation, prefer this order:
1. Split AI operations and move orchestration out of `page.tsx`
2. Make scaffold refinement and “make it smaller” AI-backed
3. Turn rescue into diagnosis + rescue plan
4. Turn bounce-back / morning ritual into reentry brief
5. Polish onboarding and narrative after the product behavior is real

## Guardrails

Do not propose features that drift MIND into:
- generic to-do / planner behavior
- team workspace breadth
- document management
- file browser / file manager primary UX
- open-ended chat as the main product surface

Treat this doctrine as the product ground truth unless a newer version explicitly replaces it.
