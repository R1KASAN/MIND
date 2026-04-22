# 02 Main App UX Audit Prompt

Use this to inspect the real MIND app before touching the mock-up.

This is an audit prompt, not a redesign prompt.

## Before You Prompt

- Which main app files are the source of truth?
- Which screenshot or route shows the target surface?
- What is the active workflow state: intake, one action, scaffold, rescue, reentry, or completion?
- What belongs to left rail, center, and right inspector in the real app?

Default source of truth:

- [`src/components/Rooms/RoomSidebar.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomSidebar.tsx)
- [`src/components/Rooms/RoomCanvasHeader.tsx`](/Users/ark1/Public/MIND/src/components/Rooms/RoomCanvasHeader.tsx)
- [`src/components/Studio/StudioPanel.tsx`](/Users/ark1/Public/MIND/src/components/Studio/StudioPanel.tsx)
- [`src/app/page.tsx`](/Users/ark1/Public/MIND/src/app/page.tsx)

## Copy-ready Prompt

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

## Expected Output

- shell map
- left / center / right ownership
- first viewport priority
- component inventory
- state language
- explicit copy / do-not-copy list
