import Dexie, { type Table } from 'dexie';
import type {
  CurrentPlan,
  ReentryBrief,
  RescueHistoryItem,
  RescueReason,
  RoomRecord,
  TaskContext,
} from '@/lib/store/idb';
import { buildRoomDataSources, type RoomDataSource } from '@/lib/retrieval/room-data';

export type RoomMemoryEventType =
  | 'source_added'
  | 'summary_updated'
  | 'blocker_updated'
  | 'action_selected'
  | 'plan_updated'
  | 'rescue_created'
  | 'reentry_created';

export type RoomMemoryActor = 'user' | 'ai' | 'system';
export type RoomMemoryOrigin = 'live' | 'backfill' | 'repair' | 'retry' | 'import';
export type RoomMemoryRefStatus = 'available' | 'tombstone' | 'missing';
export type RoomMemoryIntentKind =
  | 'context_entered'
  | 'ai_detected_blocker'
  | 'ai_recommended_start'
  | 'user_selected_action'
  | 'user_adjusted_plan'
  | 'ai_created_rescue'
  | 'ai_created_reentry';
export type RoomMemoryIntentConfidence = 'low' | 'medium' | 'high';
export type RoomMemoryStartFormat = 'bullet' | 'draft' | 'question' | 'outline' | 'direct_reply' | 'unknown';
export type RoomMemoryStuckSignal =
  | 'scope_unclear'
  | 'waiting_client'
  | 'energy_low'
  | 'missing_context'
  | 'too_big'
  | 'unknown';

export interface RoomMemoryIntent {
  kind: RoomMemoryIntentKind;
  reason?: string;
  confidence?: RoomMemoryIntentConfidence;
}

export interface RoomMemoryRef {
  id: string;
  kind: string;
  label?: string;
  excerpt?: string;
}

export interface ResolvedRoomMemoryRef extends RoomMemoryRef {
  status: RoomMemoryRefStatus;
  deletedAt?: number;
  deletedReason?: string;
}

export interface RoomMemoryEvent {
  id: string;
  roomId: string;
  type: RoomMemoryEventType;
  createdAt: number;
  actor: RoomMemoryActor;
  origin: RoomMemoryOrigin;
  summary: string;
  refs: RoomMemoryRef[];
  payloadVersion: number;
  dedupeKey?: string;
  sourceOperationId?: string;
  backfilledFrom?: string;
  intent?: RoomMemoryIntent;
  payload?: Record<string, unknown>;
}

export interface RoomMemoryActionSnapshot {
  title: string;
  rationale?: string;
  successSignal?: string;
}

export interface RoomMemoryPlanSnapshot {
  actionTitle: string;
  successSignal?: string;
  steps: Array<{
    id: string;
    text: string;
    expectedOutcome?: string;
  }>;
}

export interface RoomMemoryRescueSnapshot {
  reason: RescueReason;
  mode?: string;
  explanation?: string;
  steps: string[];
  createdAt: number;
}

export interface RoomMemoryReentrySnapshot {
  summary: string;
  topActions: Array<{
    title: string;
    rationale?: string;
    resumeTarget?: string;
  }>;
  createdAt: number;
}

export interface RoomMemoryCognitiveState {
  preferredStartFormat: RoomMemoryStartFormat;
  lastStuckSignal: RoomMemoryStuckSignal;
  commitments: string[];
  openQuestions: string[];
  driftWarnings: string[];
}

export interface RoomMemorySnapshot {
  roomId: string;
  currentSummary?: string;
  currentAction?: RoomMemoryActionSnapshot;
  currentPlan?: RoomMemoryPlanSnapshot;
  currentBlockers: string[];
  latestRescue?: RoomMemoryRescueSnapshot;
  latestReentry?: RoomMemoryReentrySnapshot;
  sourceRefs: RoomMemoryRef[];
  lastEventAt?: number;
  version: number;
  cognitiveState?: RoomMemoryCognitiveState;
}

export interface RoomMemoryRefTombstone {
  id: string;
  roomId: string;
  refId: string;
  deletedAt: number;
  reason?: string;
  summary?: string;
}

