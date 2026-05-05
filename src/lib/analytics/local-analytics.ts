import { get, set, update } from 'idb-keyval';
import type { AssistantMode, RescueReason, UIRoute } from '@/lib/store/idb';

const ANALYTICS_EVENTS_KEY = 'mind_analytics_events';
const MAX_ANALYTICS_EVENTS = 1500;

export type ValuePulseSignal = 'time' | 'mental_load' | 'risk' | 'mixed' | 'not_much' | 'unknown';

export type AnalyticsEventName =
  | 'app_launch'
  | 'dump_submitted'
  | 'task_opened'
  | 'first_action_selected'
  | 'reentry_started'
  | 'reentry_understood'
  | 'rescue_triggered'
  | 'rescue_resolved'
  | 'task_completed'
  | 'synthesis_started'
  | 'synthesis_completed'
  | 'synthesis_failed'
  | 'fallback_manual_sort_shown'
  | 'manual_fallback_triggered'
  | 'action_shown'
  | 'action_accepted'
  | 'action_rejected'
  | 'scaffold_started'
  | 'scaffold_completed'
  | 'make_smaller_no_change'
  | 'make_smaller_failed'
  | 'bounce_back_opened'
  | 'bounce_back_resumed'
  | 'reentry_suggestion_selected'
  | 'studio_intent_clicked'
  | 'studio_intent_resolved'
  | 'studio_intent_blocked'
  | 'studio_snapshot_viewed'
  | 'room_file_retry_started'
  | 'room_file_retry_finished'
  | 'room_file_retry_failed'
  | 'ocr_extract_finished'
  | 'primary_source_selected'
  | 'archive_searched'
  | 'overview_opened'
  | 'clarification_shown'
  | 'clarification_answered'
  | 'morning_ritual_shown'
  | 'morning_ritual_skipped'
  | 'morning_ritual_accepted'
  | 'morning_ritual_reentry_suggested'
  | 'morning_ritual_reentry_checkpoint'
  | 'walkthrough_opened'
  | 'healthcheck_passed'
  | 'ollama_unavailable'
  | 'model_missing'
  | 'timeout_fallback'
  | 'retry_clicked'
  | 'retry_success'
  | 'retry_failed'
  | 'time_to_action_ms'
  | 'data_exported'
  | 'data_deleted'
  | 'pinned_item_created'
  | 'weekly_reset_applied'
  | 'client_response_submitted'
  | 'client_resume_submitted'
  | 'reply_draft_copied'
  | 'blocker_detected'
  | 'blocker_addressed'
  | 'workflow_classified'
  | 'recovery_retry_shown'
  | 'recovery_manual_chosen'
  | 'active_context_preserved'
  | 'action_negotiated'
  | 'one_action_accepted_first_try'
  | 'one_action_viewed_alternative'
  | 'one_action_adjustment_clicked'
  | 'step_draft_shown'
  | 'step_evidence_clicked'
  | 'step_not_like_this'
  | 'step_edited'
  | 'step_confirmed'
  | 'reentry_brief_shown'
  | 'catch_up_mode_opened'
  | 'destructive_step_warning_shown'
  | 'destructive_step_confirmed'
  | 'metrics_dashboard_opened'
  | 'value_pulse_shown'
  | 'value_pulse_submitted'
  | 'value_pulse_dismissed';

