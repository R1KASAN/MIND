"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';

interface Props {
  snapshot: StudioSnapshot;
  surface: 'dump_studio' | 'morning_ritual' | 'bounce_back';
  onEditContext?: () => void;
  emphasized?: boolean;
  trackView?: boolean;
}

export function ContextSnapshot({ snapshot, surface, onEditContext, emphasized = false, trackView = true }: Props) {
  useTrackMountEvent('studio_snapshot_viewed', { surface }, trackView);
  const provenance = snapshot.provenance;
  const detailLabel = provenance ? 'ดูว่าทำไม' : 'ดูเพิ่ม';
  const confidenceLabel =
    provenance?.confidence === 'high'
      ? 'มั่นใจสูง'
      : provenance?.confidence === 'medium'
        ? 'มั่นใจกลาง'
        : 'มั่นใจต่ำ';

  return (
    <section
      className={`studio-card ${emphasized ? 'studio-card-emphasis' : ''}`}
      data-studio-snapshot-target
      style={{ gap: '0.85rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <p className="studio-eyebrow">บริบทที่ MIND ใช้อยู่</p>
          <h3 style={{ fontSize: '1.02rem', lineHeight: 1.35 }}>{snapshot.title}</h3>
        </div>
        {onEditContext && (
          <button
            type="button"
            onClick={onEditContext}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-secondary)',
              padding: '0.5rem 0.8rem',
              fontSize: '0.82rem',
            }}
          >
            แก้บริบทนี้
          </button>
        )}
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
        {snapshot.summary}
      </p>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <span className="studio-chip">{snapshot.contextLabel}</span>
        <span className="studio-chip">{snapshot.lastUpdatedLabel}</span>
      </div>

      {(provenance || snapshot.actionTitle) && (
        <details className="studio-provenance" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              fontWeight: 600,
              listStyle: 'none',
            }}
          >
            {detailLabel}
          </summary>
          <div className="studio-provenance-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.35rem' }}>
            {snapshot.actionTitle && (
              <p className="studio-inline-note" style={{ margin: 0 }}>
                ก้าวล่าสุด: {snapshot.actionTitle}
              </p>
            )}
            {provenance && (
              <>
                <p className="studio-inline-note" style={{ margin: 0 }}>
                  {provenance.whyThisNow}
                </p>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span className="studio-chip">{confidenceLabel}</span>
                  {provenance.inputsUsed.slice(0, 3).map((item) => (
                    <span key={item} className="studio-chip">{item}</span>
                  ))}
                </div>
                {provenance.changesSince.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <p className="studio-eyebrow" style={{ marginBottom: 0 }}>เปลี่ยนจากรอบก่อน</p>
                    <p className="studio-inline-note" style={{ margin: 0 }}>
                      {provenance.changesSince.join(' · ')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}

      {snapshot.blockers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p className="studio-eyebrow" style={{ marginBottom: 0 }}>สิ่งที่ยังค้างอยู่</p>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {snapshot.blockers.map((item) => (
              <span key={item} className="studio-chip studio-chip-danger">{item}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
