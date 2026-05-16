import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoomSidebarItems,
  rankResumeRooms,
  resolveActiveRoomReentryState,
  resolveHomeEntryState,
  type ResumeRoomCandidateInput,
} from '@/lib/orchestrator/home-entry';
import { createTaskContext, type AppSession, type RoomRecord } from '@/lib/store/idb';
import type { RoomMemoryReplayContext } from '@/lib/store/room-memory-db';
import type { RoomSourceFile } from '@/lib/room';

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    roomId: 'room-empty',
    roomTitle: 'ห้องงานใหม่',
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    ...overrides,
  };
}

function room(id: string, overrides: Partial<RoomRecord> = {}): RoomRecord {
  const baseSession = session({
    roomId: id,
    roomTitle: `Room ${id}`,
  });
  return {
    id,
    title: `Room ${id}`,
    clientName: `Room ${id}`,
    scenarioType: 'general_client_room',
    lastState: 'DUMP_ENTRY',
    lastKnownGoodNextMoves: [],
    aiFreshness: 'fallback',
    lastUpdatedAt: 100,
    unread: false,
    stale: false,
    contextSummary: '',
    nextMoves: [],
    session: baseSession,
    ...overrides,
  };
}

function replay(input: {
  lastStuckSignal?: 'scope_unclear' | 'waiting_client' | 'energy_low' | 'missing_context' | 'too_big' | 'unknown';
  driftWarnings?: string[];
  actionTitle?: string;
  summary?: string;
  latestReentry?: boolean;
  lastEventAt?: number;
}): RoomMemoryReplayContext {
  return {
    snapshot: {
      roomId: 'room',
      currentSummary: input.summary,
      currentAction: input.actionTitle ? { title: input.actionTitle } : undefined,
      currentBlockers: [],
      latestReentry: input.latestReentry
        ? {
            summary: input.summary ?? 'กลับมาต่องานนี้ได้ทันที',
            topActions: [],
            createdAt: input.lastEventAt ?? 100,
          }
        : undefined,
      sourceRefs: [],
      lastEventAt: input.lastEventAt ?? 100,
      version: 2,
      cognitiveState: {
        preferredStartFormat: 'unknown',
        lastStuckSignal: input.lastStuckSignal ?? 'unknown',
        commitments: [],
        openQuestions: [],
        driftWarnings: input.driftWarnings ?? [],
      },
    },
    recentEvents: [],
    relevantRefs: [],
  };
}

function sourceFile(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
  return {
    id: 'file-1',
    name: 'brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1200,
    status: 'ready',
    createdAt: 100,
    extractedText: 'client context',
    ...overrides,
  };
}

test('resolveHomeEntryState returns get_started when there is no user work', () => {
  const state = resolveHomeEntryState({
    rooms: [room('empty')],
    activeSession: session(),
    resumeRoom: null,
  });

  assert.equal(state.mode, 'get_started');
});

test('resolveHomeEntryState returns get_started when the workspace is empty', () => {
  const state = resolveHomeEntryState({
    rooms: [],
    activeSession: session(),
    resumeRoom: null,
  });

  assert.equal(state.mode, 'get_started');
});

test('resolveHomeEntryState treats the default seed summary as empty workspace', () => {
  const state = resolveHomeEntryState({
    rooms: [
      room('seed', {
        contextSummary: 'เริ่มห้องนี้ด้วย client chaos แล้วให้ MIND ช่วยหา next move',
        lastKnownGoodBrief: 'เริ่มห้องนี้ด้วย client chaos แล้วให้ MIND ช่วยหา next move',
      }),
    ],
    activeSession: session(),
    resumeRoom: null,
  });

  assert.equal(state.mode, 'get_started');
});

test('resolveHomeEntryState keeps resumable active sessions in active_room mode', () => {
  const activeTask = createTaskContext({
    roomId: 'active',
    sourceText: 'Client context',
    lifecycleState: 'has_one_action',
    createdAt: 100,
  });
  const activeSession = session({
    roomId: 'active',
    uiRoute: 'ONE_ACTION',
    task: activeTask,
  });
  const state = resolveHomeEntryState({
    rooms: [room('active', { session: activeSession })],
    activeSession,
    resumeRoom: null,
  });

  assert.equal(state.mode, 'active_room');
});

