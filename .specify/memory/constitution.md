<!-- Sync Impact Report
Version Check: Initializing from template (none) → 1.0.0
Modified Principles:
- Created 6 explicit principles based on MIND PRD (Action, Momentum, Recovery, AI, Mobile, Scope).
Added sections:
- Development Workflow
- Quality Gates
Templates requiring updates:
- .specify/templates/plan-template.md: ✅ Checked. Generic references to Constitution Check are valid and will naturally enforce these gates.
- .specify/templates/spec-template.md: ✅ Checked. Structure naturally aligns with the MVP prioritization principles.
- .specify/templates/tasks-template.md: ✅ Checked. Task ordering and MVP focus aligns with "Momentum First".
-->

# MIND Constitution

## Core Principles

### I. One Next Action (Over Task Lists)
The app must always present the user with a single, clear next action. We fundamentally reject overwhelming, static task lists. The interface must actively guide decisions and reduce choices rather than simply storing them.

### II. Momentum First (Fast Start)
Favor immediate action and fast starts over perfect and exhaustive planning. The system should encourage users to start executing with the minimum amount of setup or configuration, removing friction to enter "flow" state.

### III. Resilient Recovery
When a day slips or plans change, the system must provide clear, low-friction paths for recovery and bounce-back. No user should feel guilt or find it difficult to reorganize mid-day; the UI must support graceful recalibration.

### IV. Invisible AI Overhead
AI is a specialized assistant that reduces cognitive load and reasoning overhead. It is strictly NOT a generic chat bot. AI must work proactively in the background or at specific touchpoints to synthesize, suggest, and prioritize without demanding prompt engineering from the user.

### V. Mobile-First Simplicity
The product is inherently mobile-first. Design exclusively for simplicity, speed, and extremely low cognitive load on mobile devices. Complex configurations and dense informational displays are prohibited.

### VI. Ruthless Scope Discipline
The product is narrowly focused on immediate prioritization and action support. We explicitly reject scope creep into calendar management, comprehensive multi-actor project management, or elaborate habit tracking modules.

## Development Workflow

1. **MVP First:** Every feature starts as a minimal viable functionality slice tested independently.
2. **Mobile-First Validation:** Before any desktop web views are verified, all UI flows MUST be validated in mobile viewport dimensions.
3. **No Over-Engineering:** Components should be simple. Avoid generic, overbuilt layouts early on. If it doesn't directly serve one of the core principles, do not build it.

## Quality Gates

1. **Cognitive Load Check:** Does this new screen or feature ask the user to make more than 2 decisions at once? If yes, it fails the gate.
2. **Action Support Test:** Is it obvious within 1 second what the user's immediate next action is?
3. **Mobile Rendering:** Does the feature work flawlessly and without horizontal scrolling or tiny hit targets on a mobile device?

## Governance

- The Constitution supersedes all other documentation and dictates design/architecture choices.
- Any amendment requires updating this document, bumping the Semantic Version, and explaining the reasoning in the Sync Impact Report.
- Features that contradict "One Next Action" or introduce explicit scope creep into calendar/project management must be decisively rejected unless a constitution amendment is ratified.

**Version**: 1.0.0 | **Ratified**: 2026-04-04 | **Last Amended**: 2026-04-04