export interface AnalyticsEventProperties extends Record<string, unknown> {
  room_id?: string;
  roomId?: string;
  room_title?: string;
  roomTitle?: string;
  room_scenario_type?: string;
  roomScenarioType?: string;
  task_id?: string;
  taskId?: string;
  session_id?: string;
  sessionId?: string;
  ui_route?: UIRoute;
  uiRoute?: UIRoute;
  assistant_mode?: AssistantMode;
  assistantMode?: AssistantMode;
  scenario_id?: string;
  scenarioId?: string;
  icp_tag?: string;
  icpTag?: string;
  source_context_count?: number;
  sourceContextCount?: number;
  reentry_gap_days?: number;
  reentryGapDays?: number;
  action_id?: string;
  actionId?: string;
  latency_ms?: number;
  latencyMs?: number;
  rescue_reason?: RescueReason | 'unknown';
  rescueReason?: RescueReason | 'unknown';
  outcome_label?: string;
  outcomeLabel?: string;
  value_pulse_mode?: string;
  valuePulseMode?: string;
  value_pulse_signal?: ValuePulseSignal;
  valuePulseSignal?: ValuePulseSignal;
  value_pulse_minutes_saved?: number;
  valuePulseMinutesSaved?: number;
  value_pulse_note?: string;
  valuePulseNote?: string;
  value_pulse_prompt_id?: string;
  valuePulsePromptId?: string;
  step_id?: string;
  stepId?: string;
  source_ids?: string[];
  sourceIds?: string[];
  confidence_level?: string;
  confidenceLevel?: string;
  confidence_score?: number;
  confidenceScore?: number;
  destructive_risk?: string;
  destructiveRisk?: string;
  time_since_last_active_ms?: number;
  timeSinceLastActiveMs?: number;
  retrieval_enabled?: boolean;
  retrievalEnabled?: boolean;
  file_name?: string;
  fileName?: string;
  file_kind?: string;
  fileKind?: string;
  file_status?: string;
  fileStatus?: string;
  failure_reason?: string;
  failureReason?: string;
  ocr_engine?: string;
  ocrEngine?: string;
  raw_text_length?: number;
  rawTextLength?: number;
  normalized_text_length?: number;
  normalizedTextLength?: number;
  fragmented_run_count?: number;
  fragmentedRunCount?: number;
  space_density?: number;
  spaceDensity?: number;
  normal_word_ratio?: number;
  normalWordRatio?: number;
  page_count_processed?: number;
  pageCountProcessed?: number;
  duration_ms?: number;
  durationMs?: number;
}

export interface LocalAnalyticsEvent {
  id: string;
  eventName: AnalyticsEventName;
  timestamp: number;
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: string;
  taskId?: string;
  sessionId?: string;
  uiRoute?: UIRoute;
  assistantMode?: AssistantMode;
  scenarioId?: string;
  icpTag?: string;
  sourceContextCount?: number;
  reentryGapDays?: number;
  actionId?: string;
  latencyMs?: number;
  rescueReason?: RescueReason | 'unknown';
  outcomeLabel?: string;
  valuePulseMode?: string;
  valuePulseSignal?: ValuePulseSignal;
  valuePulseMinutesSaved?: number;
  valuePulseNote?: string;
  valuePulsePromptId?: string;
  properties: Record<string, unknown>;
}

