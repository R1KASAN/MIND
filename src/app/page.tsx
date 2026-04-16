"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getActions, AppSession, saveSession,
  Action, updateAction, createDefaultSession, type UIRoute,
  getRoomWorkspace,
  hydrateRoomSessionFromRecord,
  type RoomRecord,
} from '@/lib/store/idb';
import { processWeeklySweep } from '@/lib/store/memoryRules';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import { checkAiHealth, HealthCheckResult } from '@/lib/ai/adapter';
import { CANONICAL_LOCAL_PRIMARY_MODEL, DEFAULT_AI_START_ACTION } from '@/lib/ai/ollama-runtime';
import { AiRescueResponse } from '@/lib/ai/operations';
import type { AiOpsDebugEntry } from '@/lib/ai/ai-ops-debug';
import {
  buildPayloadFromAction,
  hasResumableTask,
} from '@/lib/orchestrator/task-machine';
import {
  loadBootstrapWorkspace,
  migrateLegacyActiveDumpContext,
  parseBootstrapFlags,
  resolveBootstrapSession,
  startAiHealthPolling,
} from '@/lib/orchestrator/app-bootstrap';
import { createTaskController } from '@/lib/orchestrator/task-controller';
import type { ScaffoldRefineFeedback } from '@/lib/orchestrator/scaffold-refine';
import { useRoomActions } from '@/lib/orchestrator/use-room-actions';
import {
  buildStudioSnapshot,
  getStudioIntents,
  hasFreshReentryBrief,
  type StudioIntent,
  type StudioIntentId,
} from '@/lib/orchestrator/studio';
import { PRIMARY_ICP } from '@/lib/business/monetization';
import {
  buildValuePulseContext,
  deriveValuePulseMode,
  hasSeenValuePulse,
  type ValuePulseContext,
} from '@/lib/value-pulse';

import { BrainDumpInput } from '@/components/BrainDump/Input';
import { ManualFallback } from '@/components/BrainDump/Fallback';
import { OneAction } from '@/components/ActionScaffold/OneAction';
import { Scaffold } from '@/components/ActionScaffold/Scaffold';
import { DecisionBoard } from '@/components/ActionScaffold/DecisionBoard';
import { Rescue } from '@/components/Recovery/Rescue';
import { BounceBack } from '@/components/Recovery/BounceBack';
import { Clarification } from '@/components/Recovery/Clarification';
import { ArchiveSearch } from '@/components/Recovery/ArchiveSearch';
import { OverviewOverlay } from '@/components/Overview/OverviewOverlay';
import { TrustOverlay } from '@/components/Trust/TrustOverlay';
import { MorningRitual } from '@/components/Ritual/MorningRitual';
import { WalkthroughOverlay } from '@/components/Walkthrough/WalkthroughOverlay';
import { AiOpsDebugPanel } from '@/components/Debug/AiOpsDebugPanel';
import { DemoObservationPanel } from '@/components/Debug/DemoObservationPanel';
import { StudioPanel } from '@/components/Studio/StudioPanel';
import { ValuePulse } from '@/components/ValuePulse/ValuePulse';
import { RoomSidebar } from '@/components/Rooms/RoomSidebar';
import { RoomCanvasHeader } from '@/components/Rooms/RoomCanvasHeader';

const DEFAULT_AI_HEALTH: HealthCheckResult = {
  status: 'checking',
  model: CANONICAL_LOCAL_PRIMARY_MODEL,
  modelTier: 'unknown',
  reason: 'กำลังโหลดโมเดล...',
  detail: 'กำลังตรวจสอบความพร้อมของ Ollama',
  retryable: true,
};

function formatModelLabel(model: string) {
  const lower = model.toLowerCase();
  if (lower.includes('gemma')) return 'Gemma';
  if (lower.includes('qwen')) return 'Qwen';
  if (lower.includes('llama')) return 'Emergency model';
  return model;
}

function getHealthRailContent(health: HealthCheckResult) {
  const modelLabel = formatModelLabel(health.model);

  if (health.status === 'ready' && health.modelTier === 'fallback') {
    return {
      badge: 'ใช้โมเดลสำรอง',
      headline: `${modelLabel} กำลังพยุง loop นี้อยู่`,
      detail: 'AI ยังใช้งานได้ปกติ แม้โมเดลหลักจะยังไม่พร้อม',
      tone: 'fallback' as const,
    };
  }

  if (health.status === 'ready' && health.modelTier === 'emergency') {
    return {
      badge: 'Fallback mode',
      headline: `${modelLabel} พร้อมใช้งาน`,
      detail: 'ระบบยังไปต่อได้ แต่คุณภาพอาจต่ำกว่าโมเดลหลัก',
      tone: 'fallback' as const,
    };
  }

  if (health.status === 'ready') {
    return {
      badge: 'AI พร้อม',
      headline: `${modelLabel} พร้อมแล้ว`,
      detail: 'เปิดห้องแล้วให้ MIND สรุปและพาไปต่อได้ทันที',
      tone: 'ready' as const,
    };
  }

  if (health.status === 'checking') {
    return {
      badge: 'กำลังเตรียมโมเดล',
      headline: `${modelLabel} กำลัง warm up`,
      detail: health.detail ?? 'MIND จะใช้ cached save point ไปก่อนระหว่างรอ AI',
      tone: 'checking' as const,
    };
  }

  if (health.status === 'model_missing') {
    return {
      badge: 'ยังไม่พบโมเดล',
      headline: 'ติดตั้งโมเดลก่อนเพื่อเปิด AI loop',
      detail: health.actions?.[0] ?? `ollama pull ${CANONICAL_LOCAL_PRIMARY_MODEL}`,
      tone: 'missing' as const,
    };
  }

  return {
    badge: 'AI ยังไม่พร้อม',
    headline: `${modelLabel} ยังใช้งานไม่ได้`,
    detail: health.actions?.[0] ?? health.detail ?? DEFAULT_AI_START_ACTION,
    tone: 'unavailable' as const,
  };
}

