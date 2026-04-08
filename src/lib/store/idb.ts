import { del, get, set, update } from 'idb-keyval';
import type { AiSynthesisResponse } from '@/lib/ai/schema';
import {
  composeRoomSourceText,
  normalizeRoomSourceFiles,
  type RoomSourceFile,
} from '@/lib/room';

export type ActionState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
export type WorkflowType = 'client_response' | 'client_resume';
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
  sourceText: string;
  workflowType?: WorkflowType;
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
  workflowType?: WorkflowType;
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
  assistantMode?: AssistantMode;
  lastAiOperation?: AiOperationName;
  oneActionTracking?: OneActionTracking;
}

export interface Action {
  id: string;
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
}

const SESSION_KEY = 'mind_session';
const ACTIONS_KEY = 'mind_actions';

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

function normalizeTaskContext(task: unknown, fallback: {
  sourceText?: string;
  createdAt?: number;
  workflowType?: WorkflowType;
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
  const lifecycleState = isTaskLifecycleState(record.lifecycleState)
    ? record.lifecycleState
    : fallback.lifecycleState ?? 'dumped';
  const workflowType = isWorkflowType(record.workflowType)
    ? record.workflowType
    : fallback.workflowType;
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
  const assistantMode = normalizeAssistantMode(record.assistantMode);
  const lastAiOperation = normalizeAiOperationName(record.lastAiOperation);
  const oneActionTracking = normalizeOneActionTracking(record.oneActionTracking);

  return {
    id,
    workflowType,
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
    sourceText,
    createdAt:
      typeof legacyContext === 'object' && legacyContext && 'createdAt' in legacyContext && typeof legacyContext.createdAt === 'number'
        ? legacyContext.createdAt
        : session.lastActive,
    workflowType: session.lastWorkflowType,
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
    workflowType: input.workflowType,
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

export function createDefaultSession(): AppSession {
  return normalizeSession({
    lastActive: Date.now(),
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    hasSeenResetNotice: false,
    hasSeenWalkthrough: false,
  });
}

export async function getSession(): Promise<AppSession> {
  const session = await get<AppSession & { activeDumpContext?: string | ActiveDumpContext; task?: TaskContext }>(SESSION_KEY);
  if (!session) return createDefaultSession();
  return normalizeSession(session);
}

export async function saveSession(session: AppSession): Promise<void> {
  const normalized = normalizeSession(session);
  normalized.lastActive = Date.now();
  await set(SESSION_KEY, normalized);
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

export async function exportAllData(): Promise<MindExport> {
  const [session, actions] = await Promise.all([getSession(), getActions()]);
  return {
    exportedAt: new Date().toISOString(),
    session,
    actions
  };
}

export async function clearAllData(): Promise<void> {
  await Promise.all([del(SESSION_KEY), del(ACTIONS_KEY)]);
}
