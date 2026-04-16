import { del, get, set, update } from 'idb-keyval';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type { TaskShape } from '@/lib/ai/task-shape';
import {
  buildBusinessLoopSummary,
  clearAnalyticsEvents,
  getAnalyticsEvents,
  type BusinessLoopSummary,
  type LocalAnalyticsEvent,
} from '@/lib/analytics/local-analytics';
import {
  composeRoomSourceText,
  normalizeRoomSourceFiles,
  type RoomSourceFile,
} from '@/lib/room';

export type ActionState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
export type WorkflowType = 'client_response' | 'client_resume';
export type RoomScenarioType =
  | 'client_project_restart'
  | 'sales_inquiry_demo_request'
  | 'general_client_room';
export type UIRoute =
  | 'DUMP_ENTRY'
  | 'MORNING_RITUAL'
  | 'SYNTHESIZING'
  | 'CLARIFICATION'
  | 'ONE_ACTION'
  | 'DECISION_BOARD'
  | 'SCAFFOLD'
  | 'RESCUE'
  | 'BOUNCE_BACK'
  | 'MANUAL_FALLBACK';
export type SessionStatus = UIRoute;
export type TaskLifecycleState =
  | 'dumped'
  | 'synthesizing'
  | 'clarification_needed'
  | 'has_one_action'
  | 'in_scaffold'
  | 'stalled'
  | 'done'
  | 'failed';
export type AiFailureReason =
  | 'service_down'
  | 'model_missing'
  | 'runtime_boot_failed'
  | 'metal_init_failed'
  | 'request_timeout'
  | 'unknown';

export type PendingInputKind = 'clarification' | 'manual_rescue';
export type AssistantMode =
  | 'intake_review'
  | 'action_negotiation'
  | 'scaffold_refinement'
  | 'scaffold_completion'
  | 'rescue_diagnosis'
  | 'reentry_brief';
export type RescueReason =
  | 'missing_context'
  | 'dependency'
  | 'unclear_scope'
  | 'too_big'
  | 'low_energy'
  | 'unknown';
export type RescueMode =
  | 'clarify'
  | 'follow_up'
  | 'shrink'
  | 'switch_track'
  | 'pause_cleanly';
export type ReentryImpact = 'high' | 'medium';
export type ReentryEffort = 'low' | 'medium';
export type ReentryResumeTarget = 'ONE_ACTION' | 'SCAFFOLD' | 'DUMP_ENTRY';
export type RoomAiFreshness = 'fresh' | 'stale' | 'fallback';
export type AiOperationName =
  | 'intake'
  | 'action'
  | 'scaffold'
  | 'rescue'
  | 'reentry';

export interface PendingInput {
  kind: PendingInputKind;
  prompt?: string;
  answer: string;
  createdAt: number;
}

export interface TaskFrame {
  objective: string;
  stage: string;
  stakeholders: string[];
}

export interface CurrentPlanStep {
  id: string;
  text: string;
  expectedOutcome?: string;
  canAutoDraft?: boolean;
}

export interface CurrentPlan {
  actionTitle: string;
  successSignal?: string;
  steps: CurrentPlanStep[];
}

export interface RescueHistoryItem {
  reason: RescueReason;
  mode: RescueMode;
  createdAt: number;
}

export interface ReentryTopAction {
  roomId: string;
  title: string;
  rationale: string;
  impact: ReentryImpact;
  effort: ReentryEffort;
  resumeTarget: ReentryResumeTarget;
}

export interface ReentryBrief {
  summary: string;
  topActions: ReentryTopAction[];
  ignoredNoise: string[];
  createdAt: number;
}

export interface TaskConstraints {
  timeBudgetMin?: number;
  energyLevel?: 'low' | 'medium' | 'high';
  preferReplyFirst?: boolean;
}

export interface OneActionTracking {
  hasViewedAlternative: boolean;
  hasAdjusted: boolean;
}

export interface ActiveDumpContext {
  text: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
}

export interface CreateTaskContextInput {
  roomId?: string;
  sourceText: string;
  workflowType?: WorkflowType;
  taskShape?: TaskShape;
  createdAt?: number;
  sourceFiles?: RoomSourceFile[];
  extractedText?: string;
  pendingInputs?: PendingInput[];
  blockerSignals?: string[];
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
  lastSynthesis?: AiSynthesisResponse;
  lifecycleState?: TaskLifecycleState;
  currentStepIndex?: number;
  currentActionId?: string | null;
}

export interface TaskContext {
  id: string;
  roomId?: string;
  workflowType?: WorkflowType;
  taskShape?: TaskShape;
  sourceText: string;
  sourceFiles: RoomSourceFile[];
  extractedText: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
  pendingInputs: PendingInput[];
  blockerSignals: string[];
  lastSynthesis?: AiSynthesisResponse;
  lifecycleState: TaskLifecycleState;
  currentStepIndex: number;
  currentActionId: string | null;
  taskFrame?: TaskFrame;
  currentPlan?: CurrentPlan;
  rescueHistory: RescueHistoryItem[];
  constraints?: TaskConstraints;
  actionExplanation?: string;
  reentryBrief?: ReentryBrief;
  lastStableSummary?: string;
  assistantMode?: AssistantMode;
  lastAiOperation?: AiOperationName;
  oneActionTracking?: OneActionTracking;
}

export interface Action {
  id: string;
  roomId?: string;
  createdAt: number;
  title: string;
  rationale: string;
  microSteps: string[];
  isPinned: boolean;
  state: ActionState;
  workflowType?: WorkflowType;
  situationSummary?: string;
  replyDraft?: string;
  detectedBlockers?: string[];
}

export interface AppSession {
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: RoomScenarioType;
  lastActive: number;
  uiRoute: UIRoute;
  status?: SessionStatus;
  notThisCount: number;
  currentActionId: string | null;
  task?: TaskContext;
  activeDumpContext?: ActiveDumpContext;
  currentPayload?: AiSynthesisResponse;
  lastMorningShown?: string;
  hasSeenResetNotice?: boolean;
  hasSeenWalkthrough?: boolean;
  lastWorkflowType?: WorkflowType;
  lastFailureReason?: AiFailureReason;
}

export interface MindExport {
  exportedAt: string;
  session: AppSession;
  actions: Action[];
  rooms: RoomRecord[];
  roomWorkspace: RoomWorkspace;
  analytics: {
    events: LocalAnalyticsEvent[];
    summary: BusinessLoopSummary;
  };
}

export interface RoomRecord {
  id: string;
  title: string;
  clientName: string;
  scenarioType: RoomScenarioType;
  lastState: UIRoute;
  lastReentryBrief?: ReentryBrief;
  lastKnownGoodBrief?: string;
  lastKnownGoodNextMoves: string[];
  lastKnownGoodAt?: number;
  aiFreshness: RoomAiFreshness;
  lastUpdatedAt: number;
  unread: boolean;
  stale: boolean;
  contextSummary: string;
  nextMoves: string[];
  session: AppSession;
}

export interface RoomWorkspace {
  activeRoomId: string | null;
  rooms: RoomRecord[];
  lastUpdatedAt: number;
}

