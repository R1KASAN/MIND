import {
  buildRoomMemoryReplayContext,
  ensureRoomMemoryBackfilled,
  type ResolvedRoomMemoryRef,
  type RoomMemoryDexie,
  type RoomMemoryReplayContext,
} from '@/lib/store/room-memory-db';
import type { TaskContext } from '@/lib/store/idb';
import { buildRoomDataSources, type RoomDataSource } from '@/lib/retrieval/room-data';

function compactText(value: string | undefined, limit = 220) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}...`;
}

function replayQueryForTask(task: TaskContext) {
  return [
    task.lastStableSummary,
    task.currentPlan?.actionTitle,
    task.currentPlan?.steps.map((step) => step.text).join(' '),
    task.reentryBrief?.summary,
  ].filter(Boolean).join(' ');
}

function statusCopy(ref: ResolvedRoomMemoryRef) {
  if (ref.status === 'tombstone') {
    return 'Evidence เคยอยู่ในห้องนี้ แต่ต้นทางถูกลบแล้ว จึงไม่แสดง raw content กลับมา';
  }
  if (ref.status === 'missing') {
    return 'Room memory ยังอ้างถึง evidence นี้ แต่ต้นทางไม่พร้อมใช้งานแล้ว';
  }
  return ref.excerpt || 'Evidence นี้ยัง resolve ได้จาก source ปัจจุบันของห้อง';
}

function sourceFromResolvedRef(
  task: TaskContext,
  ref: ResolvedRoomMemoryRef,
  replay: RoomMemoryReplayContext,
): RoomDataSource {
  const excerpt = compactText(statusCopy(ref));
  return {
    id: `memory-ref:${ref.id}`,
    roomId: task.roomId ?? task.id,
    createdAt: replay.snapshot?.lastEventAt,
    type: 'memory_ref',
    kind: ref.kind,
    title: ref.label ?? ref.id,
    status: ref.status === 'available' ? 'ready' : ref.status,
    label: `Room memory · ${ref.status}`,
    summary: excerpt,
    rawText: ref.status === 'available' ? (ref.excerpt ?? '') : '',
    extractedText: '',
    originMeta: {
      refId: ref.id,
      refKind: ref.kind,
      refStatus: ref.status,
      deletedAt: ref.deletedAt,
      deletedReason: ref.deletedReason,
      snapshotVersion: replay.snapshot?.version,
      recentEventCount: replay.recentEvents.length,
    },
    excerpt,
    usedInPlanCount: 0,
    unusedDays: null,
    sensitiveFlags: [],
    deleteToken: `memory-ref:${ref.id}`,
    deletable: false,
    refStatus: ref.status,
  };
}

export async function buildRoomDataSourcesWithMemory(
  task: TaskContext,
  input: {
    now?: number;
    db?: RoomMemoryDexie;
    refLimit?: number;
  } = {},
): Promise<RoomDataSource[]> {
  const baseSources = buildRoomDataSources(task, input.now);
  const roomId = task.roomId ?? task.id;

  await ensureRoomMemoryBackfilled({ task, db: input.db });
  const replay = await buildRoomMemoryReplayContext({
    roomId,
    query: replayQueryForTask(task),
    eventLimit: 10,
    refLimit: input.refLimit ?? 20,
    availableSources: baseSources,
    db: input.db,
  });

  const memorySources = replay.relevantRefs.map((ref) => sourceFromResolvedRef(task, ref, replay));
  return [...baseSources, ...memorySources];
}
