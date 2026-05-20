# Room Memory v1 Closeout

## Review Slice

Room Memory v1 is scoped to the Dexie event-log-first foundation for task continuity:

- `dexie` and `fake-indexeddb` dependencies
- `src/lib/store/room-memory-db.ts`
- AI lifecycle event wiring in `src/lib/orchestrator/task-events.ts`
- export/delete integration through `src/lib/store/idb.ts`
- source tombstone marking from the room UI
- unit/regression coverage for event append, projection, lazy backfill, bounded replay, and ref tombstones

The base Room Memory code slice is committed as `9a60f6a Add room memory event log foundation`.

This slice does not move the full workspace store to Dexie. The follow-up Manage Data adapter reads Room Memory replay context through `src/lib/retrieval/room-memory-sources.ts` without turning the UI into a file manager.

## Data Contract

Room Memory uses a room-scoped Dexie database where `roomEvents` is the source of truth and `roomSnapshots` is a derived read model. Snapshot updates must go through `append event -> project snapshot`; there is no public direct-write API for snapshots.

Events store concise continuity summaries plus typed source refs. Raw source text remains in the existing source stores. Deleted refs resolve as `available`, `tombstone`, or `missing`, so provenance can remain visible without restoring deleted raw content.

AI reentry uses bounded replay:

- latest room snapshot
- last 10 continuity events
- top relevant resolved refs

## Gate Baseline

Verified on 2026-05-05:

- `npm test`
- `npm run build`
- `npm run lint -- --quiet`
- `npm run typecheck:app`
- `npm run typecheck:test`

The prior `typecheck:test` debt was fixed in test fixtures/mocks only. No runtime behavior was changed for that gate.

## Follow-Ups

Manage Data and Review Room now consume bounded Room Memory replay refs and show `available`, `tombstone`, and `missing` states without restoring deleted raw content. A deeper event timeline can come later if Review Room needs step-by-step provenance, but it is not required for the v1 evidence surface.

Do not batch `source_added` yet. Revisit batching only after event volume or latency evidence shows the per-ref append loop is a real cost.
