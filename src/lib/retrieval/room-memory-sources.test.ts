import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { answerRoomReviewQuestion, searchRoomDataSources } from '@/lib/retrieval/room-data';
import { buildRoomDataSourcesWithMemory } from '@/lib/retrieval/room-memory-sources';
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

  const sources = await buildRoomDataSourcesWithMemory(makeTask(), { db, now: 3000 });
  const available = sources.find((source) => source.id === 'memory-ref:file:brief');
  const tombstone = sources.find((source) => source.id === 'memory-ref:file:deleted');
  const missing = sources.find((source) => source.id === 'memory-ref:file:missing');

  assert.equal(available?.refStatus, 'available');
  assert.equal(tombstone?.status, 'tombstone');
  assert.equal(missing?.status, 'missing');
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

  const answer = answerRoomReviewQuestion('missing source', sources, 'room-1');
  assert.equal(answer.sources.some((source) => source.status === 'missing'), true);

  await clearRoomMemoryData(db);
  db.close();
});
