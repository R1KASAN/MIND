"use client";

import type { UIRoute } from '@/lib/store/idb';

export type DemoScenarioId = 'A' | 'B' | 'C' | 'D' | 'E';
export type DemoSurfaceId = 'DUMP_ENTRY' | 'BOUNCE_BACK' | 'MORNING_RITUAL' | 'ONE_ACTION';
export type ObservationSeverity = 'minor' | 'moderate' | 'major';
export type ObservationConfidence = 'low' | 'medium' | 'high';
export type ObservationDeviceType = 'small_phone' | 'standard_phone' | 'desktop' | 'tablet' | 'unknown';
export type ObservationSessionStatus = 'draft' | 'active' | 'ended' | 'exported';

export interface DemoObservationSessionDraft {
  sessionId: string;
  sessionLabel: string;
  observerName: string;
  participant: string;
  deviceType: ObservationDeviceType;
}

export interface DemoObservationDraft {
  scenario: DemoScenarioId;
  surface: DemoSurfaceId;
  observedBehavior: string;
  userQuote: string;
  firstVisibleTarget: string;
  timeToFirstActionSec: string;
  didScrollBeforeActing: 'yes' | 'no';
  didOpenDisclosure: 'yes' | 'no';
  severity: ObservationSeverity;
  confidence: ObservationConfidence;
  interpretation: string;
}

export interface DemoObservationSessionRecord extends DemoObservationSessionDraft {
  status: ObservationSessionStatus;
  startedAt: number;
  lastUpdatedAt: number;
  entryCount: number;
  exportedAt?: number;
}

export interface DemoObservationEntry extends Omit<DemoObservationDraft, 'timeToFirstActionSec'>, DemoObservationSessionDraft {
  id: string;
  capturedAt: number;
  timeToFirstActionSec?: number;
}

export interface DemoObservationSessionGroup extends DemoObservationSessionRecord {
  entries: DemoObservationEntry[];
}

const OBSERVATION_STORAGE_KEY = 'mind_demo_observations_v1';
const SESSION_DRAFT_STORAGE_KEY = 'mind_demo_observation_session_v1';
const SESSION_RECORD_STORAGE_KEY = 'mind_demo_observation_sessions_v1';
const ACTIVE_SESSION_STORAGE_KEY = 'mind_demo_observation_active_session_v1';

const DEFAULT_SESSION_DRAFT: DemoObservationSessionDraft = {
  sessionId: '',
  sessionLabel: '',
  observerName: '',
  participant: '',
  deviceType: 'desktop',
};

const DEFAULT_DRAFT: DemoObservationDraft = {
  scenario: 'A',
  surface: 'DUMP_ENTRY',
  observedBehavior: '',
  userQuote: '',
  firstVisibleTarget: '',
  timeToFirstActionSec: '',
  didScrollBeforeActing: 'no',
  didOpenDisclosure: 'no',
  severity: 'minor',
  confidence: 'medium',
  interpretation: '',
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isScenario(value: unknown): value is DemoScenarioId {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E';
}

function isSurface(value: unknown): value is DemoSurfaceId {
  return value === 'DUMP_ENTRY' || value === 'BOUNCE_BACK' || value === 'MORNING_RITUAL' || value === 'ONE_ACTION';
}

function isSeverity(value: unknown): value is ObservationSeverity {
  return value === 'minor' || value === 'moderate' || value === 'major';
}

function isConfidence(value: unknown): value is ObservationConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isDeviceType(value: unknown): value is ObservationDeviceType {
  return value === 'small_phone'
    || value === 'standard_phone'
    || value === 'desktop'
    || value === 'tablet'
    || value === 'unknown';
}

function isSessionStatus(value: unknown): value is ObservationSessionStatus {
  return value === 'draft' || value === 'active' || value === 'ended' || value === 'exported';
}

function normalizeTimeToAction(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function buildSessionId() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `session-${stamp}`;
}

function normalizeSessionDraft(value: unknown): DemoObservationSessionDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    sessionId: normalizeString(record.sessionId) || buildSessionId(),
    sessionLabel: normalizeString(record.sessionLabel),
    observerName: normalizeString(record.observerName),
    participant: normalizeString(record.participant),
    deviceType: isDeviceType(record.deviceType) ? record.deviceType : 'desktop',
  };
}

