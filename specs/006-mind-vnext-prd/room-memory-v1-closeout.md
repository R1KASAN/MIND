# Room Memory v1 Closeout

## Review Slice

Room Memory v1 is scoped to the Dexie event-log-first foundation for task continuity:

- `dexie` and `fake-indexeddb` dependencies
- `src/lib/store/room-memory-db.ts`
- AI lifecycle event wiring in `src/lib/orchestrator/task-events.ts`
- export/delete integration through `src/lib/store/idb.ts`
- source tombstone marking from the room UI
- unit/regression coverage for event append, projection, lazy backfill, bounded replay, and ref tombstones

This slice does not move the full workspace store to Dexie and does not add Manage Data or Review Room UI behavior.

## Data Contract

Room Memory uses a room-scoped Dexie database where `roomEvents` is the source of truth and `roomSnapshots` is a derived read model. Snapshot updates must go through `append event -> project snapshot`; there is no public direct-write API for snapshots.

Events store concise continuity summaries plus typed source refs. Raw source text remains in the existing source stores. Deleted refs resolve as `available`, `tombstone`, or `missing`, so provenance can remain visible without restoring deleted raw content.

AI reentry uses bounded replay:

- latest room snapshot
- last 10 continuity events
- top relevant resolved refs

## Gate Baseline

Expected closeout gates:

- `npm test`
- `npm run build`
- targeted ESLint for Room Memory files
- `npm run typecheck:app`

`npm run typecheck:test` remains a separate gate for existing test type debt. Current failures are concentrated in legacy test fixtures and mocks such as `ollama-runtime.test.ts`, `app-bootstrap.test.ts`, `scaffold-refine.test.ts`, `task-controller.test.ts`, and `use-room-actions.test.ts`. It should not block Room Memory v1 review unless the failure is introduced by this slice.

## Follow-Ups

Manage Data and Review Room should consume `roomSnapshots`, recent `roomEvents`, and resolved refs. Review Room should show tombstone/missing refs without crashing and without restoring deleted raw content.

Do not batch `source_added` yet. Revisit batching only after event volume or latency evidence shows the per-ref append loop is a real cost.