test('resolveHomeEntryState returns resume_prompt for returning users with a resumable room', () => {
  const candidate: ResumeRoomCandidateInput = {
    room: room('resume', {
      contextSummary: 'มีงานค้าง',
      lastKnownGoodNextMoves: ['ตอบลูกค้า'],
    }),
    replay: replay({ actionTitle: 'ตอบลูกค้าต่อ', lastEventAt: 250 }),
  };

  const state = resolveHomeEntryState({
    rooms: [candidate.room],
    activeSession: session(),
    resumeRoom: rankResumeRooms([candidate])[0] ?? null,
  });

  assert.equal(state.mode, 'resume_prompt');
});

test('resolveHomeEntryState switches to active_room when the ranked resume room is already active', () => {
  const active = room('active', { contextSummary: 'มีงานค้าง', lastKnownGoodNextMoves: ['ตอบลูกค้า'] });
  const [resumeRoom] = rankResumeRooms([{ room: active }]);
  const state = resolveHomeEntryState({
    rooms: [active],
    activeSession: session({ roomId: 'active' }),
    activeRoomId: 'active',
    resumeRoom,
  });

  assert.equal(state.mode, 'active_room');
});

test('waiting_client with current action ranks above the latest room', () => {
  const candidates: ResumeRoomCandidateInput[] = [
    {
      room: room('latest', {
        lastUpdatedAt: 999,
        contextSummary: 'ล่าสุดแต่ยังไม่มีก้าวชัด',
      }),
      replay: replay({ summary: 'ล่าสุดแต่ยังไม่มีก้าวชัด', lastEventAt: 999 }),
    },
    {
      room: room('waiting', {
        lastUpdatedAt: 100,
        contextSummary: 'รอลูกค้าอยู่',
      }),
      replay: replay({
        actionTitle: 'ตอบกลับด้วยขอบเขตที่ชัดขึ้น',
        lastStuckSignal: 'waiting_client',
        lastEventAt: 100,
      }),
    },
  ];

  const [best] = rankResumeRooms(candidates);

  assert.equal(best?.room.id, 'waiting');
  assert.equal(best?.headline, 'รอ client อยู่');
});

test('drift with latest reentry ranks above generic currentAction when no waiting-client room exists', () => {
  const [best] = rankResumeRooms([
    {
      room: room('generic', { contextSummary: 'มีก้าวถัดไป' }),
      replay: replay({ actionTitle: 'ทำ proposal ต่อ', lastEventAt: 500 }),
    },
    {
      room: room('drift', { contextSummary: 'AI เตรียม context ใหม่' }),
      replay: replay({
        latestReentry: true,
        driftWarnings: ['fallback rescue used'],
        summary: 'AI เตรียม context ใหม่',
        lastEventAt: 200,
      }),
    },
  ]);

  assert.equal(best?.room.id, 'drift');
});

test('fallback ranking uses latest event time when signals tie', () => {
  const [best] = rankResumeRooms([
    {
      room: room('older', { contextSummary: 'old' }),
      replay: replay({ actionTitle: 'เริ่มจาก old', lastEventAt: 100 }),
    },
    {
      room: room('newer', { contextSummary: 'new' }),
      replay: replay({ actionTitle: 'เริ่มจาก new', lastEventAt: 300 }),
    },
  ]);

  assert.equal(best?.room.id, 'newer');
});

test('fallback ranking can use room save-point fields when replay is unavailable', () => {
  const [best] = rankResumeRooms([
    {
      room: room('older-save-point', {
        lastKnownGoodNextMoves: ['เริ่มจาก old save point'],
        contextSummary: 'old room context',
        lastUpdatedAt: 100,
      }),
    },
    {
      room: room('newer-save-point', {
        lastKnownGoodNextMoves: ['เริ่มจาก new save point'],
        contextSummary: 'new room context',
        lastUpdatedAt: 300,
      }),
    },
  ]);

  assert.equal(best?.room.id, 'newer-save-point');
  assert.equal(best?.actionTitle, 'เริ่มจาก new save point');
});

