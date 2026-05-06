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
  getHealthyRoomMemorySnapshot,
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
  assert.equal(snapshot?.version, 2);
  assert.equal(snapshot?.cognitiveState?.preferredStartFormat, 'unknown');

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
  assert.equal(snapshot.cognitiveState?.lastStuckSignal, 'missing_context');
});

test('legacy events without intent still project into v2 cognitive snapshot', () => {
  const snapshot = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'summary_updated',
      summary: 'Legacy summary',
      payload: { summary: 'Legacy summary' },
    }),
  ]);

  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.currentSummary, 'Legacy summary');
  assert.equal(snapshot.cognitiveState?.preferredStartFormat, 'unknown');
  assert.equal(snapshot.cognitiveState?.lastStuckSignal, 'unknown');
});

test('getHealthyRoomMemorySnapshot rebuilds legacy v1 snapshot into v2', async () => {
  const db = testDb();
  await appendRoomMemoryEvent(event({
    id: 'legacy-v1-event',
    roomId: 'room-legacy',
    createdAt: 10,
    summary: 'new summary',
    payload: { summary: 'new summary' },
  }), db);
  await db.roomSnapshots.put({
    roomId: 'room-legacy',
    currentSummary: 'old summary',
    currentBlockers: [],
    sourceRefs: [],
    lastEventAt: 10,
    version: 1,
  });

  const snapshot = await getHealthyRoomMemorySnapshot('room-legacy', db);
  const saved = await getRoomMemorySnapshot('room-legacy', db);

  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.currentSummary, 'new summary');
  assert.equal(saved?.version, 2);

  await clearRoomMemoryData(db);
  db.close();
});

test('getHealthyRoomMemorySnapshot rebuilds stale snapshot from latest event', async () => {
  const db = testDb();
  await db.roomEvents.bulkAdd([
    event({
      id: 'stale-event-1',
      roomId: 'room-stale',
      createdAt: 10,
      summary: 'first',
      payload: { summary: 'first' },
    }),
    event({
      id: 'stale-event-2',
      roomId: 'room-stale',
      createdAt: 20,
      summary: 'latest',
      payload: { summary: 'latest' },
    }),
  ]);
  await db.roomSnapshots.put({
    roomId: 'room-stale',
    currentSummary: 'first',
    currentBlockers: [],
    sourceRefs: [],
    lastEventAt: 10,
    version: 2,
    cognitiveState: {
      preferredStartFormat: 'unknown',
      lastStuckSignal: 'unknown',
      commitments: [],
      openQuestions: [],
      driftWarnings: [],
    },
  });

  const snapshot = await getHealthyRoomMemorySnapshot('room-stale', db);

  assert.equal(snapshot.currentSummary, 'latest');
  assert.equal(snapshot.lastEventAt, 20);

  await clearRoomMemoryData(db);
  db.close();
});

test('getHealthyRoomMemorySnapshot returns rebuilt in-memory snapshot when repair save fails', async () => {
  const db = testDb();
  await db.roomEvents.add(event({
    id: 'save-fail-event',
    roomId: 'room-save-fail',
    createdAt: 10,
    summary: 'rebuild me',
    payload: { summary: 'rebuild me' },
  }));
  const originalPut = db.roomSnapshots.put.bind(db.roomSnapshots);
  (db.roomSnapshots as never as { put: () => Promise<never> }).put = async () => {
    throw new Error('save failed');
  };

  const snapshot = await getHealthyRoomMemorySnapshot('room-save-fail', db);

  assert.equal(snapshot.currentSummary, 'rebuild me');
  assert.equal(snapshot.version, 2);

  (db.roomSnapshots as never as { put: typeof originalPut }).put = originalPut;
  await clearRoomMemoryData(db);
  db.close();
});

test('getHealthyRoomMemorySnapshot rebuilds malformed snapshot shape', async () => {
  const db = testDb();
  await db.roomEvents.add(event({
    id: 'malformed-event',
    roomId: 'room-malformed',
    createdAt: 10,
    summary: 'valid projection',
    payload: { summary: 'valid projection' },
  }));
  await db.roomSnapshots.put({
    roomId: 'room-malformed',
    currentSummary: 'bad projection',
    currentBlockers: [],
    sourceRefs: [],
    lastEventAt: 10,
    version: 2,
    cognitiveState: {
      preferredStartFormat: 'unknown',
      lastStuckSignal: 'unknown',
      commitments: 'not-array',
      openQuestions: [],
      driftWarnings: [],
    },
  } as never);

  const snapshot = await getHealthyRoomMemorySnapshot('room-malformed', db);

  assert.equal(snapshot.currentSummary, 'valid projection');
  assert.deepEqual(snapshot.cognitiveState?.commitments, []);

  await clearRoomMemoryData(db);
  db.close();
});

test('projectRoomMemorySnapshot infers stuck signals including too_big Thai and English keywords', () => {
  const snapshot = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'blocker_updated',
      createdAt: 1,
      summary: 'Current blockers: unclear_scope',
      payload: { blockers: ['unclear_scope'] },
    }),
    event({
      type: 'blocker_updated',
      createdAt: 2,
      summary: 'งานนี้ซับซ้อนและไม่รู้จะเริ่มจากไหน',
      payload: { blockers: ['This feels too big and complex'] },
    }),
  ]);

  assert.deepEqual(snapshot.currentBlockers, ['This feels too big and complex']);
  assert.equal(snapshot.cognitiveState?.lastStuckSignal, 'too_big');
});

