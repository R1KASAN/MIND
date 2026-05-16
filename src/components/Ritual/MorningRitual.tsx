"use client";

import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import type { ReentryBrief } from '@/lib/store/idb';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';
import { AIProcessingIndicator } from '@/components/AI/AIProcessingIndicator';
import { ContextSnapshot } from '@/components/Studio/ContextSnapshot';

interface Props {
  onStart: () => void;
  onSkip: () => void;
  reentryBrief?: ReentryBrief;
  loading?: boolean;
  onResumeSuggested?: () => void;
  onResumeCheckpoint?: () => void;
  snapshot?: StudioSnapshot | null;
  onEditContext?: () => void;
  focusMode?: boolean;
}

// T027: Lightweight morning intercept — in-app only, no push notifications (spec §7, FR-008)
export function MorningRitual({
  onStart,
  onSkip,
  reentryBrief,
  loading = false,
  onResumeSuggested,
  onResumeCheckpoint,
  snapshot,
  onEditContext,
  focusMode = true,
}: Props) {
  useTrackMountEvent('morning_ritual_shown');
  useTrackMountEvent('reentry_brief_shown', { has_top_action: Boolean(reentryBrief?.topActions[0]) }, Boolean(reentryBrief));
  useTrackMountEvent('catch_up_mode_opened', { surface: 'morning_ritual' }, Boolean(reentryBrief));
  const primaryTopAction = reentryBrief?.topActions[0];
  const secondaryTopActions = reentryBrief?.topActions.slice(1) ?? [];
  const hasSuggestedResume = Boolean(reentryBrief && onResumeSuggested);
  const secondaryLabel = onResumeCheckpoint
    ? 'กลับไปจุดเดิม'
    : reentryBrief
      ? 'เริ่มใหม่วันนี้'
      : 'ข้ามก่อน';

  const hour = new Date().getHours(); // T029: local timezone
  const greeting =
    hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <div className="reentry-hero-shell">
      <div className="reentry-hero-header">
        <p className="reentry-hero-kicker">กลับมาทำต่อ</p>
        <h1 className="reentry-hero-title">{reentryBrief ? 'กลับมาทำต่อใน 2 นาที' : `${greeting}.`}</h1>
      </div>
      {reentryBrief ? (
        <>
          <div className="reentry-hero-support">
            <p className="reentry-hero-support-title">งานนี้เกี่ยวกับอะไร</p>
            <p className="reentry-hero-card-copy">{reentryBrief.summary}</p>
            <p className="reentry-hero-support-title">ครั้งก่อนค้างตรงไหน</p>
            <p className="reentry-hero-card-copy">
              {primaryTopAction ? primaryTopAction.rationale : 'MIND เก็บ save point ล่าสุดของห้องนี้ไว้แล้ว'}
            </p>
            <p className="reentry-hero-support-title">ตอนนี้ควรเริ่มตรงไหน</p>
            <p className="reentry-hero-card-copy">
              {primaryTopAction ? primaryTopAction.title : 'กลับไปต่อจากจุดเดิม'}
            </p>
          </div>
          <p className="reentry-hero-summary">{reentryBrief.summary}</p>
          {primaryTopAction && (
            <div className="reentry-hero-card">
              <p className="reentry-hero-card-label">ก้าวที่ควรเริ่ม</p>
              <strong className="reentry-hero-card-title">{primaryTopAction.title}</strong>
              <p className="reentry-hero-card-copy">{primaryTopAction.rationale}</p>
            </div>
          )}
          <div className="reentry-hero-actions">
            {hasSuggestedResume ? (
              <button
                className="primary"
                onClick={() => {
                  trackEvent('morning_ritual_reentry_suggested');
                  onResumeSuggested?.();
                }}
              >
                ต่อจากก้าวนี้
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  trackEvent('morning_ritual_accepted');
                  onStart();
                }}
              >
                ไปกันเลย
              </button>
            )}
            <button
              className="reentry-hero-secondary"
              onClick={() => {
                if (onResumeCheckpoint) {
                  trackEvent('morning_ritual_reentry_checkpoint');
                  void onResumeCheckpoint();
                  return;
                }
                if (reentryBrief) {
                  trackEvent('morning_ritual_accepted');
                  onStart();
                  return;
                }
                trackEvent('morning_ritual_skipped');
                onSkip();
              }}
            >
              {secondaryLabel}
            </button>
          </div>
          {(snapshot || reentryBrief.ignoredNoise.length > 0 || secondaryTopActions.length > 0 || hasSuggestedResume) && (
            <details className="reentry-hero-more" open={!focusMode}>
              <summary>ดูเพิ่ม</summary>
              <div className="reentry-hero-more-body">
                {snapshot && (
                  <ContextSnapshot
                    snapshot={snapshot}
                    surface="morning_ritual"
                    onEditContext={onEditContext}
                    powerMode={!focusMode}
                  />
                )}
                {reentryBrief.ignoredNoise.length > 0 && (
                  <div className="reentry-hero-support">
                    <p className="reentry-hero-support-title">วันนี้ยังไม่ต้องแบกทั้งหมด</p>
                    <ul className="reentry-hero-support-list">
                      {reentryBrief.ignoredNoise.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {secondaryTopActions.length > 0 && (
                  <div className="reentry-hero-alt-list">
                    {secondaryTopActions.map((item, index) => (
                      <div key={`${item.roomId}-${item.title}-${index}`} className="reentry-hero-alt-card">
                        <div className="reentry-hero-alt-head">
                          <strong>{item.title}</strong>
                          <span>
                            {item.impact} impact · {item.effort} effort
                          </span>
                        </div>
                        <p>{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
                {hasSuggestedResume && (
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent('morning_ritual_accepted');
                      onStart();
                    }}
                  >
                    เริ่มใหม่วันนี้
                  </button>
                )}
                <button
                  type="button"
                  className="reentry-hero-secondary"
                  onClick={() => {
                    trackEvent('morning_ritual_skipped');
                    onSkip();
                  }}
                >
                  ข้ามก่อน
                </button>
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="reentry-hero-summary">
          ถ้าวันนี้มี client chaos ค้างอยู่ วางลงมา แล้วให้ MIND ช่วยสรุปทางเริ่มโดยไม่ต้องเริ่มคิดจากศูนย์
        </p>
      )}

      {loading && (
        <AIProcessingIndicator
          size="panel"
          label="กำลังคัดทางเริ่มวันนี้"
          detail="MIND กำลังคัดว่าควรกลับไปเริ่มจากตรงไหนดี"
        />
      )}

      {!reentryBrief && (
        <div className="reentry-hero-actions">
          <button
            className="primary"
            onClick={() => {
              trackEvent('morning_ritual_accepted');
              onStart();
            }}
          >
            ไปกันเลย
          </button>
          <button
            className="reentry-hero-secondary"
            onClick={() => {
              trackEvent('morning_ritual_skipped');
              onSkip();
            }}
          >
            ข้ามก่อน
          </button>
        </div>
      )}
    </div>
  );
}
