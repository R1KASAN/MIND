"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AudienceMode = 'team' | 'customer';
type ScenarioId = 'client_project_restart' | 'sales_inquiry_demo_request';
type ScoreKey = 'persona' | 'pain' | 'workaround' | 'fit' | 'adoption';
type MetricDirection = 'higher' | 'lower';

interface GuideQuestion {
  id: string;
  prompt: string;
  helper: string;
  placeholder: string;
}

interface MetricConfig {
  id: string;
  label: string;
  helper: string;
  unit: string;
  target: number;
  direction: MetricDirection;
}

interface GuideState {
  audience: AudienceMode;
  scenarioId: ScenarioId;
  answers: Record<string, string>;
  urgencyFrequency: number;
  urgencyPain: number;
  urgencyChecks: Record<string, boolean>;
  scores: Record<ScoreKey, number>;
  metrics: Record<string, { current: number; target: number }>;
  notes: {
    learned: string;
    nextChange: string;
    evidence: string;
  };
}

const STORAGE_KEY = 'mind-pmf-template-pack-v1';
const SCALE = [1, 2, 3, 4, 5] as const;

const SCENARIOS: Record<ScenarioId, {
  label: string;
  eyebrow: string;
  headline: string;
  promise: string;
  audienceHint: string;
  summary: string;
  interviewIntro: string;
  metricIntro: string;
}> = {
  client_project_restart: {
    label: 'Client project restart',
    eyebrow: 'ค่าเริ่มต้นของ MIND',
    headline: 'งานลูกค้าค้าง แล้วต้องหาก้าวแรกใหม่',
    promise: 'เหมาะกับตอนที่ต้องกลับเข้า context ให้เร็ว โดยไม่ต้องอ่านทุกอย่างใหม่ตั้งแต่ต้น',
    audienceHint: 'เหมาะกับ freelance, consultant, agency lead, designer, developer ที่ต้อง restart งานลูกค้า',
    summary: 'ใช้เช็กว่า MIND ช่วยคนกลับไปทำงานเดิมได้เร็วขึ้นจริงไหม โดยเฉพาะเวลาที่ context กระจัดกระจายและไม่รู้จะเริ่มจากตรงไหน',
    interviewIntro: 'ถามให้เห็นว่าเขาเสียเวลากับการ reread, เดินวน, หรือเริ่มผิดจุดแค่ไหน',
    metricIntro: 'ดูว่า “กลับมาใช้ซ้ำ” และ “กลับไปทำต่อ” เกิดขึ้นจริงไหม ไม่ใช่แค่ชอบตอนทดลองครั้งแรก',
  },
  sales_inquiry_demo_request: {
    label: 'Sales inquiry / demo request',
    eyebrow: 'ตัวอย่างรอง',
    headline: 'ข้อความลูกค้าหนัก ๆ แต่ต้องตอบให้ไว',
    promise: 'เหมาะกับตอนที่ต้องสรุปดีล, ร่างคำตอบ, และหา next move ก่อนประชุมต่อ',
    audienceHint: 'เหมาะกับคนที่รับข้อความยาวจาก prospect หรือ client แล้วต้องตอบกลับแบบเร็วแต่ยังตรงบริบท',
    summary: 'ใช้เช็กว่า MIND ช่วยแปลงข้อความยาวให้กลายเป็น response ที่ตัดสินใจได้จริงหรือยัง โดยไม่ตอบ generic',
    interviewIntro: 'ถามให้เห็นว่าเขาต้องแยก pain point, constraints, และ desired workflow เองมากแค่ไหน',
    metricIntro: 'ดูว่า MIND ช่วยให้คนกลับมาใช้ซ้ำเมื่อเจอข้อความขาย/เดโมรอบใหม่จริงไหม',
  },
};

