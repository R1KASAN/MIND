"use client";

import { useEffect, useRef, useState } from 'react';
import {
  getActions, getSession, AppSession, saveSession,
  Action, updateAction, createDefaultSession,
  normalizeSession,
} from '@/lib/store/idb';
import { processWeeklySweep } from '@/lib/store/memoryRules';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import { checkAiHealth, HealthCheckResult } from '@/lib/ai/adapter';
import { AiRescueResponse } from '@/lib/ai/operations';
import type { AiOpsDebugEntry } from '@/lib/ai/ai-ops-debug';
import {
  buildPayloadFromAction,
  hasResumableTask,
} from '@/lib/orchestrator/task-machine';
import { createTaskController } from '@/lib/orchestrator/task-controller';
import type { ScaffoldRefineFeedback } from '@/lib/orchestrator/scaffold-refine';
import {
  buildStudioSnapshot,
  getStudioIntents,
  hasFreshReentryBrief,
  type StudioIntent,
  type StudioIntentId,
} from '@/lib/orchestrator/studio';

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
import { StudioPanel } from '@/components/Studio/StudioPanel';

const DEFAULT_AI_HEALTH: HealthCheckResult = {
  status: 'checking',
  model: 'qwen2.5:3b',
  reason: 'กำลังโหลดโมเดล...',
  detail: 'กำลังตรวจสอบความพร้อมของ Ollama',
  retryable: true,
};