test('projectRoomMemorySnapshot infers preferred start format from explicit payload and action text', () => {
  const explicit = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'action_selected',
      summary: 'Start with checklist',
      payload: {
        action: {
          title: 'Start with checklist',
          startFormat: 'bullet',
        },
      },
    }),
  ]);
  const inferred = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'action_selected',
      summary: 'ถามลูกค้าหนึ่งคำถาม',
      payload: {
        action: {
          title: 'Ask one clarify question to the client',
        },
      },
    }),
  ]);
  const reply = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'action_selected',
      summary: 'เขียนข้อความตอบลูกค้า',
      payload: {
        action: {
          title: 'เขียนข้อความตอบลูกค้า',
        },
      },
    }),
  ]);

  assert.equal(explicit.cognitiveState?.preferredStartFormat, 'bullet');
  assert.equal(inferred.cognitiveState?.preferredStartFormat, 'question');
  assert.equal(reply.cognitiveState?.preferredStartFormat, 'direct_reply');
});

test('unclear action_selected and reentry_created do not overwrite existing CCS signal', () => {
  const snapshot = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'action_selected',
      createdAt: 1,
      summary: 'Start as bullets',
      payload: {
        action: {
          title: 'Make a checklist first',
        },
      },
    }),
    event({
      type: 'action_selected',
      createdAt: 2,
      summary: 'Do the thing',
      payload: {
        action: {
          title: 'Do the thing',
        },
      },
    }),
    event({
      type: 'reentry_created',
      createdAt: 3,
      summary: 'Resume from latest state',
      payload: {
        reentry: {
          summary: 'Resume from latest state',
          topActions: [],
          createdAt: 3,
        },
      },
      intent: { kind: 'ai_created_reentry', reason: 'bounce_back', confidence: 'medium' },
    }),
  ]);

  assert.equal(snapshot.cognitiveState?.preferredStartFormat, 'bullet');
});

test('ai_created_rescue drift warnings only trigger for missing unknown reason or fallback payload', () => {
  const missingReason = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'rescue_created',
      summary: 'Rescue: unknown',
      payload: {
        rescue: {
          reason: 'unknown',
          mode: 'shrink',
          steps: [],
          createdAt: 1,
        },
      },
      intent: { kind: 'ai_created_rescue', confidence: 'low' },
    }),
  ]);
  const fallback = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'rescue_created',
      summary: 'Rescue fallback',
      payload: {
        fallback: true,
        rescue: {
          reason: 'unknown',
          mode: 'shrink',
          steps: [],
          createdAt: 1,
        },
      },
      intent: { kind: 'ai_created_rescue', reason: 'unknown', confidence: 'low' },
    }),
  ]);
  const otherEventType = projectRoomMemorySnapshot('room-1', [
    event({
      type: 'reentry_created',
      summary: 'Fallback reentry',
      payload: { fallback: true },
      intent: { kind: 'ai_created_reentry', reason: 'unknown', confidence: 'low' },
    }),
  ]);

  assert.equal(missingReason.cognitiveState?.driftWarnings.length, 1);
  assert.equal(fallback.cognitiveState?.driftWarnings.length, 2);
  assert.deepEqual(otherEventType.cognitiveState?.driftWarnings, []);
});

test('projectRoomMemorySnapshot is idempotent and stable-dedupes arrays', () => {
  const events = [
    event({
      id: 'dedupe-plan',
      type: 'plan_updated',
      createdAt: 1,
      refs: [
        { id: 'source-1', kind: 'manual', label: 'Source 1' },
        { id: 'source-1', kind: 'manual', label: 'Source 1 duplicate' },
      ],
      payload: {
        commitments: ['Send client reply', 'Send client reply'],
        openQuestions: ['Need scope?', 'Need scope?'],
        plan: {
          actionTitle: 'Send client reply',
          steps: [{ id: 'step-1', text: 'Draft reply' }],
        },
      },
    }),
    event({
      id: 'dedupe-rescue',
      type: 'rescue_created',
      createdAt: 2,
      payload: {
        fallback: true,
        rescue: {
          reason: 'unknown',
          mode: 'shrink',
          steps: [],
          createdAt: 2,
        },
      },
      intent: { kind: 'ai_created_rescue', reason: 'unknown', confidence: 'low' },
    }),
  ];

  const once = projectRoomMemorySnapshot('room-1', events);
  const duplicated = projectRoomMemorySnapshot('room-1', [...events, ...events]);

  assert.deepEqual(duplicated, once);
  assert.deepEqual(once.sourceRefs.map((ref) => ref.id), ['source-1']);
  assert.deepEqual(once.cognitiveState?.commitments, ['Send client reply']);
  assert.deepEqual(once.cognitiveState?.openQuestions, ['Need scope?']);
  assert.equal(once.cognitiveState?.driftWarnings.length, 2);
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
