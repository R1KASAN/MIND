import type { LocalAnalyticsEvent, ValuePulseSignal } from '@/lib/analytics/local-analytics';
import type { UIRoute, WorkflowType } from '@/lib/store/idb';

export type ValuePulseMode = 'restart' | 'reentry' | 'urgent_reply' | 'rescue';
export type { ValuePulseSignal };

export interface ValuePulseContext {
  id: string;
  promptId: string;
  mode: ValuePulseMode;
  title: string;
  body: string;
  followUpLabel: string;
  followUpPlaceholder: string;
  taskId?: string;
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: string;
  sessionId?: string;
  scenarioId?: string;
  icpTag?: string;
  route?: UIRoute;
}

export interface ValuePulseSummary {
  shownCount: number;
  submittedCount: number;
  dismissedCount: number;
  captureRate: number | null;
  signalCounts: Record<ValuePulseSignal, number>;
  minutesSavedMedian: number | null;
  minutesSavedP75: number | null;
  latestNotes: string[];
  dominantSignal: ValuePulseSignal | null;
}

const STORAGE_KEY = 'mind_value_pulse_seen_v1';

const PULSE_COPY: Record<ValuePulseMode, Omit<ValuePulseContext, 'id' | 'taskId' | 'roomId' | 'roomTitle' | 'roomScenarioType' | 'sessionId' | 'scenarioId' | 'icpTag' | 'route'>> = {
  restart: {
    promptId: 'restart',
    mode: 'restart',
    title: 'รอบนี้ช่วยให้เริ่มงานได้เร็วขึ้นแค่ไหน?',
    body: 'ตอบสั้น ๆ ได้เลย เราใช้คำตอบนี้ดูว่าก้าวแรกของงานค้างชัดขึ้นหรือยัง',
    followUpLabel: 'ถ้าอยาก ใส่ตัวเลขคร่าว ๆ ว่าประหยัดเวลาไปกี่นาที',
    followUpPlaceholder: 'เช่น 15',
  },
  reentry: {
    promptId: 'reentry',
    mode: 'reentry',
    title: 'กลับเข้าบริบทได้เร็วขึ้นแค่ไหน?',
    body: 'ถ้าหายจากงานไปหลายวัน MIND ช่วยให้คุณไม่ต้อง reread กองเดิมมากไหม',
    followUpLabel: 'ถ้าอยาก บอกสั้น ๆ ว่ากลับมางานนี้เร็วขึ้นตรงไหน',
    followUpPlaceholder: 'เช่น ไม่ต้องไล่อ่านทั้ง thread',
  },
  urgent_reply: {
    promptId: 'urgent_reply',
    mode: 'urgent_reply',
    title: 'ช่วยให้ตอบลูกค้าได้ไวขึ้นแค่ไหน?',
    body: 'ใช้ตอบแบบเร็วและตรงบริบทได้ไหม โดยไม่ต้องเปิดหลายที่',
    followUpLabel: 'ถ้าอยาก บอกสั้น ๆ ว่าช่วยจบงานหรือช่วยเคลียร์งานทันขึ้นยังไง',
    followUpPlaceholder: 'เช่น เคลียร์งานทันก่อน follow-up',
  },
  rescue: {
    promptId: 'rescue',
    mode: 'rescue',
    title: 'ช่วยให้หลุดจากทางตันได้แค่ไหน?',
    body: 'ถ้าเพิ่งติด MIND ช่วยให้เห็นทางออกหรือทำให้งานเบาลงหรือไม่',
    followUpLabel: 'ถ้าอยาก บอกสั้น ๆ ว่าติดตรงไหนน้อยลงหรือเปล่า',
    followUpPlaceholder: 'เช่น รู้ว่าจะเริ่มจากอะไร',
  },
};

function toSorted(values: number[]) {
  return [...values].sort((left, right) => left - right);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = toSorted(values);
  const index = Math.floor((sorted.length - 1) / 2);
  return sorted[index] ?? null;
}

function p75(values: number[]) {
  if (values.length === 0) return null;
  const sorted = toSorted(values);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return sorted[index] ?? null;
}

function getPulseSeenKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function savePulseSeenKeys(keys: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-50)));
}

