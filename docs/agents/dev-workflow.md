# MIND Dev Workflow

Use this note for local development recovery and command hygiene.

## Canonical Local Run

1. Start Ollama on the CPU-safe local host.
2. Run `npm run dev` for the app.
3. Use `npm run dev:raw` only when you intentionally want the non-canonical escape hatch.

## If Next.js Shows SWC/Turbopack Helper Errors

Use this reset sequence before treating the issue as an app bug:

1. Stop the dev server.
2. Remove the local build output: `rm -rf .next`
3. If dependencies changed, refresh install state: `rm -rf node_modules package-lock.json && npm install`
4. Ensure there is only one `package-lock.json` under `/Users/ark1/Public/MIND`
5. Run `npm run dev` again

## What This Is For

- Use this step when Next.js reports SWC helper module not found, Turbopack helper errors, or similar local build-state corruption.
- Do not treat this reset path as part of the AI timeout root-cause investigation.
- For AI timeout work, keep the focus on prompt shape, model settings, and route timeout policy.