function normalizeSessionRecord(value: unknown): DemoObservationSessionRecord | null {
  const draft = normalizeSessionDraft(value);
  if (!draft) return null;
  const record = value as Record<string, unknown>;
  const startedAt = typeof record.startedAt === 'number' ? record.startedAt : Date.now();
  const lastUpdatedAt = typeof record.lastUpdatedAt === 'number' ? record.lastUpdatedAt : startedAt;
  return {
    ...draft,
    status: isSessionStatus(record.status) ? record.status : 'draft',
    startedAt,
    lastUpdatedAt,
    entryCount: typeof record.entryCount === 'number' ? record.entryCount : 0,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : undefined,
  };
}

function normalizeEntry(value: unknown): DemoObservationEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isScenario(record.scenario) || !isSurface(record.surface)) return null;
  if (!isSeverity(record.severity) || !isConfidence(record.confidence)) return null;

  const capturedAt = typeof record.capturedAt === 'number'
    ? record.capturedAt
    : typeof record.createdAt === 'number'
      ? record.createdAt
      : Date.now();
  const participant = normalizeString(record.participant);
  const sessionId = normalizeString(record.sessionId) || `legacy-${capturedAt}`;
  const sessionLabel = normalizeString(record.sessionLabel) || participant || 'Legacy session';

  return {
    id: normalizeString(record.id) || `observation-${capturedAt}`,
    capturedAt,
    sessionId,
    sessionLabel,
    observerName: normalizeString(record.observerName),
    participant,
    deviceType: isDeviceType(record.deviceType) ? record.deviceType : 'unknown',
    scenario: record.scenario,
    surface: record.surface,
    observedBehavior: normalizeString(record.observedBehavior),
    userQuote: normalizeString(record.userQuote),
    firstVisibleTarget: normalizeString(record.firstVisibleTarget),
    timeToFirstActionSec: normalizeTimeToAction(record.timeToFirstActionSec),
    didScrollBeforeActing: record.didScrollBeforeActing === 'yes' ? 'yes' : 'no',
    didOpenDisclosure: record.didOpenDisclosure === 'yes' ? 'yes' : 'no',
    severity: record.severity,
    confidence: record.confidence,
    interpretation: normalizeString(record.interpretation),
  };
}

