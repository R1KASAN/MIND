# Feature Specification: Core Action Loop

> [ARCHIVAL] This spec describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

**Feature Branch**: `001-core-action-loop`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: Define what MIND should build from this PRD...

## Problem Statement

Users experience severe cognitive overload when faced with long, static task lists. The mental tax of prioritizing, organizing, and breaking down tasks prevents them from taking actual action. Existing productivity tools act as storage mechanisms rather than action catalysts, leaving users paralyzed by choices when they just need to know what to do right now.

## Target Users

- Highly distractible professionals who struggle with initiation.
- Individuals dealing with task paralysis or executive dysfunction.
- Users who feel overwhelmed by traditional project management software and need immediate clarity over long-term tracking.

## Core Value Proposition

MIND significantly lowers the barrier to action. By taking a messy brain dump and converting it seamlessly into a single, manageable next step, the app removes the cognitive overhead of planning, prioritizing, and maintaining lists, allowing users to start immediately.

## Non-goals

- Comprehensive calendar management or integration.
- Traditional project management (e.g., Gantt charts, multi-user assignment workflows).
- Habit tracking or complex recurring task streaks.
- Acting as a generic AI chat assistant.

## MVP Scope

A mobile-first web app consisting of the core brain dump interface, the AI prioritization engine that yields a single next action, the flow states (Start Now, Focus Mode), and recovery mechanisms (Rescue Mode, Bounce-back Mode).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brain Dump to Single Action (Priority: P1)

Users can rapidly unload their thoughts and let the AI synthesize it into one immediate next action.

**Why this priority**: This is the core functionality that fulfills the app's promise of removing planning overhead. Without it, the app offers no value.

**Independent Test**: Can be fully tested by providing a brain dump of 3-5 scattered thoughts and verifying that the app returns exactly one prioritized, bite-sized next action.

**Acceptance Scenarios**:

1. **Given** the user is on the main input screen, **When** they type or dictate a chaotic list of tasks and submit, **Then** the AI processes the input and presents a single, clear "Next Action" string.
2. **Given** the user views their single "Next Action", **When** they tap a "Too Big" or "Simplify" button, **Then** the AI breaks the task down further and replaces it with an even smaller, more manageable sub-action.

---

### User Story 2 - Start Now and Focus Mode (Priority: P1)

Users must be able to lock onto the chosen action and enter a distraction-free state.

**Why this priority**: Producing an action is meaningless unless the app provides an environment that actively encourages executing it right away.

**Independent Test**: Can be tested by selecting "Start" on a generated action and verifying the UI clears away all other elements.

**Acceptance Scenarios**:

1. **Given** a generated Next Action on the screen, **When** the user taps "Start Now", **Then** the UI transitions into Focus Mode, hiding all navigation and other distractions.
2. **Given** the user is in Focus Mode, **When** they mark the task as complete, **Then** the system visually rewards them and gracefully transitions to the next prioritized item from their original dump.

---

### User Story 3 - Rescue and Bounce-Back Modes (Priority: P2)

Users must be able to gracefully recover from interruptions or long periods of inactivity without feeling guilt or having to manually reorganize.

**Why this priority**: Users inevitably drop off or get interrupted. Friction-free recovery prevents churn.

**Independent Test**: Can be tested by triggering an interruption state and verifying the app prompts for recalibration rather than showing stagnant, overdue tasks.

**Acceptance Scenarios**:

1. **Given** the user was in Focus Mode but closed the app (dropped off), **When** they return hours later, **Then** the app enters Bounce-Back Mode, asking "Where are we?" instead of showing overdue alerts.
2. **Given** the user is in Bounce-Back Mode, **When** they state their new situation (e.g., "I got pulled into a meeting"), **Then** the AI recalibrates the plan and suggests a new, relevant next action to regain momentum.
3. **Given** the user is in a stalled state while working, **When** they tap the "Rescue Me" button, **Then** the app prompts them to identify the blocker and suggests an alternative smaller task or a break.

### Edge Cases

- What happens when the user's brain dump contains no actionable items (e.g., just journaling / venting)?
- How does the system handle extremely long brain dumps that exceed AI processing context boundaries?
- What if the user repeatedly taps "Too Big" until the action cannot be reasonably broken down further?
- How to handle offline capabilities when the user needs to brain dump immediately but there is no network connection to ping the AI?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to input unstructured text (brain dump) upon opening the application without logging into complex dashboards.
- **FR-002**: System MUST process the text input via an active agent service and return exactly one prioritized actionable item.
- **FR-003**: Users MUST be able to request an action be simplified or broken down into smaller steps.
- **FR-004**: System MUST provide a "Start Now" state that hides secondary UI elements to minimize distraction while the task is active.
- **FR-005**: System MUST detect session drop-offs and seamlessly trigger a Bounce-back contextual flow upon application return.
- **FR-006**: Users MUST be able to manually trigger a "Rescue" flow during an active task if they feel stuck or interrupted.
- **FR-007**: System MUST track the user's active action state.

### Key Entities

- **Dump**: Unstructured text/audio transcription.
- **Action**: An isolated, actionable unit of work generated from the dump. Has statuses (pending, active, completed, discarded) and hierarchical relationships to derived smaller actions.
- **Session**: Tracking context of the user's current flow state (Idle, BrainDumping, Focused, Stalled/Interrupted).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users transition from opening the app to seeing their first Action generated in under 10 seconds.
- **SC-002**: 80% of users who enter Focus Mode mark the task as complete within that session.
- **SC-003**: 95% of server responses for AI action extraction complete in under 3 seconds.
- **SC-004**: App initial load time is under 1 second on mobile network conditions.
- **SC-005**: 60% of sessions that involve a drop-off interruption successfully result in a completed action after utilizing Bounce-back mode upon return.

## Assumptions

- Users have a stable internet connection for AI processing logic.
- Target latency for the AI service is sufficiently low to maintain momentum.
- The UI will be used predominantly on mobile devices, necessitating touch-friendly, large target areas.
