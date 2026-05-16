import {
  buildRoomMemoryReplayContext,
  ensureRoomMemoryBackfilled,
  type ResolvedRoomMemoryRef,
  type RoomMemoryDexie,
  type RoomMemoryEvent,
  type RoomMemoryRefStatus,
  type RoomMemoryReplayContext,
  type RoomMemorySnapshot,
} from '@/lib/store/room-memory-db';
import type { TaskContext } from '@/lib/store/idb';
import {
  answerRoomReviewQuestion,
  buildRoomDataSources,
  searchRoomDataSources,
  type RoomDataSource,
  type RoomReviewAnswer,
} from '@/lib/retrieval/room-data';

export interface RoomEvidenceHealth {
  available: number;
  tombstone: number;
  missing: number;
  total: number;
}

export interface RoomTrustReviewModel {
  snapshot: RoomMemorySnapshot | null;
  cognitiveState?: RoomMemorySnapshot['cognitiveState'];
  recentEvents: RoomMemoryEvent[];
  sources: RoomDataSource[];
  evidenceHealth: RoomEvidenceHealth;
  lastEventAt?: number;
}

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

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uniqueRefStatuses(values: Array<RoomMemoryRefStatus | undefined>) {
  return [...new Set(values.filter((value): value is RoomMemoryRefStatus => Boolean(value)))];
}

function eventTypesByRef(events: RoomMemoryEvent[]) {
  const map = new Map<string, string[]>();
  for (const event of events) {
    for (const ref of event.refs) {
      map.set(ref.id, uniqueStrings([...(map.get(ref.id) ?? []), event.type]));
    }
  }
  return map;
}

function sourceFromResolvedRef(
  roomId: string,
  ref: ResolvedRoomMemoryRef,
  replay: RoomMemoryReplayContext,
  recentEventTypes: string[] = [],
): RoomDataSource {
  const excerpt = compactText(statusCopy(ref));
  return {
    id: `memory-ref:${ref.id}`,
    roomId,
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
    memoryRefIds: [ref.id],
    refStatuses: [ref.status],
    recentEventTypes,
  };
}

function mergeAvailableRefsIntoSources(
  roomId: string,
  sources: RoomDataSource[],
  refs: ResolvedRoomMemoryRef[],
  replay: RoomMemoryReplayContext,
) {
  const eventsByRef = eventTypesByRef(replay.recentEvents);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const mergedSources = sources.map((source) => ({ ...source }));
  const mergedById = new Map(mergedSources.map((source) => [source.id, source]));
  const readOnlyMemorySources: RoomDataSource[] = [];

  for (const ref of refs) {
    const recentEventTypes = eventsByRef.get(ref.id) ?? [];
    if (ref.status === 'available' && sourceById.has(ref.id)) {
      const source = mergedById.get(ref.id);
      if (!source) continue;
      source.memoryRefIds = uniqueStrings([...(source.memoryRefIds ?? []), ref.id]);
      source.refStatuses = uniqueRefStatuses([...(source.refStatuses ?? []), ref.status]);
      source.recentEventTypes = uniqueStrings([...(source.recentEventTypes ?? []), ...recentEventTypes]);
      source.refStatus = source.refStatus ?? ref.status;
      source.originMeta = {
        ...(source.originMeta ?? {}),
        memoryRefIds: source.memoryRefIds,
        refStatuses: source.refStatuses,
        recentEventTypes: source.recentEventTypes,
        snapshotVersion: replay.snapshot?.version,
      };
      continue;
    }
    readOnlyMemorySources.push(sourceFromResolvedRef(roomId, ref, replay, recentEventTypes));
  }

  return [...mergedSources, ...readOnlyMemorySources];
}

function evidenceHealth(refs: ResolvedRoomMemoryRef[]): RoomEvidenceHealth {
  return refs.reduce<RoomEvidenceHealth>((health, ref) => ({
    ...health,
    [ref.status]: health[ref.status] + 1,
    total: health.total + 1,
  }), {
    available: 0,
    tombstone: 0,
    missing: 0,
    total: 0,
  });
}