test('buildRoomSidebarItems marks waiting-client current action as recommended', () => {
  const waiting = room('waiting', { contextSummary: 'รอลูกค้าอยู่' });
  const latest = room('latest', { contextSummary: 'ล่าสุด', lastUpdatedAt: 999 });
  const ranked = rankResumeRooms([
    { room: latest, replay: replay({ summary: 'ล่าสุด', lastEventAt: 999 }) },
    {
      room: waiting,
      replay: replay({
        actionTitle: 'ส่ง follow-up สั้น ๆ',
        lastStuckSignal: 'waiting_client',
        lastEventAt: 100,
      }),
    },
  ]);

  const items = buildRoomSidebarItems({
    rooms: [latest, waiting],
    activeRoomId: 'latest',
    rankedResumeRooms: ranked,
  });
  const recommended = items.find((item) => item.room.id === 'waiting');

  assert.equal(recommended?.isRecommended, true);
  assert.equal(recommended?.headline, 'รอ client อยู่');
  assert.equal(recommended?.nextAction, 'ส่ง follow-up สั้น ๆ');
});

test('buildRoomSidebarItems marks drift reentry as recommended when no waiting-client room exists', () => {
  const generic = room('generic', { contextSummary: 'มีก้าวถัดไป' });
  const drift = room('drift', { contextSummary: 'AI เตรียม context ใหม่' });
  const ranked = rankResumeRooms([
    { room: generic, replay: replay({ actionTitle: 'ทำ proposal ต่อ', lastEventAt: 500 }) },
    {
      room: drift,
      replay: replay({
        latestReentry: true,
        driftWarnings: ['fallback rescue used'],
        summary: 'AI เตรียม context ใหม่',
        lastEventAt: 200,
      }),
    },
  ]);

  const items = buildRoomSidebarItems({
    rooms: [generic, drift],
    activeRoomId: 'generic',
    rankedResumeRooms: ranked,
  });
  const recommended = items.find((item) => item.isRecommended);

  assert.equal(recommended?.room.id, 'drift');
  assert.equal(recommended?.headline, 'ต่อได้เลย');
  assert.equal(recommended?.reason, 'AI เตรียมบริบทกลับมาต่อไว้แล้ว');
});

test('buildRoomSidebarItems preserves active room state and excludes trashed rooms', () => {
  const active = room('active', { contextSummary: 'กำลังทำอยู่' });
  const trashed = room('trashed', {
    contextSummary: 'ไม่ควรแสดง',
    trashedAt: 123,
  });
  const ranked = rankResumeRooms([
    { room: active, replay: replay({ actionTitle: 'ทำงานนี้ต่อ', lastEventAt: 200 }) },
    { room: trashed, replay: replay({ actionTitle: 'ไม่ควรแสดง', lastEventAt: 999 }) },
  ]);

  const items = buildRoomSidebarItems({
    rooms: [active, trashed],
    activeRoomId: 'active',
    rankedResumeRooms: ranked,
  });

  assert.deepEqual(items.map((item) => item.room.id), ['active']);
  assert.equal(items[0]?.isActive, true);
});

test('buildRoomSidebarItems uses latest ranked room as recommendation when signals tie', () => {
  const older = room('older', { contextSummary: 'old' });
  const newer = room('newer', { contextSummary: 'new' });
  const ranked = rankResumeRooms([
    { room: older, replay: replay({ actionTitle: 'เริ่มจาก old', lastEventAt: 100 }) },
    { room: newer, replay: replay({ actionTitle: 'เริ่มจาก new', lastEventAt: 300 }) },
  ]);

  const items = buildRoomSidebarItems({
    rooms: [older, newer],
    activeRoomId: 'older',
    rankedResumeRooms: ranked,
  });
  const recommended = items.find((item) => item.isRecommended);

  assert.equal(recommended?.room.id, 'newer');
  assert.equal(recommended?.lastEventAt, 300);
  assert.equal(recommended?.nextAction, 'เริ่มจาก new');
});

