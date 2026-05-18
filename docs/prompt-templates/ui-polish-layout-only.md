# UI Polish Layout-Only Prompt

Use this template for post-demo visual credibility work on MIND.

```md
Act as MIND post-demo UI polish engineer.

Read first:
- AGENTS.md
- docs/product/prototype-completion-plan.md
- docs/agents/ui-polish.md
- DESIGN.md

Goal:
Patch layout, spacing, and visual hierarchy only. Do not change product logic.

Run first:
- npm run design:lint
- graphify query "What files control the app shell layout and room sidebar?"
- graphify query "What files control ONE_ACTION metadata pills and evidence link?"
- graphify query "What files control Rescue visual hierarchy and spacing?"
- graphify query "What files control mobile sidebar and sticky CTA layout?"
- graphify explain "page.tsx"
- graphify explain "OneAction.tsx"
- graphify explain "Scaffold.tsx"
- graphify explain "Rescue.tsx"

Before editing:
- Report the exact files you intend to touch and why.
- If any planned file includes routing, state, or controller logic, stop and ask for review instead of editing.

Patch:
- Desktop >=1024px: two-column shell with persistent room/history sidebar and active flow panel.
- ONE_ACTION: muted metadata row, evidence link affordance, clear primary/secondary/tertiary hierarchy.
- Rescue: clearer diagnosis/advisory/CTA hierarchy and better spacing.
- Breadcrumb/title: larger and clearer flow state.
- Mobile: safe-area sticky CTA padding, Rescue gaps, full-width drawer/bottom sheet, truncated long context, clearer scaffold quote block.
- Evidence: visual affordance only; no evidence retrieval/source logic changes.
- Desktop two-column shell can defer if it requires routing, drawer state, scroll behavior, or sticky CTA logic changes.

Hard constraints:
- Do not touch prompts, retrieval, provider, OCR, analytics, persistence schema, smoke harness, architecture, orchestrator, or state-machine logic.
- Do not change Room ingestion, evidence, memory, next action/save point, rescue behavior, or reentry behavior.
- Use DESIGN.md tokens/rationale for visual decisions.
- If DESIGN.md conflicts with prototype-completion-plan.md, follow prototype-completion-plan.md.

Verification:
- npm run design:lint
- npm run typecheck:app
- git diff --check
- Browser desktop 1440x900
- Browser mobile 390x844
- Manual demo path spot check: fresh intake -> ONE_ACTION -> evidence -> Scaffold -> Rescue -> back-to-input -> reentry
- Include screenshots or visual notes for desktop 1440x900 and mobile 390x844 after patching.
- Confirm behavior is unchanged for Rescue -> back-to-input, textarea/context preservation, and reentry continuity.

Output:
- Files changed
- Visual changes by surface
- What was intentionally not changed
- Verification results
- Decision: post-demo UI polish ready / partial
```
