# MIND Prompt Templates Index

Use these templates when the task is:

- inspect the real MIND app UX/UI
- translate its structure into a static mock-up
- keep the mock-up aligned without copying runtime behavior

For parity work, do not start with `/code`.

## Core Parity Chain

| Step | Command | Template | Required Output |
| --- | --- | --- | --- |
| A | `/structure` | [02 Main App UX Audit](02-main-flow-analysis.md) | Shell map, first viewport priority, component inventory, interaction states, copy/do-not-copy |
| B | `/structure` | [03 Mock-up Mapping](03-static-mockup-translation.md) | Component mapping, left/center/right ownership, first viewport rules, static-only behavior |
| C | `/narrative` | [04 Copy Compression](04-ux-pattern-design.md) | Product UI copy for top bar, room header, studio inspector, next move, helper text |
| D | `/code` | [05 Implementation Handoff](05-ai-actions.md) | Decision-complete implementation spec for `mockup-app` only |

## Optional Support Templates

| Step | Command | Template | Use When |
| --- | --- | --- | --- |
| Prep | `/narrative` | [01 Business Value](01-business-value.md) | A feature still needs business framing before parity work starts |
| Polish | `/structure` | [06 Mobile Shortening](06-mobile-shortening.md) | The parity spec still feels too tall, duplicated, or weak on mobile |

## What The Core Chain Must Preserve

- room memory
- state
- evidence inspector
- next move
- rescue / reentry

## Stop Conditions

Rerun the relevant step if the output:

- turns MIND into a generic chatbot, note app, planner, file manager, or dashboard-heavy SaaS
- copies runtime/API behavior instead of structure
- hides evidence/provenance when recommending the next move
- leaves left/center/right ownership ambiguous
- makes the implementer decide shell hierarchy alone
- makes mobile behavior implicit instead of explicit

## Required Implementation Validation

After Step D, the implementation handoff must still preserve these checks:

```bash
npm --prefix mockup-app run lint
npm --prefix mockup-app run build
rg "fetch\\(|axios|useSWR|/api/" mockup-app/app
```
