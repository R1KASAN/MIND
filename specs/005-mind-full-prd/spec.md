# Feature Specification: MIND Full PRD

> [ARCHIVAL] This spec describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

**Feature Branch**: `005-mind-full-prd`  
**Created**: 2026-04-05  
**Status**: Finalized  
**Input**: Integrated PRD based on strategic roadmap, product analysis, UX guidance, and V2 constitution.

## 1. Product Overview

MIND is a local-first, mobile-first momentum tool designed exclusively for overloaded knowledge workers and freelancers. It is the tool users turn to when their traditional capture systems (task managers, notes, calendars) fail due to anxiety or sheer volume. MIND converts an unstructured brain dump into a single, trusted next step. It acts inherently as a Start-and-Recovery Engine, prioritizing immediate momentum over completeness or organization.

MIND is explicitly **not** a planner, task database, journaling app, or conversational AI.

## Clarifications
### Session 2026-04-05
- Q: Is the minimal, capped overview included in the MVP release, or deferred to post-MVP? → A: In MVP. It is a read-only, minimal overview showing the current action and up to 3 pinned items, kept secondary. Usage must be tracked via telemetry to ensure it does not harm momentum.
- Q: Is the threshold for Bounce-Back (stale session detection) exactly 24 hours or 72 hours? → A: 24 Hours. Keeps actions fresh and aligns with daily rhythms.
- Q: Should the execution phase be named "Start Scaffold" or "Start Scaffold"? → A: "Start Scaffold" (Option B). Shifts psychology from tracking deep-work to simply breaking inertia.
- Q: Are morning/evening rituals MVP or post-MVP? → A: In MVP as a lightweight, in-app morning intercept. No push notifications.
- Q: What exact trust surfaces are mandatory in MVP? → A: The Basic Trust Triad (Option A) — visible AI rationale, full JSON export, and a simple "Delete All Local Data" button.
- Q: Is multi-device sync explicitly deferred forever or just post-MVP? → A: **Deferred Post-MVP / Rejected per Constitution**. Multi-device sync conflicts with the local-only privacy identity of MIND. It is currently excluded from the core product identity to prevent planner-drift.

### Session 2026-04-06
- Q: What is the quality bar for a valid next action? → A: Specificity-based (Option B). The recommended action MUST be a specific, physical first step completable within 5 minutes. Vague outputs like "Work on your project" are invalid and must be rejected by the prompt contract.
- Q: When the user taps "Not this", what happens? → A: Rotate alternatives (Option B). Cycles through pre-computed alternative_actions already returned. After all alternatives exhausted, show Decision Board or prompt a new dump. No new AI call on rejection.
- Q: What should the Bounce-Back screen show and say? → A: Warm two-choice (Option B). Show only "You were working on [Action Title]. Want to continue or start fresh?" with exactly two buttons. No elapsed time, no guilt framing, no stats.
- Q: What is the primary evidence threshold that proves MIND works as a differentiated product? → A: Completion signal (Option B). >50% of beta sessions end with a "Done" tap (in-app completion) without mid-session drop-off. This proves users act on MIND's output directly rather than using external AI chat to plan it.
- Q: What happens when the user completes an action? → A: Silent loop (Option B). "Done" immediately resets to DUMP_ENTRY with a blank slate and a fresh prompt. No celebration screen, no animation.

## 2. Problem Statement & Goals

**Problem**: Traditional task managers create meta-work. When knowledge workers become overwhelmed, opening a task list triggers anxiety rather than action ("glazing over"). This leads to avoidance, task hoarding, and drop-off, stranding users without a clear entry point back into execution.

**Goals**:
- **Zero-Friction Capture**: Allow users to export emotional noise, fears, and vague tasks in one unstructured swipe without triage overhead.
- **Immediate Action**: Provide exactly one prioritized, atomic next action from the dump.
- **Safe Recovery**: Catch users who drop off or get blocked, helping them re-enter execution without shame or guilt.
- **Low Trust-Cost**: Ensure the AI selection provides immediately visible rationale so the user trusts the chosen objective.