const AUDIENCE_COPY: Record<AudienceMode, {
  label: string;
  detail: string;
  tone: string;
}> = {
  team: {
    label: 'ทีม MIND',
    detail: 'ใช้สรุปสิ่งที่ได้ยินจากลูกค้าแล้วตัดสินใจ product direction, copy, และ metric ที่ต้องเก็บต่อ',
    tone: 'ภาษาสั้น คม และเอาไว้คุยภายในทีมได้เลย',
  },
  customer: {
    label: 'ลูกค้า / ผู้ใช้',
    detail: 'ใช้เป็น interview guide ที่ไม่บังคับให้เข้าใจ state machine ของ MIND ตั้งแต่แรก',
    tone: 'ภาษาคนใช้งาน ไม่ใช้ศัพท์ระบบเยอะ',
  },
};

const CHECKLIST_ITEMS = [
  { id: 'repeat_reading', label: 'ต้องย้อนอ่านหลายแหล่งก่อนเริ่ม' },
  { id: 'lost_start', label: 'กลับมาแล้วไม่รู้จะเริ่มตรงไหน' },
  { id: 'client_delay', label: 'งานนี้ทำให้ตอบลูกค้าช้าหรือเลื่อนดีล' },
  { id: 'manual_workaround', label: 'วิธีแก้ปัจจุบันเป็น manual workaround ที่ยังเจ็บ' },
  { id: 'same_task_return', label: 'กลับมาทำงานเดิมหลายรอบแต่ยังไม่ขยับ' },
  { id: 'deadline_pressure', label: 'ถ้าไม่แก้ จะกระทบ deadline / revenue / ความไว้ใจ' },
] as const;

const SCORE_CRITERIA: Array<{ id: ScoreKey; label: string; helper: string }> = [
  { id: 'persona', label: 'Persona ชัดไหม', helper: 'คนที่เจ็บที่สุดคือ solo client-facing knowledge worker จริงไหม' },
  { id: 'pain', label: 'Pain intensity', helper: 'ปัญหานี้เจ็บพอจนต้องหาทางแก้ไหม' },
  { id: 'workaround', label: 'Current workaround dissatisfaction', helper: 'วิธีเดิมช้า หลุด context หรือไม่พอจริงไหม' },
  { id: 'fit', label: 'Solution fit', helper: 'MIND พาไปถึง next move ได้จริงไหม' },
  { id: 'adoption', label: 'Switching intent', helper: 'ถ้ามี MIND เขายอมกลับมาใช้ซ้ำไหม' },
];

const DASHBOARD_METRICS: MetricConfig[] = [
  { id: 'retention7', label: '7-day retention', helper: 'คนที่กลับมาอีกภายใน 7 วัน', unit: '%', target: 30, direction: 'higher' },
  { id: 'repeatUsage', label: 'Repeat usage', helper: 'คนที่กลับมาใช้ guide / product ซ้ำ', unit: '%', target: 40, direction: 'higher' },
  { id: 'conversion', label: 'Conversion to second use', helper: 'จากลองครั้งแรกไปใช้ซ้ำอีกครั้ง', unit: '%', target: 25, direction: 'higher' },
  { id: 'timeToNextMove', label: 'Time to next move', helper: 'นาทีเฉลี่ยจากเปิดงานจนเห็นก้าวแรก', unit: 'min', target: 10, direction: 'lower' },
  { id: 'rescueSuccess', label: 'Rescue success rate', helper: 'ครั้งที่ผู้ใช้ติดแล้วหลุดกลับมาได้', unit: '%', target: 80, direction: 'higher' },
  { id: 'reentrySuccess', label: 'Reentry success rate', helper: 'ครั้งที่กลับมาทำต่อแล้วเข้า context ได้', unit: '%', target: 75, direction: 'higher' },
];

const INSTRUCTIONS = [
  'Select one audience: team or customer.',
  'Choose the scenario that matches the conversation you want to validate.',
  'Fill the interview answers with real user language, not polished summary language.',
  'Score urgency, pain, workaround dissatisfaction, solution fit, and switching intent from 1 to 5.',
  'Review retention, repeat usage, conversion, rescue success, and reentry success as proof signals.',
  'Use the decision memo to decide what to sharpen before the next validation round.',
  'Print or export the guide only after the fields contain evidence, not guesses.',
] as const;

