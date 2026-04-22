# MIND Main-App-to-Mock-up Prompt Plan

Use this guide when the task is:

- inspect the real MIND app UX/UI
- extract the shell and interaction language that already exists
- translate that into a static-only mock-up on `localhost:3002`

This plan is for parity work, not open-ended redesign.

## Core Rule

Treat the main app as the source of truth for:

- shell layout
- first-viewport hierarchy
- component cadence
- interaction states
- copy style

Treat the mock-up as a static reenactment of that structure.

Do not copy:

- API behavior
- store coupling
- orchestration/runtime dependency
- anything that only works because the main app has live AI routes

## Parity Prompt Chain

Run this exact sequence for main-app-to-mock-up parity work.

1. `/structure` Main App UX Audit
2. `/structure` Mock-up Mapping
3. `/narrative` Copy Compression
4. `/code` Implementation Handoff

Do not jump to `/code` before the first three outputs are approved.

If broader product reasoning is needed, use [01 Business Value](prompt-templates/01-business-value.md) as optional prep. That is not part of the required parity chain.

## What Every Audit Must Extract

Every main app audit must summarize these five things:

1. `shell layout`
   - top bar
   - left rail
   - center working surface
   - right studio/evidence inspector
2. `hierarchy`
   - what must appear in the first viewport
   - what is secondary
   - what is hidden, collapsed, or deferred
3. `component cadence`
   - room list
   - summary strip
   - next move card
   - studio snapshot
   - attachment/evidence row
4. `interaction states`
   - active
   - stale
   - fallback
   - rescue
   - scaffold
   - reentry
   - completed
5. `copy pattern`
   - short heading
   - compact metadata
   - clear CTA
   - no presentation-heavy explanation in the working viewport

Do not let the audit drift into:

- palette-only commentary
- animation-first redesign
- pixel-perfect cloning
- backend inference that the mock-up cannot support

## Main App Source of Truth

Use these components as the default parity reference:

- [`src/components/Rooms/RoomSidebar.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomSidebar.tsx)
- [`src/components/Rooms/RoomCanvasHeader.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomCanvasHeader.tsx)
- [`src/components/Studio/StudioPanel.tsx`](/Users/ark1/Public/MIND/src/components/Studio/StudioPanel.tsx)
- [`src/app/page.tsx`](/Users/ark1/Public/MIND/src/app/page.tsx)

Mapping contract:

- `RoomSidebar.tsx` -> mock left rail navigation
- `RoomCanvasHeader.tsx` -> mock room header / reentry strip / summary metadata
- `StudioPanel.tsx` -> mock studio snapshot + evidence inspector
- `src/app/page.tsx` shell cadence -> mock top bar / spacing / collapsed states

Copy:

- structure
- visual rhythm
- state language

Do not copy:

- API coupling
- store coupling
- orchestration coupling
- runtime dependencies on `/api/ai/*`

If the main app behavior depends on AI routes, translate it in the mock-up into:

- static text
- local state
- `localStorage` continuity

## Phase A: Main App UX Audit

Use [02 Main App UX Audit](prompt-templates/02-main-flow-analysis.md).

### Prompt

```text
/structure
Audit the real MIND app UI from these sources:
- route/component names
- screenshots
- main shell components

Extract only:
1. shell layout
2. first-viewport hierarchy
3. component patterns
4. interaction states
5. copy style

Do not redesign the app.
Do not add features.
Do not infer backend behavior.

Output:
- shell map
- first viewport priority
- component inventory
- “copy this” vs “do not copy”
- state language used by the main app
```

### Output Must Answer

- what the shell is
- what the first viewport prioritizes
- which components define the cadence
- which language the main app uses for state/action
- what must not be copied into static mock-up

## Phase B: Mock-up Mapping

Use [03 Mock-up Mapping](prompt-templates/03-static-mockup-translation.md).

### Prompt

```text
/structure
Translate this main app UX audit into a static-only mock-up spec for mockup-app on localhost:3002.

Constraints:
- no API
- no fetch
- no axios
- no backend
- static mock data only
- localStorage only for demo continuity

Preserve:
- room memory
- state
- evidence inspector
- next move
- rescue / reentry

Output:
- component mapping table
- mock route behavior
- center/left/right responsibilities
- what stays visible in first viewport
- what is collapsed, deferred, or removed
```

### Output Must Answer

- page/surface that acts as the demo main surface
- first three things visible in the viewport
- left/center/right ownership
- which details are removed from center because the inspector already owns them
- which localStorage keys remain in use

## Phase C: Copy Compression

Use [04 Copy Compression](prompt-templates/04-ux-pattern-design.md).

### Prompt

```text
/narrative
Rewrite the mock-up UI copy so it matches the tone of the main app.

Rules:
- use product UI copy, not presentation copy
- keep headings short
- keep metadata compact
- keep CTA labels explicit
- remove onboarding explanation unless required for demo continuity

Output:
- top bar copy
- room header copy
- studio inspector copy
- next move copy
- checklist / helper copy
```

### Output Must Answer

- what each heading says
- what metadata remains visible
- what helper copy is removed
- what CTA labels survive compression

## Phase D: Implementation Handoff

Use [05 Implementation Handoff](prompt-templates/05-ai-actions.md).

### Prompt

```text
/code
Implement this approved mock-up parity spec.

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

### Output Must Answer

- which files changed
- what behavior was preserved
- how parity improved
- which validation commands to run

## What To Copy vs Not Copy

### Do Copy

- layout hierarchy
- shell spacing rhythm
- state labels and chip patterns
- left/center/right ownership
- attachment-like evidence presentation
- compact title/subtitle/metadata structure
- CTA ordering and button priority

### Do Not Copy

- main app orchestration/store wiring
- API-driven behavior
- presentation-deck explanation copy
- hidden complexity that requires live data
- planner breadth
- file-manager behavior
- generic chat-first UI

## The Final Spec Must Always Answer

Before `/code`, the approved spec must answer all of these:

- which page is the main demo surface
- what the first three items in the viewport are
- what level of information belongs in the left rail only
- how many card layers exist in the right rail
- what copy pattern the next move uses
- how evidence reveal/highlight works
- which `localStorage` keys remain active
- what moves/hides/collapses on mobile
- which main app components were treated as source of truth

If any of these are unclear, the spec is not ready for implementation.

## Validation Criteria

The prompt chain is successful only if:

- the implementation handoff is decision-complete
- main app component -> mock-up surface mapping is explicit
- copied vs non-copied behavior is explicit
- the spec still matches MIND doctrine:
  - room memory
  - state
  - evidence
  - next move
  - rescue / reentry
- the spec does not drift into:
  - dashboard-heavy SaaS
  - generic chatbot
  - note app
  - planner
  - file manager

## Validation Commands After Implementation

```bash
npm --prefix mockup-app run lint
npm --prefix mockup-app run build
rg "fetch\\(|axios|useSWR|/api/" mockup-app/app
```

Expected:

- lint passes
- build passes
- no network/API usage in `mockup-app/app`
