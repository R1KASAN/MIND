# Quickstart: MIND

> [ARCHIVAL] This quickstart describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

1. Ensure Node v20+ is installed.
2. Initialize Next.js in the root if not present: `npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --use-npm`
3. Install dependencies: `npm i idb-keyval openai`
4. Set ENV var in `.env.local`: `OPENAI_API_KEY=your_key`
5. Run dev server: `npm run dev`
6. Access mobile-preview at `http://localhost:3000`
