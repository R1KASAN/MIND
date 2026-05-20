# MIND UI Polish Agent Instructions

Use this file as the reusable preamble for post-demo layout, spacing, and visual-hierarchy work.

## Source Of Truth

Read in this order:

1. `AGENTS.md`
2. `docs/product/prototype-completion-plan.md`
3. `DESIGN.md`

`docs/product/prototype-completion-plan.md` remains the prototype acceptance source of truth. `DESIGN.md` is the visual contract for tokens, spacing, typography, and component hierarchy. If they disagree, follow the prototype plan.

## Required Flow

1. Run `npm run design:lint`.
2. Use Graphify before reading or editing UI code.
3. Identify the minimum UI files that own the requested surface.
4. Patch layout, spacing, hierarchy, and copy affordance only.
5. Verify with `npm run design:lint`, `npm run typecheck:app`, `git diff --check`, and desktop/mobile browser checks when layout changes.
6. Before editing, report the exact files you intend to touch and why.
7. If any planned file includes routing, state, or controller logic, stop and ask for review instead of editing.
8. After patching, include screenshots or visual notes for desktop `1440x900` and mobile `390x844`.

## Design Tooling Note

Use `npx design.md` or `npm run design:lint` for this package. In `@google/design.md@0.1.1`, the installed binary is `design.md`, not `designmd`, so prompts and scripts should name the command that actually exists in the repo.

## Allowed Edit Areas

Only edit these areas when Graphify confirms they own the requested visual surface:

- app shell/page layout
- room/sidebar presentation
- `ONE_ACTION` presentation
- `Scaffold` presentation
- `Rescue` presentation
- CSS/module/global styles used by those surfaces

## Do Not Touch

Do not edit these areas for visual polish unless a confirmed acceptance blocker requires a tiny fix:

- `src/lib/orchestrator/*`
- prompts
- retrieval
- persistence schema or store logic
- OCR
- analytics contract
- smoke harness
- route/state-machine behavior

If a visual request appears to require logic or state changes, stop and classify it as `defer`, or propose a smaller visual-only version.

If a desktop two-column shell would require routing, drawer state, scroll behavior, or sticky CTA logic changes, defer the shell change and keep the patch visual-only.

## Visual Priorities

- Desktop `>=1024px`: use width purposefully with a room/history rail and readable active flow panel.
- ONE_ACTION: keep primary CTA dominant; make metadata muted; make source/evidence affordances discoverable.
- Rescue: separate diagnosis, advisory content, and CTA with clear spacing and weight.
- Breadcrumb/title: make flow state readable without adding new product surfaces.
- Mobile: preserve one-column focus, safe-area CTAs, readable Thai line-height, and uncluttered recovery actions.
- Evidence: visual affordance only. Do not change retrieval, source lookup, or evidence detail logic.
