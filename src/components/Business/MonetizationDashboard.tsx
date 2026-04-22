"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTrackMountEvent } from '@/lib/instrumentation';
import {
  buildBusinessLoopSummary,
  buildBusinessLoopSummaryByRoom,
  buildRoadmapGateEvaluations,
  clearAnalyticsEvents,
  getAnalyticsEvents,
  type BusinessLoopSummary,
  type MonetizationGateSettings,
  type RoomBusinessSummary,
  type ValuePulseSignal,
} from '@/lib/analytics/local-analytics';
import {
  DEFAULT_GATE_SETTINGS,
  DEFAULT_MONETIZATION_HYPOTHESIS,
  buildOutcomePitch,
} from '@/lib/business/monetization';
import { getRooms, type RoomRecord } from '@/lib/store/idb';

interface MonetizationSettingsState extends MonetizationGateSettings {
  pilotInterviewCount?: number;
  pilotNotes?: string;
  decisionNotes?: string;
}

const STORAGE_KEY = 'mind-business-monetization-v1';

function loadSettings(): MonetizationSettingsState {
  if (typeof window === 'undefined') return { ...DEFAULT_GATE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GATE_SETTINGS };
    const parsed = JSON.parse(raw) as MonetizationSettingsState;
    return {
      ...DEFAULT_GATE_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_GATE_SETTINGS };
  }
}

function formatMetric(value: number | null, unit = 'ms') {
  if (value === null || Number.isNaN(value)) return 'ไม่มีข้อมูล';
  if (unit === '%') return `${Math.round(value)}%`;
  if (unit === 'count') return `${Math.round(value)} ครั้ง`;
  return `${Math.round(value)}${unit}`;
}

function gateTone(status: 'pass' | 'warn' | 'stop' | 'missing') {
  if (status === 'pass') return { background: 'rgba(34, 197, 94, 0.12)', color: '#86efac', border: 'rgba(34, 197, 94, 0.22)' };
  if (status === 'warn') return { background: 'rgba(245, 158, 11, 0.12)', color: '#fcd34d', border: 'rgba(245, 158, 11, 0.22)' };
  if (status === 'stop') return { background: 'rgba(248, 113, 113, 0.12)', color: '#fca5a5', border: 'rgba(248, 113, 113, 0.22)' };
  return { background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.22)' };
}

function pulseLabel(signal: ValuePulseSignal | null) {
  switch (signal) {
    case 'time':
      return 'ประหยัดเวลา';
    case 'mental_load':
      return 'สมองเบาลง';
    case 'risk':
      return 'กันงานหลุด';
    case 'mixed':
      return 'ได้หลายอย่าง';
    case 'not_much':
      return 'ยังไม่ค่อยช่วย';
    default:
      return 'ยังไม่มีสัญญาณ';
  }
}

function pulseDecision(signal: ValuePulseSignal | null) {
  switch (signal) {
    case 'time':
      return 'ดัน copy และ demo ให้ชนะเรื่อง start faster / reentry faster';
    case 'mental_load':
      return 'เล่า value เป็น “สมองเบา / ไม่ต้อง reread” ให้ชัดขึ้น';
    case 'risk':
      return 'เน้น trust, deal risk, และงานไม่หลุดมากกว่าคำว่า productivity';
    case 'mixed':
      return 'คง narrative แบบ multi-value แต่ให้ next move และ reentry เป็นแกน';
    case 'not_much':
      return 'loop นี้ยังไม่คมพอ หรือยังไม่ใช่ buyer ที่ใช่';
    default:
      return 'ยังไม่พอใช้ตัดสิน messaging';
  }
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div style={{
      padding: '1rem',
      borderRadius: 'var(--radius-lg)',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
    }}>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <strong style={{ fontSize: '1.1rem' }}>{value}</strong>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: '0.88rem' }}>{helper}</p>
    </div>
  );
}

function MetricRow({
  label,
  current,
  target,
  unit,
  helper,
}: {
  label: string;
  current: number | null;
  target: number;
  unit: 'ms' | '%' | 'count';
  helper: string;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.35fr 0.6fr 0.6fr',
      gap: '0.75rem',
      padding: '0.85rem 0.95rem',
      borderRadius: 'var(--radius)',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      alignItems: 'center',
    }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5 }}>{helper}</p>
      </div>
      <div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Current</p>
        <strong>{formatMetric(current, unit)}</strong>
      </div>
      <div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Target</p>
        <strong>{formatMetric(target, unit)}</strong>
      </div>
    </div>
  );
}

