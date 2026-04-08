# Feature Specification: MIND Core Product Requirements (PRD)

**Feature Branch**: `004-core-prd`
**Created**: 2026-04-05
**Revised**: 2026-04-05
**Status**: Finalized

---

## Section 1: Product Positioning

### Who MIND is for

Knowledge workers and freelancers who regularly experience task overload — not because they lack tools, but because they cannot start. Target users have a capture system (notes, task managers, emails) that has become too large to trust. They open it, feel worse, and close it. They need momentum, not more organization.

MIND is for the moment the system stops working. It is the tool for "right now, when I'm overwhelmed."

### What job it does

MIND converts mental clutter into one trusted next move, helps the user begin with minimal friction, and provides a recovery path after interruption, avoidance, or drop-off.

More precisely:
- Accepts an unstructured brain dump as input
- Extracts a single prioritized next action
- Scaffolds the user through beginning that action
- Recovers gracefully when the user stalls or disappears

### What MIND is explicitly not

- Not a task manager or backlog system
- Not a calendar or planner
- Not a journaling app
- Not a general-purpose AI chatbot or assistant
- Not a habit tracker, streak app, or productivity coach
- Not a pomodoro timer or time-tracking tool
- Not a project management tool or substitute for Jira or Notion
- Not a tool for reviewing completed work or historical summaries

---

## Section 2: Core Experience Pillars

**P1 — One Action Default.**
The system's output must always be a single next action. **Implication**: Multiple results, ranked lists, or suggested sequences must never appear in the main flow.

**P2 — Dump First, Then Triage.**
The user must export mental load before any prioritization occurs. **Implication**: The entry state must be a blank input surface — no task list, no backlog count, no overdue indicators visible before dumping.

**P3 — Momentum Over Completeness.**
Moving is more important than being organized. **Implication**: Losing a task to the archive is a designed trade-off, not a failure state. The system must communicate this clearly and without apology.

**P4 — Recovery is a First-Class Surface.**
Users will stall, drop off, and return. This is expected behavior. **Implication**: The re-entry experience must equal the first-entry experience in care and design effort. Shame-free re-entry is a product requirement, not copy guidance.

**P5 — Trust must be explicit, not assumed.**
Users handing over priority control to an AI will doubt the selection. **Implication**: Every recommended action must include a brief rationale ("why this, why now") visible at the moment of decision.

**P6 — Local first, narrow scope.**
MIND does not require connectivity to function and must not grow into a data platform. **Implication**: All MVP state lives on-device. Server sync is a post-MVP decision.

---

## Section 3: Refined Solution

### Brain Dump to Action — Mechanism

The brain dump is the only input surface at session start. The user writes freely — tasks, fears, obligations, noise, emotional context — in a single text field. There is no structured input: no tags, priorities, deadlines, or categories.

When the user submits:

1. **Semantic filtering:** The AI strips emotional noise, venting, and filler to extract functional task candidates.
2. **Urgency inference:** The AI scores inferred urgency using explicit language signals: deadlines mentioned, words like "today," "must," "urgent," "waiting on me," domain signals (client vs. personal), and syntactic emphasis.
3. **Conflict detection:** If two or more candidates score within a narrow urgency band across conflicting life domains, the AI sets `requires_clarification: true` and surfaces a single 1-tap disambiguation prompt ("Is X due today or by end of week?"). This is not a conversational follow-up — it is a binary or short-answer gate before synthesis completes.
4. **Selection:** The AI selects the single item with the highest combined urgency + feasibility score. Feasibility is inferred from action language: concrete, actionable phrasings score higher than vague obligations.
5. **Reduction:** The AI compresses the selected action into an atomic imperative (one sentence, present tense, specific). It does not paraphrase the original input — it translates it into executable form.
6. **Micro-step generation:** The AI generates exactly three micro-steps for the Start Scaffold. These must be physical, observable, and completable in under five minutes each.
7. **Alternative generation:** The AI secretly generates up to two fallback actions. These are sent in the same payload but hidden from the user unless the Mini Decision Board is triggered.