function defaultQuestions(scenarioId: ScenarioId): GuideQuestion[] {
  if (scenarioId === 'sales_inquiry_demo_request') {
    return [
      { id: 'sales_pain_source', prompt: 'ข้อความนี้บอก pain จริงของลูกค้าอะไรบ้าง?', helper: 'ดูว่าเขาอยากได้ demo, pilot, หรือแค่ clarification', placeholder: 'เล่า pain point หรือ intent ที่ได้ยินจากข้อความนั้น...' },
      { id: 'sales_workflow', prompt: 'ตอนนี้คุณต้องทำอะไรเองบ้างก่อนจะตอบกลับได้?', helper: 'ยืนยันว่าต้องแยก intent, constraints, และ next response action เองแค่ไหน', placeholder: 'เช่น ต้องไล่แชต, email, notes, หรือไฟล์ประกอบอะไรบ้าง' },
      { id: 'sales_delay', prompt: 'อะไรทำให้ตอบกลับช้าหรือรอประชุมนานเกินไป?', helper: 'หาคอขวดที่เสีย momentum', placeholder: 'เช่น ต้องคิดเองหลายรอบ, ไม่มี draft, หรือรอข้อมูลเพิ่ม...' },
      { id: 'sales_frequency', prompt: 'ปัญหาแบบนี้เกิดบ่อยแค่ไหนในสัปดาห์ปกติ?', helper: 'ยืนยัน frequency ของงาน response ที่มี context รก', placeholder: 'เล่าความถี่ที่เจอจริง เช่น ทุกวัน / ทุกสัปดาห์ / เป็นบางครั้ง' },
      { id: 'sales_switch', prompt: 'ถ้า MIND ช่วยสรุปและร่าง next reply ได้ คุณจะใช้มันเมื่อไหร่?', helper: 'วัด switching intent และ adoption trigger', placeholder: 'เช่น ก่อนส่ง reply แรก, ก่อนประชุม, หรือก่อนยืนยัน demo/pilot' },
      { id: 'sales_success', prompt: 'ถ้าต้องบอกว่ามัน “ช่วยจริง” จะเห็นจากอะไร?', helper: 'ทำให้ความสำเร็จจับต้องได้', placeholder: 'เช่น ตอบได้เร็วขึ้น, พลาดรายละเอียดน้อยลง, หรือปิดขั้นตอนตอบกลับได้เร็วขึ้น' },
    ];
  }

  return [
    { id: 'restart_context', prompt: 'ก่อนจะเริ่มงานนี้ คุณต้องย้อนอ่านอะไรบ้าง?', helper: 'ดูว่าคนต้องไล่หลายแหล่งแค่ไหนก่อนจะเข้า context', placeholder: 'เช่น chat, email, note, PDF, screenshot, หรือไฟล์ประกอบอื่น ๆ' },
    { id: 'restart_start', prompt: 'อะไรทำให้คุณไม่รู้ว่าจะเริ่มจากตรงไหน?', helper: 'หาอาการ “มีงาน แต่ไม่มี first move”', placeholder: 'เล่าว่าคุณหยุดอยู่ตรงไหน และอะไรทำให้ชะงัก' },
    { id: 'restart_workaround', prompt: 'ตอนนี้คุณใช้วิธีอะไรแก้ชั่วคราวอยู่?', helper: 'ยืนยัน current workaround และข้อจำกัดของมัน', placeholder: 'เช่น จดโน้ตเอง, reread ยาว ๆ, หรือถามคนเดิมซ้ำ' },
    { id: 'restart_frequency', prompt: 'ปัญหาแบบนี้เกิดบ่อยแค่ไหน?', helper: 'ยืนยัน frequency ว่าเกิดทุกวัน ทุกสัปดาห์ หรือเฉพาะบางเคส', placeholder: 'บอกความถี่ที่เจอจริง' },
    { id: 'restart_cost', prompt: 'ถ้าไม่แก้ทันที คุณเสียอะไรบ้าง?', helper: 'เช็ก urgency ผ่านผลกระทบต่อเวลา, พลังงาน, หรือรายได้', placeholder: 'เช่น เสียเวลารันงาน, เสีย momentum, หรือเสี่ยงตอบลูกค้าช้า' },
    { id: 'restart_switch', prompt: 'ถ้า MIND ช่วยย่อและพากลับเข้า task ได้ คุณจะหยิบมันมาใช้ตอนไหน?', helper: 'วัด switching intent และ adoption trigger', placeholder: 'เช่น ตอนกลับจากหยุดงาน, ตอนติด, หรือก่อนส่งงานให้ลูกค้า' },
  ];
}

