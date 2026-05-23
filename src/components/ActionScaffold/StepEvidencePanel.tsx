'use client';

import { useState } from 'react';
import type { CurrentPlanStep } from '@/lib/store/idb';
import { trackEvent } from '@/lib/instrumentation';
import { buildStepEvidenceDisplay, buildStepEvidenceClickPayload } from '@/lib/orchestrator/step-evidence-display';

interface Props {
  step?: CurrentPlanStep;
}

export function getRenderableEvidenceChips(evidence: ReturnType<typeof buildStepEvidenceDisplay>['evidence']) {
  return evidence
    .filter((item) => (item.excerpt ?? '').trim() !== '')
    .slice(0, 3);
}

export function formatEvidenceSourceLabel(label: string) {
  return label.replace(/^Manual summary\b/i, 'ใช้ข้อความที่คุณวางไว้');
}

export function formatEvidenceChipLabel(label: string) {
  const userFacingLabel = formatEvidenceSourceLabel(label);
  return userFacingLabel.length > 32 ? `${userFacingLabel.slice(0, 32)}…` : userFacingLabel;
}

export function StepEvidencePanel({ step }: Props) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!step) return null;

  // Ensure we always have at least one honest fallback evidence source if none exists
  const hasStrongEvidence = step.evidence && step.evidence.length > 0 && step.evidence.some(item => (item.excerpt ?? '').trim() !== '');
  const stepWithEvidence = {
    ...step,
    evidence: hasStrongEvidence
      ? step.evidence
      : [
          {
            sourceId: 'manual:brain-dump',
            label: 'จากคำอธิบายที่คุณพิมพ์ไว้',
            excerpt: 'อ้างอิงจากสิ่งที่คุณพิมพ์บอกไว้ในข้อความล่าสุด',
            sourceKindLabel: 'manual_summary' as const,
          }
        ]
  };

  const display = buildStepEvidenceDisplay(stepWithEvidence, selectedSourceId);
  const {
    evidence,
    selectedEvidence,
    confidenceLabel,
    generatedLabel,
    confirmedLabel,
    sourceKindLabel,
    generatedByLabel,
  } = display;

  const safety = step.safety;
  const renderableEvidence = getRenderableEvidenceChips(evidence);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', width: '100%', maxWidth: '44rem' }}>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          className="supporting-label"
          style={{
            background: 'var(--bg-surface-muted, #2A2B31)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: '0.22rem 0.45rem',
            fontSize: '0.68rem',
            fontWeight: 500,
            color: 'var(--text-muted, #A0AEC0)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          ร่างจาก MIND
        </span>
        {confidenceLabel && (
          <span
            className="supporting-label"
            style={{
              background: 'var(--bg-surface-muted, #2A2B31)',
              borderRadius: 'var(--radius-sm, 4px)',
              padding: '0.22rem 0.45rem',
              fontSize: '0.68rem',
              fontWeight: 500,
              color: 'var(--text-muted, #A0AEC0)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {confidenceLabel}
          </span>
        )}
        {safety?.manualOnly && (
          <span
            className="supporting-label"
            style={{
              background: 'rgba(255,99,132,0.08)',
              borderRadius: 'var(--radius-sm, 4px)',
              padding: '0.22rem 0.45rem',
              fontSize: '0.68rem',
              fontWeight: 500,
              color: 'var(--danger, #FF6382)',
              border: '1px solid rgba(255,99,132,0.18)',
            }}
          >
            ทำด้วยมือเท่านั้น · ไม่รันอัตโนมัติ
          </span>
        )}
        {step.provenance?.userEdited && (
          <span
            className="supporting-label"
            style={{
              background: 'var(--bg-surface-muted, #2A2B31)',
              borderRadius: 'var(--radius-sm, 4px)',
              padding: '0.22rem 0.45rem',
              fontSize: '0.68rem',
              fontWeight: 500,
              color: 'var(--text-muted, #A0AEC0)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            แก้ไขโดยคุณ
          </span>
        )}
      </div>

      {renderableEvidence.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {renderableEvidence.map((item) => (
            <button
              key={`${item.sourceId}-${item.label}`}
              type="button"
              onClick={() => {
                setSelectedSourceId(item.sourceId);
                setDetailsOpen(true);
                trackEvent('step_evidence_clicked', buildStepEvidenceClickPayload(step, item.sourceId));
              }}
              style={{
                background: selectedSourceId === item.sourceId ? 'rgba(94,106,210,0.16)' : 'rgba(255,255,255,0.04)',
                border: selectedSourceId === item.sourceId ? '1px solid rgba(94,106,210,0.35)' : '1px solid rgba(255,255,255,0.09)',
                color: selectedSourceId === item.sourceId ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.34rem 0.58rem',
                fontSize: '0.76rem',
                cursor: 'pointer',
              }}
              title={`คลิกเพื่อดูที่มา: ${item.excerpt}`}
            >
              {formatEvidenceChipLabel(item.label)}
            </button>
          ))}
        </div>
      )}

      {(selectedEvidence || generatedLabel || confirmedLabel || step.provenance?.overrideNote) && (
        <details
          className="supporting-panel"
          style={{ padding: '0.85rem' }}
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--accent, #8B8CF6)',
              fontSize: '0.84rem',
              fontWeight: 600,
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.55rem',
              background: 'rgba(94, 106, 210, 0.08)',
              border: '1px solid rgba(94, 106, 210, 0.16)',
              borderRadius: '4px',
              transition: 'background 0.2s ease, border-color 0.2s ease',
            }}
            className="evidence-affordance-summary"
          >
            <span>ดูที่มาและหลักฐานของก้าวนี้</span>
            <span aria-hidden="true" style={{ fontSize: '0.8em', transition: 'transform 0.2s', transform: detailsOpen ? 'rotate(180deg)' : 'none' }}>↓</span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.7rem' }}>
            {selectedEvidence && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className="supporting-label" style={{ marginBottom: 0 }}>
                  {sourceKindLabel === formatEvidenceSourceLabel(selectedEvidence.label)
                    ? sourceKindLabel
                    : `${sourceKindLabel} · ${formatEvidenceSourceLabel(selectedEvidence.label)}`}
                </span>
                <p className="supporting-summary" style={{ margin: 0 }}>
                  {selectedEvidence.excerpt || 'ยังไม่มี excerpt สั้น ๆ จาก source นี้'}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {generatedLabel && <span className="studio-chip">สร้างเมื่อ {generatedLabel}</span>}
              {confirmedLabel && <span className="studio-chip">ยืนยันเมื่อ {confirmedLabel}</span>}
              {step.provenance?.generatedBy && (
                <span className="studio-chip">{generatedByLabel}</span>
              )}
              {step.safety?.risk && <span className="studio-chip">ความเสี่ยง: {step.safety.risk}</span>}
            </div>

            {step.provenance?.overrideNote && (
              <p className="studio-inline-note" style={{ margin: 0 }}>
                แก้ไข: {step.provenance.overrideNote}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