const SESSION_KEY = 'mind_session';
const ACTIONS_KEY = 'mind_actions';
const ROOM_WORKSPACE_KEY = 'mind_room_workspace_v1';
const DEFAULT_ROOM_TITLE = 'ห้องงานใหม่';

const DEFAULT_TASK_LIFECYCLE_BY_ROUTE: Record<UIRoute, TaskLifecycleState> = {
  DUMP_ENTRY: 'dumped',
  MORNING_RITUAL: 'dumped',
  SYNTHESIZING: 'synthesizing',
  CLARIFICATION: 'clarification_needed',
  ONE_ACTION: 'has_one_action',
  DECISION_BOARD: 'has_one_action',
  SCAFFOLD: 'in_scaffold',
  RESCUE: 'stalled',
  BOUNCE_BACK: 'stalled',
  MANUAL_FALLBACK: 'failed',
};

const ROUTES_KEEPING_SESSION_PRIORITY: ReadonlySet<UIRoute> = new Set([
  'MORNING_RITUAL',
  'DECISION_BOARD',
  'BOUNCE_BACK',
]);

function isRoute(value: unknown): value is UIRoute {
  return (
    value === 'DUMP_ENTRY' ||
    value === 'MORNING_RITUAL' ||
    value === 'SYNTHESIZING' ||
    value === 'CLARIFICATION' ||
    value === 'ONE_ACTION' ||
    value === 'DECISION_BOARD' ||
    value === 'SCAFFOLD' ||
    value === 'RESCUE' ||
    value === 'BOUNCE_BACK' ||
    value === 'MANUAL_FALLBACK'
  );
}

function isTaskLifecycleState(value: unknown): value is TaskLifecycleState {
  return (
    value === 'dumped' ||
    value === 'synthesizing' ||
    value === 'clarification_needed' ||
    value === 'has_one_action' ||
    value === 'in_scaffold' ||
    value === 'stalled' ||
    value === 'done' ||
    value === 'failed'
  );
}

function isWorkflowType(value: unknown): value is WorkflowType {
  return value === 'client_response' || value === 'client_resume';
}

function isRoomScenarioType(value: unknown): value is RoomScenarioType {
  return (
    value === 'client_project_restart' ||
    value === 'sales_inquiry_demo_request' ||
    value === 'general_client_room'
  );
}

function isFailureReason(value: unknown): value is AiFailureReason {
  return (
    value === 'service_down' ||
    value === 'model_missing' ||
    value === 'runtime_boot_failed' ||
    value === 'metal_init_failed' ||
    value === 'request_timeout' ||
    value === 'unknown'
  );
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePendingInputs(value: unknown): PendingInput[] {
  if (!Array.isArray(value)) return [];
  const normalized: PendingInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind: PendingInputKind | undefined = record.kind === 'clarification' || record.kind === 'manual_rescue'
      ? record.kind
      : undefined;
    const answer = normalizeOptionalString(record.answer);
    if (!kind || !answer) continue;
    const prompt = normalizeOptionalString(record.prompt);
    const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
    normalized.push({
      kind,
      prompt,
      answer,
      createdAt,
    });
  }

  return normalized;
}

function normalizeTaskFrame(value: unknown): TaskFrame | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const objective = normalizeOptionalString(record.objective);
  const stage = normalizeOptionalString(record.stage);
  const stakeholders = Array.isArray(record.stakeholders)
    ? record.stakeholders.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
    : [];

  if (!objective || !stage) return undefined;
  return { objective, stage, stakeholders };
}

function normalizeCurrentPlan(value: unknown): CurrentPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const actionTitle = normalizeOptionalString(record.actionTitle);
  if (!actionTitle) return undefined;
  const successSignal = normalizeOptionalString(record.successSignal);
  const steps: CurrentPlanStep[] = Array.isArray(record.steps)
    ? record.steps.reduce<CurrentPlanStep[]>((acc, step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) return acc;
        const stepRecord = step as Record<string, unknown>;
        const text = normalizeOptionalString(stepRecord.text);
        if (!text) return acc;
        const id = normalizeOptionalString(stepRecord.id) ?? `step-${index + 1}`;
        const expectedOutcome = normalizeOptionalString(stepRecord.expectedOutcome);
        const canAutoDraft = typeof stepRecord.canAutoDraft === 'boolean' ? stepRecord.canAutoDraft : undefined;
        acc.push({ id, text, expectedOutcome, canAutoDraft });
        return acc;
      }, [])
    : [];

  return {
    actionTitle,
    successSignal,
    steps,
  };
}

function normalizeTaskShape(value: unknown): TaskShape | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const deliverableType =
    record.deliverableType === 'reply' ||
    record.deliverableType === 'proposal' ||
    record.deliverableType === 'timeline' ||
    record.deliverableType === 'estimate' ||
    record.deliverableType === 'execution' ||
    record.deliverableType === 'unknown'
      ? record.deliverableType
      : undefined;
  const immediateNeed =
    record.immediateNeed === 'send_reply_now' ||
    record.immediateNeed === 'define_scope' ||
    record.immediateNeed === 'prepare_inputs' ||
    record.immediateNeed === 'resume_execution'
      ? record.immediateNeed
      : undefined;
  const missingInputs = Array.isArray(record.missingInputs)
    ? record.missingInputs.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
    : [];
  const workContext = normalizeOptionalString(record.workContext);
  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : undefined;

  if (!deliverableType || !immediateNeed || !workContext) return undefined;

  return {
    deliverableType,
    immediateNeed,
    missingInputs,
    workContext,
    confidence,
  };
}

function normalizeRescueHistory(value: unknown): RescueHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const reason =
        record.reason === 'missing_context' ||
        record.reason === 'dependency' ||
        record.reason === 'unclear_scope' ||
        record.reason === 'too_big' ||
        record.reason === 'low_energy' ||
        record.reason === 'unknown'
          ? record.reason
          : undefined;
      const mode =
        record.mode === 'clarify' ||
        record.mode === 'follow_up' ||
        record.mode === 'shrink' ||
        record.mode === 'switch_track' ||
        record.mode === 'pause_cleanly'
          ? record.mode
          : undefined;
      if (!reason || !mode) return undefined;
      const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
      return { reason, mode, createdAt };
    })
    .filter((item): item is RescueHistoryItem => Boolean(item));
}

function normalizeConstraints(value: unknown): TaskConstraints | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const timeBudgetMin = typeof record.timeBudgetMin === 'number' ? record.timeBudgetMin : undefined;
  const energyLevel =
    record.energyLevel === 'low' || record.energyLevel === 'medium' || record.energyLevel === 'high'
      ? record.energyLevel
      : undefined;
  const preferReplyFirst = typeof record.preferReplyFirst === 'boolean' ? record.preferReplyFirst : undefined;

  if (timeBudgetMin === undefined && energyLevel === undefined && preferReplyFirst === undefined) {
    return undefined;
  }

  return { timeBudgetMin, energyLevel, preferReplyFirst };
}