The AI never asks follow-up questions beyond the single clarification gate. It never summarizes the dump back to the user. It returns structured JSON only.

### One-Action Engine — Rules

- Default output: exactly one action. No exceptions.
- One clarification nudge permitted before synthesis: binary or short-answer only.
- "Not this" button allows soft rejection. Counter is stored in session state.
- After two rejections: surface the Mini Decision Board with the two hidden alternatives. Maximum of three options total (primary + two). The board must frame primary as recommended: "We think this one, but you can switch."
- After the board: the user must select one. No further cycling permitted. If all are rejected, the system prompts a new dump.
- "Make it smaller" does not rotate to a new action. It invokes a micro-step reduction on the current action: splits the first micro-step into two smaller sub-steps. Maximum one invocation per action before a new dump is required.

### Momentum Snapshot (Overview) — Rules

A lightweight overview surface is permitted under strict conditions:

- **Trigger**: User explicitly requests it (not shown by default).
- **Contents**: Current action status, up to 3 pinned evergreen items, and current week count (number not list). Nothing else.
- **Prohibited in overview**: Task lists, archived items, completion percentages, overdue counts, streaks, urgency ranks.
- **Post-MVP only**: If overview causes re-entry confusion or backlog anxiety in beta testing, it is removed entirely.

### Daily Ritual — Post-MVP

A minimal "morning entry" prompt (e.g., "What's the one thing today?") is a candidate for post-MVP. It must not add any structured input, list review, or planning surfaces. If implemented, it must be a thin wrapper over the existing dump flow with no additional state.

---

## Section 4: Focus Mode

### Role in Starting

Focus Mode is the Start Scaffold. It exists to hold the user inside the chosen action after they accept it — not to introduce timers, sessions, or tracking. Its job is to remove the "where do I start within this task?" friction by showing the three micro-steps generated by the AI.

### Role in Continuing

Focus Mode does not track time or enforce sessions. It persists the current action and micro-steps on screen while the user works. The user can mark steps done informally (tap to strike through). No logging occurs.

### Required Controls

- **"I'm stuck"**: Triggers Rescue. Visible at all times inside Focus Mode.
- **"Make it smaller"**: Visible in Focus Mode. See constraints above.
- **"Done"**: Completes the action, returns to Dump entry for the next cycle.

### Safeguards

- Focus Mode must not introduce any time-based UI element (timers, countdowns, elapsed time displays).
- Focus Mode must not track or display completion rates, streaks, or productivity scores.
- Focus Mode must not grow into a separate app section with navigation.

### MVP Decision

Focus Mode as described is MVP. It is a passive holding display. Any expansion into deep-work tooling, session tracking, or ambient timers is a scope violation and must be blocked at the constitution gate.

---

## Section 5: Recovery Model

### Rescue — Intra-Session Recovery

**Trigger**: User taps "I'm stuck" while in Focus Mode.

**State entered**: Rescue state. Replaces current Focus Mode view.

**Response logic**:
1. Surface a single supportive prompt. Copy must be non-shaming. Example: "It's okay to pause. What's one physical thing you can do right now?"
2. Offer two options only: "Make it smaller" (reduce the current micro-step further) or "Walk away and come back" (return to Dump entry, current action suspended but preserved).
3. Do not suggest a new action. Do not offer a list. Do not review the dump.

**Frequency rule**: Rescue can be triggered multiple times in a session. There is no limit. There is no tracking visible to the user.

**Copy rules**: No urgency language. No "you should." Permissive, warm, brief.

### Bounce-Back — Inter-Session Recovery

**Trigger**: App opened when `lastActive` timestamp is older than 24 hours AND session state is not `COMPLETED`.

**State entered**: Bounce-Back state. Shown before the Dump entry surface.

**Response logic**:
1. Single sympathetic prompt. Example: "It's been a while. No pressure — where would you like to start?"
2. Two options: "Fresh start" (clear session, go to Dump) or "Resume" (show the suspended action from the previous session, allow accept or discard).
3. If resumed action is discarded, go to Dump. If accepted, go to Focus Mode.
4. No overdue indicators. No "you haven't opened the app in N days." No progress summaries.

