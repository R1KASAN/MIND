<!-- Sync Impact Report
Version Change: v2.0.0 → v3.0.0
Modified Principles:
- Expanded from 8 to 9 structured categories.
- Hardened "Decision Rules" to provide explicit criteria for rejection/acceptance of features.
- Formalized "Success Metrics" (Time-to-action, Accepted-action rate, scaffold_completed).
Added sections:
- Business Principles: Defines the niche and pricing/market philosophy.
- Scope Boundaries: Explicit "No" list for planners, backlogs, and generic chat.
Removed sections:
- Consolidated previous "Guardrails" into the new Principle categories (UX, AI, Trust).
Templates requiring updates:
- ✅ .specify/templates/plan-template.md: Added active Constitution Gates for <5min actions and anti-backlog.
- ✅ .specify/templates/spec-template.md: Added Philosophy Alignment section.
- ✅ .specify/templates/tasks-template.md: Added Constitution Compliance task to Foundation phase.
-->

# MIND Constitution

## I. Product Identity
- **Momentum over Completeness**: MIND exists to reduce decision paralysis and start friction, not to archive every detail of a life.
- **Trusted First Step**: MIND is an emergency start button and recovery surface. It must feel like a trusted bridge to execution, never a heavy system of record.
- **Non-Identity**: MIND is not a planner, task database, calendar app, journaling app, or generic AI chatbot.

## II. Core User Promise
- **Physical Clarity**: The user provides mental noise; the system provides exactly one specific, physical next action.
- **5-Minute Rule**: Every recommended action MUST be concrete enough to begin immediately and complete (or substantially start) within 5 minutes.
- **Shame-Free Recovery**: Recovery is a first-class feature. The product must help the user start, continue, and recover from stalls without adding cognitive load or emotional shame.

## III. UX Principles
- **One-Action-by-Default**: The UI focuses on one prioritized step at a time to maximize focus.
- **Silent Completion Loop**: "Done" triggers an immediate, silent transition back to DUMP_ENTRY with no celebratory theatrics or animations.
- **Warm Bounce-Back**: Returning users are greeted with a warm, non-shaming "Welcome back" to their previous context.
- **Capped Overviews**: Overviews are read-only, secondary, and strictly capped (currently 3 pinned items) to prevent lists from becoming a source of anxiety.
- **Lightweight Rituals**: The Morning Ritual is optional, in-app only, and avoids push-notification-driven guilt.
- **Search-Only Archive**: The archive is for recovery and finding details, not for browsing a "task graveyard."

## IV. AI Principles
- **Momentum Router**: AI is a specialized tool for synthesis and micro-step breakdown, not a conversational partner.
- **Structured Validation**: AI output must match strict schemas and be validated against the "physical action" contract.
- **Passive Readiness**: AI status indicators must be non-blocking and awareness-focused.
- **Robust Fallback**: If AI fails (timeout, offline, error), the product MUST provide a manual sorting path that preserves user momentum.
- **Inline Retries**: Retry flows must stay inline within the failure context (ManualFallback) and preserve the user's active dump context.
- **Local-First Default**: Local-first operation via Ollama (or similar) is the primary identity; network connectivity should be a secondary enhancement, not a requirement.

## V. Data / Privacy Principles
- **Privacy by Default**: All mental noise and synthesized actions stay local to the device.
- **Offline Resilience**: The app must remain useful and functional even without network or AI availability.
- **Trust Surfaces**: Export and Delete-All controls must be easily accessible to reinforce user ownership.
- **Atomic Simplicity**: Data structures should be simple, portable, and easy for the user to recover or migrate.

## VI. Business Principles
- **Niche Focus**: MIND serves high-context-switch users (PMs, founders, freelancers) who are overwhelmed and cannot start.
- **Burst Value**: Usage is bursty and goal-oriented. The product wins on speed and emotional safety, not daily "active time" metrics.
- **Sustainable Integrity**: The product will never broaden into a generic productivity platform to increase market size.
- **Frictionless Pricing**: Pricing models should favor individual ownership and seasonal/annual access over high-friction subscriptions.

## VII. Scope Boundaries
- **No Planner Behavior**: No scheduling, no calendars, no Gantt charts.
- **No Backlog Management**: No editing lists, no tagging, no complex sorting systems.
- **No Collaboration Suite**: MIND is a private, individual momentum tool.
- **No Long-Form Chat**: The interaction model is Dump → Action. No generic assistant chat.
- **No Dashboards or Streaks**: Avoid metrics that induce shame or pressure.

## VIII. Decision Rules
- **REJECT if**: The feature increases cognitive load, encourages backlog curation, or creates "planner-drift."
- **KEEP if**: The feature improves start friction, aids recovery, or strengthens privacy/reliability.
- **DEFER if**: The feature adds operational complexity without improving the core momentum loop.
- **Prioritization Order**: Momentum FIRST, then Trust, then Privacy, then Simplicity, then Extensibility.

## IX. Success Metrics
- **Primary Proof**: `scaffold_completed` (indicating a user saw a breakdown and finished it).
- **Efficiency**: Time-to-first-action (latency from dump submission to action display).
- **Adoption**: Accepted-action rate and Recovery success rate.
- **Retention**: Burst-usage patterns (users returning when they feel stuck).

## Governance
- **Version Control**: Any amendment requires a Semantic Version bump and impact report.
- **Supersedence**: This constitution supersedes all other project documentation.
- **Compliance**: All PRs, plans, and specs must include a "Constitution Check" against these principles.

**Version**: 3.0.0 | **Ratified**: 2026-04-06 | **Last Amended**: 2026-04-06
