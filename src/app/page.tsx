"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getActions, AppSession, saveSession,
  Action, updateAction, createDefaultSession, type UIRoute,
  getRoomWorkspace,
  hydrateRoomSessionFromRecord,
  loadRoomFileBlob,
  normalizeSession,
  createTaskContext,
  type MemoryDegradationReason,
  type MemoryMode,
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
  deriveRoomBlockers,
  hasResumableTask,
} from '@/lib/orchestrator/task-machine';
import {
  buildRoomSidebarItems,
  rankResumeRooms,
  selectActiveRoomReentry,
  resolveHomeEntryState,
  selectRankedResumeRooms,
  selectResumeRoom,
  type ActiveRoomReentryState,
  type RankedResumeRoom,
} from '@/lib/orchestrator/home-entry';
import {
  buildPreferredRoomSourceContext,
  createAutoRoomSourcePreference,
  getRoomSourceIdForFile,
  stripRoomFileContext,
  type RoomSubmission,
  type RoomSourceFile,
} from '@/lib/room';
import {
  loadSafeBootstrapWorkspace,
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
import { recordTaskSourcesInRoomMemory } from '@/lib/orchestrator/task-events';
import { markRoomMemoryRefDeleted } from '@/lib/store/room-memory-db';
import { reportClientAsyncError } from '@/lib/orchestrator/async-error';

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
import { DataReviewPanel } from '@/components/Studio/DataReviewPanel';
import { ValuePulse } from '@/components/ValuePulse/ValuePulse';
import { RoomSidebar } from '@/components/Rooms/RoomSidebar';
import { RoomCanvasHeader } from '@/components/Rooms/RoomCanvasHeader';
import { AIProcessingIndicator } from '@/components/AI/AIProcessingIndicator';
import { GetStartedHome } from '@/components/Home/GetStartedHome';
import { ResumePrompt } from '@/components/Home/ResumePrompt';
import { ActiveRoomReentryCard } from '@/components/Home/ActiveRoomReentryCard';

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

const AI_OFFLINE_MANUAL_COPY = 'AI ในเครื่องยังไม่พร้อม ใช้ Manual Mode ได้ก่อน ข้อมูลงานยังอยู่ในเครื่องนี้';

function isAiOfflineManualMode(health: HealthCheckResult) {
  return health.status === 'unavailable' || health.status === 'model_missing';
}

function memoryDegradationCopy(reason?: MemoryDegradationReason) {
  switch (reason) {
    case 'schema_mismatch':
      return 'schema ของ memory ไม่ตรงกับแอปเวอร์ชันนี้';
    case 'migration_exception':
      return 'migration ของ memory ล้มเหลวระหว่างเปิดแอป';
    case 'critical_validation_failed':
      return 'ข้อมูลสำคัญบางส่วนไม่ผ่าน validation';
    case 'unreadable_store':
      return 'อ่าน IndexedDB บาง store ไม่สำเร็จ';
    default:
      return 'memory บางส่วนอาจไม่เข้ากับแอปเวอร์ชันนี้';
  }
}

// T028/T029: Local-timezone "today" string for morning ritual day comparison
function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getRouteShellMeta(
  route: UIRoute,
  roomTitle?: string | null,
) {
  switch (route) {
    case 'DUMP_ENTRY':
      return {
        kicker: 'เริ่ม',
        title: roomTitle || 'งานนี้',
        detail: 'วางสิ่งที่ค้างไว้ แล้วให้ MIND ช่วยสรุป',
      };
    case 'SYNTHESIZING':
      return {
        kicker: 'กำลังดูอยู่',
        title: roomTitle || 'กำลังสรุป',
        detail: 'รอผลสรุปสั้น ๆ ก่อน',
      };
    case 'ONE_ACTION':
      return {
        kicker: 'ก้าวถัดไป',
        title: 'ก้าวถัดไป',
        detail: 'เลือกใช้ก้าวนี้หรือขออีกทาง',
      };
    case 'SCAFFOLD':
      return {
        kicker: 'ทำทีละขั้น',
        title: 'ทำต่อทีละขั้น',
        detail: 'โฟกัสแค่ขั้นที่อยู่ตรงหน้า',
      };
    case 'RESCUE':
      return {
        kicker: 'ช่วยตอนติด',
        title: 'ช่วยตอนติด',
        detail: 'ดูทางออกที่เบาสุดก่อน',
      };
    case 'BOUNCE_BACK':
      return {
        kicker: 'กลับมาทำต่อ',
        title: roomTitle || 'กลับเข้าห้องเดิม',
        detail: 'ดูว่าค้างตรงไหน แล้วไปต่อ',
      };
    case 'MORNING_RITUAL':
      return {
        kicker: 'เริ่มวันนี้',
        title: roomTitle || 'เริ่มวันจากห้องนี้',
        detail: 'เลือกงานที่คุ้มสุดแล้วเริ่ม',
      };
    case 'CLARIFICATION':
      return {
        kicker: 'ต้องรู้อีกนิด',
        title: 'ขอข้อมูลเพิ่ม',
        detail: 'ตอบสั้น ๆ แล้วไปต่อ',
      };
    case 'MANUAL_FALLBACK':
      return {
        kicker: 'ไปต่อแบบง่าย',
        title: 'ไปต่อแบบง่าย',
        detail: 'ใช้ทางลัดนี้ไปก่อน',
      };
    case 'DECISION_BOARD':
      return {
        kicker: 'เลือกทาง',
        title: 'เลือกทางถัดไป',
        detail: 'เทียบสั้น ๆ แล้วเลือกต่อ',
      };
    default:
      return {
        kicker: 'งานนี้',
        title: roomTitle || 'งานนี้',
        detail: 'ทำงานต่อจากบริบทของห้องนี้',
      };
  }
}

function getStudioMode(route: UIRoute): 'dump' | 'action' | 'scaffold' | 'rescue' | 'reentry' {
  switch (route) {
    case 'ONE_ACTION':
      return 'action';
    case 'SCAFFOLD':
      return 'scaffold';
    case 'RESCUE':
      return 'rescue';
    case 'BOUNCE_BACK':
    case 'MORNING_RITUAL':
      return 'reentry';
    default:
      return 'dump';
  }
}

function getMainFlowSurface(route: UIRoute) {
  switch (route) {
    case 'DUMP_ENTRY':
    case 'SYNTHESIZING':
      return {
        tone: 'start' as const,
        maxWidth: '42rem',
        showRoomHeader: false,
      };
    case 'BOUNCE_BACK':
    case 'MORNING_RITUAL':
      return {
        tone: 'reentry' as const,
        maxWidth: '42rem',
        showRoomHeader: false,
      };
    case 'ONE_ACTION':
    case 'SCAFFOLD':
      return {
        tone: 'action' as const,
        maxWidth: '44rem',
        showRoomHeader: false,
      };
    default:
      return {
        tone: 'recovery' as const,
        maxWidth: '42rem',
        showRoomHeader: false,
      };
  }
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
  const [resumeHomeRoom, setResumeHomeRoom] = useState<RankedResumeRoom | null>(null);
  const [rankedSidebarRooms, setRankedSidebarRooms] = useState<RankedResumeRoom[]>([]);
  const [activeRoomReentry, setActiveRoomReentry] = useState<ActiveRoomReentryState | null>(null);
  const [forceInputEditor, setForceInputEditor] = useState(false);
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
  // Covers the gap between dump submit and SYNTHESIZING route — prevents blank main panel
  const [isDumpPending, setIsDumpPending] = useState(false);

  // Overlays
  const [showArchive, setShowArchive] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showDataReview, setShowDataReview] = useState<'manage' | 'review' | null>(null);
  const [aiOpsEntries, setAiOpsEntries] = useState<AiOpsDebugEntry[]>([]);
  const [allowAiDebug, setAllowAiDebug] = useState(false);
  const [showAiOpsDebug, setShowAiOpsDebug] = useState(false);
  const [allowObservationCapture, setAllowObservationCapture] = useState(false);
  const [showObservationCapture, setShowObservationCapture] = useState(false);
  const [activeStudioIntent, setActiveStudioIntent] = useState<StudioIntentId | null>(null);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const [aiOfflineNotice, setAiOfflineNotice] = useState<string | null>(null);
  const [memoryMode, setMemoryMode] = useState<MemoryMode>('normal');
  const [memoryDegradationReason, setMemoryDegradationReason] = useState<MemoryDegradationReason | undefined>();

  // T046: Background AI status — non-blocking passive indicator
  const [aiHealth, setAiHealth] = useState<HealthCheckResult>(DEFAULT_AI_HEALTH);

  // T057: Time-to-action tracking
  const [dumpStartTime, setDumpStartTime] = useState<number | null>(null);

  // T032: Reset notice
  const [showResetBanner, setShowResetBanner] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [demoScenarioId, setDemoScenarioId] = useState<'client_project_restart' | 'sales_inquiry_demo_request'>('client_project_restart');
  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [showMobileRooms, setShowMobileRooms] = useState(false);
  const [showMobileStudio, setShowMobileStudio] = useState(false);
  const [isRoomSidebarCollapsed, setIsRoomSidebarCollapsed] = useState(false);
  const [isStudioCollapsed, setIsStudioCollapsed] = useState(false);
  const [uiViewMode, setUiViewMode] = useState<'FOCUS' | 'POWER'>('FOCUS');
  const reentryUnderstoodRef = useRef<string | null>(null);
  const previousUiRouteRef = useRef<UIRoute | null>(null);
  const previousActiveRoomIdRef = useRef<string | null>(null);
  const memoryModeRef = useRef<MemoryMode>('normal');
  const valuePulseAnchorRef = useRef<ValuePulseContext | null>(null);
  const [activeValuePulseContext, setActiveValuePulseContext] = useState<ValuePulseContext | null>(null);

  // T017: Pin cap counter — hoisted before early return to respect hooks order
  const [pinnedCountLocal, setPinnedCountLocal] = useState<number>(0);

  // ── On load ──────────────────────────────────────────────────────────────

  // T017: Sync pin count when action/status changes
  useEffect(() => {
    getActions()
      .then((acts) => {
        const count = acts.filter((a) => a.isPinned && a.state !== 'ARCHIVED').length;
        setPinnedCountLocal(count);
      })
      .catch((error) => reportClientAsyncError("[MIND] Sync pin count", error));
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const syncViewportState = (matches: boolean) => {
      setIsCompactViewport(matches);
      if (!matches) {
        setShowMobileRooms(false);
        setShowMobileStudio(false);
      }
    };

    syncViewportState(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => syncViewportState(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    memoryModeRef.current = memoryMode;
  }, [memoryMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleDebugToggle = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return;
      event.preventDefault();
      setAllowAiDebug(true);
      setAllowObservationCapture(true);
      setShowAiOpsDebug((value) => !value);
      setShowObservationCapture((value) => !value);
    };
    window.addEventListener('keydown', handleDebugToggle);
    return () => window.removeEventListener('keydown', handleDebugToggle);
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

      let bootstrap;
      try {
        bootstrap = await loadSafeBootstrapWorkspace({
          isPresentationMode: flags.isPresentationMode,
          scenarioId: flags.scenarioId,
        });
      } catch (error) {
        console.error('[MIND] bootstrap failed; falling back to in-memory start state', error);
        const fallbackSession = createDefaultSession();
        if (cancelled) return;
        setRooms([]);
        setActiveRoomId(null);
        setMemoryMode('normal');
        memoryModeRef.current = 'normal';
        setMemoryDegradationReason(undefined);
        setAiOfflineNotice('โหลด memory ไม่สำเร็จชั่วคราว เปิดหน้าเริ่มงานแบบ in-memory ให้ก่อน');
        await hydrateSessionState(fallbackSession);
        return;
      }
      const { workspace, storedSession } = bootstrap;
      if (cancelled) return;

      setMemoryMode(bootstrap.memoryMode);
      memoryModeRef.current = bootstrap.memoryMode;
      setMemoryDegradationReason(bootstrap.memoryDegradationReason);

      setRooms(workspace.rooms);
      setActiveRoomId(workspace.activeRoomId);
      let nextSession = storedSession;
      const activeRoomSession = workspace.rooms.find((room) => room.id === workspace.activeRoomId)?.session;
      if (bootstrap.memoryMode === 'normal') {
        await processWeeklySweep();
      }

      if (bootstrap.memoryMode === 'normal' && activeRoomSession && activeRoomSession !== storedSession) {
        await saveSession(storedSession);
      }
      const migratedSession = migrateLegacyActiveDumpContext(storedSession);
      if (bootstrap.memoryMode === 'normal' && migratedSession) {
        nextSession = migratedSession;
        await saveSession(nextSession);
      }

      const resolvedBootstrap = resolveBootstrapSession(nextSession, {
        skipWalkthrough: flags.skipWalkthrough,
        skipMorningRitual: flags.skipMorningRitual,
        today: localDateString(),
      });

      nextSession = resolvedBootstrap.session;
      if (bootstrap.memoryMode === 'normal' && resolvedBootstrap.interceptRoute) {
        await saveSession(nextSession);
      }
      if (cancelled) return;

      setShowResetBanner(resolvedBootstrap.showResetBanner);
      setShowWalkthrough(resolvedBootstrap.showWalkthrough);

      await hydrateSessionState(nextSession);
      if (cancelled) return;
      if (bootstrap.memoryMode === 'normal') {
        await refreshRooms();
      }
    }

    void load().catch((error) => reportClientAsyncError("[MIND] On load bootstrap data", error));

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
    setShowUtilityMenu(false);
    if (isCompactViewport) {
      setShowMobileRooms(false);
      setShowMobileStudio(false);
    }
  }, [isCompactViewport, session?.uiRoute]);

  const persistSessionWithRooms = useCallback(async (nextSession: AppSession) => {
    if (memoryModeRef.current === 'read_only_degraded') {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }
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
    isDumpPending,
    setIsDumpPending,
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
    if (isAiOfflineManualMode(aiHealth) || memoryModeRef.current === 'read_only_degraded') return;
    if (session.uiRoute !== 'BOUNCE_BACK' && session.uiRoute !== 'MORNING_RITUAL') return;
    if (!hasResumableTask(session.task)) return;
    const existingBrief = session.task?.reentryBrief;
    const reentryIsFresh = existingBrief && existingBrief.createdAt >= session.lastActive;
    if (reentryIsFresh) return;
    const scope = session.uiRoute === 'BOUNCE_BACK' ? 'bounce_back' : 'morning_ritual';

    void controller.loadReentryBrief(scope).catch((error) =>
      reportClientAsyncError("[MIND] Load reentry brief", error)
    );
    // We intentionally key this effect off task/session state instead of the helper identity
    // so dev-time HMR does not trip over callback reinitialization for reentry loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiHealth, currentActionState, isReentryLoading, session, session?.lastActive, session?.task?.id, session?.task?.reentryBrief?.createdAt, session?.uiRoute]);

  useEffect(() => {
    if (!session) return;
    if (isRescueLoading) return;
    if (session.uiRoute !== 'RESCUE') return;
    if (currentRescueState) return;

    void controller.handleEnterRescue({ preserveRefineFeedback: true }).catch((error) =>
      reportClientAsyncError("[MIND] Enter rescue", error)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uiRoute, currentRescueState, isRescueLoading]);

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

    // Only trigger ValuePulse after the user has interacted with an action
    // (i.e. after ONE_ACTION or SCAFFOLD), not on the first DUMP_ENTRY load
    // or immediately after dump submission. This prevents the modal from
    // appearing before the user has seen the action recommendation.
    const isPostActionReturn =
      session.uiRoute === 'DUMP_ENTRY' &&
      (previousRoute === 'ONE_ACTION' || previousRoute === 'SCAFFOLD');

    if (!isPostActionReturn) {
      if (session.uiRoute !== 'DUMP_ENTRY') {
        setActiveValuePulseContext(null);
      }
      return;
    }

    if (forceInputEditor) {
      setActiveValuePulseContext(null);
      return;
    }

    const anchor = valuePulseAnchorRef.current;
    if (!anchor) return;
    if (hasSeenValuePulse(anchor.id)) return;
    setActiveValuePulseContext(anchor);
  }, [forceInputEditor, presentationMode, session?.uiRoute, session]);

  useEffect(() => {
    if (session?.uiRoute === 'DUMP_ENTRY') return;
    setActiveValuePulseContext(null);
  }, [session?.uiRoute]);

  const fallbackResumeHomeRoom = useMemo(() => {
    if (!session || session.uiRoute !== 'DUMP_ENTRY' || hasResumableTask(session.task)) return null;
    return rankResumeRooms(
      rooms
        .map((room) => ({ room })),
    )[0] ?? null;
  }, [rooms, session]);

  const fallbackRankedSidebarRooms = useMemo(
    () => rankResumeRooms(rooms.map((room) => ({ room }))),
    [rooms],
  );
  const effectiveRankedSidebarRooms = rankedSidebarRooms.length > 0
    ? rankedSidebarRooms
    : fallbackRankedSidebarRooms;
  const roomSidebarItems = useMemo(() => buildRoomSidebarItems({
    rooms,
    activeRoomId,
    rankedResumeRooms: effectiveRankedSidebarRooms,
  }), [activeRoomId, effectiveRankedSidebarRooms, rooms]);

  useEffect(() => {
    let cancelled = false;
    setRankedSidebarRooms([]);
    void selectRankedResumeRooms({ rooms })
      .then((ranked) => {
        if (!cancelled) setRankedSidebarRooms(ranked);
      })
      .catch((error) => reportClientAsyncError("[MIND] Select ranked resume rooms", error));

    return () => {
      cancelled = true;
    };
  }, [rooms]);

  useEffect(() => {
    if (!session || session.uiRoute !== 'DUMP_ENTRY' || hasResumableTask(session.task)) {
      setResumeHomeRoom(null);
      return;
    }

    let cancelled = false;
    setResumeHomeRoom(null);
    void selectResumeRoom({ rooms })
      .then((candidate) => {
        if (!cancelled) setResumeHomeRoom(candidate);
      })
      .catch((error) => reportClientAsyncError("[MIND] Select resume room candidate", error));

    return () => {
      cancelled = true;
    };
  }, [rooms, session]);

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
      reentryUnderstoodRef.current = null;
      previousUiRouteRef.current = null;
    },
    readOnly: memoryMode === 'read_only_degraded',
    onReadOnlyBlocked: () => {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
    },
  });

  useEffect(() => {
    if (!session || session.uiRoute !== 'DUMP_ENTRY' || !activeRoom) {
      setActiveRoomReentry(null);
      return;
    }

    let cancelled = false;
    setActiveRoomReentry(null);
    void selectActiveRoomReentry({ room: activeRoom })
      .then((state) => {
        if (!cancelled) setActiveRoomReentry(state);
      })
      .catch((error) => reportClientAsyncError("[MIND] Select active room reentry", error));

    return () => {
      cancelled = true;
    };
  }, [activeRoom, session]);

  useEffect(() => {
    if (!session || !activeRoom) return;
    if (isNegotiatingAction || isReentryLoading || isRescueLoading || isScaffoldRefining || isDumpPending) return;
    // Skip hydration while the user is editing context — prevents jitter from resetting the editor
    if (forceInputEditor) return;

    const recoveredSession = hydrateRoomSessionFromRecord(session, activeRoom);
    if (recoveredSession === session) return;

    void (async () => {
      await hydrateSessionState(recoveredSession);
      await persistSessionWithRooms(recoveredSession);
    })().catch((error) => reportClientAsyncError("[MIND] Hydrate and persist session", error));
  }, [
    activeRoom,
    forceInputEditor,
    hydrateSessionState,
    isNegotiatingAction,
    isReentryLoading,
    isRescueLoading,
    isScaffoldRefining,
    isDumpPending,
    persistSessionWithRooms,
    session,
  ]);

  const resetRoomViewport = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (session?.uiRoute !== 'DUMP_ENTRY') return;
      window.requestAnimationFrame(() => {
        const input = document.getElementById('brain-dump-text') as HTMLTextAreaElement | null;
        if (!input) return;
        input.focus();
      });
    });
  }, [session?.uiRoute]);

  useEffect(() => {
    if (previousActiveRoomIdRef.current === null) {
      previousActiveRoomIdRef.current = activeRoomId;
      return;
    }

    if (previousActiveRoomIdRef.current === activeRoomId) return;
    previousActiveRoomIdRef.current = activeRoomId;
    // Only reset forceInputEditor on genuine room switches — same-room ID jitter
    // from persistSessionWithRooms should not clear the editor mid-edit
    if (activeRoomId !== session?.roomId) {
      setForceInputEditor(false);
    }
    resetRoomViewport();
  }, [activeRoomId, resetRoomViewport, session?.roomId]);

  if (!session) return null;

  const aiOfflineManualMode = isAiOfflineManualMode(aiHealth);
  const readOnlyMemory = memoryMode === 'read_only_degraded';
  const homeEntryState = resolveHomeEntryState({
    rooms,
    activeSession: session,
    resumeRoom: resumeHomeRoom ?? fallbackResumeHomeRoom,
    activeRoomId,
  });
  const studioSnapshot = buildStudioSnapshot(session.task, currentActionState, currentPayload);
  const studioIntents = getStudioIntents(session, currentActionState, currentPayload);
  const isFocusMode = uiViewMode === 'FOCUS';
  const mainFlowSurface = getMainFlowSurface(session.uiRoute);
  const routeUsesReducedChrome = isFocusMode;
  const routeMeta = getRouteShellMeta(
    session.uiRoute,
    activeRoom?.title ?? session.roomTitle,
  );
  const studioMode = getStudioMode(session.uiRoute);
  const activeRoomHasSavedContext = Boolean(
    activeRoom?.session.task?.sourceText?.trim() ||
      activeRoom?.session.activeDumpContext?.text?.trim(),
  );
  const showDumpOnlyFirstView = isFocusMode && session.uiRoute === 'DUMP_ENTRY' && !activeRoomHasSavedContext;
  const showInternalReferenceTools = allowAiDebug;
  const utilitySections = [
    {
      title: 'บริบทของงาน',
      items: [
        ...(session.task
          ? [
              { key: 'manage-data', label: 'ดู/จัดการบริบทและไฟล์', onClick: () => setShowDataReview('manage' as const) },
              { key: 'review-room', label: 'ตรวจหลักฐานของห้องนี้', onClick: () => setShowDataReview('review' as const) },
            ]
          : []),
        ...(isFocusMode
          ? []
          : [
              { key: 'archive', label: 'Archive', onClick: () => setShowArchive(true) },
              { key: 'overview', label: 'Overview', onClick: () => setShowOverview(true) },
            ]),
        { key: 'trust', label: 'ทำไม MIND แนะนำแบบนี้', onClick: () => setShowTrust(true) },
      ],
    },
    {
      title: 'เดโม',
      items: [
        { key: 'walkthrough', label: routeUsesReducedChrome ? 'วิธีใช้' : 'ดูเดโม 30 วินาที', onClick: () => setShowWalkthrough(true) },
      ],
    },
    {
      title: 'Internal reference',
      items: [
        ...(showInternalReferenceTools && session.uiRoute === 'DUMP_ENTRY'
          ? [
              { key: 'business', label: 'Internal: business dashboard', onClick: () => router.push('/business') },
              { key: 'pmf', label: 'Internal: PMF reference', onClick: () => router.push('/pmf-guide') },
            ]
          : []),
      ],
    },
    {
      title: 'ภายใน',
      items: [
        ...(allowAiDebug
          ? [{ key: 'ai-ops', label: showAiOpsDebug ? 'ซ่อน AI Ops' : 'AI Ops', onClick: () => setShowAiOpsDebug((value) => !value) }]
          : []),
        ...(allowObservationCapture
          ? [{ key: 'observation', label: showObservationCapture ? 'ซ่อน Observation' : 'Observation', onClick: () => setShowObservationCapture((value) => !value) }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0);

  const appendReadySourcesToRoomMemory = async (task: NonNullable<AppSession['task']>, sourceOperationId: string) => {
    try {
      await recordTaskSourcesInRoomMemory(task, sourceOperationId);
    } catch (error) {
      console.warn('[MIND] failed to append ready room sources to memory', error);
    }
  };

  const handleDumpSubmission = async (submission: RoomSubmission) => {
    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }

    const normalizeContextEditSubmission = (input: RoomSubmission): RoomSubmission => {
      const baseSession = sessionRef.current ?? session;
      const existingFiles = forceInputEditor ? baseSession?.task?.sourceFiles ?? [] : [];
      if (existingFiles.length === 0) return input;

      const incomingIds = new Set(input.sourceFiles.map((file) => file.id));
      const incomingNames = new Set(input.sourceFiles.map((file) => file.name));
      const preservedFiles = existingFiles.filter((file) => !incomingIds.has(file.id) && !incomingNames.has(file.name));
      const sourceFiles = [...preservedFiles, ...input.sourceFiles];
      const createdAt = Date.now();
      const sourcePreference = baseSession?.task?.sourcePreference?.primarySourceId &&
        sourceFiles.some((file) => getRoomSourceIdForFile(file) === baseSession.task?.sourcePreference?.primarySourceId)
        ? baseSession.task.sourcePreference
        : createAutoRoomSourcePreference(sourceFiles, createdAt);
      const preferredSourceContext = buildPreferredRoomSourceContext(
        input.text || input.sourceText,
        sourceFiles,
        sourcePreference,
      );

      return {
        ...input,
        sourceText: preferredSourceContext.sourceText || input.sourceText,
        extractedText: preferredSourceContext.extractedText || input.extractedText,
        sourceFiles,
      };
    };

    const nextSubmission = normalizeContextEditSubmission(submission);

    if (!aiOfflineManualMode) {
      setForceInputEditor(false);
      setIsDumpPending(true);
      try {
        await controller.handleDump(nextSubmission);
      } finally {
        setIsDumpPending(false);
      }
      return;
    }

    const base = sessionRef.current ?? session;
    const createdAt = Date.now();
    const sourcePreference = createAutoRoomSourcePreference(nextSubmission.sourceFiles, createdAt);
    const preferredSourceContext = buildPreferredRoomSourceContext(
      nextSubmission.text || nextSubmission.sourceText,
      nextSubmission.sourceFiles,
      sourcePreference,
    );
    const task = createTaskContext({
      roomId: base.roomId,
      sourceText: preferredSourceContext.sourceText || nextSubmission.sourceText,
      sourceFiles: nextSubmission.sourceFiles,
      sourcePreference,
      extractedText: preferredSourceContext.extractedText || (sourcePreference ? nextSubmission.extractedText : ''),
      createdAt,
      lifecycleState: 'dumped',
      lastAttemptAt: createdAt,
      blockerSignals: [],
    });
    task.blockerSignals = deriveRoomBlockers(task);

    const nextSession = normalizeSession({
      ...base,
      uiRoute: 'DUMP_ENTRY',
      status: 'DUMP_ENTRY',
      task,
      activeDumpContext: {
        text: task.sourceText,
        createdAt,
        lastAttemptAt: createdAt,
      },
      currentPayload: undefined,
      currentActionId: null,
      lastFailureReason: 'service_down',
    });

    sessionRef.current = nextSession;
    setSession(nextSession);
    setCurrentPayload(null);
    setCurrentActionState(null);
    setCurrentWhyThisNow('');
    setCurrentRescueState(null);
    setForceInputEditor(false);
    setAiOfflineNotice(AI_OFFLINE_MANUAL_COPY);
    trackEvent('task_opened', {
      room_id: nextSession.roomId,
      room_title: nextSession.roomTitle,
      ui_route: nextSession.uiRoute,
      assistant_mode: nextSession.task?.assistantMode,
      outcome_label: 'manual_mode_dump_saved',
    });
    await persistSessionWithRooms(nextSession);
    await appendReadySourcesToRoomMemory(task, 'manual_dump');
  };

  const handleFileExtractionComplete = async (submission: RoomSubmission) => {
    if (readOnlyMemory) return;
    const baseSession = sessionRef.current ?? session;
    if (!baseSession.task) return;

    const incomingById = new Map(submission.sourceFiles.map((file) => [file.id, file]));
    const hasMatchingFile = baseSession.task.sourceFiles.some((file) => incomingById.has(file.id));
    if (!hasMatchingFile) return;

    const now = Date.now();
    const nextSourceFiles = baseSession.task.sourceFiles.map((file) => incomingById.get(file.id) ?? file);
    const existingPrimaryReady = baseSession.task.sourcePreference?.primarySourceId
      ? nextSourceFiles.some((file) => file.status === 'ready' && getRoomSourceIdForFile(file) === baseSession.task?.sourcePreference?.primarySourceId)
      : false;
    const sourcePreference = existingPrimaryReady
      ? baseSession.task.sourcePreference
      : createAutoRoomSourcePreference(nextSourceFiles, now);
    const preferredContext = buildPreferredRoomSourceContext(
      stripRoomFileContext(baseSession.task.sourceText),
      nextSourceFiles,
      sourcePreference,
    );
    const taskWithContext = {
      ...baseSession.task,
      sourceFiles: nextSourceFiles,
      sourcePreference,
      extractedText: preferredContext.extractedText,
      sourceText: preferredContext.sourceText,
      lastAttemptAt: now,
    };
    const nextTask = {
      ...taskWithContext,
      blockerSignals: deriveRoomBlockers({
        ...taskWithContext,
        blockerSignals: taskWithContext.blockerSignals.filter((blocker) => blocker !== 'missing_file_or_context'),
      }),
    };
    const nextSession = normalizeSession({
      ...baseSession,
      task: nextTask,
      activeDumpContext: {
        text: preferredContext.sourceText,
        createdAt: baseSession.task.createdAt,
        lastAttemptAt: now,
        lastFailureReason: baseSession.task.lastFailureReason,
      },
    });

    sessionRef.current = nextSession;
    setSession(nextSession);
    await persistSessionWithRooms(nextSession);
    await appendReadySourcesToRoomMemory(nextTask, 'file_extraction');
  };

  const handleEditCurrentContext = async () => {
    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }
    setForceInputEditor(true);
    setActiveValuePulseContext(null);
    await controller.openDumpWithCurrentContext();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const input = document.getElementById('brain-dump-text') as HTMLTextAreaElement | null;
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input?.focus();
      });
    }
  };

  const handleDeleteRoomSources = async (deleteTokens: string[]) => {
    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }
    const baseSession = sessionRef.current ?? session;
    if (!baseSession.task) return;
    const tokenSet = new Set(deleteTokens);
    const roomId = baseSession.task.roomId ?? baseSession.roomId ?? baseSession.task.id;
    const removeManualText = tokenSet.has(`manual:${baseSession.task.id}`);
    const nextPendingInputs = baseSession.task.pendingInputs.filter((item, index) => (
      !tokenSet.has(`pending:${item.kind}:${index}`)
    ));
    const nextSourceFiles = baseSession.task.sourceFiles.filter((file) => !tokenSet.has(`file:${file.id}`));
    const baseText = removeManualText ? '' : stripRoomFileContext(baseSession.task.sourceText);
    const removedPrimarySource = baseSession.task.sourcePreference?.primarySourceId
      ? tokenSet.has(baseSession.task.sourcePreference.primarySourceId)
      : false;
    const sourcePreference = removedPrimarySource
      ? createAutoRoomSourcePreference(nextSourceFiles, Date.now())
      : baseSession.task.sourcePreference;
    const preferredContext = buildPreferredRoomSourceContext(baseText, nextSourceFiles, sourcePreference);
    const taskWithContext = {
      ...baseSession.task,
      sourceFiles: nextSourceFiles,
      sourcePreference,
      extractedText: preferredContext.extractedText,
      sourceText: preferredContext.sourceText,
      pendingInputs: nextPendingInputs,
      blockerSignals: baseSession.task.blockerSignals.filter((blocker) => blocker !== 'missing_file_or_context'),
      lastAttemptAt: Date.now(),
    };
    const nextTask = {
      ...taskWithContext,
      blockerSignals: deriveRoomBlockers(taskWithContext),
    };
    const nextSession = normalizeSession({
      ...baseSession,
      task: nextTask,
      activeDumpContext: preferredContext.sourceText
        ? {
            text: preferredContext.sourceText,
            createdAt: baseSession.task.createdAt,
            lastAttemptAt: nextTask.lastAttemptAt,
            lastFailureReason: baseSession.task.lastFailureReason,
          }
        : undefined,
    });
    sessionRef.current = nextSession;
    setSession(nextSession);
    await persistSessionWithRooms(nextSession);
    await Promise.all(deleteTokens.map((token) => markRoomMemoryRefDeleted({
      roomId,
      refId: token,
      reason: 'user_deleted_source',
      summary: 'Source was removed from this room by the user',
    }).catch(() => undefined)));
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

    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      trackEvent('studio_intent_blocked', {
        ...baseProperties,
        blockedReason: 'read_only_degraded_memory',
      });
      return;
    }

    if (aiOfflineManualMode && intent.id !== 'review_status') {
      setAiOfflineNotice(AI_OFFLINE_MANUAL_COPY);
      trackEvent('studio_intent_blocked', {
        ...baseProperties,
        blockedReason: 'ai_offline_manual_mode',
      });
      return;
    }

    trackEvent('studio_intent_clicked', baseProperties);
    setActiveStudioIntent(intent.id);

    try {
      switch (intent.id) {
        case 'review_status': {
          if (aiOfflineManualMode) {
            setAiOfflineNotice(AI_OFFLINE_MANUAL_COPY);
            break;
          }
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

  const updateSourceFileAfterRetryFailure = async (
    fileId: string,
    failureDetail: string,
    failureReason?: string,
  ) => {
    const baseSession = sessionRef.current ?? session;
    if (!baseSession.task) return;
    const now = Date.now();
    const nextSourceFiles = baseSession.task.sourceFiles.map((file) => (
      file.id === fileId
        ? {
          ...file,
            status: 'failed_extraction' as const,
            failureReason: failureReason ?? file.failureReason ?? 'file_extraction_unavailable',
            failureDetail,
            failureStage: file.failureStage ?? 'unknown',
            lastExtractAttemptAt: now,
            extractAttemptCount: (file.extractAttemptCount ?? 0) + 1,
          }
        : file
    ));
    const preferredContext = buildPreferredRoomSourceContext(
      stripRoomFileContext(baseSession.task.sourceText),
      nextSourceFiles,
      baseSession.task.sourcePreference,
    );
    const taskWithContext = {
      ...baseSession.task,
      sourceFiles: nextSourceFiles,
      extractedText: preferredContext.extractedText,
      sourceText: preferredContext.sourceText,
      lastAttemptAt: now,
      blockerSignals: baseSession.task.blockerSignals.filter((blocker) => blocker !== 'missing_file_or_context'),
    };
    const nextTask = {
      ...taskWithContext,
      blockerSignals: deriveRoomBlockers(taskWithContext),
    };
    const nextSession = normalizeSession({
      ...baseSession,
      task: nextTask,
      activeDumpContext: {
        text: preferredContext.sourceText,
        createdAt: baseSession.task.createdAt,
        lastAttemptAt: now,
        lastFailureReason: baseSession.task.lastFailureReason,
      },
    });
    sessionRef.current = nextSession;
    setSession(nextSession);
    await persistSessionWithRooms(nextSession);
  };

  const handleRetrySourceFile = async (fileId: string) => {
    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }
    const baseSession = sessionRef.current ?? session;
    const targetFile = baseSession.task?.sourceFiles.find((file) => file.id === fileId);
    if (!baseSession.task || !targetFile || targetFile.status === 'pending') return;

    setRetryingFileId(fileId);
    trackEvent('room_file_retry_started', {
      roomId: baseSession.roomId,
      fileName: targetFile.name,
      failureReason: targetFile.failureReason,
      failureStage: targetFile.failureStage,
    });

    try {
      if (!targetFile.storageKey) {
        await updateSourceFileAfterRetryFailure(fileId, 'missing_local_blob_storage_key');
        return;
      }

      const file = await loadRoomFileBlob(targetFile.storageKey);
      if (!file) {
        await updateSourceFileAfterRetryFailure(fileId, 'local_blob_not_found');
        return;
      }

      const formData = new FormData();
      formData.append('text', '');
      formData.append('files', file, file.name);

      const response = await fetch('/api/file-room/extract', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || `extract_failed_${response.status}`);
      }

      const extractedFile = Array.isArray(data.sourceFiles) ? data.sourceFiles[0] as Partial<RoomSourceFile> | undefined : undefined;
      if (!extractedFile) {
        throw new Error('extract_response_missing_source_file');
      }

      const latestSession = sessionRef.current ?? baseSession;
      if (!latestSession.task) return;
      const now = Date.now();
      const nextSourceFiles: RoomSourceFile[] = latestSession.task.sourceFiles.map((fileItem) => {
        if (fileItem.id !== fileId) return fileItem;
        const nextStatus = extractedFile.status === 'failed'
          ? extractedFile.failureReason === 'pdf_text_garbled_after_ocr' || extractedFile.failureReason === 'pdf_text_layer_garbled'
            ? 'unreadable'
            : 'failed_extraction'
          : extractedFile.status ?? 'failed_extraction';
        return {
          ...fileItem,
          ...extractedFile,
          id: fileItem.id,
          name: extractedFile.name || fileItem.name,
          kind: extractedFile.kind || fileItem.kind,
          mimeType: extractedFile.mimeType || fileItem.mimeType,
          size: typeof extractedFile.size === 'number' ? extractedFile.size : fileItem.size,
          status: nextStatus,
          createdAt: fileItem.createdAt,
          storageKey: fileItem.storageKey,
          extractedText: nextStatus === 'ready' ? extractedFile.extractedText : undefined,
          failureReason: nextStatus === 'ready' ? undefined : extractedFile.failureReason ?? fileItem.failureReason,
          failureDetail: nextStatus === 'ready' ? undefined : extractedFile.failureDetail ?? fileItem.failureDetail,
          failureStage: nextStatus === 'ready' ? undefined : extractedFile.failureStage ?? fileItem.failureStage,
          lastExtractAttemptAt: now,
          extractAttemptCount: (fileItem.extractAttemptCount ?? 0) + 1,
        };
      });
      const sourcePreference = latestSession.task.sourcePreference
        ?? createAutoRoomSourcePreference(nextSourceFiles, now);
      const preferredContext = buildPreferredRoomSourceContext(
        stripRoomFileContext(latestSession.task.sourceText),
        nextSourceFiles,
        sourcePreference,
      );
      const taskWithContext = {
        ...latestSession.task,
        sourceFiles: nextSourceFiles,
        sourcePreference,
        extractedText: preferredContext.extractedText,
        sourceText: preferredContext.sourceText,
        lastAttemptAt: now,
        blockerSignals: latestSession.task.blockerSignals.filter((blocker) => blocker !== 'missing_file_or_context'),
      };
      const nextTask = {
        ...taskWithContext,
        blockerSignals: deriveRoomBlockers(taskWithContext),
      };
      const nextSession = normalizeSession({
        ...latestSession,
        task: nextTask,
        activeDumpContext: {
          text: preferredContext.sourceText,
          createdAt: latestSession.task.createdAt,
          lastAttemptAt: now,
          lastFailureReason: latestSession.task.lastFailureReason,
        },
      });

      sessionRef.current = nextSession;
      setSession(nextSession);
      await persistSessionWithRooms(nextSession);
      await appendReadySourcesToRoomMemory(nextTask, 'file_retry');
      const updatedFile = nextSourceFiles.find((file) => file.id === fileId);
      if (updatedFile) {
        trackEvent('ocr_extract_finished', {
          roomId: nextSession.roomId,
          file_name: updatedFile.name,
          file_kind: updatedFile.kind,
          file_status: updatedFile.status,
          failure_reason: updatedFile.failureReason,
          ocr_engine: updatedFile.ocrEngine,
          raw_text_length: updatedFile.ocrMetrics?.rawTextLength,
          normalized_text_length: updatedFile.ocrMetrics?.normalizedTextLength,
          fragmented_run_count: updatedFile.ocrMetrics?.fragmentedRunCount,
          space_density: updatedFile.ocrMetrics?.spaceDensity,
          normal_word_ratio: updatedFile.ocrMetrics?.normalWordRatio,
          page_count_processed: updatedFile.ocrMetrics?.pageCountProcessed,
          duration_ms: updatedFile.ocrMetrics?.durationMs,
        });
      }
      trackEvent('room_file_retry_finished', {
        roomId: nextSession.roomId,
        fileName: targetFile.name,
        status: extractedFile.status ?? 'failed',
        failureReason: extractedFile.failureReason,
      });
    } catch (error) {
      const failureDetail = error instanceof Error ? error.message : 'retry_extract_failed';
      await updateSourceFileAfterRetryFailure(fileId, failureDetail);
      trackEvent('room_file_retry_failed', {
        roomId: baseSession.roomId,
        fileName: targetFile.name,
        failureDetail,
      });
    } finally {
      setRetryingFileId(null);
    }
  };

  const handleSelectPrimarySourceFile = async (fileId: string) => {
    if (readOnlyMemory) {
      setAiOfflineNotice('Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.');
      return;
    }
    const baseSession = sessionRef.current ?? session;
    if (!baseSession.task) return;
    const targetFile = baseSession.task.sourceFiles.find((file) => file.id === fileId);
    if (!targetFile || targetFile.status !== 'ready') return;

    const now = Date.now();
    const sourcePreference = {
      primarySourceId: getRoomSourceIdForFile(targetFile),
      selectedAt: now,
      selectedBy: 'user' as const,
    };
    const preferredContext = buildPreferredRoomSourceContext(
      stripRoomFileContext(baseSession.task.sourceText),
      baseSession.task.sourceFiles,
      sourcePreference,
    );
    const taskWithContext = {
      ...baseSession.task,
      sourcePreference,
      extractedText: preferredContext.extractedText,
      sourceText: preferredContext.sourceText,
      lastAttemptAt: now,
      blockerSignals: baseSession.task.blockerSignals.filter((blocker) => blocker !== 'missing_file_or_context'),
    };
    const nextTask = {
      ...taskWithContext,
      blockerSignals: deriveRoomBlockers(taskWithContext),
    };
    const nextSession = normalizeSession({
      ...baseSession,
      task: nextTask,
      activeDumpContext: {
        text: preferredContext.sourceText,
        createdAt: baseSession.task.createdAt,
        lastAttemptAt: now,
        lastFailureReason: baseSession.task.lastFailureReason,
      },
    });

    sessionRef.current = nextSession;
    setSession(nextSession);
    trackEvent('primary_source_selected', {
      roomId: nextSession.roomId,
      fileId,
      fileName: targetFile.name,
      readyFileCount: nextTask.sourceFiles.filter((file) => file.status === 'ready').length,
    });
    await persistSessionWithRooms(nextSession);
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

  const blockAiAction = () => {
    setAiOfflineNotice(readOnlyMemory
      ? 'Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.'
      : AI_OFFLINE_MANUAL_COPY);
  };

  const handleActiveReentryPrimary = async () => {
    if (!activeRoomReentry) return;
    if (readOnlyMemory) {
      blockAiAction();
      return;
    }

    if (activeRoomReentry.primaryAction === 'fix_context') {
      if (session.task) {
        setShowDataReview('manage');
        return;
      }
      await handleEditCurrentContext();
      return;
    }

    if (activeRoomReentry.primaryAction === 'answer_question') {
      const input = document.getElementById('brain-dump-text') as HTMLTextAreaElement | null;
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
      return;
    }

    if (aiActionsBlocked) {
      blockAiAction();
      return;
    }

    if (roomCardCanContinue || hasResumableTask(session.task)) {
      await handleContinueFromRoomCard();
      return;
    }

    await controller.handleRetry();
  };

  const renderState = () => {
    switch (session.uiRoute) {
      case 'MORNING_RITUAL':
        return (
          <MorningRitual
            reentryBrief={session.task?.reentryBrief}
            snapshot={studioSnapshot}
            loading={isReentryLoading}
            onResumeSuggested={session.task?.reentryBrief ? (aiActionsBlocked ? blockAiAction : controller.resumeFromSuggestedReentry) : undefined}
            onResumeCheckpoint={hasResumableTask(session.task)
              ? async () => {
                  if (aiActionsBlocked) {
                    blockAiAction();
                    return;
                  }
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
            focusMode={isFocusMode}
          />
        );

      case 'BOUNCE_BACK':
        return (
          <BounceBack
            actionTitle={currentActionState?.title ?? session.task?.currentPlan?.actionTitle ?? 'งานนี้'}
            reentryBrief={session.task?.reentryBrief}
            snapshot={studioSnapshot}
            loading={isReentryLoading}
            onUseSuggested={session.task?.reentryBrief ? (aiActionsBlocked ? blockAiAction : controller.resumeFromSuggestedReentry) : undefined}
            onContinue={async () => {
              if (aiActionsBlocked) {
                blockAiAction();
                return;
              }
              trackEvent('bounce_back_resumed');
              await controller.resumeTaskFromRoute(controller.deriveResumeRoute());
            }}
            onStartFresh={async () => {
              if (readOnlyMemory) {
                blockAiAction();
                return;
              }
              await controller.resumeTaskFromRoute('DUMP_ENTRY');
            }}
            onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
            focusMode={isFocusMode}
          />
        );

      case 'CLARIFICATION':
        return (
          <Clarification
            prompt={clarificationPrompt || 'ตอนนี้ควรตอบลูกค้าหรือเริ่มงานค้างส่วนไหนก่อน'}
            onSubmit={controller.handleClarificationSubmit}
            focusMode={isFocusMode}
          />
        );

      case 'DUMP_ENTRY':
        // isDumpPending covers the brief gap between ไปต่อ submit and SYNTHESIZING route
        // — prevents blank main panel during AI latency
        if (isDumpPending) {
          return (
            <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
              <AIProcessingIndicator
                size="hero"
                label="กำลังคลี่สิ่งที่อยู่ในหัว"
                detail="MIND กำลังสรุปบริบทและหา next move แรก"
              />
            </div>
          );
        }
        return (
          <GetStartedHome showIntro={homeEntryState.mode === 'get_started'}>
            {!forceInputEditor && !showDumpOnlyFirstView && homeEntryState.mode === 'active_room' && activeRoomReentry?.room.id === activeRoomId && (
              <ActiveRoomReentryCard
                state={activeRoomReentry}
                onPrimary={handleActiveReentryPrimary}
                onWhy={() => setShowTrust(true)}
                onShowRooms={() => {
                  setIsRoomSidebarCollapsed(false);
                  if (isCompactViewport) setShowMobileRooms(true);
                }}
              />
            )}
            {!showDumpOnlyFirstView && homeEntryState.mode === 'resume_prompt' && homeEntryState.resumeRoom && (
              <ResumePrompt
                candidate={homeEntryState.resumeRoom}
                onOpen={() => handleSelectRoomFromShell(homeEntryState.resumeRoom?.room.id ?? '')}
                onShowRooms={() => {
                  setIsRoomSidebarCollapsed(false);
                  if (isCompactViewport) setShowMobileRooms(true);
                }}
              />
            )}
            <BrainDumpInput
              onNext={handleDumpSubmission}
              onFileExtractionComplete={handleFileExtractionComplete}
              initialText={session.activeDumpContext?.text}
              contextReturnNotice={forceInputEditor}
              existingSourceFiles={forceInputEditor ? session.task?.sourceFiles : undefined}
              presentationMode={presentationMode}
              defaultScenarioId={demoScenarioId}
              focusMode={isFocusMode}
              roomId={session.roomId}
              disabled={readOnlyMemory}
              disabledReason="View-Only mode"
              entryVariant={showDumpOnlyFirstView
                ? 'default'
                : homeEntryState.mode === 'get_started'
                ? 'get_started'
                : homeEntryState.mode === 'active_room'
                  ? 'active_context'
                  : 'default'}
            />
            {showResetBanner && (
              <div
                className="mind-inline-note"
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
          </GetStartedHome>
        );

      case 'SYNTHESIZING':
        return (
          <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
            <AIProcessingIndicator
              size="hero"
              label="กำลังคลี่สิ่งที่อยู่ในหัว"
              detail="MIND กำลังสรุปบริบทและหา next move แรก"
            />
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
            plan={session.task?.currentPlan}
            sourceFiles={session.task?.sourceFiles}
            negotiationLoading={isNegotiatingAction}
            onMarkAdjusted={readOnlyMemory ? blockAiAction : controller.handleOneActionAdjustmentTouched}
            onNegotiate={aiActionsBlocked ? blockAiAction : controller.handleActionNegotiation}
            onAccept={aiActionsBlocked ? blockAiAction : controller.handleAcceptAction}
            onNotLikeThis={aiActionsBlocked ? blockAiAction : controller.handleEnterRescue}
            focusMode={isFocusMode}
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
            onRescue={aiActionsBlocked ? blockAiAction : controller.handleEnterRescue}
            onMakeSmaller={aiActionsBlocked ? blockAiAction : controller.handleMakeSmaller}
            onBackToInput={readOnlyMemory ? blockAiAction : handleEditCurrentContext}
            onComplete={readOnlyMemory ? blockAiAction : controller.handleCompleteScaffold}
            onEditStep={readOnlyMemory ? undefined : controller.handleEditCurrentPlanStep}
            onBackToSteps={controller.handleReturnToScaffoldSteps}
            onStartNew={readOnlyMemory ? blockAiAction : controller.handleStartNewFromCompletedScaffold}
            focusMode={isFocusMode}
          />
        );

      case 'RESCUE':
        return (
          <Rescue
            loading={isRescueLoading}
            rescueState={currentRescueState}
            refineLoading={isScaffoldRefining}
            refineFeedback={scaffoldRefineFeedback}
            onMakeSmaller={aiActionsBlocked ? blockAiAction : controller.handleMakeSmaller}
            onBackToInput={readOnlyMemory ? blockAiAction : handleEditCurrentContext}
            onWalkAway={readOnlyMemory ? blockAiAction : controller.handleWalkAwayFromRescue}
            focusMode={isFocusMode}
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
            retryable={manualFallbackRetryable && !aiOfflineManualMode && !readOnlyMemory}
            focusMode={isFocusMode}
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
  const aiActionsBlocked = aiOfflineManualMode || readOnlyMemory;
  const utilityButtonLabel = showUtilityMenu ? 'ซ่อนเครื่องมือ' : 'เครื่องมือ';

  const handleSelectRoomFromShell = async (roomId: string) => {
    await handleSelectRoom(roomId);
    setShowMobileRooms(false);
  };

  const handleUtilityAction = (action: () => void) => {
    setShowUtilityMenu(false);
    action();
  };

  return (
    <>
      {/* Overlays */}
      {showArchive && <ArchiveSearch onClose={() => setShowArchive(false)} />}
      {showDataReview && session.task && (
        <DataReviewPanel
          task={session.task}
          initialMode={showDataReview}
          onClose={() => setShowDataReview(null)}
          onDeleteSources={handleDeleteRoomSources}
          onSelectPrimarySource={handleSelectPrimarySourceFile}
        />
      )}
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

      <div className={`mind-shell-layout ${isFocusMode ? 'is-focus-mode' : 'is-power-mode'} ${showDumpOnlyFirstView ? 'is-dump-first-view' : ''}`}>
        <header className={`mind-shell-topbar ${routeUsesReducedChrome ? 'is-reduced' : ''}`}>
          <div className="mind-shell-topbar-left">
            <button
              type="button"
              className="shell-toggle-button"
              onClick={() => {
                if (isCompactViewport) {
                  setShowMobileRooms((value) => !value);
                  setShowMobileStudio(false);
                  return;
                }
                setIsRoomSidebarCollapsed((value) => !value);
              }}
              aria-label={isCompactViewport ? 'เปิดรายการห้องงาน' : isRoomSidebarCollapsed ? 'ขยายแถบห้องงาน' : 'ย่อแถบห้องงาน'}
            >
              {isCompactViewport ? 'ห้อง' : isRoomSidebarCollapsed ? '→' : '←'}
            </button>
            <div className={`app-health-rail app-health-rail-${healthRail.tone} app-health-rail-compact`}>
              <span className="app-health-dot" aria-hidden="true" />
              <div className="app-health-copy">
                <div className="app-health-row">
                  <span className="app-health-badge">{healthRail.badge}</span>
                  <span className="app-health-headline">{healthRail.headline}</span>
                </div>
                {!routeUsesReducedChrome && <p className="app-health-detail">{healthRail.detail}</p>}
              </div>
            </div>
          </div>

          <div className="mind-shell-route">
            <div className="mind-shell-route-header" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.1rem' }}>
              <span className="mind-shell-route-kicker" style={{ margin: 0, padding: 0 }}>{routeMeta.kicker}</span>
              <span className="mind-shell-route-separator" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', opacity: 0.5, userSelect: 'none' }}>›</span>
              <h1 className="mind-shell-route-title" style={{ margin: 0, padding: 0 }}>{routeMeta.title}</h1>
            </div>
            <p className="mind-shell-route-detail">{routeMeta.detail}</p>
          </div>

          <div className="mind-shell-topbar-right">
            <button
              type="button"
              className="shell-secondary-button mind-shell-mode-toggle"
              onClick={() => setUiViewMode((value) => (value === 'FOCUS' ? 'POWER' : 'FOCUS'))}
              title={isFocusMode ? 'เปิดโหมดละเอียด' : 'กลับโหมดโฟกัส'}
            >
              {isFocusMode ? 'โหมดละเอียด' : 'โหมดโฟกัส'}
            </button>
            {showPinButton && (
              <button
                type="button"
                className="shell-secondary-button"
                onClick={togglePin}
                disabled={pinDisabled}
                title={pinDisabled ? 'ปักหมุดได้สูงสุด 3 รายการ' : isPinned ? 'เอาหมุดออก' : 'ปักหมุดก้าวนี้'}
              >
                {isPinned ? 'เอาหมุดออก' : 'ปักหมุด'}
              </button>
            )}
            {isCompactViewport && !showDumpOnlyFirstView && (
              <button
                type="button"
                className="shell-secondary-button"
                onClick={() => {
                  setShowMobileStudio((value) => !value);
                  setShowMobileRooms(false);
                }}
              >
                {showMobileStudio ? 'ซ่อนตัวช่วย' : 'ตัวช่วย'}
              </button>
            )}
            <button
              type="button"
              className="shell-secondary-button mind-shell-utility-toggle"
              onClick={() => setShowUtilityMenu((value) => !value)}
            >
              {utilityButtonLabel}
            </button>
          </div>
        </header>

        {showUtilityMenu && (
          <div className="mind-utility-menu" role="dialog" aria-label="เครื่องมือเพิ่มเติม">
            {utilitySections.map((section) => (
              <section key={section.title} className="mind-utility-section">
                <p className="mind-utility-section-title">{section.title}</p>
                <div className="mind-utility-section-items">
                  {section.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="mind-utility-item"
                      onClick={() => handleUtilityAction(item.onClick)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {readOnlyMemory && (
          <div className="mind-inline-note" role="status" style={{ margin: '0.75rem 1rem 0' }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Memory may be partially incompatible. Operating in View-Only mode. Resetting database is recommended only as a last resort.
              {' '}({memoryDegradationCopy(memoryDegradationReason)})
            </p>
            <button
              type="button"
              onClick={() => setShowTrust(true)}
              style={{ background: 'transparent', fontSize: '0.8rem', padding: '0.2rem 0.4rem', color: 'var(--text-secondary)' }}
            >
              เปิดข้อมูลและ reset
            </button>
          </div>
        )}

        {aiOfflineNotice && (
          <div className="mind-inline-note" role="status" style={{ margin: '0.75rem 1rem 0' }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {aiOfflineNotice}
            </p>
            <button
              type="button"
              onClick={() => setAiOfflineNotice(null)}
              style={{ background: 'transparent', fontSize: '0.8rem', padding: '0.2rem 0.4rem', color: 'var(--text-secondary)' }}
            >
              ซ่อน
            </button>
          </div>
        )}

        {pinDisabled && showPinButton && (
          <p className="mind-shell-pin-note">ปักหมุดได้สูงสุด 3 รายการ</p>
        )}

        {(showMobileRooms || (!showDumpOnlyFirstView && showMobileStudio)) && (
          <button
            type="button"
            className="mind-shell-backdrop"
            aria-label="ปิดแผงข้าง"
            onClick={() => {
              setShowMobileRooms(false);
              setShowMobileStudio(false);
            }}
          />
        )}

        <div
          className={`mind-room-shell ${isRoomSidebarCollapsed ? 'rooms-collapsed' : ''} ${isStudioCollapsed ? 'studio-collapsed' : ''} ${isFocusMode ? 'is-focus-mode' : 'is-power-mode'} ${showDumpOnlyFirstView ? 'is-dump-first-view' : ''}`}
        >
          <div className={`mind-room-sidebar-wrap ${showMobileRooms ? 'is-open' : ''}`}>
            <RoomSidebar
              items={roomSidebarItems}
              onSelectRoom={handleSelectRoomFromShell}
              onCreateRoom={handleCreateRoom}
              collapsed={!isCompactViewport && isRoomSidebarCollapsed}
              onToggleCollapse={isCompactViewport ? undefined : () => setIsRoomSidebarCollapsed((value) => !value)}
              focusMode={isFocusMode}
            />
          </div>

          <div className="mind-room-main">
            <section className={`mind-room-main-stage mind-room-main-stage-${mainFlowSurface.tone}`}>
              {mainFlowSurface.showRoomHeader && (
                <RoomCanvasHeader
                  room={activeRoom}
                  onContinue={handleContinueFromRoomCard}
                  onMakeSmaller={handleMakeSmallerFromRoomCard}
                  continueDisabled={!roomCardCanContinue || aiActionsBlocked}
                  makeSmallerDisabled={!roomCardCanMakeSmaller || aiActionsBlocked}
                  focusMode={isFocusMode}
                />
              )}
              <div
                className="mind-room-main-stage-content"
                style={{
                  maxWidth: mainFlowSurface.maxWidth,
                }}
              >
                {renderState()}
              </div>
            </section>
          </div>

          {!showDumpOnlyFirstView && (
          <aside className={`mind-room-studio-wrap ${showMobileStudio ? 'is-open' : ''} ${isStudioCollapsed ? 'is-collapsed' : ''}`}>
            {isStudioCollapsed ? (
              <button
                type="button"
                className="mind-room-studio-collapsed-toggle"
                onClick={() => {
                  if (isCompactViewport) {
                    setShowMobileStudio(false);
                    return;
                  }
                  setIsStudioCollapsed(false);
                }}
                aria-label={isCompactViewport ? 'ปิดตัวช่วย' : 'ขยายตัวช่วย'}
                title={isCompactViewport ? 'ปิดตัวช่วย' : 'ขยายตัวช่วย'}
              >
                <span className="studio-eyebrow">บริบทช่วยงาน</span>
                <span className="mind-room-studio-collapsed-label">ตัวช่วย</span>
                <span className="mind-room-studio-collapsed-arrow">←</span>
              </button>
            ) : (
              <>
                <div className="mind-room-studio-header">
                  <div>
                    <p className="studio-eyebrow">บริบทช่วยงาน</p>
                    <h2 className="mind-room-studio-title">ตัวช่วย</h2>
                  </div>
                  <button
                    type="button"
                    className="shell-toggle-button shell-toggle-button-subtle"
                    onClick={() => {
                      if (isCompactViewport) {
                        setShowMobileStudio(false);
                        return;
                      }
                      setIsStudioCollapsed((value) => !value);
                    }}
                    aria-label={isCompactViewport ? 'ปิดตัวช่วย' : isStudioCollapsed ? 'ขยายตัวช่วย' : 'ย่อตัวช่วย'}
                  >
                    {isCompactViewport ? 'ปิด' : '→'}
                  </button>
                </div>
                <StudioPanel
                  snapshot={studioSnapshot}
                  intents={studioIntents}
                  loadingIntentId={activeStudioIntent}
                  onIntent={handleStudioIntent}
                  onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
                  onRetryFile={handleRetrySourceFile}
                  onSelectPrimaryFile={handleSelectPrimarySourceFile}
                  retryingFileId={retryingFileId}
                  mode={studioMode}
                  isCompactViewport={isCompactViewport}
                  focusMode={isFocusMode}
                />
              </>
            )}
          </aside>
          )}
        </div>
      </div>
      {activeValuePulseContext && !presentationMode && !showArchive && !showDataReview && !showOverview && !showTrust && !showWalkthrough && !showAiOpsDebug && !showObservationCapture && (
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
