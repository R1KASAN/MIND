import test from 'node:test';
import assert from 'node:assert/strict';

import { scenarioLabel } from './RoomSidebar';
import type { RoomRecord } from '@/lib/store/idb';

function makeRoom(scenarioType: RoomRecord['scenarioType']): RoomRecord {
  return {
    id: 'room-1',
    title: 'ห้องทดสอบ',
    clientName: 'ห้องทดสอบ',
    scenarioType,
    contextSummary: '',
    nextMoves: [],
    lastKnownGoodNextMoves: [],
    aiFreshness: 'fresh',
    stale: false,
    unread: false,
    lastState: "DUMP_ENTRY",
    lastUpdatedAt: 1,
    session: {
      uiRoute: 'DUMP_ENTRY',
      currentPayload: undefined,
      task: undefined,
      lastActive: 1,
      roomId: 'room-1',
      roomTitle: 'ห้องทดสอบ',
      roomScenarioType: scenarioType,
      notThisCount: 0,
      currentActionId: null,
    },
  };
}

test('scenarioLabel uses neutral copy for generic/sidebar rooms and customer copy only for explicit customer scenario', () => {
  assert.equal(scenarioLabel(makeRoom('general_client_room')), 'ห้องงาน');
  assert.equal(scenarioLabel(makeRoom('client_project_restart')), 'งานค้าง');
  assert.equal(scenarioLabel(makeRoom('sales_inquiry_demo_request')), 'ต้องตอบลูกค้า');
});
