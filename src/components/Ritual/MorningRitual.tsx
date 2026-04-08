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

  const hour = new Date().getHours(); // T029: local timezone
  const greeting =
    hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(1rem, 2vw, 1.35rem)',
        paddingTop: 'clamp(1.5rem, 8vh, 4rem)',
        textAlign: 'center',
        alignItems: 'center',
        width: 'min(100%, 32rem)',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Today with MIND
        </p>
        <h1 style={{ fontSize: 'clamp(1.85rem, 6vw, 2.25rem)', fontWeight: 600 }}>{greeting}.</h1>
      </div>
      {reentryBrief ? (
        <>
          {snapshot && (
            <ContextSnapshot
              snapshot={snapshot}
              surface="morning_ritual"
              onEditContext={onEditContext}
            />
          )}
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.65 }}>
            {reentryBrief.summary}
          </p>
          {reentryBrief.ignoredNoise.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                width: '100%',
                textAlign: 'left',
                padding: '0.9rem 0.95rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
            {reentryBrief.topActions.map((item, index) => (
              <div
                key={`${item.roomId}-${item.title}-${index}`}
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius)',
                  padding: '0.95rem clamp(0.9rem, 3vw, 1rem)',
                  background: index === 0 ? 'rgba(103, 109, 229, 0.14)' : 'var(--bg-secondary)',
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%', marginTop: '0.6rem' }}>
        {reentryBrief && onResumeSuggested && (
          <button
            className="primary"
            onClick={() => {
              trackEvent('morning_ritual_reentry_suggested');
              onResumeSuggested();
            }}
          >
            เริ่มจากก้าวที่คุ้มสุดก่อน
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
          className={reentryBrief ? '' : 'primary'}
          onClick={() => {
            trackEvent('morning_ritual_accepted');
            onStart();
          }}
        >
          {reentryBrief ? 'เริ่มใหม่วันนี้' : 'ไปกันเลย'}
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
    </div>
  );
}
