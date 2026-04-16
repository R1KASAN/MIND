"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import type { ReentryBrief } from '@/lib/store/idb';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';
import { ContextSnapshot } from '@/components/Studio/ContextSnapshot';

interface Props {
  actionTitle: string;
  reentryBrief?: ReentryBrief;
  loading?: boolean;
  onUseSuggested?: () => void;
  onContinue: () => void;
  onStartFresh: () => void;
  snapshot?: StudioSnapshot | null;
  onEditContext?: () => void;
}

export function BounceBack({
  actionTitle,
  reentryBrief,
  loading = false,
  onUseSuggested,
  onContinue,
  onStartFresh,
  snapshot,
  onEditContext,
}: Props) {
  useTrackMountEvent('bounce_back_opened', { actionTitle });
  const primaryTopAction = reentryBrief?.topActions[0];
  const secondaryTopActions = reentryBrief?.topActions.slice(1) ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.9rem, 2vw, 1.1rem)',
        paddingTop: 'clamp(0.5rem, 3vh, 1rem)',
        width: 'min(100%, 34rem)',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          กลับเข้าบริบท
        </p>
        <h2 style={{ fontSize: 'clamp(1.55rem, 5vw, 2.05rem)', lineHeight: 1.15 }}>กลับมาแล้ว งานนี้ยังไปต่อได้</h2>
      </div>
      {reentryBrief ? (
        <>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.96rem' }}>{reentryBrief.summary}</p>
          {primaryTopAction && (
            <div
              style={{
                border: '1px solid rgba(94,106,210,0.34)',
                borderRadius: 'calc(var(--radius) + 4px)',
                padding: '1rem 1rem 1.05rem',
                background: 'linear-gradient(180deg, rgba(103, 109, 229, 0.16), rgba(255,255,255,0.04))',
              }}
            >
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                เริ่มจากก้าวนี้ก่อน
              </p>
              <strong style={{ display: 'block', marginTop: '0.45rem', fontSize: '1.02rem', lineHeight: 1.4 }}>{primaryTopAction.title}</strong>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.55 }}>{primaryTopAction.rationale}</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.1rem' }}>
            {reentryBrief && onUseSuggested && (
              <button className="primary" onClick={onUseSuggested}>
                ทำอันนี้ก่อน: {primaryTopAction?.title ?? actionTitle}
              </button>
            )}
            <button onClick={onContinue}>กลับไปต่อจากจุดเดิม</button>
            <button onClick={onStartFresh}>เริ่มใหม่</button>
          </div>
          {(snapshot || reentryBrief.ignoredNoise.length > 0 || secondaryTopActions.length > 0) && (
            <details
              style={{
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
                }}
              >
                ดูบริบทเพิ่มเติม
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.9rem' }}>
                {snapshot && (
                  <ContextSnapshot
                    snapshot={snapshot}
                    surface="bounce_back"
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
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>วันนี้ยังไม่ต้องสนใจ</p>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {reentryBrief.ignoredNoise.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {secondaryTopActions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {secondaryTopActions.map((item, index) => (
                      <div
                        key={`${item.roomId}-${item.title}-${index}`}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 'var(--radius)',
                          padding: '0.9rem clamp(0.9rem, 3vw, 1rem)',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <strong>{item.title}</strong>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                            {item.resumeTarget === 'SCAFFOLD' ? 'กลับไปทำต่อ' : item.resumeTarget === 'ONE_ACTION' ? 'กลับไปเลือกก้าว' : 'เริ่มใหม่'}
                          </span>
                        </div>
                        <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.55 }}>{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            เมื่อกี้คุณกำลังทำ <strong>{actionTitle}</strong> อยู่ MIND จะช่วยพากลับเข้าบริบทเดิมให้เร็วที่สุด
          </p>
          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>เริ่มจากพิมพ์งานได้เลย</p>
            <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
              ไม่มีไฟล์ก็เริ่มได้ ถ้าจะเริ่มใหม่ตอนนี้ พิมพ์สภาพงานก่อน แล้วค่อยแนบไฟล์เป็น context เสริมเมื่อจำเป็น
            </p>
          </div>
        </div>
      )}

      {loading && (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          MIND กำลังสรุปว่าควรกลับเข้างานนี้แบบไหนดี
        </p>
      )}
      {!reentryBrief && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.35rem' }}>
          <button className="primary" onClick={onContinue}>กลับไปต่อจากจุดเดิม</button>
          <button onClick={onStartFresh}>เริ่มใหม่</button>
        </div>
      )}
    </div>
  );
}
