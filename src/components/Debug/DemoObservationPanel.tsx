"use client";

import { useEffect, useMemo, useState } from 'react';
import type { UIRoute } from '@/lib/store/idb';
import {
  clearDemoObservationEntries,
  createObservationDraft,
  createObservationSessionDraft,
  exportDemoObservationEntriesForSession,
  exportGroupedDemoObservationEntries,
  getActiveDemoObservationSession,
  getDemoObservationEntries,
  getDemoObservationSessionDraft,
  getDemoObservationSessionRecords,
  groupDemoObservationEntries,
  inferSurfaceFromRoute,
  markDemoObservationSessionExported,
  removeDemoObservationEntry,
  resumeDemoObservationSession,
  saveDemoObservationEntry,
  saveDemoObservationSessionDraft,
  startDemoObservationSession,
  endDemoObservationSession,
  type DemoObservationDraft,
  type DemoObservationEntry,
  type DemoObservationSessionDraft,
  type DemoObservationSessionGroup,
  type DemoObservationSessionRecord,
} from '@/lib/validation/demo-observation';

interface Props {
  open: boolean;
  onToggle: () => void;
  currentRoute?: UIRoute;
}

const SCENARIO_LABELS = {
  A: 'A · first-time dump/start',
  B: 'B · resume after interruption',
  C: 'C · morning reentry',
  D: 'D · one-action execution',
  E: 'E · small-mobile pass',
} satisfies Record<DemoObservationDraft['scenario'], string>;

const DEVICE_LABELS = {
  small_phone: 'small phone',
  standard_phone: 'standard phone',
  desktop: 'desktop',
  tablet: 'tablet',
  unknown: 'unknown',
} satisfies Record<DemoObservationSessionDraft['deviceType'], string>;

const STATUS_LABELS = {
  draft: 'draft',
  active: 'active',
  ended: 'ended',
  exported: 'exported',
} satisfies Record<DemoObservationSessionRecord['status'], string>;

type ExportMode = 'active' | 'all' | 'idle';

