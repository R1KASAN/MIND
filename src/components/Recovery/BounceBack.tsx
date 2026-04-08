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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.9rem, 2vw, 1.1rem)',
        paddingTop: 'clamp(1.25rem, 6vh, 2.25rem)',
        width: 'min(100%, 32rem)',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Reentry Brief
        </p>
        <h2 style={{ fontSize: 'clamp(1.55rem, 5vw, 2.05rem)', lineHeight: 1.15 }}>กลับมาแล้ว งานนี้ยังไปต่อได้</h2>
      </div>
      {reentryBrief ? (
        <>
          {snapshot && (
            <ContextSnapshot
              snapshot={snapshot}
              surface="bounce_back"
              onEditContext={onEditContext}
            />
          )}
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.96rem' }}>{reentryBrief.summary}</p>
          {reentryBrief.ignoredNoise.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                padding: '0.85rem 0.95rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {reentryBrief.topActions.map((item, index) => (
              <div
                key={`${item.roomId}-${item.title}-${index}`}
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius)',
                  padding: '0.9rem clamp(0.9rem, 3vw, 1rem)',
                  background: index === 0 ? 'rgba(103, 109, 229, 0.14)' : 'var(--bg-secondary)',
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

      {reentryBrief && (
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>ถ้าจะเริ่มใหม่ ก็ยังเริ่มจากข้อความได้เลย</p>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
            ไม่มีไฟล์ก็เริ่มได้ ไฟล์เป็นแค่ context เสริม ไม่ใช่เงื่อนไขเริ่มต้น
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.35rem' }}>
        {reentryBrief && onUseSuggested && (
          <button className="primary" onClick={onUseSuggested}>
            ทำอันนี้ก่อน: {reentryBrief.topActions[0]?.title ?? actionTitle}
          </button>
        )}
        <button className={reentryBrief ? '' : 'primary'} onClick={onContinue}>กลับไปต่อจากจุดเดิม</button>
        <button onClick={onStartFresh}>เริ่มใหม่</button>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          เริ่มใหม่ = พิมพ์งานก่อนได้เลย ไม่มีไฟล์ก็เริ่มได้
        </p>
      </div>
    </div>
  );
}