function normalizeReentryBrief(value: unknown): ReentryBrief | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const summary = normalizeOptionalString(record.summary);
  if (!summary) return undefined;
  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
  const ignoredNoise = Array.isArray(record.ignoredNoise)
    ? record.ignoredNoise.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
    : [];
  const topActions = Array.isArray(record.topActions)
    ? record.topActions.reduce<ReentryTopAction[]>((acc, item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
        const actionRecord = item as Record<string, unknown>;
        const roomId = normalizeOptionalString(actionRecord.roomId);
        const title = normalizeOptionalString(actionRecord.title);
        const rationale = normalizeOptionalString(actionRecord.rationale);
        const impact = actionRecord.impact === 'high' || actionRecord.impact === 'medium'
          ? actionRecord.impact
          : undefined;
        const effort = actionRecord.effort === 'low' || actionRecord.effort === 'medium'
          ? actionRecord.effort
          : undefined;
        const resumeTarget =
          actionRecord.resumeTarget === 'ONE_ACTION' ||
          actionRecord.resumeTarget === 'SCAFFOLD' ||
          actionRecord.resumeTarget === 'DUMP_ENTRY'
            ? actionRecord.resumeTarget
            : undefined;

        if (!roomId || !title || !rationale || !impact || !effort || !resumeTarget) return acc;
        acc.push({
          roomId,
          title,
          rationale,
          impact,
          effort,
          resumeTarget,
        });
        return acc;
      }, [])
    : [];

  if (topActions.length === 0) return undefined;
  return { summary, topActions, ignoredNoise, createdAt };
}

function normalizeAssistantMode(value: unknown): AssistantMode | undefined {
  return (
    value === 'intake_review' ||
    value === 'action_negotiation' ||
    value === 'scaffold_refinement' ||
    value === 'scaffold_completion' ||
    value === 'rescue_diagnosis' ||
    value === 'reentry_brief'
  )
    ? value
    : undefined;
}

function normalizeAiOperationName(value: unknown): AiOperationName | undefined {
  return (
    value === 'intake' ||
    value === 'action' ||
    value === 'scaffold' ||
    value === 'rescue' ||
    value === 'reentry'
  )
    ? value
    : undefined;
}

function normalizeRoomAiFreshness(value: unknown): RoomAiFreshness | undefined {
  return value === 'fresh' || value === 'stale' || value === 'fallback'
    ? value
    : undefined;
}

function normalizeOneActionTracking(value: unknown): OneActionTracking | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const hasViewedAlternative = typeof record.hasViewedAlternative === 'boolean'
    ? record.hasViewedAlternative
    : false;
  const hasAdjusted = typeof record.hasAdjusted === 'boolean'
    ? record.hasAdjusted
    : false;

  if (!hasViewedAlternative && !hasAdjusted) return undefined;
  return { hasViewedAlternative, hasAdjusted };
}

function looksGenericRoomTitle(value?: string) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === DEFAULT_ROOM_TITLE ||
    normalized.startsWith('room ') ||
    normalized.startsWith('client room ') ||
    normalized.startsWith('ห้องงานใหม่')
  );
}

function truncateRoomLabel(value: string, maxLength = 72) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function deriveRoomTitleFromSession(session: AppSession, fallbackTitle = DEFAULT_ROOM_TITLE) {
  const candidates = [
    !looksGenericRoomTitle(session.roomTitle) ? session.roomTitle : undefined,
    session.task?.taskFrame?.objective,
    session.task?.currentPlan?.actionTitle,
    session.task?.reentryBrief?.topActions[0]?.title,
    session.currentPayload?.recommended_action.title,
    session.task?.sourceText?.split('\n')[0],
    session.activeDumpContext?.text?.split('\n')[0],
  ].filter((value): value is string => Boolean(normalizeOptionalString(value)));

  if (candidates.length === 0) return fallbackTitle;
  return truncateRoomLabel(candidates[0].replace(/\s+/g, ' ').trim(), 72);
}

function deriveRoomSummaryFromSession(session: AppSession) {
  const summary =
    session.task?.reentryBrief?.summary ||
    session.task?.lastStableSummary ||
    session.task?.lastSynthesis?.situation_summary ||
    session.currentPayload?.situation_summary ||
    session.task?.sourceText ||
    session.activeDumpContext?.text ||
    'เริ่มห้องนี้ด้วย client chaos แล้วให้ MIND ช่วยหา next move';
  return truncateRoomLabel(summary.replace(/\s+/g, ' ').trim(), 160);
}

function deriveRoomNextMovesFromSession(session: AppSession) {
  const fromReentry = session.task?.reentryBrief?.topActions.map((item) => item.title) ?? [];
  if (fromReentry.length > 0) return fromReentry.slice(0, 3);

  const fromPlan = session.task?.currentPlan?.steps.map((step) => step.text) ?? [];
  if (fromPlan.length > 0) return fromPlan.slice(0, 3).map((step) => truncateRoomLabel(step, 72));

  const fromPayload = session.currentPayload?.recommended_action.micro_steps ?? [];
  if (fromPayload.length > 0) return fromPayload.slice(0, 3).map((step) => truncateRoomLabel(step, 72));

  const title = session.currentPayload?.recommended_action.title ?? session.task?.currentPlan?.actionTitle;
  return title ? [truncateRoomLabel(title, 72)] : [];
}

function deriveSeedRoomSnapshot(session: AppSession) {
  const brief = deriveRoomSummaryFromSession(session);
  const nextMoves = deriveRoomNextMovesFromSession(session);
  return {
    brief,
    nextMoves,
    at: deriveRoomLastUpdatedAt(session),
  };
}

function deriveRoomLastUpdatedAt(session: AppSession) {
  return Math.max(
    session.lastActive,
    session.task?.createdAt ?? 0,
    session.task?.lastAttemptAt ?? 0,
    session.task?.reentryBrief?.createdAt ?? 0,
  );
}

function roomHasContinuity(session: AppSession) {
  return Boolean(session.task && session.task.lifecycleState !== 'done');
}

function roomHasCachedSavePoint(room?: Partial<RoomRecord> | null) {
  return Boolean(
    room &&
      (
        normalizeOptionalString(room.lastKnownGoodBrief) ||
        room.lastKnownGoodNextMoves?.some((item) => Boolean(normalizeOptionalString(item))) ||
        room.lastReentryBrief
      ),
  );
}

function deriveRoomFlags(session: AppSession, activeRoomId: string | null) {
  const lastUpdatedAt = deriveRoomLastUpdatedAt(session);
  const stale = Date.now() - lastUpdatedAt > 1000 * 60 * 60 * 24 * 3;
  const unread = session.roomId !== activeRoomId && roomHasContinuity(session);
  return { stale, unread, lastUpdatedAt };
}

function shouldPreserveExistingKnownGood(session: AppSession) {
  if (!session.task) return true;
  if (session.uiRoute === 'SYNTHESIZING' || session.uiRoute === 'MANUAL_FALLBACK') return true;
  return (
    session.task.lifecycleState === 'dumped' ||
    session.task.lifecycleState === 'synthesizing' ||
    session.task.lifecycleState === 'failed'
  );
}