export function MonetizationDashboard() {
  useTrackMountEvent('metrics_dashboard_opened');

  const [events, setEvents] = useState<Awaited<ReturnType<typeof getAnalyticsEvents>>>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [settings, setSettings] = useState<MonetizationSettingsState>(() => loadSettings());
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const nextEvents = await getAnalyticsEvents();
      setEvents(nextEvents);
      const nextRooms = await getRooms();
      setRooms(nextRooms);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary: BusinessLoopSummary = useMemo(() => buildBusinessLoopSummary(events), [events]);
  const roomSummaries: RoomBusinessSummary[] = useMemo(() => buildBusinessLoopSummaryByRoom(events), [events]);
  const gates = useMemo(() => buildRoadmapGateEvaluations(summary, settings), [summary, settings]);
  const gateCounts = gates.reduce(
    (acc, gate) => {
      acc[gate.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, stop: 0, missing: 0 },
  );

  const currentPriceBand = settings.wtpLow !== undefined && settings.wtpHigh !== undefined
    ? `${settings.wtpLow}–${settings.wtpHigh}`
    : DEFAULT_MONETIZATION_HYPOTHESIS.priceBand;

  const updateNumber = (key: keyof MonetizationSettingsState) => (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setSettings((current) => ({
      ...current,
      [key]: raw === '' ? undefined : Number(raw),
    }));
  };

  const updateText = (key: keyof MonetizationSettingsState) => (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setSettings((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const clearEvents = async () => {
    await clearAnalyticsEvents();
    setEvents([]);
  };

  return (
    <div style={{ padding: '2rem 0 3rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '42rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '0.78rem' }}>
            Business model enforcement
          </p>
          <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 5vw, 2.7rem)', lineHeight: 1.05 }}>
            MIND outcome-first loop
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: '44rem' }}>
            {buildOutcomePitch()} เป้าหมายคือ capture value 10–20% จากเวลาที่ประหยัดได้ และบังคับ roadmap ให้ชนกับ metric จริง ไม่ใช่ฟีเจอร์สวย ๆ
          </p>
        </div>
        <Link
          href="/"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '0.6rem 0.95rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          กลับหน้า MIND
        </Link>
      </header>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '0.9rem',
      }}>
        <SummaryCard label="Task loop" value="≤ 10 นาที" helper="เวลาเป้าหมายจากกลับมาจาก context chaos → next move ที่เริ่มได้จริง" />
        <SummaryCard label="Value capture" value={DEFAULT_MONETIZATION_HYPOTHESIS.valueCaptureRule} helper={`Price band: ${currentPriceBand}`} />
        <SummaryCard label="Positioning" value={settings.positioning ?? DEFAULT_MONETIZATION_HYPOTHESIS.positioning} helper="Overlay-first คือ default จนกว่าจะมีหลักฐานว่าคนยอมย้าย workflow เข้า hub" />
        <SummaryCard label="Reentry confirm" value={formatMetric(summary.reentryToConfirmedActionRate5m, '%')} helper="สัดส่วน reentry ที่พาไปสู่ confirmed action ภายใน 5 นาที" />
        <SummaryCard label="AI mismatch" value={formatMetric(summary.notLikeThisRate, '%')} helper="Not like this ต่อ draft ทั้งหมด ยิ่งต่ำยิ่ง grounded" />
        <SummaryCard label="Evidence trust" value={formatMetric(summary.evidenceClickRate, '%')} helper="อัตรากดดูหลักฐานของ step ที่ MIND เสนอ" />
        <SummaryCard label="Confirmed action" value={formatMetric(summary.timeToFirstConfirmedActionMs.median, 'ms')} helper="เวลาจากเปิดงานจนยืนยันก้าวถัดไปจริง" />
      </section>

      <section style={{
        padding: '1.1rem',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}>
        <div>
          <p className="pmf-field-label" style={{ marginBottom: '0.3rem' }}>Room-by-room signal</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ดูว่าห้องไหนมีสัญญาณ value สูง และ room type ไหนเริ่มดูเหมือน buyer story ที่คมกว่า
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.85rem' }}>
          <SummaryCard label="Rooms" value={`${rooms.length}`} helper="client / project contexts ที่เก็บในเครื่อง" />
          <SummaryCard label="Tracked rooms" value={`${roomSummaries.length}`} helper="ห้องที่เริ่มมี event log แล้ว" />
          <SummaryCard label="Top room" value={roomSummaries[0]?.roomTitle ?? 'ยังไม่มี'} helper={roomSummaries[0]?.dominantValuePulseSignal ? `signal: ${pulseLabel(roomSummaries[0].dominantValuePulseSignal)}` : 'ยังไม่มี signal ชัด'} />
        </div>

        {roomSummaries.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ยังไม่มี event พอจะแยกตามห้อง ลองใช้ MIND กับอย่างน้อย 2 ห้องก่อน แล้วกลับมาดูว่าห้องไหน reentry เร็วและ revisit บ่อยกว่า
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {roomSummaries.slice(0, 4).map((room) => (
              <div
                key={room.roomId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.6fr 0.6fr 0.6fr',
                  gap: '0.75rem',
                  padding: '0.9rem 0.95rem',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{room.roomTitle}</p>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    {room.roomScenarioType ?? 'general'} · signal {pulseLabel(room.dominantValuePulseSignal)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Next move</p>
                  <strong>{formatMetric(room.timeToNextMoveMs.median, 'ms')}</strong>
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Reentry</p>
                  <strong>{formatMetric(room.reentryTimeMs.median, 'ms')}</strong>
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Repeat</p>
                  <strong>{room.repeatUsageRate === null ? 'ไม่มีข้อมูล' : formatMetric(room.repeatUsageRate, '%')}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 0.95fr',
        gap: '1rem',
      }}>
        <div style={{
          padding: '1.1rem',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.35rem' }}>Monetization hypothesis</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              Primary ICP: {DEFAULT_MONETIZATION_HYPOTHESIS.primaryIcp.label}. Secondary ICP: {DEFAULT_MONETIZATION_HYPOTHESIS.secondaryIcp.label}. Next-best alternative: {DEFAULT_MONETIZATION_HYPOTHESIS.nextBestAlternative}.
            </p>
          </div>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.35rem' }}>Primary ICP pain</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{DEFAULT_MONETIZATION_HYPOTHESIS.primaryIcp.painNarrative}</p>
          </div>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.35rem' }}>Secondary ICP fallback</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{DEFAULT_MONETIZATION_HYPOTHESIS.secondaryIcp.painNarrative}</p>
          </div>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.35rem' }}>WTP prompt</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {DEFAULT_MONETIZATION_HYPOTHESIS.primaryIcp.wtpQuestions.slice(0, 3).map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{
          padding: '1.1rem',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
        }}>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.3rem' }}>Roadmap gate rules</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              ถ้า loop ไม่ดีขึ้น ≥ 35% ภายใน 4 สัปดาห์ ให้ freeze feature ใหม่. ถ้า reentry ไม่ลดจริง ให้หยุด claim ใน landing. ถ้า WTP อ่อน ให้ pivot ICP หรือ packaging.
            </p>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span className="pmf-field-label">Positioning</span>
            <select
              value={settings.positioning ?? DEFAULT_MONETIZATION_HYPOTHESIS.positioning}
              onChange={(event) => setSettings((current) => ({ ...current, positioning: event.target.value as MonetizationGateSettings['positioning'] }))}
              style={{
                borderRadius: '0.85rem',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-primary)',
                padding: '0.7rem 0.85rem',
              }}
            >
              <option value="overlay-first">overlay-first</option>
              <option value="hub-first">hub-first</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="pmf-field-label">Pilot commits</span>
              <input type="number" min={0} value={settings.pilotCommitCount ?? ''} onChange={updateNumber('pilotCommitCount')} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="pmf-field-label">Paid pilots</span>
              <input type="number" min={0} value={settings.paidPilotCount ?? ''} onChange={updateNumber('paidPilotCount')} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="pmf-field-label">WTP low</span>
              <input type="number" min={0} value={settings.wtpLow ?? ''} onChange={updateNumber('wtpLow')} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="pmf-field-label">WTP high</span>
              <input type="number" min={0} value={settings.wtpHigh ?? ''} onChange={updateNumber('wtpHigh')} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span className="pmf-field-label">Value capture %</span>
            <input type="number" min={0} max={100} value={settings.valueCapturePct ?? ''} onChange={updateNumber('valueCapturePct')} />
          </label>
        </div>
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '0.9rem',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Baseline time-to-next-move (ms)</span>
          <input type="number" min={0} value={settings.baselineTimeToNextMoveMs ?? ''} onChange={updateNumber('baselineTimeToNextMoveMs')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Baseline reentry time (ms)</span>
          <input type="number" min={0} value={settings.baselineReentryTimeMs ?? ''} onChange={updateNumber('baselineReentryTimeMs')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Baseline reread proxy (context items)</span>
          <input type="number" min={0} value={settings.baselineSourceContextCount ?? ''} onChange={updateNumber('baselineSourceContextCount')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Primary ICP note</span>
          <input type="text" value={settings.primaryIcp ?? DEFAULT_MONETIZATION_HYPOTHESIS.primaryIcp.id} onChange={updateText('primaryIcp')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Secondary ICP note</span>
          <input type="text" value={settings.secondaryIcp ?? DEFAULT_MONETIZATION_HYPOTHESIS.secondaryIcp.id} onChange={updateText('secondaryIcp')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="pmf-field-label">Pilot interview count</span>
          <input type="number" min={0} value={settings.pilotInterviewCount ?? ''} onChange={updateNumber('pilotInterviewCount')} />
        </label>
      </section>

      <section style={{
        padding: '1.1rem',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.95rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.3rem' }}>Live analytics</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              ข้อมูลนี้อ่านจาก event log บนเครื่องเท่านั้น ใช้ดู median / p75 และเปลี่ยน roadmap ให้ตรง loop
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? 'กำลังอัปเดต…' : 'รีเฟรช'}
            </button>
            <button onClick={() => void clearEvents()} style={{ background: 'transparent' }}>
              ล้าง event log
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.85rem' }}>
          <SummaryCard label="Events" value={`${summary.totalEvents}`} helper="event ที่เก็บในเครื่องตอนนี้" />
          <SummaryCard label="Tasks" value={`${summary.uniqueTaskCount}`} helper="task / session ที่แตะ analytics" />
          <SummaryCard label="Rescue" value={summary.rescueSuccessRate === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.rescueSuccessRate)}%`} helper="rescue resolved / rescue triggered" />
          <SummaryCard label="Conversion" value={summary.conversionRate === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.conversionRate)}%`} helper="task completed / task opened" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.85rem' }}>
          <SummaryCard label="Time to next move median" value={formatMetric(summary.timeToNextMoveMs.median, 'ms')} helper={`p75: ${formatMetric(summary.timeToNextMoveMs.p75, 'ms')}`} />
          <SummaryCard label="Reentry time median" value={formatMetric(summary.reentryTimeMs.median, 'ms')} helper={`p75: ${formatMetric(summary.reentryTimeMs.p75, 'ms')}`} />
          <SummaryCard label="Reread proxy median" value={formatMetric(summary.sourceContextCount.median, 'count')} helper={`p75: ${formatMetric(summary.sourceContextCount.p75, 'count')}`} />
          <SummaryCard label="Completion after interruption" value={summary.completionAfterInterruptionRate === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.completionAfterInterruptionRate)}%`} helper="task ที่โดน interrupt แล้วไปต่อจนจบ" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <MetricRow
            label="Time-to-first-meaningful-action"
            current={summary.timeToNextMoveMs.median}
            target={settings.baselineTimeToNextMoveMs ?? 600000}
            unit="ms"
            helper="เปิดงาน → next move ที่เริ่มทำได้จริง"
          />
          <MetricRow
            label="Reentry time"
            current={summary.reentryTimeMs.median}
            target={settings.baselineReentryTimeMs ?? 600000}
            unit="ms"
            helper="กลับมา → เข้า context แล้วรู้ next move"
          />
          <MetricRow
            label="Reread proxy"
            current={summary.sourceContextCount.median}
            target={settings.baselineSourceContextCount ?? 5}
            unit="count"
            helper="context items ที่ต้องแตะก่อนเข้าใจงาน"
          />
        </div>
      </section>

      <section style={{
        padding: '1.1rem',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p className="pmf-field-label" style={{ marginBottom: '0.3rem' }}>Weekly value pulse</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              คำตอบสั้นหลัง session ที่บอกว่า value จริงของ MIND เอนไปทางเวลา, mental load, หรือ risk
            </p>
          </div>
          <div style={{
            padding: '0.6rem 0.85rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '0.88rem',
            height: 'fit-content',
          }}>
            {summary.valuePulseCaptureRate === null
              ? 'ยังไม่มี pulse enough'
              : `Pulse capture ${Math.round(summary.valuePulseCaptureRate)}%`}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.85rem' }}>
          <SummaryCard label="Shown" value={`${summary.valuePulseShownCount}`} helper="pulse ที่โผล่หลังจบ session" />
          <SummaryCard label="Submitted" value={`${summary.valuePulseSubmittedCount}`} helper="pulse ที่ user ตอบกลับ" />
          <SummaryCard label="Dominant signal" value={pulseLabel(summary.dominantValuePulseSignal)} helper="value ที่เห็นบ่อยสุด" />
          <SummaryCard
            label="Median minutes saved"
            value={summary.valuePulseMinutesSaved.median === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.valuePulseMinutesSaved.median)} นาที`}
            helper={summary.valuePulseMinutesSaved.p75 === null ? 'ยังไม่มีข้อมูล p75' : `p75: ${Math.round(summary.valuePulseMinutesSaved.p75)} นาที`}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '0.85rem' }}>
          <div style={{
            padding: '1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Signal split
            </p>
            {summary.valuePulseSubmittedCount === 0 ? (
              <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                ยังไม่มีคำตอบสั้นพอให้สรุป signal
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                {Object.entries(summary.valuePulseSignalCounts)
                  .filter(([, count]) => count > 0)
                  .map(([signal, count]) => (
                    <span
                      key={signal}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.7rem',
                        borderRadius: '999px',
                        background: signal === summary.dominantValuePulseSignal
                          ? 'rgba(94, 106, 210, 0.18)'
                          : 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {pulseLabel(signal as ValuePulseSignal)} <strong>×{count as number}</strong>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div style={{
            padding: '1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(94, 106, 210, 0.12)',
            border: '1px solid rgba(94, 106, 210, 0.24)',
          }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Decision hint
            </p>
            <p style={{ margin: '0.45rem 0 0', lineHeight: 1.65 }}>
              {pulseDecision(summary.dominantValuePulseSignal)}
            </p>
            {summary.valuePulseLatestNotes.length > 0 && (
              <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.45rem' }}>
                {summary.valuePulseLatestNotes.map((note, index) => (
                  <p key={`${note}-${index}`} style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                    “{note}”
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.9rem',
      }}>
        {gates.map((gate) => {
          const tone = gateTone(gate.status);
          return (
            <div
              key={gate.id}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-lg)',
                background: tone.background,
                border: `1px solid ${tone.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong>{gate.label}</strong>
                <span style={{ color: tone.color, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {gate.status}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.55 }}>{gate.reason}</p>
              {gate.value && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Current: {gate.value} · Threshold: {gate.threshold}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '0.9rem',
      }}>
        <SummaryCard label="Pass" value={`${gateCounts.pass}`} helper="gate ที่ผ่านตาม threshold" />
        <SummaryCard label="Warn" value={`${gateCounts.warn}`} helper="gate ที่ยังใกล้ผ่านแต่ควร sharpen" />
        <SummaryCard label="Stop / Missing" value={`${gateCounts.stop + gateCounts.missing}`} helper="สิ่งที่บังคับให้กลับไปแก้ loop หรือกรอก baseline" />
      </section>

      <section style={{
        padding: '1.1rem',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <div>
          <p className="pmf-field-label" style={{ marginBottom: '0.25rem' }}>Team enforcement</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ทุก ticket / PR ต้องตอบได้ว่า Problem / Outcome / Metric คืออะไร ถ้ายังตอบไม่ได้ ก็ยังไม่ควร merge หรือขยาย scope
          </p>
        </div>
        <textarea
          value={settings.decisionNotes ?? ''}
          onChange={updateText('decisionNotes')}
          placeholder="บันทึกว่ารอบนี้เรียนรู้อะไร, จะ freeze อะไร, และ ticket ไหนต้องรอ metric..."
          rows={4}
          style={{
            width: '100%',
            borderRadius: '1rem',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-primary)',
            padding: '0.85rem 0.95rem',
            resize: 'vertical',
          }}
        />
      </section>
    </div>
  );
}