export function hasSeenValuePulse(key: string): boolean {
  return getPulseSeenKeys().includes(key);
}

export function markValuePulseSeen(key: string): void {
  const keys = getPulseSeenKeys();
  if (keys.includes(key)) return;
  keys.push(key);
  savePulseSeenKeys(keys);
}

export function deriveValuePulseMode(route: UIRoute, workflowType?: WorkflowType, scenarioId?: string): ValuePulseMode {
  if (route === 'BOUNCE_BACK' || route === 'MORNING_RITUAL') return 'reentry';
  if (route === 'RESCUE') return 'rescue';
  if (workflowType === 'client_response' || scenarioId === 'sales_inquiry_demo_request') return 'urgent_reply';
  return 'restart';
}

export function buildValuePulseContext(input: {
  mode: ValuePulseMode;
  taskId?: string;
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: string;
  sessionId?: string;
  scenarioId?: string;
  icpTag?: string;
  route?: UIRoute;
}): ValuePulseContext {
  const copy = PULSE_COPY[input.mode];
  return {
    id: `${copy.promptId}:${input.taskId ?? input.sessionId ?? 'session'}`,
    promptId: copy.promptId,
    mode: copy.mode,
    title: copy.title,
    body: copy.body,
    followUpLabel: copy.followUpLabel,
    followUpPlaceholder: copy.followUpPlaceholder,
    taskId: input.taskId,
    roomId: input.roomId,
    roomTitle: input.roomTitle,
    roomScenarioType: input.roomScenarioType,
    sessionId: input.sessionId,
    scenarioId: input.scenarioId,
    icpTag: input.icpTag,
    route: input.route,
  };
}

export function summarizeValuePulseEvents(events: LocalAnalyticsEvent[]): ValuePulseSummary {
  const pulseEvents = events.filter((event) =>
    event.eventName === 'value_pulse_shown' ||
    event.eventName === 'value_pulse_dismissed' ||
    event.eventName === 'value_pulse_submitted',
  );

  const submittedEvents = pulseEvents.filter((event) => event.eventName === 'value_pulse_submitted');
  const signalCounts: Record<ValuePulseSignal, number> = {
    time: 0,
    mental_load: 0,
    risk: 0,
    mixed: 0,
    not_much: 0,
    unknown: 0,
  };
  const minutesSavedValues: number[] = [];
  const notes = submittedEvents
    .map((event) => {
      const rawNote = event.valuePulseNote ?? event.properties.value_pulse_note ?? event.properties.valuePulseNote;
      return typeof rawNote === 'string' ? rawNote.trim() : '';
    })
    .filter((note) => note.length > 0)
    .slice()
    .reverse()
    .slice(0, 3);

  for (const event of submittedEvents) {
    const rawSignal = event.valuePulseSignal ?? event.properties.value_pulse_signal ?? event.properties.valuePulseSignal;
    const signal = typeof rawSignal === 'string' && rawSignal in signalCounts ? rawSignal as ValuePulseSignal : 'unknown';
    signalCounts[signal] += 1;

    const rawMinutes = event.valuePulseMinutesSaved ?? event.properties.value_pulse_minutes_saved ?? event.properties.valuePulseMinutesSaved;
    if (typeof rawMinutes === 'number' && Number.isFinite(rawMinutes) && rawMinutes >= 0) {
      minutesSavedValues.push(rawMinutes);
    }
  }

  const dominantSignal = (Object.entries(signalCounts).reduce(
    (best, current) => (current[1] > best.count ? { signal: current[0] as ValuePulseSignal, count: current[1] } : best),
    { signal: null as ValuePulseSignal | null, count: 0 },
  ).signal) ?? null;

  const shownCount = pulseEvents.filter((event) => event.eventName === 'value_pulse_shown').length;
  const submittedCount = submittedEvents.length;
  const dismissedCount = pulseEvents.filter((event) => event.eventName === 'value_pulse_dismissed').length;

  return {
    shownCount,
    submittedCount,
    dismissedCount,
    captureRate: shownCount > 0 ? (submittedCount / shownCount) * 100 : null,
    signalCounts,
    minutesSavedMedian: median(minutesSavedValues),
    minutesSavedP75: p75(minutesSavedValues),
    latestNotes: notes,
    dominantSignal,
  };
}