function buildLastKnownGoodFromSession(
  session: AppSession,
  existing?: Partial<RoomRecord>,
) {
  const existingBrief = normalizeOptionalString(existing?.lastKnownGoodBrief);
  const existingNextMoves = Array.isArray(existing?.lastKnownGoodNextMoves)
    ? existing.lastKnownGoodNextMoves
        .map((item) => normalizeOptionalString(item))
        .filter((item): item is string => Boolean(item))
    : [];
  const existingAt = typeof existing?.lastKnownGoodAt === 'number' ? existing.lastKnownGoodAt : undefined;
  const preserveExisting = shouldPreserveExistingKnownGood(session) && (existingBrief || existingNextMoves.length > 0);

  let brief: string | undefined;
  let nextMoves: string[] = [];
  let at: number | undefined;
  let freshness: RoomAiFreshness = 'fallback';

  if (session.task?.reentryBrief?.summary) {
    brief = truncateRoomLabel(session.task.reentryBrief.summary.replace(/\s+/g, ' ').trim(), 160);
    nextMoves = session.task.reentryBrief.topActions
      .map((item) => truncateRoomLabel(item.title, 72))
      .slice(0, 3);
    at = session.task.reentryBrief.createdAt;
    freshness = Date.now() - (at ?? 0) > 1000 * 60 * 60 * 24 * 3 ? 'stale' : 'fresh';
  } else if (session.task?.lastStableSummary) {
    brief = truncateRoomLabel(session.task.lastStableSummary.replace(/\s+/g, ' ').trim(), 160);
    nextMoves = deriveRoomNextMovesFromSession(session);
    at = deriveRoomLastUpdatedAt(session);
    freshness = Date.now() - (at ?? 0) > 1000 * 60 * 60 * 24 * 3 ? 'stale' : 'fresh';
  } else if (preserveExisting) {
    brief = existingBrief;
    nextMoves = existingNextMoves;
    at = existingAt;
    const stale = typeof at === 'number' && Date.now() - at > 1000 * 60 * 60 * 24 * 3;
    freshness = stale ? 'stale' : 'fallback';
  } else {
    const seeded = deriveSeedRoomSnapshot(session);
    brief = seeded.brief;
    nextMoves = seeded.nextMoves;
    at = seeded.at;
    freshness = 'fallback';
  }

  return {
    brief,
    nextMoves,
    at,
    freshness,
  };
}

export function buildRoomRecordFromSession(
  session: AppSession,
  activeRoomId: string | null,
  existing?: Partial<RoomRecord>,
): RoomRecord {
  const title = deriveRoomTitleFromSession(session, existing?.title ?? DEFAULT_ROOM_TITLE);
  const { stale, unread, lastUpdatedAt } = deriveRoomFlags(session, activeRoomId);
  const lastKnownGood = buildLastKnownGoodFromSession(session, existing);

  return {
    id: session.roomId ?? existing?.id ?? `room-${session.lastActive}`,
    title,
    clientName: existing?.clientName ?? title,
    scenarioType: session.roomScenarioType ?? existing?.scenarioType ?? 'general_client_room',
    lastState: session.uiRoute,
    lastReentryBrief: session.task?.reentryBrief ?? existing?.lastReentryBrief,
    lastKnownGoodBrief: lastKnownGood.brief,
    lastKnownGoodNextMoves: lastKnownGood.nextMoves,
    lastKnownGoodAt: lastKnownGood.at,
    aiFreshness: lastKnownGood.freshness,
    lastUpdatedAt,
    unread,
    stale,
    contextSummary: lastKnownGood.brief ?? deriveRoomSummaryFromSession(session),
    nextMoves: lastKnownGood.nextMoves.length > 0 ? lastKnownGood.nextMoves : deriveRoomNextMovesFromSession(session),
    session,
  };
}

export function hydrateRoomSessionFromRecord(
  session: AppSession,
  room?: Partial<RoomRecord> | null,
): AppSession {
  if (!session.task) return session;
  if (!roomHasCachedSavePoint(room)) return session;

  const shouldRecoverTransientRoute =
    session.uiRoute === 'SYNTHESIZING' ||
    session.uiRoute === 'MANUAL_FALLBACK' ||
    session.task.lifecycleState === 'synthesizing' ||
    session.task.lifecycleState === 'failed';

  if (!shouldRecoverTransientRoute) return session;

  return normalizeSession({
    ...session,
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    task: {
      ...session.task,
      lifecycleState: 'dumped',
      reentryBrief: session.task.reentryBrief ?? room?.lastReentryBrief,
      lastStableSummary: session.task.lastStableSummary ?? normalizeOptionalString(room?.lastKnownGoodBrief),
    },
  });
}

function normalizeTaskContext(task: unknown, fallback: {
  roomId?: string;
  sourceText?: string;
  createdAt?: number;
  workflowType?: WorkflowType;
  taskShape?: TaskShape;
  lifecycleState?: TaskLifecycleState;
  currentActionId?: string | null;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
  lastSynthesis?: AiSynthesisResponse;
  sourceFiles?: RoomSourceFile[];
  extractedText?: string;
  pendingInputs?: PendingInput[];
  blockerSignals?: string[];
  currentStepIndex?: number;
}): TaskContext | undefined {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return undefined;
  const record = task as Record<string, unknown>;
  const sourceFiles = normalizeRoomSourceFiles(record.sourceFiles ?? fallback.sourceFiles);
  const extractedTextFromFiles = sourceFiles
    .map((file) => normalizeOptionalString(file.extractedText))
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const extractedText = normalizeOptionalString(record.extractedText)
    ?? fallback.extractedText
    ?? extractedTextFromFiles
    ?? '';
  const sourceText = normalizeOptionalString(record.sourceText)
    ?? fallback.sourceText
    ?? composeRoomSourceText('', extractedText, sourceFiles);
  if (!sourceText) return undefined;

  const id = normalizeOptionalString(record.id) ?? `${record.createdAt ?? fallback.createdAt ?? Date.now()}`;
  const roomId = normalizeOptionalString(record.roomId) ?? fallback.roomId;
  const lifecycleState = isTaskLifecycleState(record.lifecycleState)
    ? record.lifecycleState
    : fallback.lifecycleState ?? 'dumped';
  const workflowType = isWorkflowType(record.workflowType)
    ? record.workflowType
    : fallback.workflowType;
  const taskShape = normalizeTaskShape(record.taskShape) ?? fallback.taskShape;
  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : fallback.createdAt ?? Date.now();
  const lastAttemptAt = typeof record.lastAttemptAt === 'number' ? record.lastAttemptAt : fallback.lastAttemptAt;
  const lastFailureReason = isFailureReason(record.lastFailureReason)
    ? record.lastFailureReason
    : fallback.lastFailureReason;
  const currentStepIndex = typeof record.currentStepIndex === 'number' && record.currentStepIndex >= 0
    ? Math.floor(record.currentStepIndex)
    : fallback.currentStepIndex ?? 0;
  const currentActionId = normalizeOptionalString(record.currentActionId) ?? fallback.currentActionId ?? null;
  const pendingInputs = normalizePendingInputs(record.pendingInputs ?? fallback.pendingInputs);
  const blockerSignals = Array.isArray(record.blockerSignals)
    ? record.blockerSignals.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
    : fallback.blockerSignals ?? [];
  const lastSynthesis = record.lastSynthesis as AiSynthesisResponse | undefined ?? fallback.lastSynthesis;
  const taskFrame = normalizeTaskFrame(record.taskFrame);
  const currentPlan = normalizeCurrentPlan(record.currentPlan);
  const rescueHistory = normalizeRescueHistory(record.rescueHistory);
  const constraints = normalizeConstraints(record.constraints);
  const actionExplanation = normalizeOptionalString(record.actionExplanation);
  const reentryBrief = normalizeReentryBrief(record.reentryBrief);
  const lastStableSummary = normalizeOptionalString(record.lastStableSummary);
  const assistantMode = normalizeAssistantMode(record.assistantMode);
  const lastAiOperation = normalizeAiOperationName(record.lastAiOperation);
  const oneActionTracking = normalizeOneActionTracking(record.oneActionTracking);

  return {
    id,
    roomId,
    workflowType,
    taskShape,
    sourceText,
    sourceFiles,
    extractedText,
    createdAt,
    lastAttemptAt,
    lastFailureReason,
    pendingInputs,
    blockerSignals,
    lastSynthesis,
    lifecycleState,
    currentStepIndex,
    currentActionId,
    taskFrame,
    currentPlan,
    rescueHistory,
    constraints,
    actionExplanation,
    reentryBrief,
    lastStableSummary,
    assistantMode,
    lastAiOperation,
    oneActionTracking,
  };
}