test('resume copy defaults to you are stuck here when signal is not waiting_client', () => {
  const [best] = rankResumeRooms([
    {
      room: room('scope', { contextSummary: 'scope unclear' }),
      replay: replay({
        actionTitle: 'ถาม scope เพิ่ม',
        lastStuckSignal: 'scope_unclear',
      }),
    },
  ]);

  assert.equal(best?.headline, 'คุณค้างอยู่ตรงนี้');
});

test('active room reentry uses start-here copy and continue CTA for clear action', () => {
  const state = resolveActiveRoomReentryState({
    room: room('active', { contextSummary: 'มีบริบทพร้อม' }),
    replay: replay({
      actionTitle: 'ร่างคำตอบกลับลูกค้า',
      summary: 'มีบริบทพร้อม',
    }),
  });

  assert.equal(state?.headline, 'เริ่มตรงนี้');
  assert.equal(state?.primaryCta, 'ทำก้าวนี้');
  assert.equal(state?.primaryAction, 'continue');
});

test('active room reentry uses waiting-client headline without blame', () => {
  const state = resolveActiveRoomReentryState({
    room: room('active', { contextSummary: 'รอลูกค้าอยู่' }),
    replay: replay({
      actionTitle: 'ส่ง follow-up สั้น ๆ',
      lastStuckSignal: 'waiting_client',
    }),
  });

  assert.equal(state?.headline, 'รอ client อยู่');
  assert.equal(state?.primaryCta, 'ทำก้าวนี้');
});

test('active room reentry uses one-question CTA when context is missing', () => {
  const activeTask = createTaskContext({
    roomId: 'active',
    sourceText: 'งานนี้ยังข้อมูลไม่ครบ',
    createdAt: 100,
    blockerSignals: ['missing_context'],
  });
  const state = resolveActiveRoomReentryState({
    room: room('active', {
      contextSummary: 'งานนี้ยังข้อมูลไม่ครบ',
      session: session({ roomId: 'active', task: activeTask }),
    }),
    replay: replay({
      actionTitle: 'ถามบริบทเพิ่ม',
      lastStuckSignal: 'missing_context',
    }),
  });

  assert.equal(state?.headline, 'ต้องรู้เพิ่มอีกนิดเดียว');
  assert.equal(state?.primaryCta, 'ตอบ 1 คำถาม');
  assert.equal(state?.primaryAction, 'answer_question');
  assert.ok(state?.trustItems.some((item) => item.id === 'missing-context'));
});

test('active room reentry uses fix-context CTA when file context is broken', () => {
  const activeTask = createTaskContext({
    roomId: 'active',
    sourceText: 'ไฟล์แนบอ่านไม่สำเร็จ',
    createdAt: 100,
    sourceFiles: [sourceFile({ status: 'failed_extraction', extractedText: undefined })],
    blockerSignals: ['missing_file_or_context'],
  });
  const state = resolveActiveRoomReentryState({
    room: room('active', {
      contextSummary: 'ไฟล์แนบอ่านไม่สำเร็จ',
      session: session({ roomId: 'active', task: activeTask }),
    }),
    replay: replay({
      actionTitle: 'แก้บริบท',
      lastStuckSignal: 'missing_context',
    }),
  });

  assert.equal(state?.primaryCta, 'แก้บริบทนี้');
  assert.equal(state?.primaryAction, 'fix_context');
  assert.ok(state?.trustItems.some((item) => item.label === 'ไฟล์หลักยังอ่านไม่สมบูรณ์'));
});

test('active room trust strip uses drift as signal without exposing raw drift warning text', () => {
  const state = resolveActiveRoomReentryState({
    room: room('active', { contextSummary: 'มี drift warning ภายใน' }),
    replay: replay({
      actionTitle: 'ตรวจบริบทก่อนตอบ',
      driftWarnings: ['fallback rescue used raw warning'],
    }),
  });

  const trustText = state?.trustItems.map((item) => item.label).join(' ') ?? '';
  assert.match(trustText, /ควรตรวจบริบทก่อน/);
  assert.doesNotMatch(trustText, /fallback rescue used raw warning/);
});