**Frequency rule**: Bounce-Back triggers once per cold re-entry. After first interaction, does not re-trigger for the same session.

**Copy rules**: No shame or urgency escalation. Treat the return as normal behavior, not as failure.

---

## Section 6: AI Decision Rules

### Inputs Allowed

- Current text dump only (plain text, current session)
- Previous dump context is **not** fed to the model
- Archive content is **never** included in context
- Pinned evergreen item titles may be included as a lightweight signal (one line each, no details)
- No calendar data, email, or external integrations in MVP

### Selection Logic

The model must apply this reduction order:
1. Filter emotional noise and venting — extract task-shaped sentences only
2. Score urgency using explicit language signals (deadline markers, domain signals, emphasis)
3. Score feasibility using action specificity (concrete verbs score higher than vague obligations)
4. Select the highest combined score
5. If two candidates are within scoring tolerance across conflicting domains: set `requires_clarification: true`, generate a 1-tap nudge, return without an action
6. After clarification, re-score with updated signal and select

### Reduction Rules

- Output must be a single atomic imperative sentence. Present tense. Specific.
- Rationale: one sentence. Must reference at least one signal from the dump.
- Micro-steps: exactly three. Physical, observable, completable in under five minutes each.
- Alternative actions: zero, one, or two. Hidden in payload. Only surfaced on board trigger.
- Token budget: output must be completable within `max_tokens: 300` at temperature `0.1` or lower.
- No markdown, preamble, explanation, or conversational filler in output.

### Explainability Rules

- Every recommended action must include a rationale field.
- Rationale must be user-facing. It must not reference model internals or scoring.
- Rationale example: "You mentioned this is due today and it's the only client-facing item in your dump."
- Rationale must be shown alongside the action. It must not be hidden behind a disclosure.

### Fallback and Manual Continuation Rules

**Parse failure (first attempt)**: Retry once with an explicit formatting correction appended to the system prompt. Log `synthesis_failed` at origin.

**Parse failure (second attempt)**: Do not retry. Enter Manual Fallback state. Emit `fallback_manual_sort_shown`.

**Endpoint unavailable (timeout > `AI_TIMEOUT_MS`, network error, non-200 response)**: Skip both retry attempts. Enter Manual Fallback state immediately. Display a clear, non-scary user message explaining the AI is offline and the user can sort manually.

**Manual Fallback state**: User is prompted to write the single smallest next step themselves, in a plain text input. This step is accepted as-is and moves directly to Focus Mode. No AI involvement. The session proceeds normally.

**Vague or generic output** (e.g., action is "Do your tasks"): Not validated in MVP. Post-MVP, implement a vague-output classifier. For now, rely on prompt constraints and temperature settings to reduce this risk.

---

## Section 7: Local-First and Trust Model

### Local-First Behavior

- All session state, action history, and archive are stored exclusively in browser IndexedDB via `idb-keyval`.
- No account creation required in MVP.
- No data leaves the device in MVP without explicit user action.
- The `/api/ai` route is the only network call. It sends the current dump text only. It receives a structured JSON payload. Nothing else is transmitted.

### Optional Sync Boundaries (Post-MVP)

- Cloud sync is a post-MVP decision gated on beta completion.
- If sync is introduced, it must be opt-in, not default.
- Sync must not require account creation as a precondition for using the app.
- No third-party analytics or telemetry SDKs in MVP. Console logging only.

### Export and Portability

- Beta users must be able to export their full IndexedDB state as a single JSON file.
- Export must be accessible from the app without contacting a server.
- Export format must be human-readable and importable.
- Archive search results must be exportable via the same mechanism.

### Privacy and Trust Implications

- Dump text is transmitted to the `/api/ai` endpoint per session. Beta users must be informed of this.
- If using a local Ollama endpoint, no data leaves the device at all. This must be communicated to users.
- No dump text is stored server-side in MVP. The API route is stateless.
- Weekly reset destroys current-week data from the main context. Users must be informed that archive is the only recovery path, and that it is search-only.

