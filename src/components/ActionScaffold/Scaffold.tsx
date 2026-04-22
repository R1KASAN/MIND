"use client";

import { useEffect, useState } from 'react';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import type { CurrentPlanStep, PlanGeneratedBy, PlanSourceKindLabel } from '@/lib/store/idb';
import { formatConfidenceLabel } from '@/lib/orchestrator/plan-provenance';
import {
  SCAFFOLD_REFINE_LOADING_COPY,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';

interface Props {
  action: AiSynthesisResponse['recommended_action'];
  steps: CurrentPlanStep[];
  currentStepIndex: number;
  isCompletion?: boolean;
  successSignal?: string;
  refineLoading?: boolean;
  refineFeedback?: ScaffoldRefineFeedback | null;
  onRescue: () => void;
  onMakeSmaller: () => void;
  onComplete: () => void;
  onEditStep?: (stepId: string, text: string) => void;
  onBackToSteps: () => void;
  onStartNew: () => void;
  focusMode?: boolean;
}

function renderRefineFeedbackBadges(refineFeedback: ScaffoldRefineFeedback) {
  if (!refineFeedback.suggestedRouteLabel && !refineFeedback.suggestedReasonLabel) return null;

  return (
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
      {refineFeedback.suggestedRouteLabel ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.26rem 0.58rem',
            borderRadius: '999px',
            background: 'rgba(94, 106, 210, 0.14)',
            border: '1px solid rgba(94, 106, 210, 0.26)',
            fontSize: '0.76rem',
            color: 'var(--text-primary)',
          }}
        >
          {refineFeedback.suggestedRouteLabel}
        </span>
      ) : null}
      {refineFeedback.suggestedReasonLabel ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.26rem 0.58rem',
            borderRadius: '999px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.76rem',
            color: 'var(--text-secondary)',
          }}
        >
          {refineFeedback.suggestedReasonLabel}
        </span>
      ) : null}
    </div>
  );
}