function trustQuestionSources(model: RoomTrustReviewModel): RoomDataSource[] {
  const roomId = model.snapshot?.roomId ?? model.sources[0]?.roomId ?? '';
  const eventSources = model.recentEvents.map((event): RoomDataSource => ({
    id: `memory-event:${event.id}`,
    roomId,
    createdAt: event.createdAt,
    type: 'memory_ref',
    kind: event.type,
    title: event.type,
    status: 'ready',
    label: `Continuity event · ${event.origin}`,
    summary: event.summary,
    rawText: '',
    extractedText: event.summary,
    originMeta: {
      eventId: event.id,
      actor: event.actor,
      origin: event.origin,
      sourceOperationId: event.sourceOperationId,
      refIds: event.refs.map((ref) => ref.id),
    },
    excerpt: event.summary,
    usedInPlanCount: 0,
    unusedDays: null,
    sensitiveFlags: [],
    deleteToken: `memory-event:${event.id}`,
    deletable: false,
    recentEventTypes: [event.type],
  }));

  const snapshot = model.snapshot;
  const snapshotSource: RoomDataSource | null = snapshot ? {
    id: `memory-snapshot:${snapshot.roomId}`,
    roomId: snapshot.roomId,
    createdAt: snapshot.lastEventAt,
    type: 'memory_ref',
    kind: 'room_snapshot',
    title: 'Room memory snapshot',
    status: 'ready',
    label: `Room memory · snapshot v${snapshot.version}`,
    summary: compactText([
      snapshot.currentSummary,
      snapshot.currentAction?.title,
      snapshot.currentPlan?.actionTitle,
      snapshot.currentBlockers.join(' '),
      snapshot.latestRescue?.explanation,
      snapshot.latestReentry?.summary,
    ].filter(Boolean).join(' '), 320),
    rawText: '',
    extractedText: '',
    originMeta: {
      blockerCount: snapshot.currentBlockers.length,
      sourceRefCount: snapshot.sourceRefs.length,
      lastEventAt: snapshot.lastEventAt,
    },
    excerpt: snapshot.currentSummary ?? snapshot.currentAction?.title ?? 'Room memory snapshot',
    usedInPlanCount: 0,
    unusedDays: null,
    sensitiveFlags: [],
    deleteToken: `memory-snapshot:${snapshot.roomId}`,
    deletable: false,
  } : null;

  return snapshotSource ? [...model.sources, snapshotSource, ...eventSources] : [...model.sources, ...eventSources];
}

export async function buildRoomDataSourcesWithMemory(
  task: TaskContext,
  input: {
    now?: number;
    db?: RoomMemoryDexie;
    refLimit?: number;
  } = {},
): Promise<RoomDataSource[]> {
  const model = await buildRoomTrustReviewModel(task, input);
  return model.sources;
}

export async function buildRoomTrustReviewModel(
  task: TaskContext,
  input: {
    now?: number;
    db?: RoomMemoryDexie;
    refLimit?: number;
  } = {},
): Promise<RoomTrustReviewModel> {
  const baseSources = buildRoomDataSources(task, input.now);
  const roomId = task.roomId ?? task.id;

  await ensureRoomMemoryBackfilled({ task, db: input.db });
  const replay = await buildRoomMemoryReplayContext({
    roomId,
    query: replayQueryForTask(task),
    eventLimit: 10,
    refLimit: input.refLimit ?? 50,
    availableSources: baseSources,
    db: input.db,
  });

  const sources = mergeAvailableRefsIntoSources(roomId, baseSources, replay.relevantRefs, replay);
  return {
    snapshot: replay.snapshot,
    cognitiveState: replay.snapshot?.cognitiveState,
    recentEvents: replay.recentEvents,
    sources,
    evidenceHealth: evidenceHealth(replay.relevantRefs),
    lastEventAt: replay.snapshot?.lastEventAt ?? replay.recentEvents.at(-1)?.createdAt,
  };
}

export function answerRoomTrustReviewQuestion(
  question: string,
  model: RoomTrustReviewModel,
  roomId: string,
): RoomReviewAnswer {
  const answer = answerRoomReviewQuestion(question, trustQuestionSources(model), roomId);
  const displaySources = answer.sources.filter((source) => !source.id.startsWith('memory-event:') && !source.id.startsWith('memory-snapshot:'));
  if (displaySources.length > 0) {
    return { ...answer, sources: displaySources };
  }

  const refIds = uniqueStrings(answer.sources.flatMap((source) => (
    Array.isArray(source.originMeta?.refIds) ? source.originMeta.refIds.filter((item): item is string => typeof item === 'string') : []
  )));
  const eventMatches = model.sources.filter((source) => (
    refIds.includes(source.id) ||
    source.memoryRefIds?.some((refId) => refIds.includes(refId))
  ));
  const fallbackMatches = eventMatches.length > 0 ? eventMatches : searchRoomDataSources({
    sources: model.sources,
    roomId,
    query: question,
    k: 5,
  });
  return {
    ...answer,
    sources: fallbackMatches,
  };
}
