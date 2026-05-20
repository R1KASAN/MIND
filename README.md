MIND is a local-first AI task copilot for solo client-facing knowledge workers.

## Release / Demo Gate

Before every demo or release, run:

```bash
npm run gate:phase5
```

If this command fails at any step, do not ship. The canonical stop-ship policy lives in [specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md](/Users/ark1/Public/MIND/specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md).

The gate currently runs runtime preflight, tests, build, Gemma route smoke, and demo browser smoke. That is the only readiness signal for controlled demo / closed beta.

In practice, this means:

- pass `npm run gate:phase5` -> okay for controlled demo / closed beta
- fail `npm run gate:phase5` -> hold the demo or release and fix the regression first
- pass `npm run gate:phase5` does **not** mean broad launch is ready

## Canonical Demo Runbook

The source of truth for the local demo and release-gating path is [docs/demo-runbook.md](docs/demo-runbook.md).

For prompt-driven mock-up planning on `localhost:3002`, use:

- [docs/mind-mockup-prompt-plan.md](docs/mind-mockup-prompt-plan.md) for the phase hierarchy
- [docs/mind-mockup-prompt-runbook.md](docs/mind-mockup-prompt-runbook.md) for the operating workflow
- [docs/mind-mockup-prompt-chain-example.md](docs/mind-mockup-prompt-chain-example.md) for a complete example
- [docs/prompt-templates/](docs/prompt-templates/) for copy-ready phase prompts

Use the commands in that runbook for the CPU-safe local AI path:

```bash
npm run ollama:serve:cpu-safe
npm run runtime:ollama:check:gemma
npm run smoke:ai-routes:gemma
```

For demo and release checks, follow the runbook instead of running ad hoc local AI commands.

## Getting Started

For the canonical local AI path, start Ollama first and run the app with the default scripts:

```bash
npm run ollama:serve:cpu-safe
npm run dev
```

`npm run dev` and `npm run start` now point at the canonical Gemma CPU-safe local AI path.
If you need the non-canonical escape hatch for manual debugging, use `npm run dev:raw` or `npm run start:raw`.

For generic Next.js development without the local AI path, use the raw escape hatch:

```bash
npm run dev:raw
```

### External Puter AI Backend

For manual checks of the external-safe backend, set MIND's Puter auth token env var before starting the app:

```bash
MIND_AI_BACKEND=external_safe
PUTER_API_KEY=<your Puter auth token>
```

`PUTER_API_KEY` is MIND's env name for the Puter auth token. Puter docs may refer to the same value as `PUTER_AUTH_TOKEN`.

If Next.js reports SWC/Turbopack helper errors, follow the reset steps in [docs/agents/dev-workflow.md](docs/agents/dev-workflow.md) before assuming the app is broken.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

The detailed execution docs for the current wave live in `specs/006-mind-vnext-prd`.

## Ollama CPU-safe Workflow

For Apple Silicon machines where Ollama crashes on the Metal path, use the CPU-safe local workflow instead of changing MIND runtime behavior:

```bash
npm run ollama:serve:cpu-safe
```

Pull Gemma on that dedicated local host:

```bash
npm run ollama:pull:gemma
```

Verify the CPU-safe Ollama runtime:

```bash
npm run runtime:ollama:check:cpu-safe
npm run runtime:ollama:check:gemma
```

Run the Gemma route smoke against the built app:

```bash
npm run smoke:ai-routes:gemma
```

Start the app against that same local AI path:

```bash
npm run start -- --hostname 127.0.0.1 --port 3000
```

This is a machine-local workaround for Ollama/Metal stability. It does not change MIND prompts, contracts, or product behavior.