// T028/T029: Local-timezone "today" string for morning ritual day comparison
function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StateMachinePage() {
  // NOTE: During first external demos, avoid changing route rendering structure or analytics wiring here.
  // Keep edits scoped to UI clarity, extracted helpers, and narrow interaction fixes.
  useTrackMountEvent('app_launch');
  const router = useRouter();

  const [session, setSession] = useState<AppSession | null>(null);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const sessionRef = useRef<AppSession | null>(null);
  const aiStatusRef = useRef<HealthCheckResult['status']>('checking');
  const [currentPayload, setCurrentPayload] = useState<AiSynthesisResponse | null>(null);
  const [currentActionState, setCurrentActionState] = useState<Action | null>(null);
  const [manualFallbackSuggestedActions, setManualFallbackSuggestedActions] = useState<string[]>([]);
  const [manualFallbackRetryable, setManualFallbackRetryable] = useState(true);
  const [clarificationPrompt, setClarificationPrompt] = useState<string>('');
  const [currentWhyThisNow, setCurrentWhyThisNow] = useState<string>('');
  const [currentRescueState, setCurrentRescueState] = useState<AiRescueResponse | null>(null);
  const [isRescueLoading, setIsRescueLoading] = useState(false);
  const [isNegotiatingAction, setIsNegotiatingAction] = useState(false);
  const [isReentryLoading, setIsReentryLoading] = useState(false);
  const [isScaffoldRefining, setIsScaffoldRefining] = useState(false);
  const [scaffoldRefineFeedback, setScaffoldRefineFeedback] = useState<ScaffoldRefineFeedback | null>(null);

  // Overlays
  const [showArchive, setShowArchive] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [aiOpsEntries, setAiOpsEntries] = useState<AiOpsDebugEntry[]>([]);
  const [allowAiDebug, setAllowAiDebug] = useState(process.env.NODE_ENV !== 'production');
  const [showAiOpsDebug, setShowAiOpsDebug] = useState(false);
  const [allowObservationCapture, setAllowObservationCapture] = useState(false);
  const [showObservationCapture, setShowObservationCapture] = useState(false);
  const [activeStudioIntent, setActiveStudioIntent] = useState<StudioIntentId | null>(null);

  // T046: Background AI status — non-blocking passive indicator
  const [aiHealth, setAiHealth] = useState<HealthCheckResult>(DEFAULT_AI_HEALTH);

  // T057: Time-to-action tracking
  const [dumpStartTime, setDumpStartTime] = useState<number | null>(null);

  // T032: Reset notice
  const [showResetBanner, setShowResetBanner] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [demoScenarioId, setDemoScenarioId] = useState<'client_project_restart' | 'sales_inquiry_demo_request'>('client_project_restart');
  const [showSecondaryTools, setShowSecondaryTools] = useState(false);
  const taskOpenedRef = useRef<string | null>(null);
  const reentryUnderstoodRef = useRef<string | null>(null);
  const previousUiRouteRef = useRef<UIRoute | null>(null);
  const valuePulseAnchorRef = useRef<ValuePulseContext | null>(null);
  const [activeValuePulseContext, setActiveValuePulseContext] = useState<ValuePulseContext | null>(null);

  // T017: Pin cap counter — hoisted before early return to respect hooks order
  const [pinnedCountLocal, setPinnedCountLocal] = useState<number>(0);

  // ── On load ──────────────────────────────────────────────────────────────

  // T017: Sync pin count when action/status changes
  useEffect(() => {
    getActions().then((acts) => {
      const count = acts.filter((a) => a.isPinned && a.state !== 'ARCHIVED').length;
      setPinnedCountLocal(count);
    });
  }, [session?.uiRoute, currentActionState?.isPinned]);

  useEffect(() => {
    const updateAiHealth = (result: HealthCheckResult) => {
      if (aiStatusRef.current !== result.status) {
        if (result.status === 'ready') trackEvent('healthcheck_passed');
        else if (result.status === 'unavailable') trackEvent('ollama_unavailable');
        else if (result.status === 'model_missing') trackEvent('model_missing');
      }
      aiStatusRef.current = result.status;
      setAiHealth(result);
    };

    const refreshAiStatus = async () => {
      const result = await checkAiHealth();
      updateAiHealth(result);
    };

    return startAiHealthPolling(refreshAiStatus);
  }, []);

  const refreshRooms = useCallback(async () => {
    const workspace = await getRoomWorkspace();
    setRooms(workspace.rooms);
    setActiveRoomId(workspace.activeRoomId);
    return workspace;
  }, []);

  const hydrateSessionState = useCallback(async (nextSession: AppSession) => {
    const actions = await getActions();
    const hydratedAction = nextSession.currentActionId
      ? actions.find((action) => action.id === nextSession.currentActionId) || null
      : null;

    setSession(nextSession);
    sessionRef.current = nextSession;
    setCurrentActionState(hydratedAction);
    setCurrentWhyThisNow(nextSession.task?.actionExplanation ?? '');
    setCurrentRescueState(null);
    setClarificationPrompt('');
    setScaffoldRefineFeedback(null);
    setIsRescueLoading(false);
    setIsNegotiatingAction(false);
    setIsReentryLoading(false);
    setIsScaffoldRefining(false);

    if (nextSession.currentPayload) {
      setCurrentPayload(nextSession.currentPayload);
    } else if (hydratedAction) {
      setCurrentPayload(buildPayloadFromAction(hydratedAction));
    } else {
      setCurrentPayload(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const flags = parseBootstrapFlags(
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null,
      );

      setPresentationMode(flags.isPresentationMode);
      setDemoScenarioId(flags.scenarioId);
      setAllowAiDebug(flags.allowAiDebug);
      setShowAiOpsDebug(flags.showAiOpsDebug);
      setAllowObservationCapture(flags.allowObservationCapture);
      setShowObservationCapture(flags.showObservationCapture);

      await processWeeklySweep();
      const { workspace, storedSession } = await loadBootstrapWorkspace({
        isPresentationMode: flags.isPresentationMode,
        scenarioId: flags.scenarioId,
      });
      if (cancelled) return;

      setRooms(workspace.rooms);
      setActiveRoomId(workspace.activeRoomId);
      let nextSession = storedSession;
      const activeRoomSession = workspace.rooms.find((room) => room.id === workspace.activeRoomId)?.session;
      if (activeRoomSession && activeRoomSession !== storedSession) {
        await saveSession(storedSession);
      }
      const migratedSession = migrateLegacyActiveDumpContext(storedSession);
      if (migratedSession) {
        nextSession = migratedSession;
        await saveSession(nextSession);
      }

      const resolvedBootstrap = resolveBootstrapSession(nextSession, {
        skipWalkthrough: flags.skipWalkthrough,
        skipMorningRitual: flags.skipMorningRitual,
        today: localDateString(),
      });

      nextSession = resolvedBootstrap.session;
      if (resolvedBootstrap.interceptRoute) {
        await saveSession(nextSession);
      }
      if (cancelled) return;

      setShowResetBanner(resolvedBootstrap.showResetBanner);
      setShowWalkthrough(resolvedBootstrap.showWalkthrough);

      await hydrateSessionState(nextSession);
      if (cancelled) return;
      await refreshRooms();
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [hydrateSessionState, refreshRooms]);

  useEffect(() => {
    if (session?.task?.actionExplanation !== undefined) {
      setCurrentWhyThisNow(session.task.actionExplanation ?? '');
    }
  }, [session?.task?.actionExplanation]);

  useEffect(() => {
    if (session?.uiRoute !== 'DUMP_ENTRY') {
      setShowSecondaryTools(false);
    }
  }, [session?.uiRoute]);

  const persistSessionWithRooms = useCallback(async (nextSession: AppSession) => {
    await saveSession(nextSession);
    const workspace = await refreshRooms();
    setRooms(workspace.rooms);
    setActiveRoomId(workspace.activeRoomId);
  }, [refreshRooms]);

  const controller = createTaskController({
    session,
    sessionRef,
    currentPayload,
    currentActionState,
    clarificationPrompt,
    dumpStartTime,
    aiModel: aiHealth.model,
    setSession,
    setCurrentPayload,
    setCurrentActionState,
    setManualFallbackSuggestedActions,
    setManualFallbackRetryable,
    setClarificationPrompt,
    setCurrentWhyThisNow,
    setCurrentRescueState,
    setIsRescueLoading,
    setIsNegotiatingAction,
    setIsReentryLoading,
    isScaffoldRefining,
    setIsScaffoldRefining,
    setScaffoldRefineFeedback,
    setDumpStartTime,
    recordAiOpsEntry: (entry) => {
      setAiOpsEntries((current) => [entry, ...current].slice(0, 12));
    },
    persistSession: persistSessionWithRooms,
    businessContext: {
      scenarioId: demoScenarioId,
      icpTag: PRIMARY_ICP.id,
    },
  });

  useEffect(() => {
    if (!session) return;
    if (isReentryLoading) return;
    if (session.uiRoute !== 'BOUNCE_BACK' && session.uiRoute !== 'MORNING_RITUAL') return;
    if (!hasResumableTask(session.task)) return;
    const existingBrief = session.task?.reentryBrief;
    const reentryIsFresh = existingBrief && existingBrief.createdAt >= session.lastActive;
    if (reentryIsFresh) return;
    const scope = session.uiRoute === 'BOUNCE_BACK' ? 'bounce_back' : 'morning_ritual';

    void controller.loadReentryBrief(scope);
    // We intentionally key this effect off task/session state instead of the helper identity
    // so dev-time HMR does not trip over callback reinitialization for reentry loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActionState, isReentryLoading, session, session?.lastActive, session?.task?.id, session?.task?.reentryBrief?.createdAt, session?.uiRoute]);

  useEffect(() => {
    if (!session?.task) return;
    if (!['DUMP_ENTRY', 'BOUNCE_BACK', 'MORNING_RITUAL'].includes(session.uiRoute)) return;
    const openKey = `${session.uiRoute}:${session.task.id}:${session.task.createdAt}`;
    if (taskOpenedRef.current === openKey) return;

    taskOpenedRef.current = openKey;
    trackEvent('task_opened', {
      room_id: session.roomId,
      room_title: session.roomTitle,
      room_scenario_type: session.roomScenarioType,
      task_id: session.task.id,
      session_id: String(session.lastActive),
      ui_route: session.uiRoute,
      assistant_mode: session.task.assistantMode,
      scenario_id: demoScenarioId,
      icp_tag: PRIMARY_ICP.id,
      source_context_count: session.task.sourceFiles.length + (session.task.sourceText.trim().length > 0 ? 1 : 0),
    });
  }, [demoScenarioId, session]);

  useEffect(() => {
    if (!session?.task?.reentryBrief) return;
    if (!['BOUNCE_BACK', 'MORNING_RITUAL'].includes(session.uiRoute)) return;
    const understoodKey = `${session.uiRoute}:${session.task.id}:${session.task.reentryBrief.createdAt}`;
    if (reentryUnderstoodRef.current === understoodKey) return;

    reentryUnderstoodRef.current = understoodKey;
    trackEvent('reentry_understood', {
      room_id: session.roomId,
      room_title: session.roomTitle,
      room_scenario_type: session.roomScenarioType,
      task_id: session.task.id,
      session_id: String(session.lastActive),
      ui_route: session.uiRoute,
      assistant_mode: session.task.assistantMode,
      scenario_id: demoScenarioId,
      icp_tag: PRIMARY_ICP.id,
      source_context_count: session.task.sourceFiles.length + (session.task.sourceText.trim().length > 0 ? 1 : 0),
      outcome_label: 'reentry_brief_visible',
    });
  }, [demoScenarioId, session]);

  useEffect(() => {
    if (!session?.task) return;
    const mode = deriveValuePulseMode(session.uiRoute, session.task.workflowType, demoScenarioId);
    valuePulseAnchorRef.current = buildValuePulseContext({
      mode,
      taskId: session.task.id,
      roomId: session.roomId,
      roomTitle: session.roomTitle,
      roomScenarioType: session.roomScenarioType,
      sessionId: String(session.lastActive),
      scenarioId: demoScenarioId,
      icpTag: PRIMARY_ICP.id,
      route: session.uiRoute,
    });
  }, [demoScenarioId, session?.lastActive, session?.roomId, session?.roomScenarioType, session?.roomTitle, session?.task, session?.task?.id, session?.task?.workflowType, session?.uiRoute]);

  useEffect(() => {
    if (!session) return;
    const previousRoute = previousUiRouteRef.current;
    previousUiRouteRef.current = session.uiRoute;

    if (!previousRoute) return;
    if (presentationMode) return;

    if (session.uiRoute !== 'DUMP_ENTRY' || previousRoute === 'DUMP_ENTRY') {
      if (session.uiRoute !== 'DUMP_ENTRY') {
        setActiveValuePulseContext(null);
      }
      return;
    }

    const anchor = valuePulseAnchorRef.current;
    if (!anchor) return;
    if (hasSeenValuePulse(anchor.id)) return;
    setActiveValuePulseContext(anchor);
  }, [presentationMode, session?.uiRoute, session]);

  useEffect(() => {
    if (session?.uiRoute === 'DUMP_ENTRY') return;
    setActiveValuePulseContext(null);
  }, [session?.uiRoute]);

  const {
    activeRoom,
    roomCardCanContinue,
    roomCardCanMakeSmaller,
    handleCreateRoom,
    handleSelectRoom,
    handleContinueFromRoomCard,
    handleMakeSmallerFromRoomCard,
  } = useRoomActions({
    rooms,
    activeRoomId,
    session,
    currentPayload,
    currentActionState,
    demoScenarioId,
    controller,
    hydrateSessionState,
    refreshRooms,
    resetRoomInteractionState: () => {
      taskOpenedRef.current = null;
      reentryUnderstoodRef.current = null;
      previousUiRouteRef.current = null;
    },
  });

  useEffect(() => {
    if (!session || !activeRoom) return;
    if (isNegotiatingAction || isReentryLoading || isRescueLoading || isScaffoldRefining) return;

    const recoveredSession = hydrateRoomSessionFromRecord(session, activeRoom);
    if (recoveredSession === session) return;

    void (async () => {
      await hydrateSessionState(recoveredSession);
      await persistSessionWithRooms(recoveredSession);
    })();
  }, [
    activeRoom,
    hydrateSessionState,
    isNegotiatingAction,
    isReentryLoading,
    isRescueLoading,
    isScaffoldRefining,
    persistSessionWithRooms,
    session,
  ]);

  if (!session) return null;

  const studioSnapshot = buildStudioSnapshot(session.task, currentActionState, currentPayload);
  const studioIntents = getStudioIntents(session, currentActionState, currentPayload);
  const routePrefersCanvasFirst = ['DUMP_ENTRY', 'BOUNCE_BACK', 'MORNING_RITUAL', 'ONE_ACTION'].includes(session.uiRoute);
  const routeMaxWidth = session.uiRoute === 'DUMP_ENTRY' ? '64rem' : '50rem';
  const routeUsesReducedChrome = ['BOUNCE_BACK', 'MORNING_RITUAL', 'ONE_ACTION'].includes(session.uiRoute);

  const handleEditCurrentContext = async () => {
    await controller.openDumpWithCurrentContext();
  };

  const handleStudioIntent = async (intent: StudioIntent) => {
    const baseProperties = {
      roomId: session.roomId,
      roomTitle: session.roomTitle,
      intent: intent.id,
      uiRoute: session.uiRoute,
      taskPresent: Boolean(session.task),
      actionPresent: Boolean(currentActionState),
    };

    if (!intent.active) {
      trackEvent('studio_intent_blocked', {
        ...baseProperties,
        blockedReason: intent.blockedReason,
      });
      return;
    }

    trackEvent('studio_intent_clicked', baseProperties);
    setActiveStudioIntent(intent.id);

    try {
      switch (intent.id) {
        case 'review_status': {
          if (session.task && hasResumableTask(session.task) && !hasFreshReentryBrief(session.task, session.lastActive)) {
            await controller.loadReentryBrief('bounce_back');
          }
          break;
        }
        case 'next_move': {
          if (currentActionState && currentPayload) {
            await controller.resumeTaskFromRoute('ONE_ACTION');
          } else {
            await controller.handleRetry();
          }
          break;
        }
        case 'make_smaller': {
          await controller.resumeTaskFromRoute('SCAFFOLD');
          break;
        }
        case 'unstick': {
          await controller.handleEnterRescue();
          break;
        }
      }

      trackEvent('studio_intent_resolved', baseProperties);
    } finally {
      setActiveStudioIntent(null);
    }
  };

  // ── Pin/Unpin with hard UI cap ─────────────────────────────────────────────

  const getPinnedCount = async (): Promise<number> => {
    const { getActions: getActs } = await import('@/lib/store/idb');
    const acts = await getActs();
    return acts.filter((a) => a.isPinned && a.state !== 'ARCHIVED').length;
  };

  const togglePin = async () => {
    if (!currentActionState) return;
    const isCurrentlyPinned = currentActionState.isPinned;

    // T017: Hard UI cap — only check count when pinning, not unpinning
    if (!isCurrentlyPinned) {
      const pinnedCount = await getPinnedCount();
      if (pinnedCount >= 3) return; // Button should already be disabled; belt-and-suspenders guard
    }

    const newVal = !isCurrentlyPinned;
    await updateAction(currentActionState.id, { isPinned: newVal });
    setCurrentActionState({ ...currentActionState, isPinned: newVal });
    if (newVal) trackEvent('pinned_item_created');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderState = () => {
    switch (session.uiRoute) {
      case 'MORNING_RITUAL':
        return (
          <MorningRitual
            reentryBrief={session.task?.reentryBrief}
            snapshot={studioSnapshot}
            loading={isReentryLoading}
            onResumeSuggested={session.task?.reentryBrief ? controller.resumeFromSuggestedReentry : undefined}
            onResumeCheckpoint={hasResumableTask(session.task)
              ? async () => {
                  trackEvent('morning_ritual_reentry_checkpoint');
                  await controller.resumeTaskFromRoute(controller.deriveResumeRoute());
                }
              : undefined}
            onStart={async () => {
              const today = localDateString();
              await controller.updateStatus('DUMP_ENTRY', { lastMorningShown: today });
            }}
            onSkip={async () => {
              const today = localDateString();
              await controller.updateStatus('DUMP_ENTRY', { lastMorningShown: today });
            }}
            onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
          />
        );

      case 'BOUNCE_BACK':
        return (
          <BounceBack
            actionTitle={currentActionState?.title ?? session.task?.currentPlan?.actionTitle ?? 'งานนี้'}
            reentryBrief={session.task?.reentryBrief}
            snapshot={studioSnapshot}
            loading={isReentryLoading}
            onUseSuggested={session.task?.reentryBrief ? controller.resumeFromSuggestedReentry : undefined}
            onContinue={async () => {
              trackEvent('bounce_back_resumed');
              await controller.resumeTaskFromRoute(controller.deriveResumeRoute());
            }}
            onStartFresh={async () => {
              await controller.resumeTaskFromRoute('DUMP_ENTRY');
            }}
            onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
          />
        );

      case 'CLARIFICATION':
        return (
          <Clarification
            prompt={clarificationPrompt || 'ตอนนี้ควรตอบลูกค้าหรือเริ่มงานค้างส่วนไหนก่อน'}
            onSubmit={controller.handleClarificationSubmit}
          />
        );

      case 'DUMP_ENTRY':
        return (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <BrainDumpInput
                onNext={controller.handleDump}
                initialText={session.activeDumpContext?.text}
                presentationMode={presentationMode}
                defaultScenarioId={demoScenarioId}
              />
              {showResetBanner && (
                <div
                  style={{
                    padding: '0.75rem 0.95rem',
                    borderRadius: 'calc(var(--radius) + 2px)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    รายการก่อนหน้านี้ยังอยู่ในคลังเก็บ เปิดดูเมื่อจำเป็นได้
                  </p>
                  <button
                    onClick={async () => {
                      setShowResetBanner(false);
                      const updated = { ...session, hasSeenResetNotice: true };
                      sessionRef.current = updated;
                      setSession(updated);
                      await persistSessionWithRooms(updated);
                    }}
                    style={{ background: 'transparent', fontSize: '0.8rem', padding: '0.2rem 0.4rem', color: 'var(--text-secondary)' }}
                  >
                    ซ่อน
                  </button>
                </div>
              )}
              <details
                style={{
                  width: '100%',
                  padding: '0.95rem 1rem',
                  borderRadius: 'calc(var(--radius) + 4px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                  }}
                >
                  ดูบริบทและตัวช่วยเพิ่มเติม
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.9rem' }}>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    เปิดส่วนนี้เมื่อต้องการดูสถานะล่าสุด หา next move จากบริบทเดิม หรือใช้ตัวช่วยรองเพิ่มเติม
                  </p>
                  <StudioPanel
                    snapshot={studioSnapshot}
                    intents={studioIntents}
                    loadingIntentId={activeStudioIntent}
                    onIntent={handleStudioIntent}
                    onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
                  />
                </div>
              </details>
            </div>
          </>
        );

      case 'SYNTHESIZING':
        return (
          <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
            <div className="spinner" />
            <p>กำลังคลี่สิ่งที่อยู่ในหัว…</p>
          </div>
        );

      case 'ONE_ACTION':
        if (!currentPayload) return <div />;
        return (
          <OneAction
            data={currentPayload}
            action={currentActionState}
            whyThisNow={currentWhyThisNow}
            constraints={session.task?.constraints}
            negotiationLoading={isNegotiatingAction}
            onMarkAdjusted={controller.handleOneActionAdjustmentTouched}
            onNegotiate={controller.handleActionNegotiation}
            onAccept={controller.handleAcceptAction}
            onReject={controller.handleRejectAction}
          />
        );

      case 'DECISION_BOARD':
        if (!currentPayload) return <div />;
        return (
          <DecisionBoard
            alternatives={currentPayload.alternative_actions}
            onBack={controller.handleReturnToPrimaryAction}
            onSelect={controller.handleDecisionBoardSelect}
          />
        );

      case 'SCAFFOLD':
        if (!currentPayload) return <div />;
        return (
          <Scaffold
            action={currentPayload.recommended_action}
            steps={session.task?.currentPlan?.steps ?? currentPayload.recommended_action.micro_steps.map((step, index) => ({
              id: `step-${index + 1}`,
              text: step,
            }))}
            currentStepIndex={session.task?.currentStepIndex ?? 0}
            isCompletion={session.task?.assistantMode === 'scaffold_completion'}
            successSignal={session.task?.currentPlan?.successSignal}
            refineLoading={isScaffoldRefining}
            refineFeedback={scaffoldRefineFeedback}
            onRescue={controller.handleEnterRescue}
            onMakeSmaller={controller.handleMakeSmaller}
            onComplete={controller.handleCompleteScaffold}
            onBackToSteps={controller.handleReturnToScaffoldSteps}
            onStartNew={controller.handleStartNewFromCompletedScaffold}
          />
        );

      case 'RESCUE':
        return (
          <Rescue
            loading={isRescueLoading}
            rescueState={currentRescueState}
            refineLoading={isScaffoldRefining}
            refineFeedback={scaffoldRefineFeedback}
            onMakeSmaller={controller.handleMakeSmaller}
            onWalkAway={controller.handleWalkAwayFromRescue}
          />
        );

      case 'MANUAL_FALLBACK':
        return (
          <ManualFallback
            onRescue={controller.handleManualRescue}
            onRetry={controller.handleRetry}
            onManualContinue={() => undefined}
            lastFailureReason={session.task?.lastFailureReason ?? session.lastFailureReason}
            suggestedActions={manualFallbackSuggestedActions.length > 0 ? manualFallbackSuggestedActions : aiHealth.actions}
            retryable={manualFallbackRetryable}
          />
        );

      default:
        return <div />;
    }
  };

  // ── Pin button state (T017) ──────────────────────────────────────────────

  const healthRail = getHealthRailContent(aiHealth);
  const showPinButton = ['ONE_ACTION', 'SCAFFOLD'].includes(session.uiRoute) && !!currentActionState;
  const isPinned = currentActionState?.isPinned ?? false;
  const pinDisabled = !isPinned && pinnedCountLocal >= 3;

  return (
    <>
      {/* Overlays */}
      {showArchive && <ArchiveSearch onClose={() => setShowArchive(false)} />}
      {showOverview && session && (
        <OverviewOverlay session={session} onClose={() => setShowOverview(false)} />
      )}
      {showTrust && (
        <TrustOverlay
          onClose={() => setShowTrust(false)}
          onDataDeleted={async () => {
            setShowTrust(false);
            const workspace = await getRoomWorkspace();
            const reset = workspace.rooms.find((room) => room.id === workspace.activeRoomId)?.session ?? createDefaultSession();
            sessionRef.current = reset;
            setSession(reset);
            setRooms(workspace.rooms);
            setActiveRoomId(workspace.activeRoomId);
            setCurrentPayload(null);
            setCurrentActionState(null);
            setClarificationPrompt('');
            setCurrentRescueState(null);
            setIsRescueLoading(false);
            setIsNegotiatingAction(false);
            setIsReentryLoading(false);
            setIsScaffoldRefining(false);
            setScaffoldRefineFeedback(null);
            setShowResetBanner(false);
            setShowWalkthrough(false);
          }}
        />
      )}
      {showWalkthrough && session && (
        <WalkthroughOverlay
          autoPlay={presentationMode}
          onClose={async () => {
            setShowWalkthrough(false);
            const base = sessionRef.current ?? session;
            const updated = { ...base, hasSeenWalkthrough: true };
            sessionRef.current = updated;
            setSession(updated);
            await persistSessionWithRooms(updated);
          }}
          onFinish={async () => {
            const base = sessionRef.current ?? session;
            const updated = { ...base, hasSeenWalkthrough: true };
            sessionRef.current = updated;
            setSession(updated);
            await persistSessionWithRooms(updated);
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem 0' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: routeUsesReducedChrome ? '0.7rem' : '1rem',
          borderBottom: routeUsesReducedChrome ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--bg-secondary)'
        }}>
          <div className={`app-health-rail app-health-rail-${healthRail.tone}`}>
            <span className="app-health-dot" aria-hidden="true" />
            <div className="app-health-copy">
              <div className="app-health-row">
                <span className="app-health-badge">{healthRail.badge}</span>
                <span className="app-health-headline">{healthRail.headline}</span>
              </div>
              {!routeUsesReducedChrome && <p className="app-health-detail">{healthRail.detail}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {session.uiRoute === 'DUMP_ENTRY' ? (
              <>
                <button
                  onClick={() => setShowSecondaryTools((value) => !value)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    padding: '0.55rem 0.9rem',
                    fontSize: '0.85rem',
                  }}
                >
                  {showSecondaryTools ? 'ซ่อนเมนูรอง' : 'เมนูรอง'}
                </button>
                {showSecondaryTools && (
                  <>
                    <button
                      onClick={() => setShowWalkthrough(true)}
                      style={{ background: 'transparent' }}
                    >
                      ดูเดโม 30 วินาที
                    </button>
                    <button
                      onClick={() => router.push('/pmf-guide')}
                      style={{ background: 'transparent' }}
                    >
                      PMF guide
                    </button>
                    <button
                      onClick={() => router.push('/business')}
                      style={{ background: 'transparent' }}
                    >
                      Business gates
                    </button>
                    <button onClick={() => setShowArchive(true)} style={{ background: 'transparent' }}>คลังเก็บ</button>
                    <button onClick={() => setShowOverview(true)} style={{ background: 'transparent' }}>ภาพรวม</button>
                    <button onClick={() => setShowTrust(true)} style={{ background: 'transparent' }}>ความไว้ใจ</button>
                    {allowAiDebug && (
                      <button onClick={() => setShowAiOpsDebug((value) => !value)} style={{ background: 'transparent' }}>
                        AI Ops
                      </button>
                    )}
                  </>
                )}
              </>
            ) : routeUsesReducedChrome ? (
              <>
                <button
                  onClick={() => setShowSecondaryTools((value) => !value)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    padding: '0.55rem 0.9rem',
                    fontSize: '0.85rem',
                  }}
                >
                  {showSecondaryTools ? 'ซ่อนเมนูรอง' : 'เมนูรอง'}
                </button>
                {showSecondaryTools && (
                  <>
                    <button
                      onClick={() => setShowWalkthrough(true)}
                      style={{ background: 'transparent' }}
                    >
                      วิธีใช้
                    </button>
                    {showPinButton && (
                      <button
                        onClick={togglePin}
                        disabled={pinDisabled}
                        title={pinDisabled ? 'ปักหมุดได้สูงสุด 3 รายการ' : isPinned ? 'เอาหมุดออก' : 'ปักหมุดก้าวนี้'}
                        style={{
                          background: 'transparent',
                          opacity: pinDisabled ? 0.4 : 1,
                          cursor: pinDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isPinned ? '📌 เอาหมุดออก' : '📍 ปักหมุด'}
                      </button>
                    )}
                    <button onClick={() => setShowArchive(true)} style={{ background: 'transparent' }}>คลังเก็บ</button>
                    <button onClick={() => setShowOverview(true)} style={{ background: 'transparent' }}>ภาพรวม</button>
                    <button onClick={() => setShowTrust(true)} style={{ background: 'transparent' }}>ความไว้ใจ</button>
                    {allowAiDebug && (
                      <button onClick={() => setShowAiOpsDebug((value) => !value)} style={{ background: 'transparent' }}>
                        AI Ops
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {allowAiDebug && (
                  <button
                    onClick={() => setShowAiOpsDebug((value) => !value)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-secondary)',
                      padding: '0.55rem 0.9rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    AI Ops
                  </button>
                )}
                <button
                  onClick={() => setShowWalkthrough(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    padding: '0.55rem 0.9rem',
                    fontSize: '0.85rem',
                  }}
                >
                  วิธีใช้
                </button>
                {showPinButton && (
                  <button
                    onClick={togglePin}
                    disabled={pinDisabled}
                    title={pinDisabled ? 'ปักหมุดได้สูงสุด 3 รายการ' : isPinned ? 'เอาหมุดออก' : 'ปักหมุดก้าวนี้'}
                    style={{
                      background: 'transparent',
                      opacity: pinDisabled ? 0.4 : 1,
                      cursor: pinDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isPinned ? '📌 เอาหมุดออก' : '📍 ปักหมุด'}
                  </button>
                )}
                <button onClick={() => setShowArchive(true)} style={{ background: 'transparent' }}>🔍</button>
                <button onClick={() => setShowOverview(true)} style={{ background: 'transparent' }}>☰</button>
                <button onClick={() => setShowTrust(true)} style={{ background: 'transparent' }}>🔒</button>
              </>
            )}
          </div>
        </div>

        {/* T017 cap cue — shown below header when limit is reached */}
        {pinDisabled && showPinButton && (
          <p style={{
            fontSize: '0.75rem', color: 'var(--text-secondary)',
            textAlign: 'right', margin: '0.25rem 0 0'
          }}>
            ปักหมุดได้สูงสุด 3 รายการ
          </p>
        )}

        <div className="mind-room-shell">
          <RoomSidebar
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={handleSelectRoom}
            onCreateRoom={handleCreateRoom}
          />

          <div className="mind-room-main">
            {routePrefersCanvasFirst ? (
              <>
                <div
                  style={{
                    width: '100%',
                    maxWidth: routeMaxWidth,
                  }}
                >
                  {renderState()}
                </div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: routeMaxWidth,
                  }}
                >
                  <RoomCanvasHeader
                    room={activeRoom}
                    onContinue={handleContinueFromRoomCard}
                    onMakeSmaller={handleMakeSmallerFromRoomCard}
                    continueDisabled={!roomCardCanContinue}
                    makeSmallerDisabled={!roomCardCanMakeSmaller}
                  />
                </div>
              </>
            ) : (
              <>
                <RoomCanvasHeader
                  room={activeRoom}
                  onContinue={handleContinueFromRoomCard}
                  onMakeSmaller={handleMakeSmallerFromRoomCard}
                  continueDisabled={!roomCardCanContinue}
                  makeSmallerDisabled={!roomCardCanMakeSmaller}
                />
                <div
                  style={{
                    width: '100%',
                    maxWidth: routeMaxWidth,
                  }}
                >
                  {renderState()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {activeValuePulseContext && !presentationMode && !showArchive && !showOverview && !showTrust && !showWalkthrough && !showAiOpsDebug && !showObservationCapture && (
        <ValuePulse
          context={activeValuePulseContext}
          onClose={() => setActiveValuePulseContext(null)}
        />
      )}
      {allowAiDebug && (
        <AiOpsDebugPanel
          entries={aiOpsEntries}
          open={showAiOpsDebug}
          onToggle={() => setShowAiOpsDebug((value) => !value)}
        />
      )}
      {allowObservationCapture && (
        <DemoObservationPanel
          currentRoute={session?.uiRoute}
          open={showObservationCapture}
          onToggle={() => setShowObservationCapture((value) => !value)}
        />
      )}
    </>
  );
}