// T028/T029: Local-timezone "today" string for morning ritual day comparison
function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StateMachinePage() {
  useTrackMountEvent('app_launch');

  const [session, setSession] = useState<AppSession | null>(null);
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
  const [activeStudioIntent, setActiveStudioIntent] = useState<StudioIntentId | null>(null);

  // T046: Background AI status — non-blocking passive indicator
  const [aiHealth, setAiHealth] = useState<HealthCheckResult>(DEFAULT_AI_HEALTH);

  // T057: Time-to-action tracking
  const [dumpStartTime, setDumpStartTime] = useState<number | null>(null);

  // T032: Reset notice
  const [showResetBanner, setShowResetBanner] = useState(false);

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
    async function load() {
      const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const skipWalkthrough = searchParams?.get('walkthrough') === 'off';
      const skipMorningRitual = searchParams?.get('ritual') === 'off';
      const enableAiDebug = searchParams?.get('debug') === 'ai';
      setAllowAiDebug(process.env.NODE_ENV !== 'production' || enableAiDebug);
      setShowAiOpsDebug(enableAiDebug);
      const updateAiHealth = (result: HealthCheckResult) => {
        // Emit readiness events only on transitions to avoid telemetry spam.
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

      // T043/T049: Non-blocking health check with lightweight background refresh.
      void refreshAiStatus();
      const healthInterval = setInterval(() => {
        void refreshAiStatus();
      }, 8000);

      await processWeeklySweep();
      const stored = await getSession();
      const actions = await getActions();
      let nextSession = stored;

      // T019: Defensive client-side migration shim for older sessions.
      if (typeof stored.activeDumpContext === 'string') {
        nextSession = {
          ...stored,
          activeDumpContext: {
            text: stored.activeDumpContext,
            createdAt: stored.lastActive,
          },
        };
        await saveSession(nextSession);
      }

      nextSession = normalizeSession(nextSession);

      // T032: Weekly reset notice
      if (nextSession.hasSeenResetNotice === false) {
        setShowResetBanner(true);
      }

      // Allow QA and verification links to open the dump entry without the onboarding overlay.
      if (!skipWalkthrough && nextSession.hasSeenWalkthrough !== true && nextSession.uiRoute === 'DUMP_ENTRY') {
        setShowWalkthrough(true);
      }

      // T005: BOUNCE_BACK intercept
      const isStale = Date.now() - nextSession.lastActive > 24 * 60 * 60 * 1000;
      if (isStale && !['DUMP_ENTRY', 'MORNING_RITUAL'].includes(nextSession.uiRoute)) {
        nextSession = normalizeSession({ ...nextSession, status: 'BOUNCE_BACK', uiRoute: 'BOUNCE_BACK' });
        await saveSession(nextSession);
      }

      // T028: Morning ritual intercept — only if not stale and first session of the day
      const today = localDateString();
      if (
        !skipMorningRitual &&
        !isStale &&
        nextSession.uiRoute === 'DUMP_ENTRY' &&
        nextSession.lastMorningShown !== today
      ) {
        nextSession = normalizeSession({ ...nextSession, status: 'MORNING_RITUAL', uiRoute: 'MORNING_RITUAL' });
        await saveSession(nextSession);
      }

      setSession(nextSession);
      sessionRef.current = nextSession;

      const hydratedAction = nextSession.currentActionId
        ? actions.find((a) => a.id === nextSession.currentActionId) || null
        : null;
      setCurrentActionState(hydratedAction);
      setCurrentWhyThisNow(nextSession.task?.actionExplanation ?? '');

      if (nextSession.currentPayload) {
        setCurrentPayload(nextSession.currentPayload);
      } else if (hydratedAction) {
        setCurrentPayload(buildPayloadFromAction(hydratedAction));
      } else {
        setCurrentPayload(null);
      }

      return () => clearInterval(healthInterval);
    }
    const cleanupPromise = load();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  useEffect(() => {
    if (session?.task?.actionExplanation !== undefined) {
      setCurrentWhyThisNow(session.task.actionExplanation ?? '');
    }
  }, [session?.task?.actionExplanation]);

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

  if (!session) return null;

  const studioSnapshot = buildStudioSnapshot(session.task, currentActionState, currentPayload);
  const studioIntents = getStudioIntents(session, currentActionState, currentPayload);

  const handleEditCurrentContext = async () => {
    await controller.openDumpWithCurrentContext();
  };

  const handleStudioIntent = async (intent: StudioIntent) => {
    const baseProperties = {
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
            {/* T032: Weekly reset dismissal banner */}
            {showResetBanner && (
              <div style={{
                padding: '0.75rem 1rem', background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)', marginBottom: '1rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  รายการก่อนหน้านี้ยังค้นหาเจอได้อย่างปลอดภัยในคลังเก็บ
                </p>
                <button
                  onClick={async () => {
                    setShowResetBanner(false);
                    const updated = { ...session, hasSeenResetNotice: true };
                    sessionRef.current = updated;
                    setSession(updated);
                    await saveSession(updated);
                  }}
                  style={{ background: 'transparent', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
                >
                  ✕
                </button>
              </div>
            )}
            <BrainDumpInput
              onNext={controller.handleDump}
              initialText={session.activeDumpContext?.text}
              studioPanel={(
                <StudioPanel
                  snapshot={studioSnapshot}
                  intents={studioIntents}
                  loadingIntentId={activeStudioIntent}
                  onIntent={handleStudioIntent}
                  onEditContext={studioSnapshot ? handleEditCurrentContext : undefined}
                />
              )}
            />
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
            currentStepIndex={session.task?.currentStepIndex ?? 0}
            refineLoading={isScaffoldRefining}
            refineFeedback={scaffoldRefineFeedback}
            onRescue={controller.handleEnterRescue}
            onMakeSmaller={controller.handleMakeSmaller}
            onComplete={controller.handleCompleteScaffold}
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

  const aiStatus = aiHealth.status;
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
            const reset = createDefaultSession();
            sessionRef.current = reset;
            setSession(reset);
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
          onClose={async () => {
            setShowWalkthrough(false);
            const base = sessionRef.current ?? session;
            const updated = { ...base, hasSeenWalkthrough: true };
            sessionRef.current = updated;
            setSession(updated);
            await saveSession(updated);
          }}
          onFinish={async () => {
            const base = sessionRef.current ?? session;
            const updated = { ...base, hasSeenWalkthrough: true };
            sessionRef.current = updated;
            setSession(updated);
            await saveSession(updated);
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem 0' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: '1rem', borderBottom: '1px solid var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* T047: Passive AI status indicator — non-clickable, awareness only */}
            <span
              title={`สถานะ AI ในเครื่อง: ${
                aiStatus === 'ready'
                  ? 'พร้อม'
                  : aiStatus === 'checking'
                    ? 'กำลังตรวจสอบ'
                    : aiStatus === 'model_missing'
                      ? 'ยังไม่พบโมเดล'
                      : 'ยังไม่พร้อม'
              }`}
              style={{
                width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                background:
                  aiStatus === 'ready' ? 'var(--success, #22c55e)' :
                  aiStatus === 'checking' ? 'var(--text-secondary)' :
                  '#f59e0b',
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {aiStatus === 'ready' ? 'AI ในเครื่องพร้อมแล้ว' :
               aiStatus === 'checking' ? 'กำลังเตรียม AI ในเครื่อง…' :
               aiStatus === 'model_missing' ? 'ยังไม่พบโมเดล' : 'AI ในเครื่องยังไม่พร้อม'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

        <div
          style={{
            width: '100%',
            maxWidth: session.uiRoute === 'DUMP_ENTRY' ? '100%' : '46rem',
            margin: '0 auto',
          }}
        >
          {renderState()}
        </div>
      </div>
      {allowAiDebug && (
        <AiOpsDebugPanel
          entries={aiOpsEntries}
          open={showAiOpsDebug}
          onToggle={() => setShowAiOpsDebug((value) => !value)}
        />
      )}
    </>
  );
}
