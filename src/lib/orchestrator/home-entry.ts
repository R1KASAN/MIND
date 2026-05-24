import { buildRoomMemoryReplayContext, type RoomMemoryReplayContext } from '@/lib/store/room-memory-db';
import type { AppSession, RoomRecord } from '@/lib/store/idb';
import { hasResumableTask } from '@/lib/orchestrator/task-machine';

export type HomeEntryMode = 'get_started' | 'resume_prompt' | 'active_room';
export type ResumeStuckSignal =
  | 'scope_unclear'
  | 'waiting_client'
  | 'energy_low'
  | 'missing_context'
  | 'too_big'
  | 'unknown';

export interface ResumeRoomCandidateInput {
  room: RoomRecord;
  replay?: RoomMemoryReplayContext | null;
}

export interface RankedResumeRoom {
  room: RoomRecord;
  headline: string;
  actionTitle: string;
  summary: string;
  reason: string;
  lastStuckSignal: ResumeStuckSignal;
  lastEventAt: number;
  rank: number;
}

export type ActiveRoomReentryPrimaryAction = 'continue' | 'answer_question' | 'fix_context';
export type TrustStripTone = 'ready' | 'caution' | 'muted';

export interface TrustStripItem {
  id: string;
  label: string;
  tone: TrustStripTone;
}

export interface ActiveRoomReentryState {
  room: RoomRecord;
  headline: string;
  actionTitle: string;
  summary: string;
  reason: string;
  primaryCta: string;
  primaryAction: ActiveRoomReentryPrimaryAction;
  secondaryCta: string;
  question?: string;
  trustItems: TrustStripItem[];
  lastStuckSignal: ResumeStuckSignal;
}

export interface HomeEntryState {
  mode: HomeEntryMode;
  resumeRoom: RankedResumeRoom | null;
}

export interface RoomSidebarItemView {
  room: RoomRecord;
  isActive: boolean;
  isRecommended: boolean;
  headline?: 'ต่อได้เลย' | 'รอ client อยู่';
  nextAction?: string;
  reason?: string;
  lastEventAt?: number;
}

const EMPTY_ROOM_SUMMARY = 'เริ่มห้องนี้ด้วย client chaos แล้วให้ MIND ช่วยหา next move';

function isVisibleRoom(room: RoomRecord) {
  return typeof room.trashedAt !== 'number';
}