function createTaskFromLegacyFields(session: Partial<AppSession> & { status?: unknown; currentPayload?: unknown }) {
  const route = isRoute(session.uiRoute)
    ? session.uiRoute
    : isRoute(session.status)
      ? session.status
      : 'DUMP_ENTRY';
  const legacyContext = session.activeDumpContext;
  const sourceText =
    legacyContext && typeof legacyContext === 'object' && !Array.isArray(legacyContext)
      ? normalizeOptionalString(legacyContext.text)
      : typeof legacyContext === 'string'
        ? normalizeOptionalString(legacyContext)
        : undefined;
  if (!sourceText) return undefined;

  return normalizeTaskContext(session.task, {
    roomId: normalizeOptionalString(session.roomId),
    sourceText,
    createdAt:
      typeof legacyContext === 'object' && legacyContext && 'createdAt' in legacyContext && typeof legacyContext.createdAt === 'number'
        ? legacyContext.createdAt
        : session.lastActive,
    workflowType: session.lastWorkflowType,
    taskShape: undefined,
    lifecycleState: DEFAULT_TASK_LIFECYCLE_BY_ROUTE[route],
    currentActionId: normalizeOptionalString(session.currentActionId) ?? null,
    lastAttemptAt:
      typeof legacyContext === 'object' && legacyContext && 'lastAttemptAt' in legacyContext && typeof legacyContext.lastAttemptAt === 'number'
        ? legacyContext.lastAttemptAt
        : undefined,
    lastFailureReason:
      typeof legacyContext === 'object' && legacyContext && 'lastFailureReason' in legacyContext && isFailureReason(legacyContext.lastFailureReason)
        ? legacyContext.lastFailureReason
        : session.lastFailureReason,
    lastSynthesis: session.currentPayload,
    sourceFiles: [],
    extractedText: '',
    pendingInputs: [],
    blockerSignals: [],
    currentStepIndex: 0,
  });
}

function routeForTaskSession(storedRoute: UIRoute, task: TaskContext | undefined): UIRoute {
  if (!task) return storedRoute;
  if (ROUTES_KEEPING_SESSION_PRIORITY.has(storedRoute)) return storedRoute;
  return routeFromTaskLifecycleState(task.lifecycleState);
}

export function createTaskContext(sourceText: string, workflowType?: WorkflowType, createdAt?: number): TaskContext;
export function createTaskContext(input: CreateTaskContextInput): TaskContext;
export function createTaskContext(
  inputOrSourceText: string | CreateTaskContextInput,
  workflowType?: WorkflowType,
  createdAt = Date.now(),
): TaskContext {
  const input = typeof inputOrSourceText === 'string'
    ? { sourceText: inputOrSourceText, workflowType, createdAt }
    : inputOrSourceText;

  const sourceFiles = normalizeRoomSourceFiles(input.sourceFiles);
  const extractedTextFromFiles = sourceFiles
    .map((file) => normalizeOptionalString(file.extractedText))
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const extractedText = normalizeOptionalString(input.extractedText) ?? extractedTextFromFiles ?? '';
  const sourceText = normalizeOptionalString(input.sourceText) ?? composeRoomSourceText('', extractedText, sourceFiles);
  const currentCreatedAt = typeof input.createdAt === 'number' ? input.createdAt : createdAt;

  return {
    id: `${currentCreatedAt}`,
    roomId: input.roomId,
    workflowType: input.workflowType,
    taskShape: input.taskShape,
    sourceText,
    sourceFiles,
    extractedText,
    createdAt: currentCreatedAt,
    lastAttemptAt: input.lastAttemptAt,
    lastFailureReason: input.lastFailureReason,
    pendingInputs: input.pendingInputs ?? [],
    blockerSignals: input.blockerSignals ?? [],
    lastSynthesis: input.lastSynthesis,
    lifecycleState: input.lifecycleState ?? 'dumped',
    currentStepIndex: typeof input.currentStepIndex === 'number' ? input.currentStepIndex : 0,
    currentActionId: input.currentActionId ?? null,
    rescueHistory: [],
    actionExplanation: undefined,
    reentryBrief: undefined,
    oneActionTracking: undefined,
  };
}

export function lifecycleStateForRoute(route: UIRoute): TaskLifecycleState {
  return DEFAULT_TASK_LIFECYCLE_BY_ROUTE[route];
}

export function routeFromTaskLifecycleState(state: TaskLifecycleState): UIRoute {
  switch (state) {
    case 'synthesizing':
      return 'SYNTHESIZING';
    case 'clarification_needed':
      return 'CLARIFICATION';
    case 'has_one_action':
      return 'ONE_ACTION';
    case 'in_scaffold':
      return 'SCAFFOLD';
    case 'stalled':
      return 'RESCUE';
    case 'failed':
      return 'MANUAL_FALLBACK';
    case 'done':
      return 'DUMP_ENTRY';
    case 'dumped':
    default:
      return 'DUMP_ENTRY';
  }
}

