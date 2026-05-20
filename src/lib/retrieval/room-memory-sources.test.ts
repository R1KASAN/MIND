import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { searchRoomDataSources } from '@/lib/retrieval/room-data';
import {
  answerRoomTrustReviewQuestion,
  buildRoomDataSourcesWithMemory,
  buildRoomTrustReviewModel,
} from '@/lib/retrieval/room-memory-sources';
import {
  appendRoomMemoryEvent,
  clearRoomMemoryData,
  createRoomMemoryDb,
  markRoomMemoryRefDeleted,
  type RoomMemoryEvent,
} from '@/lib/store/room-memory-db';
import type { TaskContext } from '@/lib/store/idb';

function makeTask(): TaskContext {
  return {
    id: 'task-1',
    roomId: 'room-1',
    sourceText: 'Client asks for phase 2 budget cleanup.',
    sourceFiles: [
      {
        id: 'brief',
        name: 'Brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'ready',
        createdAt: 1000,
        extractedText: 'Live budget evidence remains available.',
        storageKey: 'blob-brief',
      },
    ],
    extractedText: 'Live budget evidence remains available.',
    createdAt: 1000,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'dumped',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    lastStableSummary: 'Phase 2 budget cleanup needs review.',
  };
}

function event(overrides: Partial<RoomMemoryEvent> = {}): RoomMemoryEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    roomId: 'room-1',
    type: 'source_added',
    createdAt: 2000,
    actor: 'system',
    origin: 'live',
    summary: 'Room sources entered memory.',
    refs: [],
    payloadVersion: 1,
    ...overrides,
  };
}

test('buildRoomDataSourcesWithMemory exposes available, tombstone, and missing refs without restoring deleted raw content', async () => {
  const db = createRoomMemoryDb(`mind_room_memory_sources_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  await appendRoomMemoryEvent(event({
    refs: [
      { id: 'file:brief', kind: 'pdf', label: 'Brief.pdf', excerpt: 'Live budget evidence remains available.' },
      { id: 'file:deleted', kind: 'pdf', label: 'Deleted.pdf', excerpt: 'SECRET DELETED RAW CONTENT' },
      { id: 'file:missing', kind: 'pdf', label: 'Missing.pdf', excerpt: 'Missing source original content.' },
    ],
  }), db);
  await markRoomMemoryRefDeleted({
    roomId: 'room-1',
    refId: 'file:deleted',
    reason: 'user_deleted_source',
    deletedAt: 2500,
  }, db);

  const model = await buildRoomTrustReviewModel(makeTask(), { db, now: 3000 });
  const sources = model.sources;
  const available = sources.find((source) => source.id === 'file:brief');
  const tombstone = sources.find((source) => source.id === 'memory-ref:file:deleted');
  const missing = sources.find((source) => source.id === 'memory-ref:file:missing');

  assert.equal(model.evidenceHealth.available, 1);
  assert.equal(model.evidenceHealth.tombstone, 1);
  assert.equal(model.evidenceHealth.missing, 1);
  assert.deepEqual(available?.memoryRefIds, ['file:brief']);
  assert.deepEqual(available?.refStatuses, ['available']);
  assert.equal(tombstone?.status, 'tombstone');
  assert.equal(tombstone?.deletable, false);
  assert.equal(missing?.status, 'missing');
  assert.equal(missing?.deletable, false);
  assert.equal(tombstone?.rawText, '');
  assert.doesNotMatch([tombstone?.summary, tombstone?.excerpt].join(' '), /SECRET DELETED RAW CONTENT/);

  const tombstoneResults = searchRoomDataSources({
    sources,
    roomId: 'room-1',
    query: '',
    type: 'memory_ref',
    status: 'tombstone',
  });
  assert.deepEqual(tombstoneResults.map((source) => source.id), ['memory-ref:file:deleted']);

  const answer = answerRoomTrustReviewQuestion('missing source', model, 'room-1');
  assert.equal(answer.sources.some((source) => source.status === 'missing'), true);

  const legacySources = await buildRoomDataSourcesWithMemory(makeTask(), { db, now: 3000 });
  assert.deepEqual(legacySources.map((source) => source.id), sources.map((source) => source.id));

  await clearRoomMemoryData(db);
  db.close();
});

test('buildRoomTrustReviewModel keeps replay bounded to the last 10 events and links event refs to evidence cards', async () => {
  const db = createRoomMemoryDb(`mind_room_memory_trust_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  for (let index = 0; index < 12; index += 1) {
    await appendRoomMemoryEvent(event({
      id: `event-${index}`,
      type: index === 11 ? 'blocker_updated' : 'summary_updated',
      createdAt: 2000 + index,
      summary: index === 11 ? 'Budget blocker changed' : `Summary ${index}`,
      refs: [{ id: 'file:brief', kind: 'pdf', label: 'Brief.pdf', excerpt: 'Budget evidence.' }],
      payload: index === 11 ? { blockers: ['dependency'] } : { summary: `Summary ${index}` },
    }), db);
  }

  const model = await buildRoomTrustReviewModel(makeTask(), { db, now: 3000 });

  assert.equal(model.recentEvents.length, 10);
  assert.equal(model.recentEvents[0]?.id, 'event-2');
  assert.equal(model.recentEvents.at(-1)?.id, 'event-11');
  assert.equal(model.snapshot?.currentBlockers[0], 'dependency');
  assert.deepEqual(model.sources.find((source) => source.id === 'file:brief')?.recentEventTypes?.sort(), ['blocker_updated', 'summary_updated']);

  const answer = answerRoomTrustReviewQuestion('Budget blocker', model, 'room-1');
  assert.equal(answer.sources.some((source) => source.id === 'file:brief'), true);

  await clearRoomMemoryData(db);
  db.close();
});
