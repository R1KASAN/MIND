# MIND Main-App-to-Mock-up Prompt Runbook

Use this runbook when the goal is parity:

- inspect the real MIND app
- extract its shell/hierarchy/copy cadence
- translate that into `mockup-app` on `localhost:3002`

This is not the generic product-discovery chain. It is the parity chain.

## Operating Rule

Do not jump straight to `/code`.

Run this sequence in order:

1. `/structure` Main App UX Audit
2. `/structure` Mock-up Mapping
3. `/narrative` Copy Compression
4. `/code` Implementation Handoff

If broader product justification is needed, run [01 Business Value](prompt-templates/01-business-value.md) first as optional prep. Do not let that replace the parity chain.

## Source of Truth

Always inspect these main app sources first unless the task says otherwise:

- [`src/components/Rooms/RoomSidebar.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomSidebar.tsx)
- [`src/components/Rooms/RoomCanvasHeader.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomCanvasHeader.tsx)
- [`src/components/Studio/StudioPanel.tsx`](/Users/ark1/Public/MIND/src/components/Studio/StudioPanel.tsx)
- [`src/app/page.tsx`](/Users/ark1/Public/MIND/src/app/page.tsx)

Audit for:

- shell layout
- first-viewport hierarchy
- component cadence
- interaction states
- copy style

Do not audit for:

- palette alone
- animation before structure
- backend behavior the mock-up cannot support
- pixel-perfect clone work

## Template Files

### Core parity chain

- [02 Main App UX Audit](prompt-templates/02-main-flow-analysis.md)
- [03 Mock-up Mapping](prompt-templates/03-static-mockup-translation.md)
- [04 Copy Compression](prompt-templates/04-ux-pattern-design.md)
- [05 Implementation Handoff](prompt-templates/05-ai-actions.md)

### Optional support

- [01 Business Value](prompt-templates/01-business-value.md)
- [06 Mobile Shortening](prompt-templates/06-mobile-shortening.md)

## How to Run the Chain

### 1) Gather source context

Before prompting, collect at least two of these:

- screenshot of the real surface
- route/component names
- current mock-up screenshot
- relevant shell file references

For parity work, do not ask the model to invent the main product flow if real code/screenshots exist.

### 2) Run Main App UX Audit

Use `02 Main App UX Audit`.

The output must include:

- shell map
- first viewport priority
- component inventory
- interaction states
- explicit `copy this` vs `do not copy`

If any of those are missing, rerun the audit.

### 3) Run Mock-up Mapping

Use `03 Mock-up Mapping`.

Always include these constraints:

```text
This is for mockup-app on localhost:3002 only.
No API, no fetch, no axios, no backend.
Use static mock data and localStorage only for demo continuity.
```

The output must answer:

- what page is the main demo surface
- what belongs left / center / right
- what stays in the first viewport
- what gets collapsed, deferred, or removed
- which localStorage keys remain active

### 4) Run Copy Compression

Use `04 Copy Compression`.

Compression rules:

- product UI copy only
- short headings
- compact metadata
- explicit CTA labels
- remove presentation explanation unless required for demo continuity

If the copy still sounds like onboarding narration or slide text, rerun this phase.

### 5) Create the implementation handoff

Use `05 Implementation Handoff`.

Only do this after the first three outputs are approved.

The handoff must be decision-complete. The implementer should not need to decide:

- which main app component is the source of truth
- what the first viewport shows
- what the right rail owns
- what the next move card says
- what mobile hides or collapses

## Pre-code Checklist

Before handing off `/code`, confirm all of these:

- The spec starts from room/task context, not generic chat.
- The spec preserves:
  - room memory
  - state
  - evidence inspector
  - next move
  - rescue / reentry
- The first viewport is explicit.
- Left rail information density is capped at navigation level.
- Right rail ownership is explicit and thin enough to be operational.
- Evidence reveal/highlight behavior is defined.
- Active `localStorage` keys are listed.
- Mobile collapse/move/remove rules are listed.
- `mockup-app` remains static-only.

## Handoff Checklist

Every implementation handoff must name:

- edited app: `mockup-app` only
- source-of-truth components from the main app
- target main surface
- left / center / right responsibilities
- first-viewport priorities
- copy rules
- `localStorage` contracts
- no-network validation commands

## Implementation Handoff Format

Use this structure:

```text
/code
Implement this approved mock-up parity spec.

Main app source of truth:
[paste the audited components and shell findings]

Approved mock-up mapping:
[paste the left / center / right mapping and first viewport rules]

Approved compressed copy:
[paste top bar / header / inspector / next move copy]

Rules:
- edit only mockup-app
- static-only
- no API/fetch/axios/useSWR
- preserve existing mock logic
- use main app shell cadence as source of truth
- do not invent new product features

Return:
- changed files
- behavior summary
- validation commands
```

## Optional Mobile Pass

If the parity output still looks too tall or demo-heavy, run [06 Mobile Shortening](prompt-templates/06-mobile-shortening.md) after copy compression and before `/code`.

Use it to answer:

- what moves out of center
- what collapses on mobile
- what stops competing with the primary CTA

## Failure Modes

- If the model redesigns instead of auditing: rerun Main App UX Audit with stricter “Do not redesign the app.”
- If the output clones runtime behavior: rerun Mock-up Mapping with stricter static-only constraints.
- If the copy sounds like a slide deck: rerun Copy Compression with “product UI copy only.”
- If the spec is still ambiguous: do not start `/code`.
