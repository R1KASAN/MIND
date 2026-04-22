# 03 Mock-up Mapping Prompt

Use this after the main app audit is approved.

The goal is to map the real app structure into a static-only mock-up spec for `mockup-app`.

## Before You Prompt

- What page is the main demo surface?
- Which main app components are the source of truth?
- Which details must remain visible in the first viewport?
- Which behaviors must degrade into static text, local state, or localStorage?

## Copy-ready Prompt

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

## Expected Output

- main demo surface
- component mapping table
- left / center / right responsibilities
- first viewport rules
- collapsed / deferred / removed items
- localStorage continuity list