## 3. Target Users & Personas

- **The Overloaded Freelancer**: Juggling multiple clients, contexts, and vague obligations. Needs to know the single most important fire to put out.
- **The Stalled Executive/Knowledge Worker**: Has advanced GTD systems but currently cannot look at them due to sheer dread or context fatigue. Needs someone/something to just make the first decision so they can start moving.

## 4. Product Scope (In-scope / Out-of-scope)

**In-Scope (MVP)**
- Unstructured text dump entry.
- Single-route state machine driving user from input to action.
- AI mechanism to reduce dump to 1 action + 3 micro-steps.
- Recovery flows: Rescue (during action) and Bounce-Back (after idle).
- Local-first browser storage.
- JSON export function.
- Manual fallback for offline/fail states.

**Out-of-scope (MVP and Beyond)**
- No editable backlog lists or Gantt charts.
- No general conversational AI interfaces.
- No calendar/email sync or external API ingestion.
- No remote cloud sync or multi-device sharing (strictly local-first). **Deferred Post-MVP / Rejected per Constitution.**
- No performance tracking, badges, timers, or streaks.

## 5. Key Experience & UX Principles

Per the MIND Constitution:
- **Movement over Completeness**: Never require sorting before starting.
- **One-Action-by-Default**: Never show a list of options initially.
- **Recovery is First-Class**: Graceful handling of delay.
- **Anti-Task-Graveyard**: Weekly resets archive un-pinned items automatically. The archive is search-only—no browse view.
- **Minimal, Capped Overview**: Read-only overview is included in MVP as a secondary screen. It shows only the current action and a maximum of 3 pinned items for trust and continuity. No full backlog or planning functionality.

## 6. User Journeys & Core Flows

### User Story 1 - The Overloaded Dump to One Action (Priority: P1)

**Description**: The user opens the app in a state of high anxiety and types multiple disconnected requirements and emotional vents into the entry box.
**Why**: This is the core "cold start" loop of the product.
**Independent Test**: Can the user type 5 sentences and receive one specific imperative sentence and 3 micro-steps back, with a rationale?
**Acceptance Scenarios**:
1. **Given** a blank entry state, **When** the user submits a messy dump with one clear deadline, **Then** the system outputs a single action based on that deadline and enters Start Scaffold.
2. **Given** the user is on the One-Action screen, **When** they tap "Not this", **Then** the system rotates to the next pre-computed alternative action (no new AI call). After all alternatives are exhausted, the system shows the Decision Board if alternatives exist, or prompts a fresh dump if none remain.

### User Story 2 - Start Scaffold Rescue (Priority: P1)

**Description**: The user accepts an action but stalls for 30 minutes, feeling blocked on the first micro-step.
**Why**: Proves the "Recovery is a First-Class Surface" principle.
**Acceptance Scenarios**:
1. **Given** the user is in Start Scaffold, **When** they tap "I'm stuck", **Then** the Rescue state appears with options: "Make it smaller" (break down step) or "Walk away and come back" (suspend and go to Dump).

### User Story 3 - Stale Session Bounce-Back (Priority: P2)

**Description**: The user abandons the app. They re-open it 25 hours later.
**Acceptance Scenarios**:
1. **Given** a last-active gap > 24h, **When** the app opens, **Then** the Bounce-Back state intercepts with exactly two elements: the previous action title and two buttons — "Continue" and "Start Fresh". No elapsed time is shown. No language referencing how long the user was away.

### User Story 4 - Manual / Offline Fallback (Priority: P2)

**Description**: The AI endpoint timeouts or parsing fails completely.
**Acceptance Scenarios**:
1. **Given** the AI is unavailable, **When** the user submits a dump, **Then** the app immediately surfaces the Manual Fallback input ("AI is offline. What is the single smallest step you can do?"), moving directly to Start Scaffold upon submission.

### User Story 5 - Morning Ritual (Priority: P2)

