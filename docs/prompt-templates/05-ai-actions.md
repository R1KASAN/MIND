# 05 Implementation Handoff Prompt

Use this only after:

- main app UX audit is approved
- mock-up mapping is approved
- copy compression is approved

This is the `/code` handoff for parity work.

## Before You Prompt

- Which main app components are the source of truth?
- What is the approved left / center / right ownership?
- What must appear in the first viewport?
- Which localStorage keys remain active?
- What mobile collapse rules are already decided?

## Copy-ready Prompt

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

## Expected Output

- changed files
- parity behavior summary
- validation commands
- no extra product features invented during implementation