function fieldStyle() {
  return {
    padding: '0.75rem 0.8rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  } as const;
}

function sectionLabel(label: string) {
  return (
    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
      {label}
    </span>
  );
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
}

function sessionDraftFromRecord(record: DemoObservationSessionRecord): DemoObservationSessionDraft {
  return {
    sessionId: record.sessionId,
    sessionLabel: record.sessionLabel,
    observerName: record.observerName,
    participant: record.participant,
    deviceType: record.deviceType,
  };
}

export function DemoObservationPanel({ open, onToggle, currentRoute }: Props) {
  const [entries, setEntries] = useState<DemoObservationEntry[]>([]);
  const [sessionRecords, setSessionRecords] = useState<DemoObservationSessionRecord[]>([]);
  const [sessionDraft, setSessionDraft] = useState<DemoObservationSessionDraft>(() => getDemoObservationSessionDraft());
  const [draft, setDraft] = useState<DemoObservationDraft>(() => createObservationDraft(currentRoute));
  const [copyState, setCopyState] = useState<ExportMode>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [defaultScenario, setDefaultScenario] = useState<DemoObservationDraft['scenario']>('A');
  const [defaultSeverity, setDefaultSeverity] = useState<DemoObservationDraft['severity']>('minor');
  const [defaultConfidence, setDefaultConfidence] = useState<DemoObservationDraft['confidence']>('medium');

  useEffect(() => {
    const nextEntries = getDemoObservationEntries();
    const nextSessionRecords = getDemoObservationSessionRecords();
    const nextActiveSession = getActiveDemoObservationSession();
    const nextSessionDraft = nextActiveSession
      ? sessionDraftFromRecord(nextActiveSession)
      : getDemoObservationSessionDraft();

    setEntries(nextEntries);
    setSessionRecords(nextSessionRecords);
    setActiveSessionId(nextActiveSession?.sessionId ?? null);
    setSelectedSessionId(nextActiveSession?.sessionId ?? nextSessionRecords[0]?.sessionId ?? null);
    setSessionDraft(nextSessionDraft);
    setDraft(createObservationDraft(currentRoute, {
      scenario: defaultScenario,
      severity: defaultSeverity,
      confidence: defaultConfidence,
    }));
  }, []);

  useEffect(() => {
    saveDemoObservationSessionDraft(sessionDraft);
  }, [sessionDraft]);

  useEffect(() => {
    setDraft((current) => {
      const nextSurface = inferSurfaceFromRoute(currentRoute);
      if (!nextSurface) return current;
      return {
        ...current,
        surface: current.surface === nextSurface ? current.surface : nextSurface,
      };
    });
  }, [currentRoute]);

  const activeSession = useMemo(
    () => sessionRecords.find((record) => record.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessionRecords],
  );
  const groupedEntries = useMemo(
    () => groupDemoObservationEntries(entries, sessionRecords),
    [entries, sessionRecords],
  );
  const selectedSessionGroup = useMemo(
    () => groupedEntries.find((group) => group.sessionId === selectedSessionId) ?? null,
    [groupedEntries, selectedSessionId],
  );

  const canSave = useMemo(() => (
    activeSession?.status === 'active'
    && sessionDraft.sessionId === activeSession.sessionId
    && draft.observedBehavior.trim().length > 0
    && draft.interpretation.trim().length > 0
  ), [activeSession, draft, sessionDraft.sessionId]);

  const updateDraft = <K extends keyof DemoObservationDraft>(key: K, value: DemoObservationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateSessionDraft = <K extends keyof DemoObservationSessionDraft>(key: K, value: DemoObservationSessionDraft[K]) => {
    setSessionDraft((current) => ({ ...current, [key]: value }));
  };

  const resetObservationDraft = (session: DemoObservationSessionDraft, overrides: Partial<DemoObservationDraft> = {}) => {
    const inferredSurface = inferSurfaceFromRoute(currentRoute);
    setDraft(createObservationDraft(currentRoute, {
      scenario: defaultScenario,
      severity: defaultSeverity,
      confidence: defaultConfidence,
      surface: inferredSurface ?? (session.deviceType === 'small_phone' ? 'DUMP_ENTRY' : undefined),
      ...overrides,
    }));
  };

  const syncStateAfterSessionUpdate = (
    nextSession: DemoObservationSessionRecord | null,
    nextSessionRecords: DemoObservationSessionRecord[],
  ) => {
    setSessionRecords(nextSessionRecords);
    setActiveSessionId(nextSession?.status === 'active' ? nextSession.sessionId : null);
    setSelectedSessionId(nextSession?.sessionId ?? nextSessionRecords[0]?.sessionId ?? null);
    setSessionDraft(nextSession ? sessionDraftFromRecord(nextSession) : createObservationSessionDraft({
      observerName: sessionDraft.observerName,
      deviceType: sessionDraft.deviceType,
    }));
  };

  const handleStartSession = () => {
    const sessionIdExists = sessionRecords.some((record) => record.sessionId === sessionDraft.sessionId);
    const seedDraft = sessionIdExists
      ? createObservationSessionDraft({
        sessionLabel: sessionDraft.sessionLabel,
        observerName: sessionDraft.observerName,
        participant: sessionDraft.participant,
        deviceType: sessionDraft.deviceType,
      })
      : sessionDraft;

    const { session, sessions } = startDemoObservationSession(seedDraft);
    syncStateAfterSessionUpdate(session, sessions);
    resetObservationDraft(sessionDraftFromRecord(session));
  };

  const handleResumeSession = () => {
    if (!selectedSessionId) return;
    const { session, sessions } = resumeDemoObservationSession(selectedSessionId);
    if (!session) return;
    syncStateAfterSessionUpdate(session, sessions);
    resetObservationDraft(sessionDraftFromRecord(session));
  };

  const handleEndSession = () => {
    if (!activeSession) return;
    const { session, sessions } = endDemoObservationSession(activeSession.sessionId);
    syncStateAfterSessionUpdate(session, sessions);
  };

  const handleSave = () => {
    if (!canSave || !activeSession) return;
    const nextEntries = saveDemoObservationEntry(sessionDraft, draft);
    const nextSessionRecords = getDemoObservationSessionRecords();
    setEntries(nextEntries);
    setSessionRecords(nextSessionRecords);
    setSelectedSessionId(activeSession.sessionId);
    resetObservationDraft(sessionDraft);
  };

  const handleCopyExport = async (mode: ExportMode) => {
    const payload = mode === 'active' && activeSession
      ? exportDemoObservationEntriesForSession(sessionRecords, entries, activeSession.sessionId)
      : exportGroupedDemoObservationEntries(entries, sessionRecords);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
      setCopyState(mode);

      if (mode === 'active' && activeSession) {
        const { session, sessions } = markDemoObservationSessionExported(activeSession.sessionId);
        syncStateAfterSessionUpdate(session, sessions);
      }

      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('idle');
    }
  };

  const handleClearAll = () => {
    setEntries(clearDemoObservationEntries());
    setSessionRecords([]);
    setActiveSessionId(null);
    const nextSessionDraft = createObservationSessionDraft({
      observerName: sessionDraft.observerName,
      deviceType: sessionDraft.deviceType,
    });
    setSessionDraft(nextSessionDraft);
    setSelectedSessionId(null);
    resetObservationDraft(nextSessionDraft);
  };

  const selectedEntries = selectedSessionGroup?.entries ?? entries.slice(0, 12);

  return (
    <div
      style={{
        position: 'fixed',
        left: '1rem',
        bottom: '1rem',
        zIndex: 80,
        width: 'min(440px, calc(100vw - 1.5rem))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          alignSelf: 'flex-start',
          padding: '0.55rem 0.85rem',
          fontSize: '0.8rem',
          background: 'rgba(15,15,15,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
        }}
      >
        {open ? 'ซ่อน Observation' : 'Observation'}
      </button>
      {open && (
        <div
          style={{
            borderRadius: '18px',
            background: 'rgba(10,10,10,0.94)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.34)',
            padding: '0.95rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.9rem',
            backdropFilter: 'blur(10px)',
            maxHeight: 'min(80vh, 880px)',
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '0.74rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Demo Observation
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                start / capture / end / export ต่อ session โดยไม่แตะ flow หลัก
              </p>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              {entries.length} logs / {sessionRecords.length} sessions
            </span>
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.88rem' }}>Active session</strong>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                {activeSession ? STATUS_LABELS[activeSession.status] : 'no active session'}
              </span>
            </div>

            {activeSession ? (
              <div style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{activeSession.sessionLabel || activeSession.sessionId}</strong>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {activeSession.participant || 'unknown participant'} · {activeSession.observerName || 'no observer'} · {DEVICE_LABELS[activeSession.deviceType]}
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {activeSession.entryCount} logs · started {formatTimestamp(activeSession.startedAt)} · updated {formatTimestamp(activeSession.lastUpdatedAt)}
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                ยังไม่มี active session ให้เริ่มหรือ resume ก่อนจึงจะ log observation ได้
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
              <button className="primary" onClick={handleStartSession}>
                Start new session
              </button>
              <button
                onClick={handleResumeSession}
                disabled={!selectedSessionId || selectedSessionGroup?.status === 'exported'}
                style={{ background: 'transparent' }}
              >
                Resume current session
              </button>
              <button
                onClick={handleEndSession}
                disabled={!activeSession}
                style={{ background: 'transparent' }}
              >
                End session
              </button>
              <button
                onClick={() => void handleCopyExport('active')}
                disabled={!activeSession}
                style={{ background: 'transparent' }}
              >
                {copyState === 'active' ? 'คัดลอกแล้ว' : 'Archive/export session'}
              </button>
            </div>
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>Session draft</strong>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Session ID')}
              <input
                value={sessionDraft.sessionId}
                onChange={(event) => updateSessionDraft('sessionId', event.target.value)}
                style={fieldStyle()}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Session label')}
                <input
                  value={sessionDraft.sessionLabel}
                  onChange={(event) => updateSessionDraft('sessionLabel', event.target.value)}
                  placeholder="Freelancer demo 01"
                  style={fieldStyle()}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Observer')}
                <input
                  value={sessionDraft.observerName}
                  onChange={(event) => updateSessionDraft('observerName', event.target.value)}
                  placeholder="ark / observer-01"
                  style={fieldStyle()}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Participant')}
                <input
                  value={sessionDraft.participant}
                  onChange={(event) => updateSessionDraft('participant', event.target.value)}
                  placeholder="P1 / Mint"
                  style={fieldStyle()}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Device')}
                <select
                  value={sessionDraft.deviceType}
                  onChange={(event) => updateSessionDraft('deviceType', event.target.value as DemoObservationSessionDraft['deviceType'])}
                  style={fieldStyle()}
                >
                  {Object.entries(DEVICE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>Quick defaults</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.55rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Scenario preset')}
                <select
                  value={defaultScenario}
                  onChange={(event) => {
                    const value = event.target.value as DemoObservationDraft['scenario'];
                    setDefaultScenario(value);
                    updateDraft('scenario', value);
                  }}
                  style={fieldStyle()}
                >
                  {Object.entries(SCENARIO_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Severity default')}
                <select
                  value={defaultSeverity}
                  onChange={(event) => {
                    const value = event.target.value as DemoObservationDraft['severity'];
                    setDefaultSeverity(value);
                    updateDraft('severity', value);
                  }}
                  style={fieldStyle()}
                >
                  <option value="minor">minor</option>
                  <option value="moderate">moderate</option>
                  <option value="major">major</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sectionLabel('Confidence default')}
                <select
                  value={defaultConfidence}
                  onChange={(event) => {
                    const value = event.target.value as DemoObservationDraft['confidence'];
                    setDefaultConfidence(value);
                    updateDraft('confidence', value);
                  }}
                  style={fieldStyle()}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {(['A', 'B', 'C', 'D', 'E'] as DemoObservationDraft['scenario'][]).map((scenario) => (
                <button
                  key={scenario}
                  onClick={() => updateDraft('scenario', scenario)}
                  style={{ background: draft.scenario === scenario ? 'rgba(255,255,255,0.12)' : 'transparent', color: 'var(--text-secondary)' }}
                >
                  {scenario}
                </button>
              ))}
              {(['minor', 'moderate', 'major'] as DemoObservationDraft['severity'][]).map((severity) => (
                <button
                  key={severity}
                  onClick={() => updateDraft('severity', severity)}
                  style={{ background: draft.severity === severity ? 'rgba(255,255,255,0.12)' : 'transparent', color: 'var(--text-secondary)' }}
                >
                  {severity}
                </button>
              ))}
              {(['low', 'medium', 'high'] as DemoObservationDraft['confidence'][]).map((confidence) => (
                <button
                  key={confidence}
                  onClick={() => updateDraft('confidence', confidence)}
                  style={{ background: draft.confidence === confidence ? 'rgba(255,255,255,0.12)' : 'transparent', color: 'var(--text-secondary)' }}
                >
                  {confidence}
                </button>
              ))}
              <button
                onClick={() => {
                  const inferredSurface = inferSurfaceFromRoute(currentRoute);
                  if (inferredSurface) updateDraft('surface', inferredSurface);
                }}
                style={{ background: 'transparent', color: 'var(--text-secondary)' }}
              >
                ใช้ surface จาก route นี้
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Scenario')}
              <select
                value={draft.scenario}
                onChange={(event) => updateDraft('scenario', event.target.value as DemoObservationDraft['scenario'])}
                style={fieldStyle()}
              >
                {Object.entries(SCENARIO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Surface')}
              <select
                value={draft.surface}
                onChange={(event) => updateDraft('surface', event.target.value as DemoObservationDraft['surface'])}
                style={fieldStyle()}
              >
                <option value="DUMP_ENTRY">DUMP_ENTRY</option>
                <option value="BOUNCE_BACK">BOUNCE_BACK</option>
                <option value="MORNING_RITUAL">MORNING_RITUAL</option>
                <option value="ONE_ACTION">ONE_ACTION</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {sectionLabel('Observed behavior')}
            <textarea
              value={draft.observedBehavior}
              onChange={(event) => updateDraft('observedBehavior', event.target.value)}
              placeholder="ผู้ใช้เปิดหน้า อ่านหัวข้อ แล้วเริ่มพิมพ์ทันที / scroll ก่อน / กด disclosure ก่อน"
              style={{ ...fieldStyle(), minHeight: '92px' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {sectionLabel('User quote / paraphrase')}
            <textarea
              value={draft.userQuote}
              onChange={(event) => updateDraft('userQuote', event.target.value)}
              placeholder="&quot;โอเค หน้านี้บอกชัดว่าต้องเริ่มตรงไหน&quot;"
              style={{ ...fieldStyle(), minHeight: '72px' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('First visible target')}
              <input
                value={draft.firstVisibleTarget}
                onChange={(event) => updateDraft('firstVisibleTarget', event.target.value)}
                placeholder="CTA หลัก / textarea / summary card"
                style={fieldStyle()}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Interpretation')}
              <input
                value={draft.interpretation}
                onChange={(event) => updateDraft('interpretation', event.target.value)}
                placeholder="ช่วยเริ่มได้ทันที / ยัง scan shell ก่อน"
                style={fieldStyle()}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Time to first action (sec)')}
              <input
                value={draft.timeToFirstActionSec}
                onChange={(event) => updateDraft('timeToFirstActionSec', event.target.value)}
                inputMode="decimal"
                placeholder="3.5"
                style={fieldStyle()}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Severity / confidence')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                <select
                  value={draft.severity}
                  onChange={(event) => updateDraft('severity', event.target.value as DemoObservationDraft['severity'])}
                  style={fieldStyle()}
                >
                  <option value="minor">minor</option>
                  <option value="moderate">moderate</option>
                  <option value="major">major</option>
                </select>
                <select
                  value={draft.confidence}
                  onChange={(event) => updateDraft('confidence', event.target.value as DemoObservationDraft['confidence'])}
                  style={fieldStyle()}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.55rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Scroll before acting?')}
              <select
                value={draft.didScrollBeforeActing}
                onChange={(event) => updateDraft('didScrollBeforeActing', event.target.value as 'yes' | 'no')}
                style={fieldStyle()}
              >
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sectionLabel('Disclosure opened?')}
              <select
                value={draft.didOpenDisclosure}
                onChange={(event) => updateDraft('didOpenDisclosure', event.target.value as 'yes' | 'no')}
                style={fieldStyle()}
              >
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
            <button className="primary" onClick={handleSave} disabled={!canSave}>
              บันทึก observation
            </button>
            <button onClick={() => void handleCopyExport('all')} style={{ background: 'transparent' }}>
              {copyState === 'all' ? 'คัดลอกแล้ว' : 'Export all sessions'}
            </button>
            <button onClick={handleClearAll} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
              ล้าง logs ทั้งหมด
            </button>
          </div>

          <div style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>Session review</strong>
            {groupedEntries.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                ยังไม่มี observation log ในเครื่องนี้
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {groupedEntries.map((group: DemoObservationSessionGroup) => (
                    <button
                      key={group.sessionId}
                      onClick={() => {
                        setSelectedSessionId(group.sessionId);
                        setSessionDraft(sessionDraftFromRecord(group));
                      }}
                      style={{
                        textAlign: 'left',
                        background: selectedSessionId === group.sessionId ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '0.84rem' }}>
                        {group.sessionLabel || group.sessionId}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {group.participant || 'unknown participant'} · {group.observerName || 'no observer'} · {DEVICE_LABELS[group.deviceType]}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {STATUS_LABELS[group.status]} · {group.entryCount} logs · updated {formatTimestamp(group.lastUpdatedAt)}
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {selectedEntries.slice(0, 12).map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        borderRadius: '14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: '0.8rem 0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.88rem' }}>{entry.participant || 'unknown'}</strong>
                        <button
                          onClick={() => {
                            const nextEntries = removeDemoObservationEntry(entry.id);
                            setEntries(nextEntries);
                            setSessionRecords(getDemoObservationSessionRecords());
                          }}
                          style={{ background: 'transparent', color: 'var(--text-secondary)', padding: 0, fontSize: '0.75rem' }}
                        >
                          ลบ
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {SCENARIO_LABELS[entry.scenario]} · {entry.surface} · {entry.severity} / {entry.confidence}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>{entry.observedBehavior}</p>
                      {entry.firstVisibleTarget && (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          first target: {entry.firstVisibleTarget}
                        </p>
                      )}
                      {entry.interpretation && (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          interpretation: {entry.interpretation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