**Description**: The user opens the app for the first time on a new calendar day.
**Acceptance Scenarios**:
1. **Given** no session has occurred today, **When** the app opens, **Then** an optional, lightweight morning prompt intercepts the flow to encourage an initial brain dump without relying on push notifications.

## 7. Functional Requirements

- **FR-001**: System MUST accept plain text input with no mandatory structure or tagging.
- **FR-002**: System MUST transition directly from Dump to Synthesis to a One-Action view. The output action MUST be a specific, physical first step completable within 5 minutes. Vague or abstract actions (e.g., "Work on your project") are invalid output.
- **FR-003**: System MUST NOT display an editable list of parsed tasks to the user at any point.
- **FR-004**: Start Scaffold MUST ONLY display the accepted action and its micro-steps. It MUST NOT contain any timer UI.
- **FR-005**: Concept of User Settings/Overview MUST be present in MVP but strictly limited in visible state to: Current Action, up to 3 Pinned Evergreen items, and the number of resets. It MUST be read-only (no backlog editing) and secondary to the main dump/action flow. The UI MUST enforce a hard cap of 3 pinned items; the Pin button MUST be disabled with a "Max 3 pinned items" cue when the limit is reached. Analytics must track if overview access negatively correlates with time-to-first-action.
- **FR-006**: System MUST automatically archive all non-pinned items at a predefined weekly boundary (e.g., Sunday midnight).
- **FR-007**: System MUST provide a search bar to query the archive. It MUST NOT display the archive contents as a list.
- **FR-008**: System MUST implement a lightweight "first-session-of-the-day" intercept screen as a morning ritual. It MUST purely be in-app and NOT use OS push notifications.
- **FR-009**: System MUST explicitly implement the "Basic Trust Triad" in MVP: visible AI rationale next to actions, full JSON state export, and a "Delete All Local Data" button.
- **FR-010**: "Not this" on the One-Action screen MUST cycle through pre-computed alternative_actions without triggering a new AI call. When alternatives are exhausted: if the Decision Board has options, show it; if not, transition directly to DUMP_ENTRY. A new AI call on rejection is a specification violation.
- **FR-011**: The Bounce-Back screen MUST display only the previous action title and exactly two buttons ("Continue" and "Start Fresh"). It MUST NOT show elapsed time, days since last use, or any language that implies the user is behind or late.
- **FR-012**: When a user completes an action (taps "Done" in Start Scaffold), the system MUST transition immediately to DUMP_ENTRY. The transition MUST be silent, with no celebration screen, no animation, and no reflection prompt.

## 8. AI Layer Specification

**MVP Local-First Model Strategy**:
To guarantee absolute user privacy, zero recurring inference costs, and offline resilience, the MVP routes exclusively through a local Ollama runtime. Hosted APIs (e.g., OpenAI, Anthropic) are explicitly deferred to post-MVP as optional escalation paths only. Fine-tuning or complex training pipelines are completely out of scope for the MVP to minimize operational engineering overhead.

**Model Ordering & Tradeoffs**:
1. **Default MVP Model**: `qwen2.5:3b`. Strikes the best balance of speed, strict JSON schema adherence, and hardware requirements. (8GB RAM target).
2. **High-Quality Local Option**: `qwen3:4b-instruct`. Offered as an upscale option for logical depth on high-compute machines.
3. **Low-Resource Fallback**: `gemma3n:e2b`. Extremely lightweight fallback for resource-constrained devices.

**The Dump-to-Action Mechanism**:
The core zero-shot system prompt enforces a strict pipeline that local models must execute to maintain the momentum quality bar:
1. **Semantic Filtering**: Ignore vents; extract objective tasks.
2. **Urgency & Feasibility Scoring**: Score tasks implicitly by deadlines ("today", "urgent") and concreteness.
3. **Single Selection**: Output only the top-scoring task.
4. **Compression**: Rewrite the chosen task as a single, present-tense imperative sentence that describes a **specific physical action completable within 5 minutes**. Vague outputs (e.g., "Work on your project") MUST be rejected by the prompt constraint.
5. **Micro-stepping**: Generate exactly 3 physical, <5-minute steps.
6. **Rationale**: Supply 1 sentence explaining why this was chosen.

