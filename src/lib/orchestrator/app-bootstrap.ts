import {
  type AppSession,
  type MemoryDegradationReason,
  type MemoryMode,
  type RoomScenarioType,
  type RoomWorkspace,
  ensureDemoRooms,
  getReadOnlyWorkspaceSnapshot,
  getRoomWorkspace,
  getSession,
  hydrateRoomSessionFromRecord,
  inspectStoredMemoryState,
  normalizeSession,
} from '@/lib/store/idb';

export interface BootstrapFlags {
  skipWalkthrough: boolean;
  skipMorningRitual: boolean;
  isPresentationMode: boolean;
  scenarioId: 'client_project_restart' | 'sales_inquiry_demo_request';
  allowAiDebug: boolean;
  showAiOpsDebug: boolean;
  allowObservationCapture: boolean;
  showObservationCapture: boolean;
}

export interface ResolvedBootstrapSession {
  session: AppSession;
  showResetBanner: boolean;
  showWalkthrough: boolean;
  isStale: boolean;
  interceptRoute: 'BOUNCE_BACK' | 'MORNING_RITUAL' | null;
}

interface LoadBootstrapWorkspaceOptions {
  isPresentationMode: boolean;
  scenarioId: RoomScenarioType;
}

export interface SafeBootstrapWorkspace {
  workspace: RoomWorkspace;
  storedSession: AppSession;
  memoryMode: MemoryMode;
  memoryDegradationReason?: MemoryDegradationReason;
}

export function parseBootstrapFlags(searchParams: URLSearchParams | null, nodeEnv = process.env.NODE_ENV): BootstrapFlags {
  const demoMode = searchParams?.get('demo');

  return {
    skipWalkthrough: searchParams?.get('walkthrough') === 'off',
    skipMorningRitual: searchParams?.get('ritual') === 'off',
    isPresentationMode: demoMode === 'presentation' || demoMode === '1',
    scenarioId: searchParams?.get('scenario') === 'sales'
      ? 'sales_inquiry_demo_request'
      : 'client_project_restart',
    allowAiDebug: searchParams?.get('debug') === 'ai',
    showAiOpsDebug: searchParams?.get('debug') === 'ai',
    allowObservationCapture: searchParams?.get('observe') === '1',
    showObservationCapture: searchParams?.get('observe') === '1',
  };
}

export function migrateLegacyActiveDumpContext(session: AppSession): AppSession | null {
  const legacyContext = (session as AppSession & { activeDumpContext?: unknown }).activeDumpContext;
  if (typeof legacyContext !== 'string') return null;

  return {
    ...session,
    activeDumpContext: {
      text: legacyContext,
      createdAt: session.lastActive,
    },
  };
}

export function shouldShowWalkthrough(session: AppSession, skipWalkthrough: boolean) {
  return !skipWalkthrough && session.hasSeenWalkthrough !== true && session.uiRoute === 'DUMP_ENTRY';
}

export function isSessionStale(session: Pick<AppSession, 'lastActive'>, now = Date.now()) {
  return now - session.lastActive > 24 * 60 * 60 * 1000;
}

export function resolveBootstrapSession(
  session: AppSession,
  {
    skipWalkthrough,
    skipMorningRitual,
    today,
    now = Date.now(),
  }: {
    skipWalkthrough: boolean;
    skipMorningRitual: boolean;
    today: string;
    now?: number;
  },
): ResolvedBootstrapSession {
  let nextSession = normalizeSession(session);
  let interceptRoute: ResolvedBootstrapSession['interceptRoute'] = null;
  const stale = isSessionStale(nextSession, now);
  const suppressReentryIntercept = nextSession.suppressReentryIntercept === true;

  if (stale && !suppressReentryIntercept && !['DUMP_ENTRY', 'MORNING_RITUAL'].includes(nextSession.uiRoute)) {
    nextSession = normalizeSession({
      ...nextSession,
      status: 'BOUNCE_BACK',
      uiRoute: 'BOUNCE_BACK',
    });
    interceptRoute = 'BOUNCE_BACK';
  } else if (
    !skipMorningRitual &&
    !stale &&
    nextSession.uiRoute === 'DUMP_ENTRY' &&
    nextSession.lastMorningShown !== today
  ) {
    nextSession = normalizeSession({
      ...nextSession,
      status: 'MORNING_RITUAL',
      uiRoute: 'MORNING_RITUAL',
    });
    interceptRoute = 'MORNING_RITUAL';
  }

  return {
    session: nextSession,
    showResetBanner: nextSession.hasSeenResetNotice === false,
    showWalkthrough: shouldShowWalkthrough(nextSession, skipWalkthrough),
    isStale: stale,
    interceptRoute,
  };
}

export async function loadBootstrapWorkspace({
  isPresentationMode,
  scenarioId,
}: LoadBootstrapWorkspaceOptions): Promise<{ workspace: RoomWorkspace; storedSession: AppSession }> {
  const workspace = isPresentationMode
    ? await ensureDemoRooms(scenarioId)
    : await getRoomWorkspace();

  const activeRoom = workspace.rooms.find((room) => room.id === workspace.activeRoomId);
  const storedSession = activeRoom
    ? hydrateRoomSessionFromRecord(activeRoom.session, activeRoom)
    : await getSession();
  return { workspace, storedSession };
}

export async function loadSafeBootstrapWorkspace(options: LoadBootstrapWorkspaceOptions): Promise<SafeBootstrapWorkspace> {
  const memory = await inspectStoredMemoryState();
  if (memory.mode === 'normal') {
    const loaded = await loadBootstrapWorkspace(options);
    return {
      ...loaded,
      memoryMode: 'normal',
    };
  }

  const workspace = await getReadOnlyWorkspaceSnapshot();
  const activeRoom = workspace.rooms.find((room) => room.id === workspace.activeRoomId);
  const storedSession = activeRoom
    ? hydrateRoomSessionFromRecord(activeRoom.session, activeRoom)
    : workspace.rooms[0]?.session ?? normalizeSession({
      lastActive: Date.now(),
      uiRoute: 'DUMP_ENTRY',
      notThisCount: 0,
      currentActionId: null,
    });

  return {
    workspace,
    storedSession,
    memoryMode: 'read_only_degraded',
    memoryDegradationReason: memory.reason,
  };
}

export function startAiHealthPolling(
  refresh: () => Promise<void>,
  intervalMs = 8000,
) {
  void refresh();
  const interval = window.setInterval(() => {
    void refresh();
  }, intervalMs);

  return () => {
    window.clearInterval(interval);
  };
}
