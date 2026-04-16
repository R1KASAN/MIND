import test from 'node:test';
import assert from 'node:assert/strict';

import type { AiSynthesisResponse } from '@/lib/ai/schema';
import {
  canContinueFromRoomCard,
  canMakeSmallerFromRoomCard,
  getAdjacentRoom,
} from '@/lib/orchestrator/use-room-actions';
import { createTaskContext } from '@/lib/store/idb';
import type { Action, AppSession, RoomRecord } from '@/lib/store/idb';

function createSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    lastActive: 1,
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    ...overrides,
  };
}

function createRoom(id: string): RoomRecord {
  return {
    id,
    title: id,
    clientName: id,
    scenarioType: 'client_project_restart',
    lastState: 'DUMP_ENTRY',
    lastKnownGoodNextMoves: [],
    aiFreshness: 'stale',
    lastUpdatedAt: 1,
    unread: false,
    stale: false,
    contextSummary: '',
    nextMoves: [],
    session: createSession(),
  };
}

const mockPayload = {
  requires_clarification: false,
  recommended_action: {
    title: 'Reply to client',
    rationale: 'Fastest unblock',
    micro_steps: ['Open reply', 'Send reply'],
  },
  alternative_actions: [],
} satisfies AiSynthesisResponse;

const mockAction: Action = {
  id: 'action-1',
  createdAt: 1,
  title: 'Reply to client',
  rationale: 'Fastest unblock',
  microSteps: ['Open reply'],
  isPinned: false,
  state: 'PENDING',
};

test('getAdjacentRoom wraps forward and backward', () => {
  const rooms = [createRoom('a'), createRoom('b'), createRoom('c')];
  assert.equal(getAdjacentRoom(rooms, 'b', 'next')?.id, 'c');
  assert.equal(getAdjacentRoom(rooms, 'a', 'previous')?.id, 'c');
});

test('canContinueFromRoomCard allows save-point rooms with suggested reentry action', () => {
  const session = createSession({
    task: {
      ...createTaskContext({ sourceText: 'demo task' }),
      reentryBrief: {
        summary: 'Resume here',
        topActions: [{
          roomId: 'room-1',
          title: 'Continue draft',
          rationale: 'Best next move',
          impact: 'high',
          effort: 'low',
          resumeTarget: 'ONE_ACTION',
        }],
        ignoredNoise: [],
        createdAt: 1,
      },
      lifecycleState: 'dumped',
    },
  });

  assert.equal(canContinueFromRoomCard(session, null, null), true);
});

test('canContinueFromRoomCard allows resumable tasks with current payload', () => {
  const session = createSession({
    uiRoute: 'ONE_ACTION',
    task: {
      ...createTaskContext({ sourceText: 'demo task' }),
      lifecycleState: 'has_one_action',
    },
  });

  assert.equal(canContinueFromRoomCard(session, mockPayload, null), true);
});

test('canMakeSmallerFromRoomCard requires resumable task and live context', () => {
  const resumable = createSession({
    uiRoute: 'SCAFFOLD',
    task: {
      ...createTaskContext({ sourceText: 'demo task' }),
      lifecycleState: 'in_scaffold',
      currentPlan: {
        actionTitle: 'Do task',
        steps: [{ id: '1', text: 'Step one' }],
      },
    },
  });

  const dumped = createSession({
    task: {
      ...createTaskContext({ sourceText: 'demo task' }),
      lifecycleState: 'dumped',
    },
  });

  assert.equal(canMakeSmallerFromRoomCard(resumable, null, null), true);
  assert.equal(canMakeSmallerFromRoomCard(dumped, null, null), false);
  assert.equal(canMakeSmallerFromRoomCard(resumable, null, mockAction), true);
});