function hasRetrievedEvidence(step?: CurrentPlanStep) {
  return Boolean(step?.evidence?.some((item) => item.sourceKindLabel === 'retrieved'));
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return undefined;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatSourceKindLabel(value?: PlanSourceKindLabel) {
  if (value === 'manual_summary') return 'สรุปด้วยมือ';
  if (value === 'extracted') return 'ดึงจากไฟล์';
  if (value === 'retrieved') return 'ดึงจากหลักฐาน';
  return 'หลักฐานในห้อง';
}

function formatGeneratedByLabel(value?: PlanGeneratedBy) {
  if (value === 'action') return 'แผนหลัก';
  if (value === 'scaffold') return 'ย่อยงาน';
  if (value === 'rescue') return 'ช่วยตอนติด';
  if (value === 'reentry') return 'กลับเข้าห้อง';
  return value ?? '';
}

function StepProvenance({ step }: { step?: CurrentPlanStep }) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  if (!step) return null;
  const selectedEvidence = step.evidence?.find((item) => item.sourceId === selectedSourceId) ?? step.evidence?.[0];
  const generatedLabel = formatTimestamp(step.provenance?.generatedAt);
  const confirmedLabel = formatTimestamp(step.provenance?.confirmedAt);
  return (
    <details className="supporting-panel" style={{ width: '100%', maxWidth: '44rem' }}>
          <summary
          style={{
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            fontWeight: 600,
            listStyle: 'none',
            textAlign: 'left',
          }}
        >
          เหตุผล / ประวัติ
        </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span className="supporting-label">ร่างจาก MIND</span>
          <span className="supporting-label">{formatConfidenceLabel(step.confidence)}</span>
          {step.provenance?.userEdited && <span className="supporting-label">แก้ไขโดยคุณ</span>}
          {step.provenance?.confirmedAt && <span className="supporting-label">ยืนยันแล้ว</span>}
          {step.safety?.manualOnly && <span className="supporting-label" style={{ color: 'var(--danger)' }}>ทำด้วยมือเท่านั้น</span>}
        </div>
        {step.evidence && step.evidence.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {step.evidence.map((item) => (
              <button
                key={`${step.id}-${item.sourceId}`}
                type="button"
                onClick={() => {
                  setSelectedSourceId(item.sourceId);
                  trackEvent('step_evidence_clicked', {
                    step_id: step.id,
                    source_ids: [item.sourceId],
                    confidence_level: step.confidence?.level,
                    confidence_score: step.confidence?.score,
                    destructive_risk: step.safety?.risk,
                    retrieval_enabled: hasRetrievedEvidence(step),
                  });
                }}
                title={item.excerpt}
                style={{
                  background: selectedSourceId === item.sourceId ? 'rgba(94,106,210,0.16)' : 'rgba(255,255,255,0.04)',
                  border: selectedSourceId === item.sourceId ? '1px solid rgba(94,106,210,0.35)' : '1px solid rgba(255,255,255,0.09)',
                  color: selectedSourceId === item.sourceId ? 'var(--text-primary)' : 'var(--text-secondary)',
                  padding: '0.34rem 0.58rem',
                  fontSize: '0.76rem',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {selectedEvidence && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span className="supporting-label" style={{ marginBottom: 0 }}>
              {formatSourceKindLabel(selectedEvidence.sourceKindLabel)} · {selectedEvidence.label}
            </span>
            <p className="supporting-summary" style={{ margin: 0 }}>
              {selectedEvidence.excerpt || 'ยังไม่มี excerpt สั้น ๆ จาก source นี้'}
            </p>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {generatedLabel && <span className="studio-chip">สร้างเมื่อ {generatedLabel}</span>}
          {confirmedLabel && <span className="studio-chip">ยืนยันเมื่อ {confirmedLabel}</span>}
              {step.provenance?.generatedBy && <span className="studio-chip">{formatGeneratedByLabel(step.provenance.generatedBy)}</span>}
          {step.safety?.risk && <span className="studio-chip">ความเสี่ยง: {step.safety.risk}</span>}
        </div>
        {step.provenance?.overrideNote && (
          <p className="studio-inline-note" style={{ margin: 0 }}>
            แก้ไข: {step.provenance.overrideNote}
          </p>
        )}
      </div>
    </details>
  );
}

function StepMiniMeta({ step }: { step: CurrentPlanStep }) {
  const evidenceCount = step.evidence?.length ?? 0;
  if (!step.confidence && evidenceCount === 0 && !step.safety?.manualOnly && !step.provenance?.userEdited) return null;

  return (
    <div style={{ display: 'flex', gap: '0.38rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
      {step.confidence && <span className="studio-chip">{formatConfidenceLabel(step.confidence)}</span>}
      {evidenceCount > 0 && <span className="studio-chip">{evidenceCount} หลักฐาน</span>}
      {step.provenance?.userEdited && <span className="studio-chip">แก้ไขโดยคุณ</span>}
      {step.safety?.manualOnly && <span className="studio-chip studio-chip-danger">ทำด้วยมือเท่านั้น</span>}
    </div>
  );
}

export function Scaffold({
  action,
  steps,
  currentStepIndex,
  isCompletion = false,
  successSignal,
  refineLoading = false,
  refineFeedback,
  onRescue,
  onMakeSmaller,
  onComplete,
  onEditStep,
  onBackToSteps,
  onStartNew,
  focusMode = true,
}: Props) {
  useTrackMountEvent('scaffold_started');
  const visibleSteps: CurrentPlanStep[] = steps.length > 0
    ? steps
    : action.micro_steps.map((step, index) => ({ id: `step-${index + 1}`, text: step }));
  const activeStepIndex = Math.min(currentStepIndex, Math.max(visibleSteps.length - 1, 0));
  const currentStep = visibleSteps[activeStepIndex] ?? visibleSteps[0];
  useEffect(() => {
    if (!currentStep) return;
    trackEvent('step_draft_shown', {
      step_id: currentStep.id,
      source_ids: currentStep.evidence?.map((item) => item.sourceId),
      confidence_level: currentStep.confidence?.level,
      confidence_score: currentStep.confidence?.score,
      destructive_risk: currentStep.safety?.risk,
      retrieval_enabled: hasRetrievedEvidence(currentStep),
    });
    if (currentStep.safety?.manualOnly) {
      trackEvent('destructive_step_warning_shown', {
        step_id: currentStep.id,
        destructive_risk: currentStep.safety.risk,
      });
    }
  }, [currentStep]);

  if (focusMode) {
    if (isCompletion) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: '44rem', margin: '0 auto', gap: '0.95rem', paddingTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{action.title}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '-0.2rem' }}>
            งานรอบนี้จบแล้ว เหลือแค่ตัดสินใจว่าจะเริ่มใหม่หรือย้อนดูขั้นตอน
          </p>

          <div
            style={{
              padding: '1.1rem',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(94, 106, 210, 0.12)',
              border: '1px solid rgba(94, 106, 210, 0.28)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <strong style={{ fontSize: '1.03rem' }}>
              คุณทำครบ {visibleSteps.length} ขั้นตอนของงานรอบนี้แล้ว
            </strong>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {successSignal ?? 'ถ้าจะไปต่อ ให้เริ่มงานใหม่หรือย้อนกลับไปดู step ล่าสุดได้'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="primary" onClick={onStartNew}>
              เริ่มงานใหม่
            </button>
            <button onClick={onBackToSteps}>กลับไปดูขั้นตอน</button>
          </div>

          <details className="supporting-panel" style={{ width: '100%', maxWidth: '44rem' }}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
                fontWeight: 600,
                listStyle: 'none',
                textAlign: 'left',
              }}
            >
              ดูขั้นตอนทั้งหมด
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.85rem' }}>
              {visibleSteps.map((step, idx) => (
                <div
                  key={step.id}
                  style={{
                    padding: '0.95rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    opacity: 0.82,
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    ขั้นตอน {idx + 1}
                  </span>
                  <span>{step.text}</span>
                  <StepMiniMeta step={step} />
                </div>
              ))}
            </div>
          </details>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: '44rem', margin: '0 auto', gap: '0.95rem', paddingTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{action.title}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '-0.2rem' }}>
          ตอนนี้อยู่ที่ขั้นตอน {visibleSteps.length === 0 ? '0' : `${activeStepIndex + 1} / ${visibleSteps.length}`}
        </p>

        <div className="action-hero-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ขั้นตอนที่กำลังทำ
          </p>
          <strong style={{ fontSize: '1.03rem', lineHeight: 1.55 }}>
            {currentStep?.text ?? action.title}
          </strong>
          {currentStep && onEditStep && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>แก้ step นี้ก่อนยืนยัน</span>
              <textarea
                key={currentStep.id}
                defaultValue={currentStep.text}
                onBlur={(event) => {
                  const nextText = event.currentTarget.value;
                  if (nextText.trim() && nextText.trim() !== currentStep.text) {
                    onEditStep(currentStep.id, nextText);
                  }
                }}
                style={{ minHeight: '84px' }}
              />
            </label>
          )}
        </div>

        <StepProvenance step={currentStep} />

        {refineLoading && (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {SCAFFOLD_REFINE_LOADING_COPY}
          </p>
        )}
        {!refineLoading && refineFeedback?.kind === 'error' && (
          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(255, 99, 132, 0.08)',
              border: '1px solid rgba(255, 99, 132, 0.22)',
              color: 'var(--text-primary)',
              fontSize: '0.92rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span>{refineFeedback.message}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                {refineFeedback.diagnostic}
              </span>
              {renderRefineFeedbackBadges(refineFeedback)}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.1rem' }}>
          <button
            className="primary"
            disabled={refineLoading}
            onClick={() => { trackEvent('scaffold_completed'); onComplete(); }}
          >
            เสร็จแล้ว
          </button>
          <button disabled={refineLoading} onClick={onMakeSmaller}>ย่อยให้เล็กลงอีก</button>
          <button disabled={refineLoading} onClick={onRescue}>ไม่ใช่แบบนี้</button>
          <details className="supporting-panel" style={{ width: '100%', maxWidth: '44rem' }}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
                fontWeight: 600,
                listStyle: 'none',
                textAlign: 'left',
              }}
            >
              ดูขั้นตอนทั้งหมด
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.85rem' }}>
              {visibleSteps.map((step, idx) => (
                <div
                  key={step.id}
                  style={{
                    padding: '1rem',
                    background: idx === activeStepIndex ? 'rgba(94, 106, 210, 0.14)' : 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    border: idx === activeStepIndex ? '1px solid rgba(94, 106, 210, 0.35)' : '1px solid transparent',
                    opacity: idx < activeStepIndex ? 0.72 : 1,
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    ขั้นตอน {idx + 1}
                  </span>
                  <span>{step.text}</span>
                  <StepMiniMeta step={step} />
                </div>
              ))}
            </div>
          </details>
          <button disabled={refineLoading} onClick={onRescue} style={{ color: 'var(--danger)' }}>ฉันติดอยู่</button>
        </div>
      </div>
    );
  }

  if (isCompletion) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: '44rem', margin: '0 auto', gap: '1rem', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{action.title}</h2>
        <div
          style={{
            padding: '1.15rem',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(94, 106, 210, 0.12)',
            border: '1px solid rgba(94, 106, 210, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            จบชุดขั้นตอนนี้แล้ว
          </span>
          <strong style={{ fontSize: '1.05rem' }}>
            คุณทำครบ {visibleSteps.length} ขั้นตอนของงานรอบนี้แล้ว
          </strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {successSignal ?? 'ตอนนี้งานรอบนี้ขยับจนจบชุดขั้นตอนแล้ว ถ้าพร้อมค่อยเริ่มงานใหม่ หรือย้อนกลับไปดู step ล่าสุดได้'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          {visibleSteps.map((step, idx) => (
            <div
              key={step.id}
              style={{
                padding: '0.95rem 1rem',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(255,255,255,0.05)',
                opacity: 0.82,
              }}
            >
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                ขั้นตอน {idx + 1}
              </span>
              <span>{step.text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button className="primary" onClick={onStartNew}>
            เริ่มงานใหม่
          </button>
          <button onClick={onBackToSteps}>กลับไปดูขั้นตอน</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: '44rem', margin: '0 auto', gap: '1rem', paddingTop: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{action.title}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '-0.35rem' }}>
        ตอนนี้อยู่ที่ขั้นตอน {visibleSteps.length === 0 ? '0' : `${activeStepIndex + 1} / ${visibleSteps.length}`}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
        {visibleSteps.map((step, idx) => (
          <div
            key={step.id}
            style={{
              padding: '1rem',
              background: idx === activeStepIndex ? 'rgba(94, 106, 210, 0.14)' : 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              border: idx === activeStepIndex ? '1px solid rgba(94, 106, 210, 0.35)' : '1px solid transparent',
              opacity: idx < activeStepIndex ? 0.72 : 1,
            }}
          >
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              ขั้นตอน {idx + 1}
            </span>
            <span>{step.text}</span>
            <StepMiniMeta step={step} />
          </div>
        ))}
      </div>

      <StepProvenance step={currentStep} />

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {refineLoading && (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {SCAFFOLD_REFINE_LOADING_COPY}
          </p>
        )}
        {!refineLoading && refineFeedback?.kind === 'error' && (
          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(255, 99, 132, 0.08)',
              border: '1px solid rgba(255, 99, 132, 0.22)',
              color: 'var(--text-primary)',
              fontSize: '0.92rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span>{refineFeedback.message}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                {refineFeedback.diagnostic}
              </span>
              {renderRefineFeedbackBadges(refineFeedback)}
            </div>
          </div>
        )}
        <button
          className="primary"
          disabled={refineLoading}
          onClick={() => { trackEvent('scaffold_completed'); onComplete(); }}
        >
          เสร็จแล้ว
        </button>
        <button disabled={refineLoading} onClick={onMakeSmaller}>ย่อยให้เล็กลงอีก</button>
        <button disabled={refineLoading} onClick={onRescue}>ไม่ใช่แบบนี้</button>
        <button disabled={refineLoading} onClick={onRescue} style={{ color: 'var(--danger)' }}>ฉันติดอยู่</button>
      </div>
    </div>
  );
}