export interface RoomMemoryReplayContext {
  snapshot: RoomMemorySnapshot | null;
  recentEvents: RoomMemoryEvent[];
  relevantRefs: ResolvedRoomMemoryRef[];
}

export interface RoomMemoryExport {
  events: RoomMemoryEvent[];
  snapshots: RoomMemorySnapshot[];
  tombstones: RoomMemoryRefTombstone[];
}

const DB_NAME = 'mind_room_memory_v1';
export const ROOM_MEMORY_SNAPSHOT_VERSION = 2;
const EVENT_PAYLOAD_VERSION = 1;
const DEFAULT_REPLAY_EVENT_LIMIT = 10;
const DEFAULT_REPLAY_REF_LIMIT = 5;
const ROOM_MEMORY_INTENT_KINDS = new Set<RoomMemoryIntentKind>([
  'context_entered',
  'ai_detected_blocker',
  'ai_recommended_start',
  'user_selected_action',
  'user_adjusted_plan',
  'ai_created_rescue',
  'ai_created_reentry',
]);
const DEFAULT_COGNITIVE_STATE: RoomMemoryCognitiveState = {
  preferredStartFormat: 'unknown',
  lastStuckSignal: 'unknown',
  commitments: [],
  openQuestions: [],
  driftWarnings: [],
};

export class RoomMemoryDexie extends Dexie {
  roomEvents!: Table<RoomMemoryEvent, string>;
  roomSnapshots!: Table<RoomMemorySnapshot, string>;
  refTombstones!: Table<RoomMemoryRefTombstone, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      roomEvents: 'id, roomId, type, createdAt, [roomId+createdAt], dedupeKey, sourceOperationId',
      roomSnapshots: 'roomId, lastEventAt, version',
      refTombstones: 'id, roomId, refId, deletedAt, [roomId+refId]',
    });
  }
}

let defaultDb: RoomMemoryDexie | null = null;

export function createRoomMemoryDb(name?: string) {
  return new RoomMemoryDexie(name);
}

export function getRoomMemoryDb() {
  if (!defaultDb) defaultDb = createRoomMemoryDb();
  return defaultDb;
}

export function resetRoomMemoryDbForTests() {
  defaultDb = null;
}