function normalizeText(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function normalizeUserWorkText(value: string | undefined) {
  const normalized = normalizeText(value);
  return normalized === EMPTY_ROOM_SUMMARY ? undefined : normalized;
}

function mapBlockerToStuckSignal(value: string | undefined): ResumeStuckSignal {
  const normalized = value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return 'unknown';
  if (normalized.includes('dependency') || normalized.includes('waiting') || normalized.includes('รอลูกค้า')) return 'waiting_client';
  if (normalized.includes('unclear_scope') || normalized.includes('scope unclear') || normalized.includes('scope ไม่ชัด')) return 'scope_unclear';
  if (normalized.includes('low_energy') || normalized.includes('low energy') || normalized.includes('พลังงานต่ำ')) return 'energy_low';
  if (normalized.includes('missing_context') || normalized.includes('missing context') || normalized.includes('ข้อมูลไม่ครบ')) return 'missing_context';
  if (
    normalized.includes('too_big') ||
    normalized.includes('too big') ||
    normalized.includes('ใหญ่เกิน') ||
    normalized.includes('ซับซ้อน') ||
    normalized.includes('complex') ||
    normalized.includes('ไม่รู้จะเริ่มจากไหน')
  ) {
    return 'too_big';
  }
  return 'unknown';
}

function readStuckSignal(candidate: ResumeRoomCandidateInput): ResumeStuckSignal {
  const cognitiveSignal = candidate.replay?.snapshot?.cognitiveState?.lastStuckSignal;
  if (cognitiveSignal) return cognitiveSignal;
  const taskSignal = candidate.room.session.task?.blockerSignals.map(mapBlockerToStuckSignal).find((item) => item !== 'unknown');
  return taskSignal ?? 'unknown';
}

function readActionTitle(candidate: ResumeRoomCandidateInput) {
  const snapshot = candidate.replay?.snapshot;
  const task = candidate.room.session.task;
  return normalizeText(snapshot?.currentAction?.title) ||
    normalizeText(snapshot?.currentPlan?.actionTitle) ||
    normalizeText(task?.currentPlan?.actionTitle) ||
    normalizeText(candidate.room.session.currentPayload?.recommended_action.title) ||
    normalizeText(candidate.room.lastKnownGoodNextMoves[0]) ||
    normalizeText(candidate.room.nextMoves[0]);
}

function readSummary(candidate: ResumeRoomCandidateInput) {
  const snapshot = candidate.replay?.snapshot;
  const task = candidate.room.session.task;
  return normalizeUserWorkText(snapshot?.currentSummary) ||
    normalizeText(snapshot?.latestReentry?.summary) ||
    normalizeUserWorkText(candidate.room.lastKnownGoodBrief) ||
    normalizeText(task?.reentryBrief?.summary) ||
    normalizeText(task?.lastStableSummary) ||
    normalizeUserWorkText(candidate.room.contextSummary) ||
    'MIND เก็บบริบทล่าสุดของห้องนี้ไว้แล้ว';
}

function hasDrift(candidate: ResumeRoomCandidateInput) {
  return (candidate.replay?.snapshot?.cognitiveState?.driftWarnings.length ?? 0) > 0;
}

function hasLatestReentry(candidate: ResumeRoomCandidateInput) {
  return Boolean(
    candidate.replay?.snapshot?.latestReentry ||
      candidate.room.lastReentryBrief ||
      candidate.room.session.task?.reentryBrief,
  );
}

function hasBrokenFileContext(room: RoomRecord) {
  const files = room.session.task?.sourceFiles ?? [];
  return files.some((file) => file.status !== 'ready');
}

function hasMissingContext(candidate: ResumeRoomCandidateInput, signal: ResumeStuckSignal) {
  const blockers = candidate.room.session.task?.blockerSignals ?? [];
  return signal === 'missing_context' || blockers.some((blocker) => {
    const normalized = blocker.toLowerCase();
    return normalized.includes('missing_context') ||
      normalized.includes('missing context') ||
      normalized.includes('missing_file_or_context') ||
      normalized.includes('ข้อมูลไม่ครบ');
  });
}

function hasLatestInput(room: RoomRecord) {
  return Boolean(
    room.session.task?.sourceText?.trim() ||
      room.session.activeDumpContext?.text?.trim(),
  );
}

function hasExistingRoomContext(candidate: ResumeRoomCandidateInput) {
  return Boolean(
    normalizeUserWorkText(candidate.room.lastKnownGoodBrief) ||
      candidate.room.lastReentryBrief ||
      normalizeUserWorkText(candidate.room.contextSummary) ||
      normalizeUserWorkText(candidate.replay?.snapshot?.currentSummary),
  );
}

function buildContextSourceLabel(candidate: ResumeRoomCandidateInput, fileCount: number) {
  const sourceLabels: string[] = [];
  if (hasLatestInput(candidate.room) && hasExistingRoomContext(candidate)) {
    sourceLabels.push('latest input + existing room context');
  } else if (hasLatestInput(candidate.room)) {
    sourceLabels.push('latest input');
  } else if (hasExistingRoomContext(candidate)) {
    sourceLabels.push('existing room context');
  }
  if (fileCount > 0) sourceLabels.push(`${fileCount} ไฟล์`);
  return sourceLabels.length > 0 ? `ใช้ ${sourceLabels.join(' + ')}` : undefined;
}

function buildTrustItems(candidate: ResumeRoomCandidateInput, signal: ResumeStuckSignal): TrustStripItem[] {
  const room = candidate.room;
  const task = room.session.task;
  const sourceFiles = task?.sourceFiles ?? [];
  const sourceLabel = buildContextSourceLabel(candidate, sourceFiles.length);
  const trustItems: TrustStripItem[] = [];

  if (sourceLabel) {
    trustItems.push({
      id: 'sources',
      label: sourceLabel,
      tone: 'ready',
    });
  }

  if (hasBrokenFileContext(room)) {
    trustItems.push({
      id: 'file-health',
      label: 'ไฟล์หลักยังอ่านไม่สมบูรณ์',
      tone: 'caution',
    });
  }

  if (hasMissingContext(candidate, signal)) {
    trustItems.push({
      id: 'missing-context',
      label: 'ควรถามเพิ่ม 1 คำถามก่อนให้ next move',
      tone: 'caution',
    });
  }

  if (hasDrift(candidate)) {
    trustItems.push({
      id: 'drift',
      label: 'คำแนะนำนี้ควรตรวจบริบทก่อน',
      tone: 'caution',
    });
  }

  if (hasLatestReentry(candidate)) {
    trustItems.push({
      id: 'reentry',
      label: 'มี reentry brief ล่าสุด',
      tone: 'ready',
    });
  }

  trustItems.push({
    id: 'updated',
    label: formatUpdatedAt(readLastEventAt(candidate)),
    tone: 'muted',
  });

  return stableUniqueTrustItems(trustItems);
}

function stableUniqueTrustItems(items: TrustStripItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function roomHasWork(candidate: ResumeRoomCandidateInput) {
  const room = candidate.room;
  return Boolean(
    room.session.task ||
      normalizeUserWorkText(room.lastKnownGoodBrief) ||
      room.lastKnownGoodNextMoves.some((item) => Boolean(normalizeText(item))) ||
      room.lastReentryBrief ||
      normalizeUserWorkText(room.contextSummary) ||
      normalizeUserWorkText(candidate.replay?.snapshot?.currentSummary),
  );
}

function isCompletedRoom(candidate: ResumeRoomCandidateInput) {
  return candidate.room.session.task?.lifecycleState === 'done';
}

export function formatUpdatedAt(value: number) {
  const diffMs = Date.now() - value;
  if (diffMs < 1000 * 60 * 60) return 'ขยับล่าสุดในชั่วโมงนี้';
  if (diffMs < 1000 * 60 * 60 * 24) return 'ขยับล่าสุดวันนี้';
  const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  return `ขยับล่าสุด ${days} วันที่แล้ว`;
}

function readLastEventAt(candidate: ResumeRoomCandidateInput) {
  return candidate.replay?.snapshot?.lastEventAt ||
    candidate.room.lastKnownGoodAt ||
    candidate.room.session.task?.reentryBrief?.createdAt ||
    candidate.room.lastUpdatedAt;
}

function rankCandidate(candidate: ResumeRoomCandidateInput): RankedResumeRoom | null {
  if (!isVisibleRoom(candidate.room)) return null;
  if (isCompletedRoom(candidate)) return null;
  if (!roomHasWork(candidate)) return null;

  const actionTitle = readActionTitle(candidate);
  const lastStuckSignal = readStuckSignal(candidate);
  const drift = hasDrift(candidate);
  const reentry = hasLatestReentry(candidate);
  const hasClearAction = Boolean(actionTitle);
  let rank = 0;
  let reason = 'มีบริบทล่าสุดพร้อมให้กลับไปต่อ';

  if (hasClearAction && lastStuckSignal === 'waiting_client') {
    rank = 400;
    reason = 'มีงานรอการขยับต่อจากฝั่งคุณ';
  } else if (drift && reentry) {
    rank = 300;
    reason = 'AI เตรียมบริบทกลับมาต่อไว้แล้ว';
  } else if (hasClearAction && !drift) {
    rank = 200;
    reason = 'มีก้าวถัดไปชัดอยู่แล้ว';
  } else {
    rank = 100;
  }

  return {
    room: candidate.room,
    headline: lastStuckSignal === 'waiting_client' ? 'รอ client อยู่' : 'คุณค้างอยู่ตรงนี้',
    actionTitle: actionTitle ?? candidate.room.lastKnownGoodNextMoves[0] ?? 'เปิดบริบทล่าสุดของงานนี้',
    summary: readSummary(candidate),
    reason,
    lastStuckSignal,
    lastEventAt: readLastEventAt(candidate),
    rank,
  };
}

export function rankResumeRooms(candidates: ResumeRoomCandidateInput[]) {
  return candidates
    .map(rankCandidate)
    .filter((candidate): candidate is RankedResumeRoom => Boolean(candidate))
    .sort((left, right) => {
      if (right.rank !== left.rank) return right.rank - left.rank;
      return right.lastEventAt - left.lastEventAt;
    });
}

export function buildRoomSidebarItems(input: {
  rooms: RoomRecord[];
  activeRoomId: string | null;
  rankedResumeRooms?: RankedResumeRoom[];
}): RoomSidebarItemView[] {
  const recommendedRoom = input.rankedResumeRooms?.[0];
  const rankedByRoomId = new Map((input.rankedResumeRooms ?? []).map((item) => [item.room.id, item]));

  return input.rooms
    .filter(isVisibleRoom)
    .map((room) => {
      const ranked = rankedByRoomId.get(room.id);
      const isRecommended = Boolean(recommendedRoom && recommendedRoom.room.id === room.id);
      const headline = isRecommended
        ? ranked?.lastStuckSignal === 'waiting_client'
          ? 'รอ client อยู่'
          : 'ต่อได้เลย'
        : undefined;

      return {
        room,
        isActive: room.id === input.activeRoomId,
        isRecommended,
        headline,
        nextAction: ranked?.actionTitle,
        reason: ranked?.reason,
        lastEventAt: ranked?.lastEventAt,
      };
    });
}

export function resolveHomeEntryState(input: {
  rooms: RoomRecord[];
  activeSession: AppSession | null;
  resumeRoom: RankedResumeRoom | null;
  activeRoomId?: string | null;
}): HomeEntryState {
  if (input.activeSession && input.activeSession.uiRoute !== 'DUMP_ENTRY') {
    return { mode: 'active_room', resumeRoom: null };
  }

  if (hasResumableTask(input.activeSession?.task)) {
    return { mode: 'active_room', resumeRoom: null };
  }

  const visibleRooms = input.rooms.filter(isVisibleRoom);
  const roomsWithWork = visibleRooms.filter((room) => roomHasWork({ room }));
  if (roomsWithWork.length === 0) {
    return { mode: 'get_started', resumeRoom: null };
  }

  if (input.resumeRoom && input.resumeRoom.room.id === input.activeRoomId) {
    return { mode: 'active_room', resumeRoom: null };
  }

  return input.resumeRoom
    ? { mode: 'resume_prompt', resumeRoom: input.resumeRoom }
    : { mode: 'get_started', resumeRoom: null };
}

export function resolveActiveRoomReentryState(candidate: ResumeRoomCandidateInput): ActiveRoomReentryState | null {
  const ranked = rankCandidate(candidate);
  if (!ranked) return null;

  const brokenFileContext = hasBrokenFileContext(candidate.room);
  const missingContext = hasMissingContext(candidate, ranked.lastStuckSignal);
  const question = 'งานนี้ต้องตอบลูกค้า สรุปสถานะ หรือแก้บริบทก่อน?';

  if (brokenFileContext) {
    return {
      room: ranked.room,
      headline: 'ต้องรู้เพิ่มอีกนิดเดียว',
      actionTitle: 'แก้บริบทที่อ่านไม่สมบูรณ์ก่อน',
      summary: ranked.summary,
      reason: 'บริบทหลักยังไม่พร้อมพอให้แนะนำอย่างมั่นใจ',
      primaryCta: 'แก้บริบทนี้',
      primaryAction: 'fix_context',
      secondaryCta: 'ดูงานอื่น',
      trustItems: buildTrustItems(candidate, ranked.lastStuckSignal),
      lastStuckSignal: ranked.lastStuckSignal,
    };
  }

  if (missingContext) {
    return {
      room: ranked.room,
      headline: 'ต้องรู้เพิ่มอีกนิดเดียว',
      actionTitle: question,
      summary: ranked.summary,
      reason: 'context ยังไม่พอ ควรถามแค่ 1 จุดก่อนให้ next move',
      primaryCta: 'ตอบ 1 คำถาม',
      primaryAction: 'answer_question',
      secondaryCta: 'ดูงานอื่น',
      question,
      trustItems: buildTrustItems(candidate, ranked.lastStuckSignal),
      lastStuckSignal: ranked.lastStuckSignal,
    };
  }

  return {
    room: ranked.room,
    headline: ranked.lastStuckSignal === 'waiting_client' ? 'รอ client อยู่' : 'เริ่มตรงนี้',
    actionTitle: ranked.actionTitle,
    summary: ranked.summary,
    reason: ranked.reason,
    primaryCta: 'ทำก้าวนี้',
    primaryAction: 'continue',
    secondaryCta: 'ดูงานอื่น',
    trustItems: buildTrustItems(candidate, ranked.lastStuckSignal),
    lastStuckSignal: ranked.lastStuckSignal,
  };
}

export async function selectResumeRoom(input: {
  rooms: RoomRecord[];
}) {
  return (await selectRankedResumeRooms(input))[0] ?? null;
}

export async function selectRankedResumeRooms(input: {
  rooms: RoomRecord[];
}) {
  const visibleRooms = input.rooms.filter(isVisibleRoom);
  const candidates = await Promise.all(visibleRooms.map(async (room): Promise<ResumeRoomCandidateInput> => {
    try {
      return {
        room,
        replay: await buildRoomMemoryReplayContext({
          roomId: room.id,
          query: [
            room.title,
            room.lastKnownGoodBrief,
            room.lastKnownGoodNextMoves.join(' '),
            room.session.task?.currentPlan?.actionTitle,
          ].filter(Boolean).join(' '),
          eventLimit: 10,
          refLimit: 5,
        }),
      };
    } catch {
      return { room, replay: null };
    }
  }));

  return rankResumeRooms(candidates);
}

export async function selectActiveRoomReentry(input: {
  room: RoomRecord;
}) {
  try {
    const replay = await buildRoomMemoryReplayContext({
      roomId: input.room.id,
      query: [
        input.room.title,
        input.room.lastKnownGoodBrief,
        input.room.lastKnownGoodNextMoves.join(' '),
        input.room.session.task?.currentPlan?.actionTitle,
      ].filter(Boolean).join(' '),
      eventLimit: 10,
      refLimit: 5,
    });
    return resolveActiveRoomReentryState({ room: input.room, replay });
  } catch {
    return resolveActiveRoomReentryState({ room: input.room, replay: null });
  }
}