export function normalizeSession(session: Partial<AppSession> & { status?: unknown }): AppSession {
  const storedUiRoute = isRoute(session.uiRoute)
    ? session.uiRoute
    : isRoute(session.status)
      ? session.status
      : 'DUMP_ENTRY';

  const existingTask = normalizeTaskContext(session.task, {
    roomId: normalizeOptionalString(session.roomId),
    sourceText:
      typeof session.activeDumpContext === 'string'
        ? session.activeDumpContext
        : session.activeDumpContext && typeof session.activeDumpContext === 'object'
          ? session.activeDumpContext.text
          : undefined,
    createdAt:
      typeof session.activeDumpContext === 'object' && session.activeDumpContext && 'createdAt' in session.activeDumpContext && typeof session.activeDumpContext.createdAt === 'number'
        ? session.activeDumpContext.createdAt
        : session.lastActive,
    workflowType: session.lastWorkflowType,
    lifecycleState: DEFAULT_TASK_LIFECYCLE_BY_ROUTE[storedUiRoute],
    currentActionId: normalizeOptionalString(session.currentActionId) ?? null,
    lastAttemptAt:
      typeof session.activeDumpContext === 'object' && session.activeDumpContext && 'lastAttemptAt' in session.activeDumpContext && typeof session.activeDumpContext.lastAttemptAt === 'number'
        ? session.activeDumpContext.lastAttemptAt
        : undefined,
    lastFailureReason:
      typeof session.activeDumpContext === 'object' && session.activeDumpContext && 'lastFailureReason' in session.activeDumpContext && isFailureReason(session.activeDumpContext.lastFailureReason)
        ? session.activeDumpContext.lastFailureReason
        : session.lastFailureReason,
    lastSynthesis: session.currentPayload,
    sourceFiles: [],
    extractedText: '',
    pendingInputs: [],
    blockerSignals: [],
    currentStepIndex: 0,
  }) ?? createTaskFromLegacyFields(session);

  const task = existingTask
    ? {
        ...existingTask,
        lifecycleState: existingTask.lifecycleState || DEFAULT_TASK_LIFECYCLE_BY_ROUTE[storedUiRoute],
        currentStepIndex: typeof existingTask.currentStepIndex === 'number' ? existingTask.currentStepIndex : 0,
        pendingInputs: existingTask.pendingInputs || [],
        blockerSignals: existingTask.blockerSignals || [],
        sourceFiles: existingTask.sourceFiles || [],
        extractedText: existingTask.extractedText || '',
        rescueHistory: existingTask.rescueHistory || [],
      }
    : undefined;

  const completedTask = task?.lifecycleState === 'done' ? task : undefined;
  const activeTask = completedTask ? undefined : task;
  const uiRoute = completedTask ? 'DUMP_ENTRY' : routeForTaskSession(storedUiRoute, activeTask);
  const currentActionId = completedTask
    ? null
    : activeTask?.currentActionId ?? normalizeOptionalString(session.currentActionId) ?? null;
  const currentPayload = completedTask ? undefined : activeTask?.lastSynthesis ?? session.currentPayload;
  const activeDumpContext = activeTask
    ? {
        text: activeTask.sourceText,
        createdAt: activeTask.createdAt,
        lastAttemptAt: activeTask.lastAttemptAt,
        lastFailureReason: activeTask.lastFailureReason,
      }
    : completedTask
      ? undefined
      : session.activeDumpContext;

  return {
    roomId: normalizeOptionalString(session.roomId) ?? activeTask?.roomId ?? completedTask?.roomId,
    roomTitle: normalizeOptionalString(session.roomTitle),
    roomScenarioType: isRoomScenarioType(session.roomScenarioType) ? session.roomScenarioType : undefined,
    lastActive: typeof session.lastActive === 'number' ? session.lastActive : Date.now(),
    uiRoute,
    status: uiRoute,
    notThisCount: typeof session.notThisCount === 'number' ? session.notThisCount : 0,
    currentActionId,
    task: activeTask,
    activeDumpContext,
    currentPayload,
    lastMorningShown: normalizeOptionalString(session.lastMorningShown),
    hasSeenResetNotice: session.hasSeenResetNotice ?? false,
    hasSeenWalkthrough: session.hasSeenWalkthrough ?? false,
    lastWorkflowType: isWorkflowType(session.lastWorkflowType) ? session.lastWorkflowType : task?.workflowType,
    lastFailureReason: completedTask
      ? undefined
      : isFailureReason(session.lastFailureReason) ? session.lastFailureReason : activeTask?.lastFailureReason,
  };
}

export function createDefaultSession(options?: {
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: RoomScenarioType;
}): AppSession {
  return normalizeSession({
    roomId: options?.roomId,
    roomTitle: options?.roomTitle,
    roomScenarioType: options?.roomScenarioType,
    lastActive: Date.now(),
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    hasSeenResetNotice: false,
    hasSeenWalkthrough: false,
  });
}

export async function getSession(): Promise<AppSession> {
  const workspace = normalizeRoomWorkspace(await get(ROOM_WORKSPACE_KEY));
  if (workspace?.activeRoomId) {
    const activeRoom = workspace.rooms.find((room) => room.id === workspace.activeRoomId);
    if (activeRoom) {
      return normalizeSession(activeRoom.session);
    }
  }

  const session = await get<AppSession & { activeDumpContext?: string | ActiveDumpContext; task?: TaskContext }>(SESSION_KEY);
  if (!session) {
    const seededWorkspace = await getRoomWorkspace();
    const seededSession = seededWorkspace.rooms.find((room) => room.id === seededWorkspace.activeRoomId)?.session;
    return seededSession ?? createDefaultSession();
  }
  return normalizeSession(session);
}

export async function saveSession(session: AppSession): Promise<void> {
  const normalized = normalizeSession(session);
  normalized.lastActive = Date.now();
  await set(SESSION_KEY, normalized);
  if (normalized.roomId) {
    await syncRoomFromSession(normalized);
  }
}

export async function getActions(): Promise<Action[]> {
  const actions = await get<Action[]>(ACTIONS_KEY);
  return actions || [];
}

export async function getArchivedActions(): Promise<Action[]> {
  const actions = await getActions();
  return actions.filter((action) => action.state === 'ARCHIVED');
}

export async function saveAction(action: Action): Promise<void> {
  await update(ACTIONS_KEY, (val) => {
    const actions = (val as Action[]) || [];
    return [...actions, action];
  });
}

export async function updateAction(id: string, modifications: Partial<Action>): Promise<void> {
  await update(ACTIONS_KEY, (val) => {
    const actions = (val as Action[]) || [];
    return actions.map(a => a.id === id ? { ...a, ...modifications } : a);
  });
}

export async function saveActions(newActions: Action[]): Promise<void> {
  await set(ACTIONS_KEY, newActions);
}

function normalizeRoomRecord(value: unknown, activeRoomId: string | null): RoomRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const session = normalizeSession(record.session as Partial<AppSession> & { status?: unknown });
  const nextSession = normalizeSession({
    ...session,
    roomId: normalizeOptionalString(record.id) ?? session.roomId,
    roomTitle: normalizeOptionalString(record.title) ?? session.roomTitle,
    roomScenarioType: isRoomScenarioType(record.scenarioType) ? record.scenarioType : session.roomScenarioType,
  });
  return buildRoomRecordFromSession(nextSession, activeRoomId, {
    id: normalizeOptionalString(record.id) ?? nextSession.roomId ?? `room-${nextSession.lastActive}`,
    title: normalizeOptionalString(record.title) ?? nextSession.roomTitle ?? DEFAULT_ROOM_TITLE,
    clientName: normalizeOptionalString(record.clientName) ?? nextSession.roomTitle ?? DEFAULT_ROOM_TITLE,
    scenarioType: isRoomScenarioType(record.scenarioType) ? record.scenarioType : nextSession.roomScenarioType,
    lastKnownGoodBrief: normalizeOptionalString(record.lastKnownGoodBrief),
    lastKnownGoodNextMoves: Array.isArray(record.lastKnownGoodNextMoves)
      ? record.lastKnownGoodNextMoves
          .map((item) => normalizeOptionalString(item))
          .filter((item): item is string => Boolean(item))
      : [],
    lastKnownGoodAt: typeof record.lastKnownGoodAt === 'number' ? record.lastKnownGoodAt : undefined,
    aiFreshness: normalizeRoomAiFreshness(record.aiFreshness),
  });
}