export interface MetricDistribution {
  count: number;
  values: number[];
  median: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

export interface BusinessLoopSummary {
  totalEvents: number;
  uniqueTaskCount: number;
  taskOpenCount: number;
  firstActionCount: number;
  reentryStartCount: number;
  reentryUnderstoodCount: number;
  rescueTriggeredCount: number;
  rescueResolvedCount: number;
  taskCompletedCount: number;
  timeToNextMoveMs: MetricDistribution;
  reentryTimeMs: MetricDistribution;
  sourceContextCount: MetricDistribution;
  rescueSuccessRate: number | null;
  completionAfterInterruptionRate: number | null;
  repeatUsageRate: number | null;
  conversionRate: number | null;
  valuePulseShownCount: number;
  valuePulseSubmittedCount: number;
  valuePulseDismissedCount: number;
  valuePulseCaptureRate: number | null;
  valuePulseSignalCounts: Record<ValuePulseSignal, number>;
  valuePulseMinutesSaved: MetricDistribution;
  valuePulseLatestNotes: string[];
  dominantValuePulseSignal: ValuePulseSignal | null;
  timeToFirstConfirmedActionMs: MetricDistribution;
  reentryToConfirmedActionRate5m: number | null;
  notLikeThisRate: number | null;
  evidenceClickRate: number | null;
  draftToConfirmConversionRate: number | null;
  destructiveWarningHitRate: number | null;
  ocrFailureRate: number | null;
  ocrGarbledRate: number | null;
  demoPdfReadyRate: number | null;
  ocrRetrySuccessRate: number | null;
}

export interface RoomBusinessSummary {
  roomId: string;
  roomTitle: string;
  roomScenarioType?: string;
  totalEvents: number;
  taskCount: number;
  timeToNextMoveMs: MetricDistribution;
  reentryTimeMs: MetricDistribution;
  rescueSuccessRate: number | null;
  repeatUsageRate: number | null;
  dominantValuePulseSignal: ValuePulseSignal | null;
  reentryToConfirmedActionRate5m: number | null;
  notLikeThisRate: number | null;
}

export interface MonetizationGateSettings {
  baselineTimeToNextMoveMs?: number;
  baselineReentryTimeMs?: number;
  baselineSourceContextCount?: number;
  targetTimeToNextMoveImprovementPct?: number;
  targetReentryImprovementPct?: number;
  targetSourceReductionPct?: number;
  targetRescueSuccessRate?: number;
  pilotCommitCount?: number;
  paidPilotCount?: number;
  wtpLow?: number;
  wtpHigh?: number;
  valueCapturePct?: number;
  positioning?: 'overlay-first' | 'hub-first';
  primaryIcp?: string;
  secondaryIcp?: string;
}

export interface GateStatus {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'stop' | 'missing';
  reason: string;
  value?: string;
  threshold?: string;
}

function pickString(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function sanitizeProperties(properties?: AnalyticsEventProperties) {
  if (!properties) return {};
  try {
    return JSON.parse(JSON.stringify(properties)) as Record<string, unknown>;
  } catch {
    return { ...properties };
  }
}

export function normalizeAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsEventProperties,
  timestamp = Date.now(),
): LocalAnalyticsEvent {
  const safeProperties = sanitizeProperties(properties);
  return {
    id: `${eventName}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    eventName,
    timestamp,
    roomId: pickString(safeProperties, ['room_id', 'roomId']),
    roomTitle: pickString(safeProperties, ['room_title', 'roomTitle']),
    roomScenarioType: pickString(safeProperties, ['room_scenario_type', 'roomScenarioType']),
    taskId: pickString(safeProperties, ['task_id', 'taskId']),
    sessionId: pickString(safeProperties, ['session_id', 'sessionId']),
    uiRoute: pickString(safeProperties, ['ui_route', 'uiRoute']) as UIRoute | undefined,
    assistantMode: pickString(safeProperties, ['assistant_mode', 'assistantMode']) as AssistantMode | undefined,
    scenarioId: pickString(safeProperties, ['scenario_id', 'scenarioId']),
    icpTag: pickString(safeProperties, ['icp_tag', 'icpTag']),
    sourceContextCount: pickNumber(safeProperties, ['source_context_count', 'sourceContextCount']),
    reentryGapDays: pickNumber(safeProperties, ['reentry_gap_days', 'reentryGapDays']),
    actionId: pickString(safeProperties, ['action_id', 'actionId']),
    latencyMs: pickNumber(safeProperties, ['latency_ms', 'latencyMs']),
    rescueReason: pickString(safeProperties, ['rescue_reason', 'rescueReason']) as RescueReason | 'unknown' | undefined,
    outcomeLabel: pickString(safeProperties, ['outcome_label', 'outcomeLabel']),
    valuePulseMode: pickString(safeProperties, ['value_pulse_mode', 'valuePulseMode']),
    valuePulseSignal: pickString(safeProperties, ['value_pulse_signal', 'valuePulseSignal']) as ValuePulseSignal | undefined,
    valuePulseMinutesSaved: pickNumber(safeProperties, ['value_pulse_minutes_saved', 'valuePulseMinutesSaved']),
    valuePulseNote: pickString(safeProperties, ['value_pulse_note', 'valuePulseNote']),
    valuePulsePromptId: pickString(safeProperties, ['value_pulse_prompt_id', 'valuePulsePromptId']),
    properties: safeProperties,
  };
}

export async function appendAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsEventProperties,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const event = normalizeAnalyticsEvent(eventName, properties);
  await update(ANALYTICS_EVENTS_KEY, (value) => {
    const events = Array.isArray(value) ? (value as LocalAnalyticsEvent[]) : [];
    const next = [...events, event];
    return next.slice(-MAX_ANALYTICS_EVENTS);
  });
}

export async function getAnalyticsEvents(): Promise<LocalAnalyticsEvent[]> {
  if (typeof window === 'undefined') return [];
  const value = await get(ANALYTICS_EVENTS_KEY);
  return Array.isArray(value) ? (value as LocalAnalyticsEvent[]) : [];
}

export async function clearAnalyticsEvents(): Promise<void> {
  if (typeof window === 'undefined') return;
  await set(ANALYTICS_EVENTS_KEY, []);
}

function toGroupKey(event: LocalAnalyticsEvent) {
  return event.taskId || event.sessionId || `${event.eventName}-${event.timestamp}`;
}

function toSorted(values: number[]) {
  return [...values].sort((left, right) => left - right);
}

function buildDistribution(values: number[]): MetricDistribution {
  if (values.length === 0) {
    return { count: 0, values: [], median: null, p75: null, min: null, max: null };
  }

  const sorted = toSorted(values);
  const medianIndex = Math.floor((sorted.length - 1) / 2);
  const p75Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));

  return {
    count: sorted.length,
    values: sorted,
    median: sorted[medianIndex] ?? null,
    p75: sorted[p75Index] ?? null,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

function pairDurations(events: LocalAnalyticsEvent[], startEvent: AnalyticsEventName, endEvent: AnalyticsEventName) {
  const groups = new Map<string, LocalAnalyticsEvent[]>();
  for (const event of events) {
    if (event.eventName !== startEvent && event.eventName !== endEvent) continue;
    const groupKey = toGroupKey(event);
    const group = groups.get(groupKey) ?? [];
    group.push(event);
    groups.set(groupKey, group);
  }

  const durations: number[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => left.timestamp - right.timestamp);
    const pendingStarts: LocalAnalyticsEvent[] = [];

    for (const event of sorted) {
      if (event.eventName === startEvent) {
        pendingStarts.push(event);
        continue;
      }

      if (event.eventName === endEvent && pendingStarts.length > 0) {
        const start = pendingStarts.pop();
        if (start && event.timestamp >= start.timestamp) {
          durations.push(event.timestamp - start.timestamp);
        }
      }
    }
  }

  return durations;
}

function countEvents(events: LocalAnalyticsEvent[], eventName: AnalyticsEventName) {
  return events.filter((event) => event.eventName === eventName).length;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function propertyString(event: LocalAnalyticsEvent, ...keys: string[]) {
  for (const key of keys) {
    const value = event.properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function countReentryConfirmationsWithin(events: LocalAnalyticsEvent[], windowMs: number) {
  const sorted = [...events].sort((left, right) => left.timestamp - right.timestamp);
  const reentryEvents = sorted.filter(
    (event) => event.eventName === 'reentry_brief_shown' || event.eventName === 'catch_up_mode_opened',
  );
  const confirmedEvents = sorted.filter((event) => event.eventName === 'step_confirmed');
  let confirmed = 0;

  for (const reentryEvent of reentryEvents) {
    const key = toGroupKey(reentryEvent);
    const hasConfirmed = confirmedEvents.some(
      (event) =>
        toGroupKey(event) === key &&
        event.timestamp >= reentryEvent.timestamp &&
        event.timestamp - reentryEvent.timestamp <= windowMs,
    );
    if (hasConfirmed) confirmed += 1;
  }

  return { reentryCount: reentryEvents.length, confirmed };
}

function collectTaskIds(events: LocalAnalyticsEvent[]) {
  const taskIds = new Set<string>();
  for (const event of events) {
    const key = event.taskId || event.sessionId;
    if (key) taskIds.add(key);
  }
  return taskIds;
}

export function buildBusinessLoopSummary(events: LocalAnalyticsEvent[]): BusinessLoopSummary {
  const taskOpenedDurations = pairDurations(events, 'task_opened', 'first_action_selected');
  const confirmedActionDurations = pairDurations(events, 'task_opened', 'step_confirmed');
  const reentryDurations = pairDurations(events, 'reentry_started', 'reentry_understood');
  const reentryConfirmations = countReentryConfirmationsWithin(events, 1000 * 60 * 5);
  const taskIds = collectTaskIds(events);
  const valuePulseEvents = events.filter(
    (event) =>
      event.eventName === 'value_pulse_shown' ||
      event.eventName === 'value_pulse_dismissed' ||
      event.eventName === 'value_pulse_submitted',
  );
  const valuePulseSubmittedEvents = valuePulseEvents.filter((event) => event.eventName === 'value_pulse_submitted');
  const valuePulseShownCount = valuePulseEvents.filter((event) => event.eventName === 'value_pulse_shown').length;
  const valuePulseDismissedCount = valuePulseEvents.filter((event) => event.eventName === 'value_pulse_dismissed').length;

  const sourceContextValues = events
    .filter((event) => event.eventName === 'task_opened' && typeof event.sourceContextCount === 'number')
    .map((event) => event.sourceContextCount as number);

  const rescueTriggeredCount = countEvents(events, 'rescue_triggered');
  const rescueResolvedCount = countEvents(events, 'rescue_resolved');
  const draftShownCount = countEvents(events, 'step_draft_shown');
  const stepConfirmedCount = countEvents(events, 'step_confirmed');
  const notLikeThisCount = countEvents(events, 'step_not_like_this');
  const evidenceClickCount = countEvents(events, 'step_evidence_clicked');
  const destructiveWarningCount = countEvents(events, 'destructive_step_warning_shown');
  const destructiveConfirmedCount = countEvents(events, 'destructive_step_confirmed');
  const extractEvents = events.filter((event) => event.eventName === 'ocr_extract_finished');
  const ocrCandidateEvents = extractEvents.filter((event) => {
    const kind = propertyString(event, 'file_kind', 'fileKind');
    return kind === 'pdf' || kind === 'image';
  });
  const failedOcrEvents = ocrCandidateEvents.filter((event) => {
    const status = propertyString(event, 'file_status', 'fileStatus');
    return status === 'failed' || status === 'failed_extraction' || status === 'unreadable';
  });
  const garbledOcrEvents = ocrCandidateEvents.filter((event) => propertyString(event, 'failure_reason', 'failureReason') === 'pdf_text_garbled_after_ocr');
  const demoPdfEvents = extractEvents.filter((event) => {
    const kind = propertyString(event, 'file_kind', 'fileKind');
    const fileName = propertyString(event, 'file_name', 'fileName') ?? '';
    return kind === 'pdf' && fileName.startsWith('mind-demo-');
  });
  const readyDemoPdfEvents = demoPdfEvents.filter((event) => propertyString(event, 'file_status', 'fileStatus') === 'ready');
  const retryFinishedEvents = events.filter((event) => event.eventName === 'room_file_retry_finished');
  const retrySuccessEvents = retryFinishedEvents.filter((event) => propertyString(event, 'status', 'file_status', 'fileStatus') === 'ready');
  const completedTasks = new Set(
    events.filter((event) => event.eventName === 'task_completed').map((event) => toGroupKey(event)),
  );
  const interruptedTasks = new Set(
    events
      .filter((event) => event.eventName === 'reentry_started' || event.eventName === 'rescue_triggered')
      .map((event) => toGroupKey(event)),
  );
  const taskOpenedTasks = new Set(
    events.filter((event) => event.eventName === 'task_opened').map((event) => toGroupKey(event)),
  );

  const repeatUsageTasks = new Set<string>();
  for (const taskId of taskOpenedTasks) {
    const openCount = events.filter((event) => event.eventName === 'task_opened' && toGroupKey(event) === taskId).length;
    if (openCount > 1) repeatUsageTasks.add(taskId);
  }

  const interruptedAndCompleted = [...interruptedTasks].filter((taskId) => completedTasks.has(taskId));
  const valuePulseSignalCounts: Record<ValuePulseSignal, number> = {
    time: 0,
    mental_load: 0,
    risk: 0,
    mixed: 0,
    not_much: 0,
    unknown: 0,
  };
  const valuePulseMinutesSaved: number[] = [];
  const valuePulseLatestNotes = valuePulseSubmittedEvents
    .map((event) => event.valuePulseNote ?? event.properties.value_pulse_note ?? event.properties.valuePulseNote)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice()
    .reverse()
    .slice(0, 3);

  for (const event of valuePulseSubmittedEvents) {
    const rawSignal = event.valuePulseSignal ?? event.properties.value_pulse_signal ?? event.properties.valuePulseSignal;
    const signal = typeof rawSignal === 'string' && rawSignal in valuePulseSignalCounts
      ? rawSignal as ValuePulseSignal
      : 'unknown';
    valuePulseSignalCounts[signal] += 1;

    const rawMinutes = event.valuePulseMinutesSaved ?? event.properties.value_pulse_minutes_saved ?? event.properties.valuePulseMinutesSaved;
    if (typeof rawMinutes === 'number' && Number.isFinite(rawMinutes) && rawMinutes >= 0) {
      valuePulseMinutesSaved.push(rawMinutes);
    }
  }

  const dominantValuePulseSignal = (Object.entries(valuePulseSignalCounts).reduce(
    (best, current) => (current[1] > best.count ? { signal: current[0] as ValuePulseSignal, count: current[1] } : best),
    { signal: null as ValuePulseSignal | null, count: 0 },
  ).signal) ?? null;

  return {
    totalEvents: events.length,
    uniqueTaskCount: taskIds.size,
    taskOpenCount: events.filter((event) => event.eventName === 'task_opened').length,
    firstActionCount: events.filter((event) => event.eventName === 'first_action_selected').length,
    reentryStartCount: events.filter((event) => event.eventName === 'reentry_started').length,
    reentryUnderstoodCount: events.filter((event) => event.eventName === 'reentry_understood').length,
    rescueTriggeredCount,
    rescueResolvedCount,
    taskCompletedCount: completedTasks.size,
    timeToNextMoveMs: buildDistribution(taskOpenedDurations),
    reentryTimeMs: buildDistribution(reentryDurations),
    sourceContextCount: buildDistribution(sourceContextValues),
    rescueSuccessRate: rescueTriggeredCount > 0 ? (rescueResolvedCount / rescueTriggeredCount) * 100 : null,
    completionAfterInterruptionRate: interruptedTasks.size > 0 ? (interruptedAndCompleted.length / interruptedTasks.size) * 100 : null,
    repeatUsageRate: taskOpenedTasks.size > 0 ? (repeatUsageTasks.size / taskOpenedTasks.size) * 100 : null,
    conversionRate: taskOpenedTasks.size > 0 ? (completedTasks.size / taskOpenedTasks.size) * 100 : null,
    valuePulseShownCount,
    valuePulseSubmittedCount: valuePulseSubmittedEvents.length,
    valuePulseDismissedCount,
    valuePulseCaptureRate: valuePulseShownCount > 0
      ? (valuePulseSubmittedEvents.length / valuePulseShownCount) * 100
      : null,
    valuePulseSignalCounts,
    valuePulseMinutesSaved: buildDistribution(valuePulseMinutesSaved),
    valuePulseLatestNotes,
    dominantValuePulseSignal,
    timeToFirstConfirmedActionMs: buildDistribution(confirmedActionDurations),
    reentryToConfirmedActionRate5m: ratio(reentryConfirmations.confirmed, reentryConfirmations.reentryCount),
    notLikeThisRate: ratio(notLikeThisCount, draftShownCount),
    evidenceClickRate: ratio(evidenceClickCount, draftShownCount),
    draftToConfirmConversionRate: ratio(stepConfirmedCount, draftShownCount),
    destructiveWarningHitRate: ratio(destructiveConfirmedCount, destructiveWarningCount),
    ocrFailureRate: ratio(failedOcrEvents.length, ocrCandidateEvents.length),
    ocrGarbledRate: ratio(garbledOcrEvents.length, ocrCandidateEvents.length),
    demoPdfReadyRate: ratio(readyDemoPdfEvents.length, demoPdfEvents.length),
    ocrRetrySuccessRate: ratio(retrySuccessEvents.length, retryFinishedEvents.length),
  };
}

export function buildBusinessLoopSummaryByRoom(events: LocalAnalyticsEvent[]): RoomBusinessSummary[] {
  const groups = new Map<string, LocalAnalyticsEvent[]>();

  for (const event of events) {
    if (!event.roomId) continue;
    const group = groups.get(event.roomId) ?? [];
    group.push(event);
    groups.set(event.roomId, group);
  }

  return [...groups.entries()]
    .map(([roomId, roomEvents]) => {
      const summary = buildBusinessLoopSummary(roomEvents);
      const firstLabeledEvent = roomEvents.find((event) => event.roomTitle);
      return {
        roomId,
        roomTitle: firstLabeledEvent?.roomTitle ?? 'ห้องนี้',
        roomScenarioType: firstLabeledEvent?.roomScenarioType,
        totalEvents: roomEvents.length,
        taskCount: summary.uniqueTaskCount,
        timeToNextMoveMs: summary.timeToNextMoveMs,
        reentryTimeMs: summary.reentryTimeMs,
        rescueSuccessRate: summary.rescueSuccessRate,
        repeatUsageRate: summary.repeatUsageRate,
        dominantValuePulseSignal: summary.dominantValuePulseSignal,
        reentryToConfirmedActionRate5m: summary.reentryToConfirmedActionRate5m,
        notLikeThisRate: summary.notLikeThisRate,
      };
    })
    .sort((left, right) => right.totalEvents - left.totalEvents);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function statusFromComparison(
  current: number | null,
  baseline: number | undefined,
  direction: 'lower' | 'higher',
  targetImprovementPct: number,
  id: string,
  label: string,
) {
  if (!baseline || baseline <= 0 || current === null) {
    return {
      id,
      label,
      status: 'missing' as const,
      reason: 'ยังไม่มี baseline ที่ใช้เปรียบเทียบ',
      value: current === null ? 'ไม่มีข้อมูล' : `${Math.round(current)}ms`,
      threshold: `ต้องมี baseline และดีขึ้นอย่างน้อย ${targetImprovementPct}%`,
    };
  }

  const improvementPct = direction === 'lower'
    ? ((baseline - current) / baseline) * 100
    : ((current - baseline) / baseline) * 100;
  const valueText = `${Math.round(current)}ms`;
  if (improvementPct >= targetImprovementPct) {
    return {
      id,
      label,
      status: 'pass' as const,
      reason: `ดีขึ้น ${Math.round(improvementPct)}% จาก baseline`,
      value: valueText,
      threshold: `≥ ${targetImprovementPct}%`,
    };
  }
  if (improvementPct >= targetImprovementPct * 0.6) {
    return {
      id,
      label,
      status: 'warn' as const,
      reason: `ดีขึ้น ${Math.round(improvementPct)}% แต่ยังไม่ถึง threshold`,
      value: valueText,
      threshold: `≥ ${targetImprovementPct}%`,
    };
  }
  return {
    id,
    label,
    status: 'stop' as const,
    reason: `ยังดีขึ้นไม่พอ (${Math.round(improvementPct)}%)`,
    value: valueText,
    threshold: `≥ ${targetImprovementPct}%`,
  };
}

function percentGate(
  current: number | null,
  target: number,
  label: string,
  higherIsBetter = true,
) {
  if (current === null) {
    return {
      id: label,
      label,
      status: 'missing' as const,
      reason: 'ยังไม่มีข้อมูลพอประเมิน',
      value: 'ไม่มีข้อมูล',
      threshold: `${higherIsBetter ? '≥' : '≤'} ${target}%`,
    };
  }
  const pass = higherIsBetter ? current >= target : current <= target;
  const warnBand = higherIsBetter ? current >= target * 0.85 : current <= target * 1.15;
  return {
    id: label,
    label,
    status: pass ? ('pass' as const) : warnBand ? ('warn' as const) : ('stop' as const),
    reason: pass
      ? `ถึงเกณฑ์ ${Math.round(current)}%`
      : warnBand
        ? `ใกล้เกณฑ์ ${Math.round(current)}%`
        : `ยังไม่ถึงเกณฑ์ ${Math.round(current)}%`,
    value: formatPercent(current),
    threshold: `${higherIsBetter ? '≥' : '≤'} ${target}%`,
  };
}

export function buildRoadmapGateEvaluations(
  summary: BusinessLoopSummary,
  settings: MonetizationGateSettings,
): GateStatus[] {
  const timeImprovementTarget = settings.targetTimeToNextMoveImprovementPct ?? 35;
  const reentryImprovementTarget = settings.targetReentryImprovementPct ?? 25;
  const sourceReductionTarget = settings.targetSourceReductionPct ?? 30;
  const rescueTarget = settings.targetRescueSuccessRate ?? 70;

  const timeGate = (() => {
    const baseline = settings.baselineTimeToNextMoveMs;
    if (!baseline || baseline <= 0 || summary.timeToNextMoveMs.median === null) {
      return {
        id: 'time-to-next-move',
        label: 'Time-to-next-move',
        status: 'missing' as const,
        reason: 'ต้องมี baseline median ของ time-to-next-move ก่อน',
        value: summary.timeToNextMoveMs.median === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.timeToNextMoveMs.median)}ms`,
        threshold: `baseline + ${timeImprovementTarget}% improvement`,
      };
    }
    return statusFromComparison(
      summary.timeToNextMoveMs.median,
      baseline,
      'lower',
      timeImprovementTarget,
      'time-to-next-move',
      'Time-to-next-move',
    );
  })();

  const reentryGate = (() => {
    const baseline = settings.baselineReentryTimeMs;
    if (!baseline || baseline <= 0 || summary.reentryTimeMs.median === null) {
      return {
        id: 'reentry-time',
        label: 'Reentry time',
        status: 'missing' as const,
        reason: 'ต้องมี baseline median ของ reentry time ก่อน',
        value: summary.reentryTimeMs.median === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.reentryTimeMs.median)}ms`,
        threshold: `baseline + ${reentryImprovementTarget}% improvement`,
      };
    }
    return statusFromComparison(
      summary.reentryTimeMs.median,
      baseline,
      'lower',
      reentryImprovementTarget,
      'reentry-time',
      'Reentry time',
    );
  })();

  const sourceGate = (() => {
    const baseline = settings.baselineSourceContextCount;
    if (!baseline || baseline <= 0 || summary.sourceContextCount.median === null) {
      return {
        id: 'reread-reduction',
        label: 'Reread reduction proxy',
        status: 'missing' as const,
        reason: 'ต้องมี baseline context count ก่อน',
        value: summary.sourceContextCount.median === null ? 'ไม่มีข้อมูล' : `${Math.round(summary.sourceContextCount.median)} items`,
        threshold: `baseline ลดลง ${sourceReductionTarget}%`,
      };
    }
    const reductionPct = ((baseline - summary.sourceContextCount.median) / baseline) * 100;
    if (reductionPct >= sourceReductionTarget) {
      return {
        id: 'reread-reduction',
        label: 'Reread reduction proxy',
        status: 'pass' as const,
        reason: `ลดลง ${Math.round(reductionPct)}% จาก baseline`,
        value: `${Math.round(summary.sourceContextCount.median)} items`,
        threshold: `≥ ${sourceReductionTarget}%`,
      };
    }
    if (reductionPct >= sourceReductionTarget * 0.6) {
      return {
        id: 'reread-reduction',
        label: 'Reread reduction proxy',
        status: 'warn' as const,
        reason: `ยังลดลงไม่พอ (${Math.round(reductionPct)}%)`,
        value: `${Math.round(summary.sourceContextCount.median)} items`,
        threshold: `≥ ${sourceReductionTarget}%`,
      };
    }
    return {
      id: 'reread-reduction',
      label: 'Reread reduction proxy',
      status: 'stop' as const,
      reason: `ยังลดลงไม่พอ (${Math.round(reductionPct)}%)`,
      value: `${Math.round(summary.sourceContextCount.median)} items`,
      threshold: `≥ ${sourceReductionTarget}%`,
    };
  })();

  const rescueGate = percentGate(summary.rescueSuccessRate, rescueTarget, 'Rescue success rate');

  const commercialGate = (() => {
    if (
      typeof settings.wtpLow !== 'number' ||
      typeof settings.wtpHigh !== 'number' ||
      typeof settings.valueCapturePct !== 'number'
    ) {
      return {
        id: 'commercial-proof',
        label: 'Commercial proof',
        status: 'missing' as const,
        reason: 'ยังต้องกรอก WTP range และ value capture rule',
        value: 'ไม่มีข้อมูล',
        threshold: 'WTP range + 10–20% value capture',
      };
    }

    const captureRuleOkay = settings.valueCapturePct >= 10 && settings.valueCapturePct <= 20;
    const wtpOkay = settings.wtpHigh > 0 && settings.wtpHigh >= settings.wtpLow;
    const paidPilotOkay = (settings.paidPilotCount ?? 0) > 0;
    const commitOkay = (settings.pilotCommitCount ?? 0) > 0;

    if (captureRuleOkay && wtpOkay && (paidPilotOkay || commitOkay)) {
      return {
        id: 'commercial-proof',
        label: 'Commercial proof',
        status: 'pass' as const,
        reason: 'WTP และ value capture อยู่ในกรอบที่ใช้งานได้',
        value: `${settings.wtpLow}–${settings.wtpHigh}`,
        threshold: '10–20% capture + commitment',
      };
    }

    return {
      id: 'commercial-proof',
      label: 'Commercial proof',
      status: 'warn' as const,
      reason: 'ยังต้องคุม value capture rule / paid signal ให้ชัดขึ้น',
      value: `${settings.wtpLow}–${settings.wtpHigh}`,
      threshold: '10–20% capture + commitment',
    };
  })();

  return [timeGate, reentryGate, sourceGate, rescueGate, commercialGate];
}