---

## Section 8: Product Differentiation

### What MIND Borrows

- **From GTD / inbox tools**: The brain dump as a frictionless capture entry point.
- **From focus apps**: A clean, distraction-free execution holding surface.
- **From journaling tools**: Tolerance for unstructured, emotionally-laden input.
- **From triage systems**: The principle that one prioritized action beats a ranked list.

### What MIND Explicitly Avoids

- List-based review at entry (avoids re-triggering overload)
- Punitive tracking — no streaks, no overdue counts, no "days since last session"
- Manual tagging and sorting (blocks the manual triage problem)
- Conversational AI UX (avoids prompt engineering burden on user)
- Planner-like overview surfaces at any point in the primary flow
- Any UI pattern that resembles a task database or backlog

### Differentiation Statement

MIND is not a tool for managing tasks. It is a tool for starting one. Every design, copy, and AI decision must serve this distinction. When MIND works, the user moves. When MIND fails, the user can still move, because the manual fallback path always exists.

---

## Section 9: Risks and Mitigations

### Product Risks

**Risk: Black Box Anxiety.** Users panic that hiding tasks means losing them. They maintain a parallel system, rendering MIND optional.
**Mitigation**: Communicate the archive clearly and early. The archive always holds prior actions. It is always searchable. The weekly reset is framed as deliberate declutter, not deletion. Three pinned evergreen items provide a visible safety net visible in the Momentum Snapshot.

**Risk: The Rejection Slot Machine.** Avoidant users exploit "Not this" and "Make it smaller" to delay starting indefinitely.
**Mitigation**: Hard limit on decision board cycling (maximum three options, no further cycling). If all alternatives are rejected, the system prompts a new dump — it does not negotiate.

**Risk: AI Misjudges True Priority.** The model cannot see calendars, emails, or commitments not in the dump.
**Mitigation**: The system prompt explicitly instructs users to include deadlines when they dump. The clarification gate exists for ambiguous high-urgency conflicts. For MVP: the user owns accuracy. MIND owns reduction.

### UX Risks

**Risk: Focus Mode creep.** Design pressure to make Focus Mode richer creates a timer suite.
**Mitigation**: Constitution gate blocks timers, session tracking, and deep-work features.

**Risk: Overview anxiety.** An overview surface, if poorly designed, recreates the list-glazing problem.
**Mitigation**: Overview is post-MVP by default. If included in MVP, it is gated behind explicit user request and capped at the three pinned items plus current action. No lists visible.

### AI Trust Risks

**Risk: Prompt engineering fragility.** Model upgrades or temperature changes silently break emotional safety behavior.
**Mitigation**: Automated regression tests (T025) validate physical grounding responses against a fixed distress prompt fixture set before any model or prompt change.

**Risk: Vague output degrades trust.** A generic action ("work on your project") erodes user confidence faster than a wrong action.
**Mitigation**: Post-MVP vague-output classifier. MVP relies on prompt constraints and temperature controls.

### Scope Creep Risks

**Risk: Feature pressure toward backlog management.** Users request "a place to see everything."
**Mitigation**: This is a constitution violation. Archive is search-only. No list view will be built. Overview is capped.

**Risk: Emotional safety as an excuse for inaction.** Recovery flows that are too comfortable become an avoidance tool.
**Mitigation**: Rescue and Bounce-Back must not enable indefinite cycling without a new dump. After one Rescue invocation, returning to Dump entry is always an option. The system does not hold the user inside Recovery.

### Local-First / Sync Risks

**Risk: Data loss on browser clear.** IndexedDB is volatile. Beta users can lose all state.
**Mitigation**: Explicit warning to beta users at onboarding. Export function available at all times. Acceptable for 50-user behavioral validation; not acceptable for public launch.

**Risk: IndexedDB failure silently breaks the app.** State read/write failures are not surfaced.
**Mitigation**: All idb operations must be wrapped in error boundaries. If a state read fails, the app must fall back to a clean dump entry state, not crash.