function normalizeRoomWorkspace(value: unknown): RoomWorkspace | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const activeRoomId = normalizeOptionalString(record.activeRoomId) ?? null;
  const rooms = Array.isArray(record.rooms)
    ? record.rooms
        .map((item) => normalizeRoomRecord(item, activeRoomId))
        .filter((item): item is RoomRecord => Boolean(item))
    : [];

  if (rooms.length === 0) return undefined;

  const normalizedActiveRoomId = rooms.some((room) => room.id === activeRoomId)
    ? activeRoomId
    : rooms[0]?.id ?? null;

  return {
    activeRoomId: normalizedActiveRoomId,
    rooms: rooms.map((room) => buildRoomRecordFromSession(room.session, normalizedActiveRoomId, room)),
    lastUpdatedAt: typeof record.lastUpdatedAt === 'number' ? record.lastUpdatedAt : Date.now(),
  };
}

function buildBlankRoomTitle(index: number) {
  if (index <= 1) return DEFAULT_ROOM_TITLE;
  return `ห้องงานใหม่ ${index}`;
}

function createRoomId() {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildRoomSessionSeed(input?: {
  roomId?: string;
  roomTitle?: string;
  roomScenarioType?: RoomScenarioType;
}): AppSession {
  const roomId = input?.roomId ?? createRoomId();
  const roomTitle = input?.roomTitle ?? DEFAULT_ROOM_TITLE;
  return createDefaultSession({
    roomId,
    roomTitle,
    roomScenarioType: input?.roomScenarioType ?? 'general_client_room',
  });
}

async function persistRoomWorkspace(workspace: RoomWorkspace): Promise<void> {
  await set(ROOM_WORKSPACE_KEY, workspace);
}

export async function getRoomWorkspace(): Promise<RoomWorkspace> {
  const storedWorkspace = normalizeRoomWorkspace(await get(ROOM_WORKSPACE_KEY));
  if (storedWorkspace) {
    return storedWorkspace;
  }

  const legacySession = await get<AppSession & { activeDumpContext?: string | ActiveDumpContext; task?: TaskContext }>(SESSION_KEY);
  if (legacySession) {
    const normalizedLegacy = normalizeSession(legacySession);
    const roomId = normalizedLegacy.roomId ?? createRoomId();
    const sessionWithRoom = normalizeSession({
      ...normalizedLegacy,
      roomId,
      roomTitle: normalizedLegacy.roomTitle ?? deriveRoomTitleFromSession(normalizedLegacy),
      roomScenarioType: normalizedLegacy.roomScenarioType ?? 'general_client_room',
    });
    const workspace: RoomWorkspace = {
      activeRoomId: roomId,
      rooms: [buildRoomRecordFromSession(sessionWithRoom, roomId)],
      lastUpdatedAt: Date.now(),
    };
    await persistRoomWorkspace(workspace);
    await set(SESSION_KEY, sessionWithRoom);
    return workspace;
  }

  const seedSession = buildRoomSessionSeed();
  const workspace: RoomWorkspace = {
    activeRoomId: seedSession.roomId ?? null,
    rooms: [buildRoomRecordFromSession(seedSession, seedSession.roomId ?? null, {
      title: DEFAULT_ROOM_TITLE,
      clientName: DEFAULT_ROOM_TITLE,
      scenarioType: 'general_client_room',
    })],
    lastUpdatedAt: Date.now(),
  };
  await persistRoomWorkspace(workspace);
  await set(SESSION_KEY, seedSession);
  return workspace;
}

export async function getRooms(): Promise<RoomRecord[]> {
  const workspace = await getRoomWorkspace();
  return workspace.rooms;
}

export async function createRoom(input?: {
  title?: string;
  scenarioType?: RoomScenarioType;
  makeActive?: boolean;
}): Promise<RoomRecord> {
  const workspace = await getRoomWorkspace();
  const roomId = createRoomId();
  const nextTitle = normalizeOptionalString(input?.title) ?? buildBlankRoomTitle(workspace.rooms.length + 1);
  const session = buildRoomSessionSeed({
    roomId,
    roomTitle: nextTitle,
    roomScenarioType: input?.scenarioType ?? 'general_client_room',
  });
  const room = buildRoomRecordFromSession(session, input?.makeActive === false ? workspace.activeRoomId : roomId, {
    title: nextTitle,
    clientName: nextTitle,
    scenarioType: input?.scenarioType ?? 'general_client_room',
  });
  const activeRoomId = input?.makeActive === false ? workspace.activeRoomId : roomId;
  const nextWorkspace: RoomWorkspace = {
    activeRoomId,
    rooms: [...workspace.rooms, room].map((item) => buildRoomRecordFromSession(item.session, activeRoomId, item)),
    lastUpdatedAt: Date.now(),
  };
  await persistRoomWorkspace(nextWorkspace);
  if (activeRoomId === roomId) {
    await set(SESSION_KEY, session);
  }
  return room;
}

export async function activateRoom(roomId: string): Promise<AppSession> {
  const workspace = await getRoomWorkspace();
  const targetRoom = workspace.rooms.find((room) => room.id === roomId);
  if (!targetRoom) {
    const fallbackSession = workspace.rooms[0]?.session ?? buildRoomSessionSeed();
    await set(SESSION_KEY, fallbackSession);
    return fallbackSession;
  }

  const hydratedSession = hydrateRoomSessionFromRecord(targetRoom.session, targetRoom);
  const nextWorkspace: RoomWorkspace = {
    activeRoomId: roomId,
    rooms: workspace.rooms.map((room) => {
      const session = room.id === roomId ? hydratedSession : room.session;
      return buildRoomRecordFromSession(session, roomId, room);
    }),
    lastUpdatedAt: Date.now(),
  };
  await persistRoomWorkspace(nextWorkspace);
  await set(SESSION_KEY, hydratedSession);
  return hydratedSession;
}

export async function syncRoomFromSession(session: AppSession): Promise<RoomWorkspace> {
  const normalized = normalizeSession(session);
  const workspace = await getRoomWorkspace();
  const roomId = normalized.roomId ?? workspace.activeRoomId ?? createRoomId();
  const nextSession = normalizeSession({
    ...normalized,
    roomId,
    roomTitle: normalized.roomTitle ?? deriveRoomTitleFromSession(normalized),
    roomScenarioType: normalized.roomScenarioType ?? 'general_client_room',
  });
  const existing = workspace.rooms.find((room) => room.id === roomId);
  const nextRoom = buildRoomRecordFromSession(nextSession, roomId, existing ?? {
    id: roomId,
    title: nextSession.roomTitle ?? DEFAULT_ROOM_TITLE,
    clientName: nextSession.roomTitle ?? DEFAULT_ROOM_TITLE,
    scenarioType: nextSession.roomScenarioType ?? 'general_client_room',
  });
  const remainingRooms = workspace.rooms.filter((room) => room.id !== roomId);
  const nextWorkspace: RoomWorkspace = {
    activeRoomId: roomId,
    rooms: [nextRoom, ...remainingRooms].map((room) => buildRoomRecordFromSession(room.session, roomId, room)),
    lastUpdatedAt: Date.now(),
  };
  await persistRoomWorkspace(nextWorkspace);
  await set(SESSION_KEY, nextSession);
  return nextWorkspace;
}

export async function ensureDemoRooms(primaryScenario: RoomScenarioType = 'client_project_restart'): Promise<RoomWorkspace> {
  const workspace = await getRoomWorkspace();
  const hasDemoRooms = workspace.rooms.some((room) => room.id.startsWith('demo-room-'));
  if (hasDemoRooms) {
    return workspace;
  }

  const demoRooms: RoomRecord[] = [
    buildRoomRecordFromSession(
      normalizeSession({
        ...buildRoomSessionSeed({
          roomId: 'demo-room-restart',
          roomTitle: 'ACME - Website revamp',
          roomScenarioType: 'client_project_restart',
        }),
        activeDumpContext: {
          text: 'โปรเจกต์เว็บลูกค้า ACME ค้างมาหลายวัน มี feedback กระจัดกระจายหลายที่',
          createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
        },
        task: {
          ...createTaskContext({
            roomId: 'demo-room-restart',
            sourceText: 'โปรเจกต์เว็บลูกค้า ACME ค้างมาหลายวัน มี feedback กระจัดกระจายหลายที่',
            workflowType: 'client_resume',
            createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
            lifecycleState: 'dumped',
            currentStepIndex: 0,
          }),
          reentryBrief: {
            summary: 'งานนี้ค้างหลัง feedback รอบล่าสุด สิ่งที่คุ้มสุดตอนนี้คือเปิดรายการแก้และตอบลูกค้าว่ากำลังเดินต่อ',
            topActions: [
              {
                roomId: 'demo-room-restart',
                title: 'สรุป feedback ล่าสุดเป็น checklist สั้น',
                rationale: 'ช่วยกลับเข้า context โดยไม่ต้องอ่านทั้ง thread ใหม่',
                impact: 'high',
                effort: 'low',
                resumeTarget: 'ONE_ACTION',
              },
              {
                roomId: 'demo-room-restart',
                title: 'ร่าง reply update ให้ลูกค้ารู้ว่างานอยู่ตรงไหน',
                rationale: 'กัน lost trust และเปิดทางให้ project เดินต่อ',
                impact: 'medium',
                effort: 'low',
                resumeTarget: 'DUMP_ENTRY',
              },
            ],
            ignoredNoise: ['ยังไม่ต้องจัดไฟล์เก่าใน archive'],
            createdAt: Date.now() - 1000 * 60 * 30,
          },
        },
      }),
      primaryScenario === 'client_project_restart' ? 'demo-room-restart' : 'demo-room-urgent',
      {
        id: 'demo-room-restart',
        title: 'ACME - Website revamp',
        clientName: 'ACME',
        scenarioType: 'client_project_restart',
      },
    ),
    buildRoomRecordFromSession(
      normalizeSession({
        ...buildRoomSessionSeed({
          roomId: 'demo-room-urgent',
          roomTitle: 'Northstar - Demo reply',
          roomScenarioType: 'sales_inquiry_demo_request',
        }),
        activeDumpContext: {
          text: 'ลูกค้า Northstar ขอ demo ด่วนและอยากได้สรุป scope ก่อนประชุม',
          createdAt: Date.now() - 1000 * 60 * 60 * 6,
        },
        task: {
          ...createTaskContext({
            roomId: 'demo-room-urgent',
            sourceText: 'ลูกค้า Northstar ขอ demo ด่วนและอยากได้สรุป scope ก่อนประชุม',
            workflowType: 'client_response',
            createdAt: Date.now() - 1000 * 60 * 60 * 6,
            lifecycleState: 'dumped',
            currentStepIndex: 0,
          }),
          reentryBrief: {
            summary: 'ลูกค้ากำลังรอคำตอบสั้น ๆ เรื่อง demo slot, use case, และ next step ก่อนประชุม',
            topActions: [
              {
                roomId: 'demo-room-urgent',
                title: 'ร่าง reply สั้นเพื่อ confirm demo slot',
                rationale: 'ช่วยกันดีลเย็นและตอบลูกค้าได้เร็วที่สุด',
                impact: 'high',
                effort: 'low',
                resumeTarget: 'ONE_ACTION',
              },
              {
                roomId: 'demo-room-urgent',
                title: 'สรุป use case ที่ลูกค้าพูดถึง 3 ข้อ',
                rationale: 'ช่วยให้คุย demo รอบหน้าไม่หลุด context',
                impact: 'medium',
                effort: 'low',
                resumeTarget: 'DUMP_ENTRY',
              },
            ],
            ignoredNoise: ['ยังไม่ต้องสรุป deck เต็ม'],
            createdAt: Date.now() - 1000 * 60 * 20,
          },
        },
      }),
      primaryScenario === 'sales_inquiry_demo_request' ? 'demo-room-urgent' : 'demo-room-restart',
      {
        id: 'demo-room-urgent',
        title: 'Northstar - Demo reply',
        clientName: 'Northstar',
        scenarioType: 'sales_inquiry_demo_request',
      },
    ),
  ];

  const mergedRooms = [
    ...workspace.rooms.filter((room) => !room.id.startsWith('demo-room-')),
    ...demoRooms,
  ];
  const activeRoomId = primaryScenario === 'sales_inquiry_demo_request' ? 'demo-room-urgent' : 'demo-room-restart';
  const nextWorkspace: RoomWorkspace = {
    activeRoomId,
    rooms: mergedRooms.map((room) => buildRoomRecordFromSession(room.session, activeRoomId, room)),
    lastUpdatedAt: Date.now(),
  };
  await persistRoomWorkspace(nextWorkspace);
  const activeRoom = nextWorkspace.rooms.find((room) => room.id === activeRoomId);
  if (activeRoom) {
    await set(SESSION_KEY, activeRoom.session);
  }
  return nextWorkspace;
}

export async function clearRoomWorkspace(): Promise<void> {
  await del(ROOM_WORKSPACE_KEY);
}

export async function exportAllData(): Promise<MindExport> {
  const [session, actions, analyticsEvents, roomWorkspace] = await Promise.all([
    getSession(),
    getActions(),
    getAnalyticsEvents(),
    getRoomWorkspace(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    session,
    actions,
    rooms: roomWorkspace.rooms,
    roomWorkspace,
    analytics: {
      events: analyticsEvents,
      summary: buildBusinessLoopSummary(analyticsEvents),
    },
  };
}

export async function clearAllData(): Promise<void> {
  await Promise.all([del(SESSION_KEY), del(ACTIONS_KEY), clearAnalyticsEvents(), clearRoomWorkspace()]);
}
