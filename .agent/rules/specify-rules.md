# Frontend Design Rules

When doing frontend design tasks, avoid generic, overbuilt layouts. Use these hard rules:

- **One composition:** The first viewport must read as one composition, not a dashboard, unless it is a dashboard.
- **Brand first:** On branded pages, the brand or product name must be a hero-level signal, not just nav text or an eyebrow. No headline should overpower the brand.
- **Brand test:** If the first viewport could belong to another brand after removing the nav, the branding is too weak.
- **Typography:** Use expressive, purposeful fonts and avoid default stacks (Inter, Roboto, Arial, system).
- **Background:** Don't rely on faint, single-color backgrounds; use gradients, images, or subtle patterns to build depth.
- **Full-bleed hero only:** On landing pages and promotional surfaces, the hero image should be a dominant edge-to-edge visual plane or background. Do not default to inset hero images, side-panel hero images, rounded media cards, tiled collages, or floating image blocks unless the existing design system clearly requires it.
- **Hero budget:** The first viewport should usually contain only the brand, one headline, one short supporting sentence, one CTA group, and one dominant image. Do not place stats, schedules, event listings, address blocks, promos, "this week" callouts, metadata rows, or secondary marketing content there.
- **No hero overlays:** Do not place detached labels, floating badges, promo stickers, info chips, or callout boxes on top of hero media.
- **Cards:** Default to no cards. Never use cards in the hero unless they are the container for a user interaction. If removing a border, shadow, background, or radius does not hurt interaction or understanding, it should not be a card.
- **One job per section:** Each section should have one purpose, one headline, and usually one short supporting sentence.
- **Real visual anchor:** Imagery should show the product, place, atmosphere, or context. Decorative gradients and abstract backgrounds do not count as the main visual.
- **Reduce clutter:** Avoid pill clusters, stat strips, icon rows, boxed promos, schedule snippets, and multiple competing text blocks.
- **Motion:** Use motion to create presence and hierarchy, not noise. Ship 2-3 intentional motions for visually led work, and prefer Framer Motion when it is available.
- **Color & look:** Choose a clear visual direction, define CSS variables, avoid purple-on-white defaults. No purple bias or dark mode by default.
- **Responsiveness:** Ensure the page loads properly on both desktop and mobile.
- **For recent pages:** If the modern design system already exists, follow the repo's React component usage, file structure, accessibility checklist, start/stricter modes, and useDeferrable when appropriate; if used by the broader codebase and used/usable by default unless already used; follow the repo's React compile targets.
- **Exception:** If working within an existing website or design system, preserve the established patterns, structure, and visual language.

## Active Technologies
- TypeScript / Node 20+ + Next.js (App Router), Vanilla CSS, OpenAI API/SDK (or similar) (001-core-action-loop)
- IndexedDB (Client-side MVP via `idb-keyval`) (001-core-action-loop)
- TypeScript / Node 20+ + Next.js 14+ (App Router), React, Vanilla CSS (no Tailwind), simple IndexedDB (`idb-keyval`) for MVP persistence, OpenAI API (via Edge/Server actions). (004-core-prd)
- Client-side `idb-keyval` for the 50-user Beta. (004-core-prd)
- TypeScript 5, React 19, Next.js 16 (App Router) + `idb-keyval` 6.2.2 (local storage), `zod` 4.3.6 (AI schema validation) (005-mind-full-prd)
- IndexedDB via `idb-keyval` — two keys: `mind_session`, `mind_actions` (005-mind-full-prd)
- TypeScript 5.x, Next.js 15 (App Router), React 19 + idb-keyval (IDB), zod (schema validation), Ollama (local AI runtime) (006-mind-vnext-client-resume)
- IndexedDB via idb-keyval — keys `mind_session` and `mind_actions` (no new keys in vNext) (006-mind-vnext-client-resume)

## Recent Changes
- 001-core-action-loop: Added TypeScript / Node 20+ + Next.js (App Router), Vanilla CSS, OpenAI API/SDK (or similar)