---

## Section 10: Open Questions

1. **Bounce-Back threshold**: Is 24 hours the right stale-session trigger? A user who works a night shift may open the app 26 hours later without any session abandonment. Should the trigger be configurable or inferred from usage patterns? This affects Bounce-Back UX design.

2. **Pinned evergreen item UX**: When a pinned item survives the weekly reset, does it auto-insert into the next session's dump context, or does the user see it only in the Momentum Snapshot? Inserting it changes the AI's selection logic and may override a more urgent current-week item.

3. **Manual fallback depth**: When the AI is offline and the user writes their own action, should that action receive AI-generated micro-steps when the AI recovers, or does it enter Focus Mode with generic placeholder steps? This affects Focus Mode behavior in degraded conditions.

4. **Emotional safety threshold**: What constitutes a distress signal that should trigger physical grounding instead of task extraction? "I can't do this" may mean "this task is hard" or "I am in crisis." Drawing this line wrong in either direction is a product risk. The current system prompt relies on heuristic language detection without clinical grounding. This must be defined before any expansion of the emotional safety system.

5. **Overview timing**: If an overview surface is introduced, at what point in the session is it permitted? Showing it before a dump re-introduces backlog anxiety. Showing it after may interrupt momentum. The correct insertion point is unresolved.

---

## Functional Requirements

- **FR-001**: System MUST accept unstructured text input with no required fields, tags, or structure.
- **FR-002**: System MUST return exactly one recommended action as the default AI output.
- **FR-003**: System MUST display action rationale alongside every recommendation.
- **FR-004**: System MUST enter Manual Fallback state when the AI fails twice or is unreachable.
- **FR-005**: System MUST enforce a hard maximum of three options in the Mini Decision Board.
- **FR-006**: System MUST detect stale sessions (>24h) and route to Bounce-Back before Dump entry.
- **FR-007**: System MUST archive all non-pinned actions at the weekly boundary.
- **FR-008**: System MUST enforce a hard maximum of three pinned evergreen items at any time.
- **FR-009**: System MUST restrict archive access to search-only. No list view.
- **FR-010**: System MUST NOT include archive content in the AI context window.
- **FR-011**: System MUST NOT display timers, session lengths, or time-based tracking in Focus Mode.
- **FR-012**: System MUST NOT display overdue counts, streaks, or failure indicators at any entry point.
- **FR-013**: System MUST allow the user to export all local state as a JSON file without a server call.

---

## Success Criteria

- **SC-001 — Time-to-Start**: Median duration from app open to entering Focus Mode is < 30 seconds across 80% of sessions in the beta cohort.
- **SC-002 — Bounce-Back Conversion**: > 60% of Bounce-Back sessions result in a new action being accepted within the same session.
- **SC-003 — Weekly Reset Retention**: > 75% of users who experience a weekly reset return to the app within 48 hours.
- **SC-004 — Manual Fallback Frequency**: < 10% of synthesis attempts result in Manual Fallback, indicating acceptable model reliability.
- **SC-005 — Rejection Rate**: < 20% of sessions trigger the Mini Decision Board (i.e., fewer than 1 in 5 users rejects the primary action twice).
- **SC-006 — Recovery Conversion**: > 50% of Rescue-triggered sessions result in the user returning to Focus Mode rather than discarding the session.

---

## Assumptions

- Users are willing to give control of priority selection to an AI system in exchange for reduced cognitive load.
- The target user has a meaningful volume of obligations (not a minimal task list) that generates genuine overload.
- Local IndexedDB is stable enough for a 50-user behavioral validation beta.
- Open-weight models (Llama 3.x 8–13B, DeepSeek V3.x) can reliably output structured JSON conforming to the `ai-synthesis.json` contract with prompt constraints and Zod validation.
- The app will be distributed as a web app and accessed primarily on mobile browsers.
- No authentication is required for the closed beta.
- Beta users accept that clearing browser storage destroys their local data.
