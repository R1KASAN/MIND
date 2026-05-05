import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendRoomMemoryEvent,
  appendRoomMemoryEvents,
  buildBackfillRoomMemoryEvents,
  buildRoomMemoryReplayContext,
  clearRoomMemoryData,
  createRoomMemoryDb,
  ensureRoomMemoryBackfilled,
  getRoomMemorySnapshot,
  markRoomMemoryRefDeleted,
  projectRoomMemorySnapshot,
  resolveRoomMemoryRefs,
  validateRoomMemoryEvent,
  type RoomMemoryEvent,
} from './room-memory-db';
import { createTaskContext, type RoomRecord, type TaskContext } from './idb';

function testDb() {
  return createRoomMemoryDb(`mind_room_memory_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

function event(overrides: Partial<RoomMemoryEvent> = {}): RoomMemoryEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    roomId: 'room-1',
    type: 'summary_updated',
    createdAt: Date.now(),
    actor: 'ai',
    origin: 'live',
    summary: 'สรุปล่าสุดของงานนี้',
    refs: [],
    payloadVersion: 1,
    payload: {
      summary: 'สรุปล่าสุดของงานนี้',
    },
    ...overrides,
  };
}

test('validateRoomMemoryEvent requires backfilledFrom for backfill events', () => {
  assert.throws(() => validateRoomMemoryEvent(event({
    origin: 'backfill',
  })), /backfilledFrom/);

  assert.doesNotThrow(() => validateRoomMemoryEvent(event({
    origin: 'backfill',
    backfilledFrom: 'TaskContext+RoomRecord',
  })));
});

test('appendRoomMemoryEvent dedupes by dedupeKey and projects snapshot from events only', async () => {
  const db = testDb();
  const first = event({
    id: 'event-1',
    dedupeKey: 'room-1:summary',
    summary: 'summary one',
    payload: { summary: 'summary one' },
  });
  const duplicate = event({
    id: 'event-2',
    dedupeKey: 'room-1:summary',
    summary: 'summary two',
    payload: { summary: 'summary two' },
  });

  await appendRoomMemoryEvent(first, db);
  await appendRoomMemoryEvent(duplicate, db);

  const events = await db.roomEvents.toArray();
  const snapshot = await getRoomMemorySnapshot('room-1', db);

  assert.equal(events.length, 1);
  assert.equal(snapshot?.currentSummary, 'summary one');
  assert.equal(snapshot?.version, 1);

  await clearRoomMemoryData(db);
  db.close();
});

test('projectRoomMemorySnapshot makes blocker_updated first-class without rescue', () => {
  const snapshot = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'blocker_updated',
      summary: 'Current blockers: missing_context',
      payload: { blockers: ['missing_context', 'too_big'] },
    }),
  ]);

  assert.deepEqual(snapshot.currentBlockers, ['missing_context', 'too_big']);
  assert.equal(snapshot.latestRescue, undefined);
});

test('lazy backfill creates backfill events and a snapshot from legacy task context', async () => {
  const db = testDb();
  const task: TaskContext = {
    ...createTaskContext({
      roomId: 'room-backfill',
      sourceText: 'Client wants phase 2 budget and deadline clarified.',
      createdAt: 10,
      lastAttemptAt: 20,
    }),
    blockerSignals: ['unclear_scope'],
    currentPlan: {
      actionTitle: 'Clarify phase 2 budget',
      successSignal: 'Client confirms budget',
      steps: [
        { id: 'step-1', text: 'Ask for phase 2 budget range' },
      ],
    },
    reentryBrief: {
      summary: 'ค้างที่การ clarify budget phase 2',
      topActions: [
        {
          roomId: 'room-backfill',
          title: 'ส่งคำถามเรื่อง budget',
          rationale: 'ลด scope ambiguity',
          impact: 'high' as const,
          effort: 'low' as const,
          resumeTarget: 'ONE_ACTION' as const,
        },
      ],
      ignoredNoise: [],
      createdAt: 30,
    },
  };
  const room: RoomRecord = {
    id: 'room-backfill',
    title: 'Phase 2',
    clientName: 'Client',
    scenarioType: 'general_client_room',
    lastState: 'BOUNCE_BACK',
    lastKnownGoodBrief: 'ค้างที่การ clarify budget phase 2',
    lastKnownGoodNextMoves: ['ส่งคำถามเรื่อง budget'],
    lastKnownGoodAt: 30,
    aiFreshness: 'fresh',
    lastUpdatedAt: 30,
    unread: false,
    stale: false,
    contextSummary: 'Phase 2 budget',
    nextMoves: ['ส่งคำถามเรื่อง budget'],
    session: {
      roomId: 'room-backfill',
      roomTitle: 'Phase 2',
      lastActive: 30,
      uiRoute: 'BOUNCE_BACK',
      notThisCount: 0,
      currentActionId: null,
      task,
    },
  };

  const snapshot = await ensureRoomMemoryBackfilled({ task, room, db });
  const events = await db.roomEvents.where('roomId').equals('room-backfill').toArray();

  assert.ok(events.length >= 4);
  assert.equal(events.every((item) => item.origin === 'backfill'), true);
  assert.equal(events.every((item) => item.backfilledFrom === 'TaskContext+RoomRecord'), true);
  assert.deepEqual(snapshot?.currentBlockers, ['unclear_scope']);
  assert.equal(snapshot?.currentPlan?.actionTitle, 'Clarify phase 2 budget');
  assert.equal(snapshot?.latestReentry?.summary, 'ค้างที่การ clarify budget phase 2');

  await clearRoomMemoryData(db);
  db.close();
});

test('room memory stays room-scoped and replay uses last 10 events', async () => {
  const db = testDb();
  const roomOneEvents = Array.from({ length: 12 }, (_, index) => event({
    id: `room-1-event-${index}`,
    roomId: 'room-1',
    createdAt: index + 1,
    summary: `room 1 event ${index}`,
    payload: { summary: `room 1 event ${index}` },
    refs: [{ id: `manual:${index}`, kind: 'manual_summary', label: `Manual ${index}` }],
  }));
  const roomTwoEvent = event({
    id: 'room-2-event',
    roomId: 'room-2',
    createdAt: 99,
    summary: 'room 2 event',
    payload: { summary: 'room 2 event' },
  });

  await appendRoomMemoryEvents([...roomOneEvents, roomTwoEvent], db);
  const replay = await buildRoomMemoryReplayContext({
    roomId: 'room-1',
    eventLimit: 10,
    refLimit: 5,
    query: 'manual',
    db,
  });

  assert.equal(replay.recentEvents.length, 10);
  assert.equal(replay.recentEvents[0].id, 'room-1-event-2');
  assert.equal(replay.recentEvents.every((item) => item.roomId === 'room-1'), true);
  assert.equal(replay.snapshot?.currentSummary, 'room 1 event 11');

  await clearRoomMemoryData(db);
  db.close();
});

test('deleted refs resolve as tombstone and missing refs do not break projection', async () => {
  const db = testDb();
  const refs = [
    { id: 'file:a', kind: 'pdf', label: 'A.pdf' },
    { id: 'file:b', kind: 'pdf', label: 'B.pdf' },
  ];
  await appendRoomMemoryEvent(event({
    id: 'source-event',
    type: 'source_added',
    refs,
  }), db);
  await markRoomMemoryRefDeleted({
    roomId: 'room-1',
    refId: 'file:a',
    reason: 'user_deleted_source',
    deletedAt: 50,
  }, db);

  const snapshot = await getRoomMemorySnapshot('room-1', db);
  const resolved = await resolveRoomMemoryRefs({
    roomId: 'room-1',
    refs: snapshot?.sourceRefs ?? [],
    availableRefIds: new Set(['file:a']),
  }, db);

  assert.equal(resolved.find((ref) => ref.id === 'file:a')?.status, 'tombstone');
  assert.equal(resolved.find((ref) => ref.id === 'file:b')?.status, 'missing');

  await clearRoomMemoryData(db);
  db.close();
});

test('buildBackfillRoomMemoryEvents includes explicit blocker_updated event', () => {
  const task = {
    ...createTaskContext({
      roomId: 'room-blocker',
      sourceText: 'Need client dependency before proposal.',
      createdAt: 10,
    }),
    blockerSignals: ['dependency'],
  };
  const events = buildBackfillRoomMemoryEvents({ task });

  assert.ok(events.some((item) => item.type === 'blocker_updated'));
});