function createDefaultState(scenarioId: ScenarioId = 'client_project_restart'): GuideState {
  const metrics = Object.fromEntries(
    DASHBOARD_METRICS.map((metric) => [
      metric.id,
      {
        current: metric.id === 'timeToNextMove'
          ? 12
          : metric.id === 'retention7'
            ? 28
            : metric.id === 'repeatUsage'
              ? 34
              : metric.id === 'conversion'
                ? 18
                : metric.id === 'rescueSuccess'
                  ? 68
                  : 66,
        target: metric.target,
      },
    ]),
  ) as GuideState['metrics'];

  return {
    audience: 'team',
    scenarioId,
    answers: {},
    urgencyFrequency: 3,
    urgencyPain: 3,
    urgencyChecks: Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, false])),
    scores: {
      persona: 4,
      pain: 4,
      workaround: 3,
      fit: 4,
      adoption: 3,
    },
    metrics,
    notes: {
      learned: '',
      nextChange: '',
      evidence: '',
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatMetricSignal(current: number, target: number, direction: MetricDirection) {
  if (direction === 'higher') {
    if (target <= 0) return 0;
    return clamp((current / target) * 100, 0, 125);
  }
  if (current <= 0) return 125;
  return clamp((target / current) * 100, 0, 125);
}

function scoreLabel(score: number) {
  if (score >= 80) return { label: 'สัญญาณแรง', tone: 'good' as const };
  if (score >= 60) return { label: 'มีสัญญาณ แต่ยังต้อง sharpen', tone: 'mid' as const };
  return { label: 'ยังต้องกลับไปนิยาม pain ให้คม', tone: 'low' as const };
}

function scoreToneClass(tone: 'good' | 'mid' | 'low') {
  if (tone === 'good') return 'pmf-badge-good';
  if (tone === 'mid') return 'pmf-badge-mid';
  return 'pmf-badge-low';
}

function PMFScale({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="pmf-scale-block">
      <div className="pmf-scale-header">
        <div>
          <p className="pmf-field-label">{label}</p>
          <p className="pmf-field-helper">{helper}</p>
        </div>
        <span className="pmf-scale-value">{value}/5</span>
      </div>
      <div className="pmf-scale-buttons" role="radiogroup" aria-label={label}>
        {SCALE.map((item) => {
          const active = item === value;
          return (
            <button
              key={item}
              type="button"
              className={`pmf-scale-button${active ? ' is-active' : ''}`}
              onClick={() => onChange(item)}
              aria-pressed={active}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  current,
  target,
  onCurrentChange,
  onTargetChange,
}: {
  metric: MetricConfig;
  current: number;
  target: number;
  onCurrentChange: (next: number) => void;
  onTargetChange: (next: number) => void;
}) {
  const signal = formatMetricSignal(current, target, metric.direction);
  const toneClass = signal >= 85 ? 'pmf-signal-good' : signal >= 65 ? 'pmf-signal-mid' : 'pmf-signal-low';

  return (
    <div className="pmf-metric-row">
      <div className="pmf-metric-copy">
        <p className="pmf-field-label">{metric.label}</p>
        <p className="pmf-field-helper">{metric.helper}</p>
      </div>
      <div className="pmf-metric-inputs">
        <label className="pmf-metric-input">
          <span>Current ({metric.unit})</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={current}
            onChange={(event) => onCurrentChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))}
          />
        </label>
        <label className="pmf-metric-input">
          <span>Target ({metric.unit})</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={target}
            onChange={(event) => onTargetChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))}
          />
        </label>
        <div className={`pmf-metric-signal ${toneClass}`}>
          {formatPercent(signal)}
        </div>
      </div>
      <div className="pmf-metric-bar" aria-hidden="true">
        <span style={{ width: `${clamp(signal, 0, 100)}%` }} />
      </div>
    </div>
  );
}

export function PMFGuide() {
  const [state, setState] = useState<GuideState>(() => createDefaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GuideState> | null;
        const defaults = createDefaultState(parsed?.scenarioId === 'sales_inquiry_demo_request' ? 'sales_inquiry_demo_request' : 'client_project_restart');
        setState({
          ...defaults,
          ...parsed,
          answers: { ...defaults.answers, ...(parsed?.answers ?? {}) },
          urgencyChecks: { ...defaults.urgencyChecks, ...(parsed?.urgencyChecks ?? {}) },
          scores: { ...defaults.scores, ...(parsed?.scores ?? {}) },
          metrics: { ...defaults.metrics, ...(parsed?.metrics ?? {}) },
          notes: { ...defaults.notes, ...(parsed?.notes ?? {}) },
        });
      }
    } catch {
      setState(createDefaultState());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const questions = useMemo(() => defaultQuestions(state.scenarioId), [state.scenarioId]);
  const scenario = SCENARIOS[state.scenarioId];
  const audienceCopy = AUDIENCE_COPY[state.audience];

  const interviewCoverage = questions.length === 0
    ? 0
    : (questions.filter((question) => (state.answers[question.id] ?? '').trim().length > 0).length / questions.length) * 100;

  const checklistSignals = Object.values(state.urgencyChecks).filter(Boolean).length;
  const urgencyChecklistScore = (checklistSignals / CHECKLIST_ITEMS.length) * 5;
  const urgencyScore = clamp((state.urgencyFrequency + state.urgencyPain + urgencyChecklistScore) / 3, 1, 5);

  const scorecardAverage = (Object.values(state.scores).reduce((sum, value) => sum + value, 0) / Object.keys(state.scores).length) || 0;
  const scorecardPercent = clamp((scorecardAverage / 5) * 100, 0, 100);
  const urgencyPercent = clamp((urgencyScore / 5) * 100, 0, 100);

  const metricSignals = DASHBOARD_METRICS.map((metric) => {
    const row = state.metrics[metric.id] ?? { current: metric.target, target: metric.target };
    return formatMetricSignal(row.current, row.target, metric.direction);
  });
  const dashboardHealth = metricSignals.length === 0
    ? 0
    : clamp(metricSignals.reduce((sum, value) => sum + value, 0) / metricSignals.length, 0, 100);

  const pmfReadiness = Math.round(
    (scorecardPercent * 0.4) +
    (urgencyPercent * 0.2) +
    (dashboardHealth * 0.35) +
    (interviewCoverage * 0.05),
  );

  const verdict = scoreLabel(pmfReadiness);

  const nextSteps = useMemo(() => {
    const steps: string[] = [];
    if (state.scores.persona < 4) steps.push('ทำ persona ให้แคบลงอีก: เลือกคนที่เจ็บที่สุดจริง ๆ');
    if (state.scores.pain < 4) steps.push('เก็บคำพูดจริงของ pain ให้ชัดขึ้น แล้วหาอาการที่เกิดซ้ำ');
    if (urgencyScore < 3.5) steps.push('ยืนยันความถี่และผลกระทบก่อนสรุปว่า pain นี้เร่งด่วนพอ');
    if (scorecardAverage < 4) steps.push('เช็กว่ามี workaround manual ที่แพงพอจะคุ้มกับการเปลี่ยนไหม');
    if (dashboardHealth < 75) steps.push('เก็บ metric จากการใช้จริงให้เห็น repeat usage และ conversion รอบถัดไป');
    if (steps.length === 0) steps.push('ขยาย pilot เล็ก ๆ และจับ first repeat use / reentry ให้แน่น');
    return steps;
  }, [dashboardHealth, urgencyScore, scorecardAverage, state.scores.persona, state.scores.pain]);

  const updateAnswer = (id: string, value: string) => {
    setState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [id]: value,
      },
    }));
  };

  const updateChecklist = (id: string, next: boolean) => {
    setState((current) => ({
      ...current,
      urgencyChecks: {
        ...current.urgencyChecks,
        [id]: next,
      },
    }));
  };

  const updateScore = (id: ScoreKey, next: number) => {
    setState((current) => ({
      ...current,
      scores: {
        ...current.scores,
        [id]: next,
      },
    }));
  };

  const updateMetric = (id: string, field: 'current' | 'target', next: number) => {
    setState((current) => ({
      ...current,
      metrics: {
        ...current.metrics,
        [id]: {
          ...current.metrics[id],
          [field]: next,
        },
      },
    }));
  };

  const resetAll = () => {
    setState(createDefaultState(state.scenarioId));
  };

  const printGuide = () => {
    window.print();
  };

  return (
    <div className="pmf-page">
      <div className="pmf-toolbar no-print">
        <Link href="/" className="pmf-toolbar-link">
          ← กลับ MIND
        </Link>
        <div className="pmf-toolbar-actions">
          <button type="button" className="pmf-toolbar-button" onClick={resetAll}>
            รีเซ็ตคำตอบ
          </button>
          <button type="button" className="pmf-toolbar-button pmf-toolbar-primary" onClick={printGuide}>
            พิมพ์เป็น PDF
          </button>
        </div>
      </div>

      <section className="pmf-hero">
        <div className="pmf-hero-copy">
          <p className="pmf-eyebrow">Internal reference only · {scenario.eyebrow}</p>
          <h1>PMF Template Pack สำหรับ MIND</h1>
          <p className="pmf-hero-lede">
            หน้านี้เป็น reference ภายใน ไม่ใช่ workflow หลักของ prototype. ใช้เช็กว่า MIND แก้ painpoint จริงไหม โดยดูทั้ง customer interview, urgency/frequency, และ metric ที่บอกว่า user กลับมาใช้ซ้ำหรือไม่
          </p>
          <div className="pmf-chip-row">
            <span className="pmf-chip">Editable</span>
            <span className="pmf-chip">Print-ready</span>
            <span className="pmf-chip">Thai-first</span>
            <span className="pmf-chip">Client chaos → next move</span>
          </div>
          <div className="pmf-scenario-switch">
            <button
              type="button"
              className={`pmf-toggle${state.scenarioId === 'client_project_restart' ? ' is-active' : ''}`}
              onClick={() => setState((current) => ({ ...current, scenarioId: 'client_project_restart' }))}
            >
              Client project restart
            </button>
            <button
              type="button"
              className={`pmf-toggle${state.scenarioId === 'sales_inquiry_demo_request' ? ' is-active' : ''}`}
              onClick={() => setState((current) => ({ ...current, scenarioId: 'sales_inquiry_demo_request' }))}
            >
              Sales inquiry / demo request
            </button>
          </div>
          <p className="pmf-hero-summary">{scenario.summary}</p>
        </div>

        <aside className="pmf-hero-panel">
          <div className={`pmf-badge ${scoreToneClass(verdict.tone)}`}>
            {verdict.label}
          </div>
          <div className="pmf-score-overview">
            <div>
              <span>PMF readiness</span>
              <strong>{pmfReadiness}/100</strong>
            </div>
            <div>
              <span>Interview coverage</span>
              <strong>{Math.round(interviewCoverage)}%</strong>
            </div>
            <div>
              <span>Urgency signal</span>
              <strong>{Math.round(urgencyPercent)}%</strong>
            </div>
            <div>
              <span>Dashboard health</span>
              <strong>{Math.round(dashboardHealth)}%</strong>
            </div>
          </div>
          <p className="pmf-panel-copy">{scenario.promise}</p>
          <p className="pmf-panel-copy pmf-panel-copy-muted">{audienceCopy.detail}</p>
          <div className="pmf-mini-list">
            <span>Audience: {audienceCopy.label}</span>
            <span>{audienceCopy.tone}</span>
            <span>{scenario.audienceHint}</span>
          </div>
        </aside>
      </section>

      <section className="pmf-section no-print">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Audience</p>
            <h2>เลือกโหมดการใช้งาน</h2>
          </div>
          <div className="pmf-audience-switch">
            <button
              type="button"
              className={`pmf-toggle${state.audience === 'team' ? ' is-active' : ''}`}
              onClick={() => setState((current) => ({ ...current, audience: 'team' }))}
            >
              ทีม MIND
            </button>
            <button
              type="button"
              className={`pmf-toggle${state.audience === 'customer' ? ' is-active' : ''}`}
              onClick={() => setState((current) => ({ ...current, audience: 'customer' }))}
            >
              ลูกค้า / ผู้ใช้
            </button>
          </div>
        </div>
        <p className="pmf-section-description">{audienceCopy.detail}</p>
      </section>

      <section className="pmf-section no-print">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Instructions</p>
            <h2>Give Computer instructions for how it should work in this space</h2>
          </div>
          <span className="pmf-section-kicker">machine-readable operating notes</span>
        </div>
        <div className="pmf-instructions">
          {INSTRUCTIONS.map((instruction, index) => (
            <div key={instruction} className="pmf-instruction">
              <span className="pmf-instruction-step">0{index + 1}</span>
              <p>{instruction}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pmf-section" id="interview">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Customer interview script</p>
            <h2>คำถามเพื่อยืนยัน pain point</h2>
          </div>
          <span className="pmf-section-kicker">เติมคำตอบจริง คัด quote ที่คนพูดเอง</span>
        </div>
        <p className="pmf-section-description">{scenario.interviewIntro}</p>
        <div className="pmf-question-list">
          {questions.map((question) => (
            <label key={question.id} className="pmf-question">
              <div className="pmf-question-head">
                <div>
                  <p className="pmf-field-label">{question.prompt}</p>
                  <p className="pmf-field-helper">{question.helper}</p>
                </div>
                <span className="pmf-question-tag">Q</span>
              </div>
              <textarea
                className="pmf-textarea"
                value={state.answers[question.id] ?? ''}
                onChange={(event) => updateAnswer(question.id, event.currentTarget.value)}
                placeholder={question.placeholder}
                rows={4}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="pmf-section" id="urgency">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Urgency & frequency checklist</p>
            <h2>เช็กว่าปัญหา “ถี่และเจ็บ” พอหรือยัง</h2>
          </div>
          <span className="pmf-section-kicker">1 = ต่ำ, 5 = สูง</span>
        </div>
        <p className="pmf-section-description">
          ใช้คะแนน frequency + pain + evidence checklist เพื่อดูว่าปัญหานี้เป็นแค่รำคาญ หรือแรงพอจนต้องแก้ตอนนี้
        </p>
        <div className="pmf-urgency-grid">
          <PMFScale
            label="Frequency"
            helper="ปัญหานี้เกิดบ่อยแค่ไหน"
            value={state.urgencyFrequency}
            onChange={(value) => setState((current) => ({ ...current, urgencyFrequency: value }))}
          />
          <PMFScale
            label="Pain when it happens"
            helper="เวลามันเกิดขึ้น เจ็บแค่ไหน"
            value={state.urgencyPain}
            onChange={(value) => setState((current) => ({ ...current, urgencyPain: value }))}
          />
          <div className="pmf-urgency-summary">
            <p className="pmf-field-label">Urgency signal</p>
            <strong>{Math.round(urgencyScore)}/5</strong>
            <span>{Math.round(urgencyPercent)}% ของสัญญาณความเร่งด่วน</span>
            <div className="pmf-progress">
              <span style={{ width: `${urgencyPercent}%` }} />
            </div>
          </div>
        </div>
        <div className="pmf-checklist">
          {CHECKLIST_ITEMS.map((item) => (
            <label key={item.id} className="pmf-check">
              <input
                type="checkbox"
                checked={state.urgencyChecks[item.id] ?? false}
                onChange={(event) => updateChecklist(item.id, event.currentTarget.checked)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="pmf-section" id="scorecard">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">PMF checklist + scorecard</p>
            <h2>สรุปว่าสิ่งที่ได้ยิน “แรงพอ” ไหม</h2>
          </div>
          <span className="pmf-section-kicker">คะแนน 1–5</span>
        </div>
        <div className="pmf-score-grid">
          {SCORE_CRITERIA.map((criterion) => (
            <PMFScale
              key={criterion.id}
              label={criterion.label}
              helper={criterion.helper}
              value={state.scores[criterion.id]}
              onChange={(value) => updateScore(criterion.id, value)}
            />
          ))}
        </div>
        <div className="pmf-score-summary">
          <div>
            <p className="pmf-field-label">Average score</p>
            <strong>{scorecardAverage.toFixed(1)}/5</strong>
          </div>
          <div>
            <p className="pmf-field-label">Scorecard signal</p>
            <strong>{Math.round(scorecardPercent)}%</strong>
          </div>
          <div>
            <p className="pmf-field-label">Verdict</p>
            <strong>{verdict.label}</strong>
          </div>
        </div>
      </section>

      <section className="pmf-section" id="metrics">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Metrics dashboard example</p>
            <h2>ดู retention, repeat usage, และ conversion ว่าขยับจริงไหม</h2>
          </div>
          <span className="pmf-section-kicker">ปรับ current / target ได้</span>
        </div>
        <p className="pmf-section-description">{scenario.metricIntro}</p>
        <div className="pmf-metric-list">
          {DASHBOARD_METRICS.map((metric) => {
            const row = state.metrics[metric.id];
            return (
              <MetricRow
                key={metric.id}
                metric={metric}
                current={row.current}
                target={row.target}
                onCurrentChange={(value) => updateMetric(metric.id, 'current', value)}
                onTargetChange={(value) => updateMetric(metric.id, 'target', value)}
              />
            );
          })}
        </div>
        <div className="pmf-score-summary pmf-score-summary-wide">
          <div>
            <p className="pmf-field-label">Dashboard health</p>
            <strong>{Math.round(dashboardHealth)}%</strong>
          </div>
          <div>
            <p className="pmf-field-label">Repeat-use evidence</p>
            <strong>{formatPercent(metricSignals[1] ?? 0)}</strong>
          </div>
          <div>
            <p className="pmf-field-label">Conversion evidence</p>
            <strong>{formatPercent(metricSignals[2] ?? 0)}</strong>
          </div>
        </div>
      </section>

      <section className="pmf-section">
        <div className="pmf-section-head">
          <div>
            <p className="pmf-section-eyebrow">Decision memo</p>
            <h2>สรุปสิ่งที่ต้องทำต่อ</h2>
          </div>
          <span className={`pmf-badge ${scoreToneClass(verdict.tone)}`}>{verdict.label}</span>
        </div>
        <div className="pmf-decision-layout">
          <div className="pmf-decision-panel">
            <p className="pmf-field-label">What we learned</p>
            <textarea
              className="pmf-textarea pmf-textarea-tight"
              value={state.notes.learned}
              onChange={(event) => setState((current) => ({
                ...current,
                notes: { ...current.notes, learned: event.currentTarget.value },
              }))}
              placeholder="สรุปสิ่งที่ได้ยินจากลูกค้าหรือผู้ใช้จริง"
              rows={4}
            />
          </div>
          <div className="pmf-decision-panel">
            <p className="pmf-field-label">What to change next</p>
            <textarea
              className="pmf-textarea pmf-textarea-tight"
              value={state.notes.nextChange}
              onChange={(event) => setState((current) => ({
                ...current,
                notes: { ...current.notes, nextChange: event.currentTarget.value },
              }))}
              placeholder="สิ่งที่ควร sharpen, cut, หรือทดลองเพิ่มรอบถัดไป"
              rows={4}
            />
          </div>
          <div className="pmf-decision-panel">
            <p className="pmf-field-label">Quote / evidence to keep</p>
            <textarea
              className="pmf-textarea pmf-textarea-tight"
              value={state.notes.evidence}
              onChange={(event) => setState((current) => ({
                ...current,
                notes: { ...current.notes, evidence: event.currentTarget.value },
              }))}
              placeholder="คำพูดจริงที่ยืนยัน pain หรือ intent ได้ดีที่สุด"
              rows={4}
            />
          </div>
        </div>
        <div className="pmf-next-steps">
          {nextSteps.map((step) => (
            <div key={step} className="pmf-next-step">
              {step}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
