"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import type { StudioProvenanceConfidence, StudioSnapshot } from '@/lib/orchestrator/studio';

interface Props {
  snapshot: StudioSnapshot;
  surface: 'dump_studio' | 'morning_ritual' | 'bounce_back';
  onEditContext?: () => void;
  emphasized?: boolean;
}

function confidenceLabel(confidence: StudioProvenanceConfidence) {
  if (confidence === 'high') return 'มั่นใจสูง';
  if (confidence === 'medium') return 'มั่นใจกลาง';
  return 'มั่นใจต่ำ';
}

function previewInputs(inputsUsed: string[]) {
  if (inputsUsed.length === 0) return 'ยังไม่มีข้อมูลชัด';
  if (inputsUsed.length === 1) return inputsUsed[0];
  if (inputsUsed.length === 2) return `${inputsUsed[0]} + ${inputsUsed[1]}`;
  return `${inputsUsed.slice(0, 2).join(' + ')} +${inputsUsed.length - 2} เพิ่มเติม`;
}

export function ContextSnapshot({ snapshot, surface, onEditContext, emphasized = false }: Props) {
  useTrackMountEvent('studio_snapshot_viewed', { surface });
  const provenance = snapshot.provenance;

  return (
    <section className={`studio-card ${emphasized ? 'studio-card-emphasis' : ''}`} style={{ gap: '0.9rem' }}>
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

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
        {snapshot.summary}
      </p>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <span className="studio-chip">{snapshot.contextLabel}</span>
        <span className="studio-chip">{snapshot.lastUpdatedLabel}</span>
        {snapshot.actionTitle && <span className="studio-chip">ก้าวล่าสุด: {snapshot.actionTitle}</span>}
      </div>

      {provenance && (
        <details className="studio-provenance">
          <summary className="studio-provenance-summary">
            <div className="studio-provenance-summary-copy">
              <p className="studio-eyebrow" style={{ marginBottom: 0 }}>ทำไม MIND ใช้ชุดนี้</p>
              <p className="studio-provenance-preview">
                ใช้ {previewInputs(provenance.inputsUsed)} · {confidenceLabel(provenance.confidence)}
              </p>
            </div>
            <span className="studio-provenance-more">ดูเพิ่ม</span>
          </summary>

          <div className="studio-provenance-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <p className="studio-eyebrow" style={{ marginBottom: 0 }}>ใช้ข้อมูล</p>
              <div className="studio-provenance-chip-row">
                {provenance.inputsUsed.map((item) => (
                  <span key={item} className="studio-chip">{item}</span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <p className="studio-eyebrow" style={{ marginBottom: 0 }}>เปลี่ยนจากรอบก่อน</p>
              <div className="studio-provenance-chip-row">
                {provenance.changesSince.map((item) => (
                  <span key={item} className="studio-chip studio-chip-danger">{item}</span>
                ))}
              </div>
            </div>

            <p className="studio-provenance-note">{provenance.whyThisNow}</p>
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
