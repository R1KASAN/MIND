"use client";

import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import type { ReentryBrief } from '@/lib/store/idb';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';
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
}: Props) {
  useTrackMountEvent('morning_ritual_shown');
  const primaryTopAction = reentryBrief?.topActions[0];
  const secondaryTopActions = reentryBrief?.topActions.slice(1) ?? [];

  const hour = new Date().getHours(); // T029: local timezone
  const greeting =
    hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(1rem, 2vw, 1.35rem)',
        paddingTop: 'clamp(0.6rem, 4vh, 1.4rem)',
        textAlign: 'center',
        alignItems: 'center',
        width: 'min(100%, 34rem)',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          กลับเข้าวันนี้
        </p>
        <h1 style={{ fontSize: 'clamp(1.85rem, 6vw, 2.25rem)', fontWeight: 600 }}>{greeting}.</h1>
      </div>
      {reentryBrief ? (
        <>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.65 }}>
            {reentryBrief.summary}
          </p>
          {primaryTopAction && (
            <div
              style={{
                width: '100%',
                border: '1px solid rgba(94,106,210,0.34)',
                borderRadius: 'calc(var(--radius) + 4px)',
                padding: '1rem 1rem 1.05rem',
                background: 'linear-gradient(180deg, rgba(103, 109, 229, 0.16), rgba(255,255,255,0.04))',
                textAlign: 'left',
              }}
            >
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                เริ่มจากก้าวนี้ก่อน
              </p>
              <strong style={{ display: 'block', marginTop: '0.45rem', fontSize: '1.02rem', lineHeight: 1.4 }}>{primaryTopAction.title}</strong>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{primaryTopAction.rationale}</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%', marginTop: '0.1rem' }}>
            {reentryBrief && onResumeSuggested && (
              <button
                className="primary"
                onClick={() => {
                  trackEvent('morning_ritual_reentry_suggested');
                  onResumeSuggested();
                }}
              >
                เริ่มจากก้าวนี้ก่อน
              </button>
            )}
            {reentryBrief && onResumeCheckpoint && (
              <button
                onClick={() => {
                  trackEvent('morning_ritual_reentry_checkpoint');
                  onResumeCheckpoint();
                }}
              >
                กลับไปต่อจาก checkpoint เดิม
              </button>
            )}
            <button
              onClick={() => {
                trackEvent('morning_ritual_accepted');
                onStart();
              }}
            >
              เริ่มใหม่วันนี้
            </button>
            <button
              onClick={() => {
                trackEvent('morning_ritual_skipped');
                onSkip();
              }}
              style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            >
              ข้ามก่อน
            </button>
          </div>
          {(snapshot || reentryBrief.ignoredNoise.length > 0 || secondaryTopActions.length > 0) && (
            <details
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.95rem 1rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  listStyle: 'none',
                }}
              >
                ดูบริบทเพิ่มเติม
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.9rem' }}>
                {snapshot && (
                  <ContextSnapshot
                    snapshot={snapshot}
                    surface="morning_ritual"
                    onEditContext={onEditContext}
                  />
                )}
                {reentryBrief.ignoredNoise.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                    }}
                  >
                    <p style={{ color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontSize: '0.82rem' }}>วันนี้ยังไม่ต้องแบกทั้งหมด</p>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {reentryBrief.ignoredNoise.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {secondaryTopActions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                    {secondaryTopActions.map((item, index) => (
                      <div
                        key={`${item.roomId}-${item.title}-${index}`}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 'var(--radius)',
                          padding: '0.95rem clamp(0.9rem, 3vw, 1rem)',
                          background: 'var(--bg-secondary)',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <strong>{item.title}</strong>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                            {item.impact} impact · {item.effort} effort
                          </span>
                        </div>
                        <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--text-secondary)', maxWidth: '280px', lineHeight: 1.65 }}>
          ถ้าวันนี้มี client chaos ค้างอยู่ วางลงมา แล้วให้ MIND ช่วยสรุป next move ให้โดยไม่ต้องเริ่มคิดจากศูนย์
        </p>
      )}

      {loading && (
        <p style={{ color: 'var(--text-secondary)', maxWidth: '280px' }}>
          MIND กำลังช่วยคัดว่าวันนี้ควรกลับไปเริ่มจากตรงไหนดี
        </p>
      )}

      {!reentryBrief && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%', marginTop: '0.6rem' }}>
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
            onClick={() => {
              trackEvent('morning_ritual_skipped');
              onSkip();
            }}
            style={{ background: 'transparent', color: 'var(--text-secondary)' }}
          >
            ข้ามก่อน
          </button>
        </div>
      )}
    </div>
  );
}