**Guardrails & Fallback Integrations**:
- The prompt explicitly forces a structured JSON output. Runtime execution utilizes libraries (e.g., Zod) to validate exact parameter shapes. 
- If a local parse failure occurs, the AI loop retries exactly once with an error formatting hint.
- If the retry fails, if the model times out (**12s safety bound** for local cold starts), or if the Ollama runtime is disconnected entirely, the app triggers **Manual Fallback** to ensure execution is never completely blocked.
- Emotional vent limits: If the model detects severe distress without actionable tasks, it returns physical grounding instructions rather than failing.

## 9. Data, Local-first & Sync Requirements

- **Primary Storage**: Browser Web APIs (IndexedDB) wrapped for seamless asynchronous persistence.
- **Local-First Privacy & Offline Resilience**: By pairing local IndexedDB state arrays with a local Ollama model runtime, the user's dump entries and parsed steps never leave the device boundary. The application retains full UI rendering if the model fails/connection drops, pushing the user immediately onto the offline Manual Fallback flow to capture momentum.
- **Setup Help**: Include a small, tertiary link to "Setup local AI" inside `ManualFallback` or `TrustOverlay`. This must be a **non-blocking** reference to local documentation or a modal tooltip. It MUST NOT introduce a new route or wizard flow.
- **Data Export**: Users can export all unified session state and historical dump logs to a readable `.json` file at any time.
- **Sync**: **Deferred Post-MVP / Rejected per Constitution**. Explicitly out-of-scope. External database hosting and sync logic conflict directly with the atomic, local-only nature of MIND v3.0.0.

## 10. Metrics & Success Criteria

- **SC-001**: 80% of sessions progress from opening the app to accepting an action within 30 seconds.
- **SC-002**: <10% of sessions result in "Manual Fallback" triggered by unresolvable local AI timeouts, parsing failures, or Ollama offline errors.
- **SC-003**: >50% of users who tap "I'm Stuck" choose "Make it smaller" and complete the action rather than abandoning the session.
- **SC-004**: >60% of Bounce-Back encounters result in a successfully accepted action within the same session.
- **SC-005 (Primary Differentiation Proof)**: >50% of sessions in the 50-user beta end with a "Done" tap (in-app `scaffold_completed` completion signal). This proves users directly act on the locally synthesized action step without needing external hosted chatbots.
- **SC-006 (Model Telemetry)**: The application correctly routes telemetry measuring the local model used (`qwen2.5:3b`, etc.) against the user rejection rate ("Not this"). This provides visibility into specific model quality against the rigid 5-minute action parameter validation.

## 11. Risks, Assumptions & Open Questions

## 11. Risks, Assumptions & Open Questions

**Assumptions**:
- Target users value psychological momentum over control, accepting they cannot curate the backlog like traditional apps.
- The default 3B to 4B parameters class of local open-weight models running on Ollama natively can maintain zero-shot structural adherence, eliminating the need for a secondary fine-tuning process.
- Target hardware constraints afford the thermal capacity and active memory limits to ingest, process, and output the required JSON arrays within an 8-second time window.

**Risks**:
- *Hardware Schema Fragility*: `qwen2.5:3b` may struggle to adhere to structurally strict micro-steps array nesting consistently. Mitigated by demanding minimal fields natively on output and enforcing 1-turn retry schema guards.
- *Open-Weight Abstract Drift*: Sub-5B models acting under stress may output vague action properties. Mitigated by explicit zero-shot definitions demanding specific, <5 minute physical boundaries within the base system prompt instructions—with seamless Manual Fallback if the user rejects them.
- *External Chatbot Detours*: Users accept the single step but export context directly into external tools to process, destroying the value of MIND as an independent execution center. Tracked via `SC-005` correlation.
- *Archive panic*: Users feel their thoughts are "lost". Mitigated by clear messaging about the searchability of the archive.