function compactText(value: string | undefined, limit = 260) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function uniqueById(refs: RoomMemoryRef[]) {
  const map = new Map<string, RoomMemoryRef>();
  for (const ref of refs) {
    if (!ref.id || map.has(ref.id)) continue;
    map.set(ref.id, ref);
  }
  return [...map.values()];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function makeEventId(roomId: string, type: RoomMemoryEventType, createdAt: number, suffix: string) {
  return `${roomId}:${type}:${createdAt}:${suffix}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStartFormat(value: unknown): RoomMemoryStartFormat | undefined {
  if (
    value === 'bullet' ||
    value === 'draft' ||
    value === 'question' ||
    value === 'outline' ||
    value === 'direct_reply' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function readStuckSignal(value: unknown): RoomMemoryStuckSignal | undefined {
  if (
    value === 'scope_unclear' ||
    value === 'waiting_client' ||
    value === 'energy_low' ||
    value === 'missing_context' ||
    value === 'too_big' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function normalizeSignalText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function inferStartFormatFromText(value: string): RoomMemoryStartFormat | undefined {
  const text = normalizeSignalText(value);
  if (!text) return undefined;
  if (/\b(bullet|bullets|list|checklist)\b/.test(text) || /ข้อ ๆ|เป็นข้อ/.test(text)) return 'bullet';
  if (/\b(reply|email)\b/.test(text) || /ข้อความตอบ/.test(text)) return 'direct_reply';
  if (/\b(draft)\b/.test(text) || /ร่างตอบ/.test(text)) return 'draft';
  if (/\b(ask|clarify|question)\b/.test(text) || /ถามลูกค้า|ขอข้อมูล/.test(text)) return 'question';
  if (/\b(outline|structure|plan)\b/.test(text) || /โครง/.test(text)) return 'outline';
  return undefined;
}

function inferStartFormatFromPayload(payload: Record<string, unknown> | undefined): RoomMemoryStartFormat | undefined {
  if (!payload) return undefined;
  const explicit = readStartFormat(payload.startFormat);
  if (explicit) return explicit;
  const action = readRecord(payload.action);
  const actionExplicit = readStartFormat(action?.startFormat);
  if (actionExplicit) return actionExplicit;
  return inferStartFormatFromText([
    readString(action?.title),
    readString(action?.rationale),
    readString(payload.summary),
  ].filter(Boolean).join(' '));
}

function inferStuckSignalFromText(value: string): RoomMemoryStuckSignal | undefined {
  const text = normalizeSignalText(value);
  if (!text) return undefined;
  if (text.includes('unclear_scope') || text.includes('scope unclear') || text.includes('scope ไม่ชัด')) return 'scope_unclear';
  if (text.includes('dependency') || text.includes('waiting') || text.includes('รอลูกค้า')) return 'waiting_client';
  if (text.includes('low_energy') || text.includes('low energy') || text.includes('พลังงานต่ำ')) return 'energy_low';
  if (text.includes('missing_context') || text.includes('missing context') || text.includes('ข้อมูลไม่ครบ')) return 'missing_context';
  if (
    text.includes('too_big') ||
    text.includes('too big') ||
    text.includes('ใหญ่เกิน') ||
    text.includes('ซับซ้อน') ||
    text.includes('complex') ||
    text.includes('ไม่รู้จะเริ่มจากไหน')
  ) {
    return 'too_big';
  }
  return undefined;
}

function inferStuckSignalFromPayload(payload: Record<string, unknown> | undefined, summary: string): RoomMemoryStuckSignal | undefined {
  const explicit = readStuckSignal(payload?.stuckSignal);
  if (explicit) return explicit;
  const blockerSignal = readStringArray(payload?.blockers)
    .map((blocker) => readStuckSignal(blocker) ?? inferStuckSignalFromText(blocker))
    .find(Boolean);
  if (blockerSignal) return blockerSignal;
  return inferStuckSignalFromText(summary);
}

function readCognitiveStringArray(payload: Record<string, unknown> | undefined, key: string) {
  return uniqueStrings(readStringArray(payload?.[key]));
}

function rescueDriftWarnings(event: RoomMemoryEvent) {
  if (event.intent?.kind !== 'ai_created_rescue') return [];
  const payload = event.payload ?? {};
  const reason = readString(event.intent.reason);
  const fallback =
    payload.fallback === true ||
    payload.isFallback === true ||
    payload.fallbackPath === true ||
    event.sourceOperationId?.includes('fallback') === true;

  const warnings: string[] = [];
  if (!reason || reason.toLowerCase() === 'unknown') {
    warnings.push('Rescue reason was missing or unknown; avoid assuming the blocker diagnosis is stable.');
  }
  if (fallback) {
    warnings.push('Rescue used fallback output; avoid treating the diagnosis as fully verified.');
  }
  return warnings;
}

function readAction(value: unknown): RoomMemoryActionSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const title = readString(record.title);
  if (!title) return undefined;
  return {
    title,
    rationale: readString(record.rationale),
    successSignal: readString(record.successSignal),
  };
}

function readPlan(value: unknown): RoomMemoryPlanSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const actionTitle = readString(record.actionTitle);
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const steps = rawSteps
    .map((step, index): RoomMemoryPlanSnapshot['steps'][number] | null => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
      const stepRecord = step as Record<string, unknown>;
      const text = readString(stepRecord.text);
      if (!text) return null;
      const normalizedStep: RoomMemoryPlanSnapshot['steps'][number] = {
        id: readString(stepRecord.id) ?? `step-${index + 1}`,
        text,
      };
      const expectedOutcome = readString(stepRecord.expectedOutcome);
      if (expectedOutcome) normalizedStep.expectedOutcome = expectedOutcome;
      return normalizedStep;
    })
    .filter((step): step is RoomMemoryPlanSnapshot['steps'][number] => Boolean(step));

  if (!actionTitle && steps.length === 0) return undefined;
  return {
    actionTitle: actionTitle ?? steps[0]?.text ?? 'Current plan',
    successSignal: readString(record.successSignal),
    steps,
  };
}

function readRescue(value: unknown, fallbackCreatedAt: number): RoomMemoryRescueSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const reason = readString(record.reason);
  if (!reason) return undefined;
  return {
    reason: reason as RescueReason,
    mode: readString(record.mode),
    explanation: readString(record.explanation),
    steps: readStringArray(record.steps),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : fallbackCreatedAt,
  };
}

function readReentry(value: unknown, fallbackCreatedAt: number): RoomMemoryReentrySnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const summary = readString(record.summary);
  if (!summary) return undefined;
  const topActions = Array.isArray(record.topActions)
    ? record.topActions
        .map((item): RoomMemoryReentrySnapshot['topActions'][number] | null => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const action = item as Record<string, unknown>;
          const title = readString(action.title);
          if (!title) return null;
          const normalizedAction: RoomMemoryReentrySnapshot['topActions'][number] = {
            title,
          };
          const rationale = readString(action.rationale);
          const resumeTarget = readString(action.resumeTarget);
          if (rationale) normalizedAction.rationale = rationale;
          if (resumeTarget) normalizedAction.resumeTarget = resumeTarget;
          return normalizedAction;
        })
        .filter((item): item is RoomMemoryReentrySnapshot['topActions'][number] => Boolean(item))
    : [];
  return {
    summary,
    topActions,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : fallbackCreatedAt,
  };
}

function emptySnapshot(roomId: string): RoomMemorySnapshot {
  return {
    roomId,
    currentBlockers: [],
    sourceRefs: [],
    version: ROOM_MEMORY_SNAPSHOT_VERSION,
    cognitiveState: { ...DEFAULT_COGNITIVE_STATE },
  };
}

export function validateRoomMemoryEvent(event: RoomMemoryEvent) {
  if (!event.id) throw new Error('Room memory event id is required');
  if (!event.roomId) throw new Error('Room memory event roomId is required');
  if (!event.type) throw new Error('Room memory event type is required');
  if (!Number.isFinite(event.createdAt)) throw new Error('Room memory event createdAt is required');
  if (!event.actor) throw new Error('Room memory event actor is required');
  if (!event.origin) throw new Error('Room memory event origin is required');
  if (event.origin === 'backfill' && !event.backfilledFrom) {
    throw new Error('Backfill room memory events require backfilledFrom');
  }
  if (typeof event.summary !== 'string') throw new Error('Room memory event summary is required');
  if (!Array.isArray(event.refs)) throw new Error('Room memory event refs must be an array');
  if (!Number.isFinite(event.payloadVersion)) throw new Error('Room memory event payloadVersion is required');
  if (event.intent) {
    if (!event.intent.kind) throw new Error('Room memory event intent.kind is required when intent is present');
    if (!ROOM_MEMORY_INTENT_KINDS.has(event.intent.kind)) {
      throw new Error('Room memory event intent.kind is invalid');
    }
    if (
      event.intent.confidence &&
      event.intent.confidence !== 'low' &&
      event.intent.confidence !== 'medium' &&
      event.intent.confidence !== 'high'
    ) {
      throw new Error('Room memory event intent.confidence is invalid');
    }
  }
}

export function projectRoomMemorySnapshot(roomId: string, events: RoomMemoryEvent[]) {
  const snapshot = emptySnapshot(roomId);
  const orderedEvents = [...events]
    .filter((event) => event.roomId === roomId)
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const event of orderedEvents) {
    snapshot.lastEventAt = Math.max(snapshot.lastEventAt ?? 0, event.createdAt);
    snapshot.sourceRefs = uniqueById([...snapshot.sourceRefs, ...event.refs]);
    const cognitiveState = snapshot.cognitiveState ?? { ...DEFAULT_COGNITIVE_STATE };
    const payload = event.payload;
    const explicitStartFormat = readStartFormat(payload?.startFormat);
    const explicitStuckSignal = readStuckSignal(payload?.stuckSignal);
    const commitments = readCognitiveStringArray(payload, 'commitments');
    const openQuestions = readCognitiveStringArray(payload, 'openQuestions');

    if (explicitStartFormat && explicitStartFormat !== 'unknown') {
      cognitiveState.preferredStartFormat = explicitStartFormat;
    }
    if (explicitStuckSignal && explicitStuckSignal !== 'unknown') {
      cognitiveState.lastStuckSignal = explicitStuckSignal;
    }
    if (commitments.length > 0) {
      cognitiveState.commitments = uniqueStrings([...cognitiveState.commitments, ...commitments]);
    }
    if (openQuestions.length > 0) {
      cognitiveState.openQuestions = uniqueStrings([...cognitiveState.openQuestions, ...openQuestions]);
    }

    switch (event.type) {
      case 'source_added':
        break;
      case 'summary_updated': {
        snapshot.currentSummary = readString(event.payload?.summary) ?? event.summary;
        break;
      }
      case 'blocker_updated': {
        snapshot.currentBlockers = readStringArray(event.payload?.blockers);
        const signal = inferStuckSignalFromPayload(event.payload, event.summary);
        if (signal && signal !== 'unknown') cognitiveState.lastStuckSignal = signal;
        break;
      }
      case 'action_selected': {
        snapshot.currentAction = readAction(event.payload?.action);
        const signal = inferStartFormatFromPayload(event.payload);
        if (signal && signal !== 'unknown') cognitiveState.preferredStartFormat = signal;
        break;
      }
      case 'plan_updated': {
        snapshot.currentPlan = readPlan(event.payload?.plan);
        const plan = snapshot.currentPlan;
        if (plan?.actionTitle) {
          cognitiveState.commitments = uniqueStrings([...cognitiveState.commitments, plan.actionTitle]);
        }
        break;
      }
      case 'rescue_created': {
        snapshot.latestRescue = readRescue(event.payload?.rescue, event.createdAt);
        const warnings = rescueDriftWarnings(event);
        if (warnings.length > 0) {
          cognitiveState.driftWarnings = uniqueStrings([...cognitiveState.driftWarnings, ...warnings]);
        }
        break;
      }
      case 'reentry_created': {
        const reentry = readReentry(event.payload?.reentry, event.createdAt);
        snapshot.latestReentry = reentry;
        if (reentry?.summary) snapshot.currentSummary = reentry.summary;
        break;
      }
    }
    snapshot.cognitiveState = cognitiveState;
  }

  return snapshot;
}

async function loadRoomEvents(roomId: string, db: RoomMemoryDexie) {
  return db.roomEvents
    .where('roomId')
    .equals(roomId)
    .sortBy('createdAt');
}

export async function getRoomMemorySnapshot(roomId: string, db = getRoomMemoryDb()) {
  return db.roomSnapshots.get(roomId);
}

function isRoomMemorySnapshotShape(value: unknown): value is RoomMemorySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<RoomMemorySnapshot>;
  return (
    typeof record.roomId === 'string' &&
    Array.isArray(record.currentBlockers) &&
    Array.isArray(record.sourceRefs) &&
    typeof record.version === 'number'
  );
}

function isCognitiveStateShape(value: unknown): value is RoomMemoryCognitiveState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<RoomMemoryCognitiveState>;
  return (
    Boolean(readStartFormat(record.preferredStartFormat)) &&
    Boolean(readStuckSignal(record.lastStuckSignal)) &&
    Array.isArray(record.commitments) &&
    Array.isArray(record.openQuestions) &&
    Array.isArray(record.driftWarnings)
  );
}

function isSnapshotHealthy(
  snapshot: RoomMemorySnapshot | undefined,
  roomId: string,
  latestEventAt?: number,
): snapshot is RoomMemorySnapshot {
  if (!isRoomMemorySnapshotShape(snapshot)) return false;
  if (snapshot.roomId !== roomId) return false;
  if (snapshot.version < ROOM_MEMORY_SNAPSHOT_VERSION) return false;
  if (!isCognitiveStateShape(snapshot.cognitiveState)) return false;
  if (latestEventAt !== undefined && (snapshot.lastEventAt ?? 0) < latestEventAt) return false;
  return true;
}

export async function getHealthyRoomMemorySnapshot(roomId: string, db = getRoomMemoryDb()) {
  const [snapshot, events] = await Promise.all([
    getRoomMemorySnapshot(roomId, db).catch(() => undefined),
    loadRoomEvents(roomId, db),
  ]);
  const latestEventAt = events.at(-1)?.createdAt;
  if (isSnapshotHealthy(snapshot, roomId, latestEventAt)) return snapshot;

  const rebuilt = projectRoomMemorySnapshot(roomId, events);
  await db.roomSnapshots.put(rebuilt).catch(() => undefined);
  return rebuilt;
}

async function projectAndSaveRoomSnapshot(roomId: string, db: RoomMemoryDexie) {
  const events = await loadRoomEvents(roomId, db);
  const snapshot = projectRoomMemorySnapshot(roomId, events);
  await db.roomSnapshots.put(snapshot);
  return snapshot;
}

export async function appendRoomMemoryEvents(events: RoomMemoryEvent[], db = getRoomMemoryDb()) {
  if (events.length === 0) return null;
  for (const event of events) validateRoomMemoryEvent(event);

  const roomIds = [...new Set(events.map((event) => event.roomId))];
  await db.transaction('rw', db.roomEvents, db.roomSnapshots, async () => {
    for (const event of events) {
      if (event.dedupeKey) {
        const existing = await db.roomEvents.where('dedupeKey').equals(event.dedupeKey).first();
        if (existing) continue;
      }
      await db.roomEvents.add(event);
    }
    for (const roomId of roomIds) {
      await projectAndSaveRoomSnapshot(roomId, db);
    }
  });

  return roomIds.length === 1 ? db.roomSnapshots.get(roomIds[0]) : null;
}

export async function appendRoomMemoryEvent(event: RoomMemoryEvent, db = getRoomMemoryDb()) {
  return appendRoomMemoryEvents([event], db);
}

function refFromSource(source: RoomDataSource): RoomMemoryRef {
  return {
    id: source.id,
    kind: source.kind ?? source.type,
    label: source.title,
    excerpt: compactText(source.excerpt, 180),
  };
}

function refsFromTask(task: TaskContext) {
  return buildRoomDataSources(task).map(refFromSource);
}

function eventBase(input: {
  roomId: string;
  type: RoomMemoryEventType;
  createdAt: number;
  summary: string;
  refs?: RoomMemoryRef[];
  dedupeKey: string;
  payload?: Record<string, unknown>;
  sourceOperationId?: string;
}): RoomMemoryEvent {
  return {
    id: makeEventId(input.roomId, input.type, input.createdAt, input.dedupeKey),
    roomId: input.roomId,
    type: input.type,
    createdAt: input.createdAt,
    actor: 'system',
    origin: 'backfill',
    summary: compactText(input.summary),
    refs: uniqueById(input.refs ?? []),
    payloadVersion: EVENT_PAYLOAD_VERSION,
    dedupeKey: input.dedupeKey,
    sourceOperationId: input.sourceOperationId,
    backfilledFrom: 'TaskContext+RoomRecord',
    payload: input.payload,
  };
}

function planPayload(plan: CurrentPlan): RoomMemoryPlanSnapshot {
  return {
    actionTitle: plan.actionTitle,
    successSignal: plan.successSignal,
    steps: plan.steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      text: step.text,
      expectedOutcome: step.expectedOutcome,
    })),
  };
}

function reentryPayload(brief: ReentryBrief): RoomMemoryReentrySnapshot {
  return {
    summary: brief.summary,
    topActions: brief.topActions.map((action) => ({
      title: action.title,
      rationale: action.rationale,
      resumeTarget: action.resumeTarget,
    })),
    createdAt: brief.createdAt,
  };
}

function rescuePayload(item: RescueHistoryItem): RoomMemoryRescueSnapshot {
  return {
    reason: item.reason,
    mode: item.mode,
    steps: [],
    createdAt: item.createdAt,
  };
}

export function buildBackfillRoomMemoryEvents(input: {
  task: TaskContext;
  room?: RoomRecord | null;
  now?: number;
}) {
  const { task, room, now = Date.now() } = input;
  const roomId = task.roomId ?? room?.id ?? task.id;
  const refs = refsFromTask(task);
  const events: RoomMemoryEvent[] = [];

  if (refs.length > 0) {
    events.push(eventBase({
      roomId,
      type: 'source_added',
      createdAt: task.createdAt,
      summary: `${refs.length} source(s) available for this room`,
      refs,
      dedupeKey: `backfill:${roomId}:sources:${task.createdAt}:${refs.map((ref) => ref.id).join('|')}`,
      payload: { sourceCount: refs.length },
    }));
  }

  const summary = compactText(
    room?.lastKnownGoodBrief ||
      task.reentryBrief?.summary ||
      task.lastStableSummary ||
      task.lastSynthesis?.situation_summary ||
      task.taskFrame?.objective ||
      task.sourceText,
  );
  if (summary) {
    events.push(eventBase({
      roomId,
      type: 'summary_updated',
      createdAt: room?.lastKnownGoodAt ?? task.reentryBrief?.createdAt ?? task.lastAttemptAt ?? task.createdAt,
      summary,
      refs,
      dedupeKey: `backfill:${roomId}:summary:${summary}`,
      payload: { summary },
    }));
  }

  if (task.blockerSignals.length > 0) {
    events.push(eventBase({
      roomId,
      type: 'blocker_updated',
      createdAt: task.lastAttemptAt ?? task.createdAt,
      summary: `Current blockers: ${task.blockerSignals.join(', ')}`,
      refs,
      dedupeKey: `backfill:${roomId}:blockers:${task.blockerSignals.join('|')}`,
      payload: { blockers: task.blockerSignals },
    }));
  }

  if (task.currentPlan?.actionTitle) {
    events.push(eventBase({
      roomId,
      type: 'action_selected',
      createdAt: task.lastConfirmedActionAt ?? task.lastAttemptAt ?? task.createdAt,
      summary: task.currentPlan.actionTitle,
      refs,
      dedupeKey: `backfill:${roomId}:action:${task.currentPlan.actionTitle}`,
      payload: {
        action: {
          title: task.currentPlan.actionTitle,
          successSignal: task.currentPlan.successSignal,
        },
      },
    }));
    events.push(eventBase({
      roomId,
      type: 'plan_updated',
      createdAt: task.lastAttemptAt ?? task.createdAt,
      summary: `Plan: ${task.currentPlan.actionTitle}`,
      refs,
      dedupeKey: `backfill:${roomId}:plan:${task.currentPlan.actionTitle}:${task.currentPlan.steps.map((step) => step.text).join('|')}`,
      payload: { plan: planPayload(task.currentPlan) },
    }));
  }

  const latestRescue = task.rescueHistory.at(-1);
  if (latestRescue) {
    events.push(eventBase({
      roomId,
      type: 'rescue_created',
      createdAt: latestRescue.createdAt,
      summary: `Rescue: ${latestRescue.reason} -> ${latestRescue.mode}`,
      refs,
      dedupeKey: `backfill:${roomId}:rescue:${latestRescue.createdAt}:${latestRescue.reason}:${latestRescue.mode}`,
      payload: { rescue: rescuePayload(latestRescue) },
    }));
  }

  const reentry = task.reentryBrief ?? room?.lastReentryBrief;
  if (reentry) {
    events.push(eventBase({
      roomId,
      type: 'reentry_created',
      createdAt: reentry.createdAt,
      summary: reentry.summary,
      refs,
      dedupeKey: `backfill:${roomId}:reentry:${reentry.createdAt}:${reentry.summary}`,
      payload: { reentry: reentryPayload(reentry) },
    }));
  }

  if (events.length === 0) {
    events.push(eventBase({
      roomId,
      type: 'summary_updated',
      createdAt: now,
      summary: 'Room memory initialized without enough legacy context',
      refs: [],
      dedupeKey: `backfill:${roomId}:empty:${now}`,
      payload: { summary: 'Room memory initialized without enough legacy context' },
    }));
  }

  return events;
}

export async function ensureRoomMemoryBackfilled(input: {
  task: TaskContext;
  room?: RoomRecord | null;
  db?: RoomMemoryDexie;
}) {
  const db = input.db ?? getRoomMemoryDb();
  const roomId = input.task.roomId ?? input.room?.id ?? input.task.id;
  const existing = await getRoomMemorySnapshot(roomId, db);
  if (existing) return existing;
  const events = buildBackfillRoomMemoryEvents(input);
  const snapshot = await appendRoomMemoryEvents(events, db);
  return snapshot ?? getRoomMemorySnapshot(roomId, db);
}

export async function markRoomMemoryRefDeleted(input: {
  roomId: string;
  refId: string;
  reason?: string;
  summary?: string;
  deletedAt?: number;
}, db = getRoomMemoryDb()) {
  const deletedAt = input.deletedAt ?? Date.now();
  const tombstone: RoomMemoryRefTombstone = {
    id: `${input.roomId}:${input.refId}`.replace(/[^a-zA-Z0-9:_-]/g, '_'),
    roomId: input.roomId,
    refId: input.refId,
    deletedAt,
    reason: input.reason,
    summary: input.summary,
  };
  await db.refTombstones.put(tombstone);
  return tombstone;
}

export async function resolveRoomMemoryRefs(input: {
  roomId: string;
  refs: RoomMemoryRef[];
  availableRefIds?: Set<string>;
}, db = getRoomMemoryDb()): Promise<ResolvedRoomMemoryRef[]> {
  const tombstones = await db.refTombstones
    .where('[roomId+refId]')
    .anyOf(input.refs.map((ref) => [input.roomId, ref.id] as [string, string]))
    .toArray()
    .catch(() => []);
  const tombstoneByRef = new Map(tombstones.map((item) => [item.refId, item]));

  return input.refs.map((ref) => {
    const tombstone = tombstoneByRef.get(ref.id);
    if (tombstone) {
      return {
        ...ref,
        status: 'tombstone',
        deletedAt: tombstone.deletedAt,
        deletedReason: tombstone.reason,
      };
    }
    if (input.availableRefIds && !input.availableRefIds.has(ref.id)) {
      return { ...ref, status: 'missing' };
    }
    return { ...ref, status: 'available' };
  });
}

function scoreRefForQuery(ref: RoomMemoryRef, query: string) {
  if (!query.trim()) return 0;
  const haystack = [ref.id, ref.kind, ref.label, ref.excerpt].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).reduce((score, term) => (
    score + (haystack.includes(term) ? 1 : 0)
  ), 0);
}

export async function buildRoomMemoryReplayContext(input: {
  roomId: string;
  query?: string;
  eventLimit?: number;
  refLimit?: number;
  availableSources?: RoomDataSource[];
  db?: RoomMemoryDexie;
}): Promise<RoomMemoryReplayContext> {
  const db = input.db ?? getRoomMemoryDb();
  const eventLimit = input.eventLimit ?? DEFAULT_REPLAY_EVENT_LIMIT;
  const refLimit = input.refLimit ?? DEFAULT_REPLAY_REF_LIMIT;
  const [snapshot, recentEventsDescending] = await Promise.all([
    getHealthyRoomMemorySnapshot(input.roomId, db),
    db.roomEvents
      .where('roomId')
      .equals(input.roomId)
      .reverse()
      .sortBy('createdAt')
      .then((events) => events.slice(0, Math.max(0, eventLimit))),
  ]);
  const recentEvents = [...recentEventsDescending].sort((left, right) => left.createdAt - right.createdAt);
  const availableRefIds = input.availableSources
    ? new Set(input.availableSources.map((source) => source.id))
    : undefined;
  const refs = uniqueById([
    ...(snapshot?.sourceRefs ?? []),
    ...recentEvents.flatMap((event) => event.refs),
  ])
    .map((ref) => ({
      ref,
      score: scoreRefForQuery(ref, input.query ?? ''),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, refLimit))
    .map((item) => item.ref);

  return {
    snapshot: snapshot ?? null,
    recentEvents,
    relevantRefs: await resolveRoomMemoryRefs({
      roomId: input.roomId,
      refs,
      availableRefIds,
    }, db),
  };
}

export async function exportRoomMemoryData(db = getRoomMemoryDb()): Promise<RoomMemoryExport> {
  const [events, snapshots, tombstones] = await Promise.all([
    db.roomEvents.toArray(),
    db.roomSnapshots.toArray(),
    db.refTombstones.toArray(),
  ]);
  return { events, snapshots, tombstones };
}

export async function clearRoomMemoryData(db = getRoomMemoryDb()) {
  await db.transaction('rw', db.roomEvents, db.roomSnapshots, db.refTombstones, async () => {
    await Promise.all([
      db.roomEvents.clear(),
      db.roomSnapshots.clear(),
      db.refTombstones.clear(),
    ]);
  });
}
