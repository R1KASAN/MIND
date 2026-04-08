# Feature Specification: MIND Start & Recovery System

**Feature Branch**: `002-start-recovery-system`  
**Created**: 2026-04-05  
**Status**: Draft  

## Problem Statement
Overloaded workers and freelancers suffer from cognitive paralysis when confronted with their mounting responsibilities. The mental tax of prioritizing, sorting, and breaking down amorphous tasks prevents them from taking the first step. They don't need another place to store their tasks—they need a system that decides what to do right now, mitigates the guilt of dropping off, and actively assists them in restarting.

## Product Differentiation
- **What MIND is:** A ruthless start-and-recovery engine. It operates on the principle of reducing cognitive load to zero by taking a messy, unstructured brain dump and synthesizing it into exactly one undeniable next action.
- **What MIND is not:** A generic AI chatbot, a task database, a calendar planner, or a habit tracker.
- **Compared to GTD/Inbox tools:** Those tools are strong at capture but fail to convert an overwhelming inbox into a single next move without intense manual triaging.
- **Compared to Focus apps:** They block distractions but assume the user already knows exactly what they should be focusing on.
- **Compared to Brain dump apps:** They help vent chaos but lack guided starting and recovery systems.
- **Compared to Planning tools:** They manage calendars well but are terrible at single-action recovery when the day deviates from the schedule.

## Solution Approach
MIND uses an "Anti-Overload Algorithm" focusing purely on movement rather than completeness of planning. By funneling all inputs through decision-reduction rules, it forces the user into action.

### Decision-Reduction Rules
1. **Reduce, never expand:** The AI must consolidate tasks and reduce options, never output lists or choices. [NEEDS CLARIFICATION: Should the system strictly enforce *never* showing more than one recommendation even if the AI detects two equally urgent priorities across distinct life domains (Work vs. Personal)?]
2. **Shrink immediately:** If a user flags an action as "Too Big", the system immediately shrinks it natively; no prompt engineering required.
3. **Contextual Preservation without Guilt:** The system preserves just enough context to revive momentum later, avoiding compounding past-due tasks.

## Core User Flow
The primary loop of the system:
1. **Overload:** User opens the app feeling overwhelmed.
2. **Brain Dump:** User dictactes or types raw, unstructured thoughts and anxieties.
3. **One Next Action:** System processes the dump and outputs exactly one atomic action.
4. **Guided Start:** User clicks "Start" to enter Focus Mode.
5. **Rescue:** If user stalls, they trigger a rescue intervention to unblock or pivot.
6. **Bounce-back:** If user abandons the session entirely, upon return the system asks "Where are we?" instead of punishing them with overdue flags.

## Recovery Model
The system acknowledges that plans fail and days slip. 
- **Stall Recovery (Rescue Mode):** Active within a session when a user gets stuck. Shrinks the task or enforces a break.
- **Session Recovery (Bounce-back Mode):** Active across sessions. The system abandons rigid prior schedules. It uses what was historically relevant, asks the user for a quick status shift, and generates a new path forward instantly without forcing the user to reorganize past items. [NEEDS CLARIFICATION: How long should historical context be retained across disparate sessions before the system considers it stale and requires a completely fresh brain dump from the user?]

## Focus Mode Rules
- **What Focus Mode is for:** Providing a distraction-free, single-pane environment exclusively for the execution of the active "One Next Action".
- **What Focus Mode is NOT allowed to become:** A pomodoro timer suite, a time-tracking billable hours logger, or a multi-tab browser. 
- [NEEDS CLARIFICATION: Since Focus Mode requires additional UI state management and possibly native notifications, should it remain a prerequisite block in the immediate MVP, or can the MVP solely target the Brain Dump -> Next Action conversion?]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chaos to Single Action (Priority: P1)
Overloaded user inputs a chaotic mix of life and work tasks. System must return a single next viable action.

**Why this priority**: Core value delivery.
**Independent Test**: Provide 5 disparate tasks; system returns 1 atomic next step.
**Acceptance Scenarios**:
1. **Given** a raw text input, **When** submitted, **Then** the AI extracts the most blocking task and formulates it as a single instructional string.
2. **Given** the generated action is displayed, **When** user taps "Too Big", **Then** the AI returns a smaller fractional step of that same action.

### User Story 2 - Dropped Session Recovery (Priority: P1)
User leaves app mid-task and returns a day later.

**Why this priority**: Required for the 'recovery engine' paradigm.
**Independent Test**: Simulate session timeout; verify app launches Bounce-back mode.
**Acceptance Scenarios**:
1. **Given** an expired session, **When** app boots, **Then** UI shows Bounce-back state asking to recalibrate context.

### User Story 3 - Guided Execution (Focus Mode) (Priority: P2)
User initiates the action and enters a focused execution state.

**Why this priority**: Important for flow, but not conceptually blocking the dump-to-action engine.
**Independent Test**: Verify UI hides all elements except current task and "Done"/"Rescue" actions.
**Acceptance Scenarios**:
1. **Given** an action, **When** user starts, **Then** only the action and exit/rescue buttons are visible.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST accept unstructured text input.
- **FR-002**: System MUST return exactly one synthesized action per dump via AI processor.
- **FR-003**: System MUST provide a "Shrink" / "Too Big" control.
- **FR-004**: System MUST trigger Bounce-back mode if last activity was > 4 hours ago.
- **FR-005**: System MUST provide a "Rescue" action during an active task state.

### Key Entities
- **BrainDump**: Source of truth for raw intention.
- **Action**: The single synthesized output.
- **SessionState**: Tracker for `active`, `stalled`, or `expired`.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: "Time to Action": Users receive their next step within 5 seconds of submitting a dump.
- **SC-002**: "Bounce-back Engagement": 70% of returning users experiencing a session drop-off engage with the bounce-back prompt to get a new action, rather than closing the app.

## Risks and Mitigations
- **Risk:** AI hallucinates a next step that has no relevance to the brain dump.
  - **Mitigation:** Strict system prompting and temperature control; prioritizing extraction over generativity.
- **Risk:** Users use the system to dump tasks, but still never execute them.
  - **Mitigation:** The "Shrink" functionality and "Guided Start" actively break psychological barriers; keeping UI limited prevents list-grazing.

## Assumptions
- Assuming standard LLM capabilities can adequately parse priority out of a messy human text dump.
- Assuming users prefer an opinionated routing (1 task) over customizable list views.