function readStorage<T>(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function writeActiveSessionId(sessionId: string | null) {
  if (typeof window === 'undefined') return;
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    return;
  }
  window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

function readObservationStorage(): DemoObservationEntry[] {
  const parsed = readStorage<unknown[]>(OBSERVATION_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is DemoObservationEntry => Boolean(entry))
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

function writeObservationStorage(entries: DemoObservationEntry[]) {
  writeStorage(OBSERVATION_STORAGE_KEY, entries);
}

function deriveLegacySessionRecords(entries: DemoObservationEntry[]) {
  const grouped = new Map<string, DemoObservationSessionRecord>();

  entries.forEach((entry) => {
    const existing = grouped.get(entry.sessionId);
    if (existing) {
      existing.entryCount += 1;
      existing.lastUpdatedAt = Math.max(existing.lastUpdatedAt, entry.capturedAt);
      existing.startedAt = Math.min(existing.startedAt, entry.capturedAt);
      return;
    }

    grouped.set(entry.sessionId, {
      sessionId: entry.sessionId,
      sessionLabel: entry.sessionLabel,
      observerName: entry.observerName,
      participant: entry.participant,
      deviceType: entry.deviceType,
      status: 'ended',
      startedAt: entry.capturedAt,
      lastUpdatedAt: entry.capturedAt,
      entryCount: 1,
    });
  });

  return [...grouped.values()].sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

function readSessionRecordStorage(): DemoObservationSessionRecord[] {
  const parsed = readStorage<unknown[]>(SESSION_RECORD_STORAGE_KEY);
  if (Array.isArray(parsed)) {
    return parsed
      .map((record) => normalizeSessionRecord(record))
      .filter((record): record is DemoObservationSessionRecord => Boolean(record))
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  }

  const legacyRecords = deriveLegacySessionRecords(readObservationStorage());
  if (legacyRecords.length > 0) {
    writeSessionRecordStorage(legacyRecords);
  }
  return legacyRecords;
}

function writeSessionRecordStorage(records: DemoObservationSessionRecord[]) {
  writeStorage(SESSION_RECORD_STORAGE_KEY, records);
}

function readSessionDraftStorage(): DemoObservationSessionDraft | null {
  return normalizeSessionDraft(readStorage<unknown>(SESSION_DRAFT_STORAGE_KEY));
}

function writeSessionDraftStorage(sessionDraft: DemoObservationSessionDraft) {
  writeStorage(SESSION_DRAFT_STORAGE_KEY, sessionDraft);
}

function upsertSessionRecord(record: DemoObservationSessionRecord, records = readSessionRecordStorage()) {
  const nextRecords = [
    record,
    ...records.filter((candidate) => candidate.sessionId !== record.sessionId),
  ].sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  writeSessionRecordStorage(nextRecords);
  return nextRecords;
}

function buildSessionDraftFromRecord(record: DemoObservationSessionRecord): DemoObservationSessionDraft {
  return {
    sessionId: record.sessionId,
    sessionLabel: record.sessionLabel,
    observerName: record.observerName,
    participant: record.participant,
    deviceType: record.deviceType,
  };
}

function recomputeSessionRecord(
  record: DemoObservationSessionRecord,
  entries: DemoObservationEntry[],
): DemoObservationSessionRecord {
  const sessionEntries = entries.filter((entry) => entry.sessionId === record.sessionId);
  const startedAt = sessionEntries.length > 0
    ? Math.min(...sessionEntries.map((entry) => entry.capturedAt), record.startedAt)
    : record.startedAt;
  const lastUpdatedAt = sessionEntries.length > 0
    ? Math.max(...sessionEntries.map((entry) => entry.capturedAt), record.lastUpdatedAt)
    : record.lastUpdatedAt;
  return {
    ...record,
    entryCount: sessionEntries.length,
    startedAt,
    lastUpdatedAt,
  };
}

export function createObservationSessionDraft(
  overrides: Partial<DemoObservationSessionDraft> = {},
): DemoObservationSessionDraft {
  return {
    ...DEFAULT_SESSION_DRAFT,
    sessionId: buildSessionId(),
    ...overrides,
  };
}

export function getDemoObservationSessionDraft() {
  const activeSession = getActiveDemoObservationSession();
  if (activeSession) return buildSessionDraftFromRecord(activeSession);
  return readSessionDraftStorage() ?? createObservationSessionDraft();
}

export function saveDemoObservationSessionDraft(draft: DemoObservationSessionDraft) {
  const normalizedDraft = {
    ...DEFAULT_SESSION_DRAFT,
    ...draft,
    sessionId: normalizeString(draft.sessionId) || buildSessionId(),
    sessionLabel: normalizeString(draft.sessionLabel),
    observerName: normalizeString(draft.observerName),
    participant: normalizeString(draft.participant),
    deviceType: draft.deviceType,
  };
  writeSessionDraftStorage(normalizedDraft);
  return normalizedDraft;
}

export function getDemoObservationSessionRecords() {
  return readSessionRecordStorage();
}

export function getActiveDemoObservationSessionId() {
  const activeSessionId = readStorage<string>(ACTIVE_SESSION_STORAGE_KEY);
  return typeof activeSessionId === 'string' && activeSessionId.trim().length > 0 ? activeSessionId : null;
}

export function getActiveDemoObservationSession() {
  const activeSessionId = getActiveDemoObservationSessionId();
  if (!activeSessionId) return null;
  return readSessionRecordStorage().find((record) => record.sessionId === activeSessionId) ?? null;
}

export function startDemoObservationSession(draft: DemoObservationSessionDraft) {
  const normalizedDraft = saveDemoObservationSessionDraft(draft);
  const now = Date.now();
  const existingRecords = readSessionRecordStorage();
  const existing = existingRecords.find((record) => record.sessionId === normalizedDraft.sessionId);
  const nextRecord: DemoObservationSessionRecord = {
    sessionId: normalizedDraft.sessionId,
    sessionLabel: normalizedDraft.sessionLabel || normalizedDraft.participant || normalizedDraft.sessionId,
    observerName: normalizedDraft.observerName,
    participant: normalizedDraft.participant,
    deviceType: normalizedDraft.deviceType,
    status: 'active',
    startedAt: existing?.startedAt ?? now,
    lastUpdatedAt: now,
    entryCount: existing?.entryCount ?? 0,
    exportedAt: undefined,
  };
  const records = upsertSessionRecord(nextRecord, existingRecords.map((record) => (
    record.status === 'active' && record.sessionId !== nextRecord.sessionId
      ? { ...record, status: 'ended' as const }
      : record
  )));
  writeActiveSessionId(nextRecord.sessionId);
  return { session: nextRecord, sessions: records };
}

export function resumeDemoObservationSession(sessionId: string) {
  const existingRecords = readSessionRecordStorage();
  const existing = existingRecords.find((record) => record.sessionId === sessionId);
  if (!existing || existing.status === 'exported') {
    return { session: null, sessions: existingRecords };
  }
  const resumed: DemoObservationSessionRecord = {
    ...existing,
    status: 'active',
    lastUpdatedAt: Date.now(),
  };
  const sessions = upsertSessionRecord(resumed, existingRecords.map((record) => (
    record.status === 'active' && record.sessionId !== resumed.sessionId
      ? { ...record, status: 'ended' as const }
      : record
  )));
  writeActiveSessionId(resumed.sessionId);
  writeSessionDraftStorage(buildSessionDraftFromRecord(resumed));
  return { session: resumed, sessions };
}

export function endDemoObservationSession(sessionId: string) {
  const existing = readSessionRecordStorage().find((record) => record.sessionId === sessionId);
  if (!existing) return { session: null, sessions: readSessionRecordStorage() };
  const ended = {
    ...existing,
    status: 'ended' as const,
    lastUpdatedAt: Date.now(),
  };
  const sessions = upsertSessionRecord(ended);
  if (getActiveDemoObservationSessionId() === sessionId) {
    writeActiveSessionId(null);
  }
  return { session: ended, sessions };
}

export function markDemoObservationSessionExported(sessionId: string) {
  const existing = readSessionRecordStorage().find((record) => record.sessionId === sessionId);
  if (!existing) return { session: null, sessions: readSessionRecordStorage() };
  const exportedAt = Date.now();
  const exported = {
    ...existing,
    status: 'exported' as const,
    exportedAt,
    lastUpdatedAt: exportedAt,
  };
  const sessions = upsertSessionRecord(exported);
  if (getActiveDemoObservationSessionId() === sessionId) {
    writeActiveSessionId(null);
  }
  return { session: exported, sessions };
}

export function createObservationDraft(
  route?: UIRoute,
  overrides: Partial<DemoObservationDraft> = {},
): DemoObservationDraft {
  const inferredSurface = inferSurfaceFromRoute(route);
  return {
    ...DEFAULT_DRAFT,
    ...(inferredSurface ? { surface: inferredSurface } : {}),
    ...overrides,
  };
}

export function inferSurfaceFromRoute(route?: UIRoute): DemoSurfaceId | undefined {
  if (route === 'DUMP_ENTRY') return 'DUMP_ENTRY';
  if (route === 'BOUNCE_BACK') return 'BOUNCE_BACK';
  if (route === 'MORNING_RITUAL') return 'MORNING_RITUAL';
  if (route === 'ONE_ACTION') return 'ONE_ACTION';
  return undefined;
}

export function getDemoObservationEntries() {
  return readObservationStorage();
}

export function saveDemoObservationEntry(
  sessionDraft: DemoObservationSessionDraft,
  draft: DemoObservationDraft,
) {
  const session = startDemoObservationSession(sessionDraft).session;
  const capturedAt = Date.now();
  const nextEntry: DemoObservationEntry = {
    id: `observation-${capturedAt}`,
    capturedAt,
    sessionId: session.sessionId,
    sessionLabel: session.sessionLabel,
    observerName: session.observerName,
    participant: session.participant,
    deviceType: session.deviceType,
    scenario: draft.scenario,
    surface: draft.surface,
    observedBehavior: draft.observedBehavior.trim(),
    userQuote: draft.userQuote.trim(),
    firstVisibleTarget: draft.firstVisibleTarget.trim(),
    timeToFirstActionSec: normalizeTimeToAction(draft.timeToFirstActionSec),
    didScrollBeforeActing: draft.didScrollBeforeActing,
    didOpenDisclosure: draft.didOpenDisclosure,
    severity: draft.severity,
    confidence: draft.confidence,
    interpretation: draft.interpretation.trim(),
  };

  const entries = [nextEntry, ...readObservationStorage()];
  writeObservationStorage(entries);
  const refreshedSession = recomputeSessionRecord(
    { ...session, lastUpdatedAt: capturedAt, status: 'active' },
    entries,
  );
  upsertSessionRecord(refreshedSession);
  return entries;
}

export function clearDemoObservationEntries() {
  writeObservationStorage([]);
  writeSessionRecordStorage([]);
  writeActiveSessionId(null);
  writeSessionDraftStorage(createObservationSessionDraft());
  return [];
}

export function removeDemoObservationEntry(id: string) {
  const nextEntries = readObservationStorage().filter((entry) => entry.id !== id);
  writeObservationStorage(nextEntries);
  const nextRecords = readSessionRecordStorage().map((record) => recomputeSessionRecord(record, nextEntries));
  writeSessionRecordStorage(nextRecords);
  return nextEntries;
}

export function getDemoObservationEntriesForSession(sessionId: string) {
  return readObservationStorage().filter((entry) => entry.sessionId === sessionId);
}

export function groupDemoObservationEntries(
  entries: DemoObservationEntry[],
  records = readSessionRecordStorage(),
): DemoObservationSessionGroup[] {
  return records
    .map((record) => ({
      ...recomputeSessionRecord(record, entries),
      entries: entries
        .filter((entry) => entry.sessionId === record.sessionId)
        .sort((a, b) => b.capturedAt - a.capturedAt),
    }))
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

export function exportDemoObservationEntries(entries: DemoObservationEntry[]) {
  return JSON.stringify(entries, null, 2);
}

export function exportDemoObservationEntriesForSession(
  records: DemoObservationSessionRecord[],
  entries: DemoObservationEntry[],
  sessionId: string,
) {
  const session = records.find((record) => record.sessionId === sessionId) ?? null;
  return JSON.stringify({
    exportedAt: Date.now(),
    session,
    entries: entries.filter((entry) => entry.sessionId === sessionId),
  }, null, 2);
}

export function exportGroupedDemoObservationEntries(
  entries: DemoObservationEntry[],
  records = readSessionRecordStorage(),
) {
  return JSON.stringify({
    exportedAt: Date.now(),
    sessions: groupDemoObservationEntries(entries, records),
  }, null, 2);
}
