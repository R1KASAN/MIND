# Example Prompt Chain: Main App to Mock-up Parity

This example shows how to run the parity chain without jumping directly to code.

## Goal

```text
Read the real MIND room detail shell, then translate that structure into a static-only room detail mock-up on localhost:3002 without copying API/runtime behavior.
```

## Phase A Example Input

Use [02 Main App UX Audit](prompt-templates/02-main-flow-analysis.md).

Context to provide:

```text
Real app sources:
- src/components/Rooms/RoomSidebar.tsx
- src/components/Rooms/RoomCanvasHeader.tsx
- src/components/Studio/StudioPanel.tsx
- src/app/page.tsx

Target surface:
- room detail
- reentry / current task / studio inspector
```

Expected answer should produce:

- shell map
- first viewport priority
- component inventory
- interaction states
- copy/do-not-copy list

## Phase B Example Input

Use [03 Mock-up Mapping](prompt-templates/03-static-mockup-translation.md).

Context to provide:

```text
Main app shell to preserve:
- top bar
- left room rail
- center current working surface
- right studio/evidence inspector

Mock-up constraints:
- mockup-app only
- localhost:3002
- static-only
- no API
- no fetch
- no axios
- localStorage only for continuity
```

Expected answer should produce:

- component mapping table
- target main surface
- first viewport rules
- left / center / right responsibilities
- what gets collapsed or removed from the mock-up

## Phase C Example Input

Use [04 Copy Compression](prompt-templates/04-ux-pattern-design.md).

Copy goal:

```text
Match the tone of the main app.
Use product UI language, not presentation narration.
Keep headings short, metadata compact, CTA labels explicit.
```

Expected answer should produce:

- top bar copy
- room header copy
- inspector copy
- next move copy
- compressed helper/checklist copy

## Phase D Example Input

Use [05 Implementation Handoff](prompt-templates/05-ai-actions.md).

Implementation handoff should include:

```text
/code
Implement this approved mock-up parity spec.

Main app source of truth:
- RoomSidebar.tsx for left rail navigation
- RoomCanvasHeader.tsx for room header cadence
- StudioPanel.tsx for inspector cadence
- src/app/page.tsx for shell spacing

Approved mapping:
- left = room navigation
- center = current working surface
- right = studio snapshot + evidence inspector

Rules:
- edit only mockup-app
- static-only
- no API/fetch/axios/useSWR
- preserve existing mock logic
- do not invent new product features
```

Expected answer should return:

- changed files
- behavior summary
- validation commands

## Optional Mobile Pass

If the result still feels too tall or duplicated, run [06 Mobile Shortening](prompt-templates/06-mobile-shortening.md) after Phase C and before Phase D.

Use it to answer:

- what moves out of center
- what collapses on mobile
- what stops competing with the primary CTA
