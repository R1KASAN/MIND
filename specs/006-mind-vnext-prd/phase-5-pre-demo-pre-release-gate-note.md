# Phase 5 Pre-Demo / Pre-Release Gate Note

Updated: 2026-04-13

## Purpose

The current canonical readiness gate is `npm run gate:phase5`.
It certifies the room-first reentry loop for controlled demo / closed beta readiness.

The active source of truth is now:

- [README.md](/Users/ark1/Public/MIND/README.md)
- [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md)

## Required command gate

Run only this command as the release gate:

```bash
npm run gate:phase5
```

The gate runs:

- `npm run runtime:ollama:check:gemma`
- `npm test`
- `npm run build`
- `npm run smoke:ai-routes:gemma`
- `npm run smoke:demo-browser`

## Stop-ship rules

If any gate step fails, hold the demo / release and fix the regression first.

What a pass means:

- controlled demo / small closed beta is okay
- broad launch is not implied
- the room-first reentry loop is stable enough for demo use

## What changed from older Phase 5 notes

- `sales inquiry` smoke is no longer part of the gate
- `task-flow repeat` is no longer part of the gate
- `benchmark:rescue` is no longer part of the gate

## Related Docs

- Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- Phase 5 demo runtime runbook: `specs/006-mind-vnext-prd/phase-5-demo-runtime-runbook.md`
