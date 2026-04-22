"use client";

import { useEffect, useRef, useState } from 'react';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import type { Action, CurrentPlan, CurrentPlanStep, PlanGeneratedBy, PlanSourceKindLabel, TaskConstraints } from '@/lib/store/idb';
import type { ActionNegotiationInput } from '@/lib/orchestrator/task-controller';
import { formatConfidenceLabel } from '@/lib/orchestrator/plan-provenance';

interface Props {
  data: AiSynthesisResponse;
  action?: Action | null;
  whyThisNow?: string;
  constraints?: TaskConstraints;
  plan?: CurrentPlan;
  negotiationLoading?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onNotLikeThis?: () => void;
  onMarkAdjusted: () => void;
  onNegotiate: (input: ActionNegotiationInput) => void;
  focusMode?: boolean;
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

function StepEvidence({ step }: { step?: CurrentPlanStep }) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  if (!step) return null;
  const evidence = step.evidence ?? [];
  const safety = step.safety;
  const selectedEvidence = evidence.find((item) => item.sourceId === selectedSourceId) ?? evidence[0];
  const generatedLabel = formatTimestamp(step.provenance?.generatedAt);
  const confirmedLabel = formatTimestamp(step.provenance?.confirmedAt);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', width: '100%', maxWidth: '42rem' }}>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '999px',
            padding: '0.28rem 0.58rem',
            fontSize: '0.74rem',
            color: 'var(--text-secondary)',
          }}
        >
          ร่างจาก MIND
        </span>
        <span
          style={{
            border: '1px solid rgba(94,106,210,0.34)',
            background: 'rgba(94,106,210,0.12)',
            borderRadius: '999px',
            padding: '0.28rem 0.58rem',
            fontSize: '0.74rem',
            color: 'var(--text-primary)',
          }}
        >
          {formatConfidenceLabel(step.confidence)}
        </span>
        {safety?.manualOnly && (
          <span
            style={{
              border: '1px solid rgba(255,99,132,0.3)',
              background: 'rgba(255,99,132,0.1)',
              borderRadius: '999px',
              padding: '0.28rem 0.58rem',
              fontSize: '0.74rem',
              color: 'var(--danger)',
            }}
          >
            ทำด้วยมือเท่านั้น · ไม่รันอัตโนมัติ
          </span>
        )}
        {step.provenance?.userEdited && (
          <span
            style={{
              border: '1px solid rgba(87,210,162,0.24)',
              background: 'rgba(87,210,162,0.08)',
              borderRadius: '999px',
              padding: '0.28rem 0.58rem',
              fontSize: '0.74rem',
              color: 'var(--text-primary)',
            }}
          >
            Edited by you
          </span>
        )}
      </div>
      {evidence.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {evidence.map((item) => (
            <button
              key={`${item.sourceId}-${item.label}`}
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
              style={{
                background: selectedSourceId === item.sourceId ? 'rgba(94,106,210,0.16)' : 'rgba(255,255,255,0.04)',
                border: selectedSourceId === item.sourceId ? '1px solid rgba(94,106,210,0.35)' : '1px solid rgba(255,255,255,0.09)',
                color: selectedSourceId === item.sourceId ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.34rem 0.58rem',
                fontSize: '0.76rem',
              }}
              title={item.excerpt}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {(selectedEvidence || generatedLabel || confirmedLabel || step.provenance?.overrideNote) && (
        <details className="supporting-panel" style={{ padding: '0.85rem' }}>
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              fontWeight: 600,
              listStyle: 'none',
            }}
          >
            เหตุผล / ประวัติ
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.7rem' }}>
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
      )}
    </div>
  );
}

export function OneAction({
  data,
  action,
  whyThisNow,
  constraints,
  plan,
  negotiationLoading = false,
  onAccept,
  onReject,
  onNotLikeThis,
  onMarkAdjusted,
  onNegotiate,
  focusMode = true,
}: Props) {
  useTrackMountEvent('action_shown');
  const [showTunePanel, setShowTunePanel] = useState(false);
  const [replyDraftValue, setReplyDraftValue] = useState(action?.replyDraft || data.reply_draft || '');
  const replyDraftRef = useRef<HTMLTextAreaElement | null>(null);

  const situationSummary = action?.situationSummary || data.situation_summary;
  const replyDraft =
    action?.workflowType === 'client_resume'
      ? ''
      : action?.replyDraft || data.reply_draft || '';
  const workflowType = action?.workflowType || data.workflow_type;
  const selectedTimeBudget = constraints?.timeBudgetMin;
  const selectedEnergy = constraints?.energyLevel;
  const hasConstraintSelection = typeof selectedTimeBudget === 'number' || typeof selectedEnergy === 'string';
  const primaryActionLabel = 'ใช้ก้าวนี้';
  const secondaryActionLabel = 'ลองอีกทาง';
  const heroReason =
    whyThisNow
    || situationSummary
    || (data.task_shape?.deliverableType === 'proposal'
      ? 'ก้าวนี้ช่วยล็อก requirement กับ scope ก่อน แล้วค่อยแตกเป็นขั้นตอนเล็ก ๆ ต่อได้'
      : data.task_shape?.deliverableType === 'reply' && data.task_shape?.immediateNeed === 'send_reply_now' && data.task_shape?.workContext.includes('นัด demo')
        ? 'ก้าวนี้พาไปตอบลูกค้าและจัดลำดับคุย demo/pilot ก่อน เพื่อให้งานกลับเข้าร่องเร็วที่สุด'
        : 'ก้าวนี้ใกล้การลงมือที่สุด และแตกเป็นขั้นตอนเล็ก ๆ ต่อได้ทันที');
  const [showReplyDraft, setShowReplyDraft] = useState(false);
  const primaryStep = plan?.steps[0];

  useEffect(() => {
    setReplyDraftValue(replyDraft);
  }, [replyDraft]);

  useEffect(() => {
    setShowTunePanel(false);
  }, [data.recommended_action.title]);

  useEffect(() => {
    setShowReplyDraft(false);
  }, [replyDraft]);

  useEffect(() => {
    if (negotiationLoading || hasConstraintSelection) {
      setShowTunePanel(true);
    }
  }, [hasConstraintSelection, negotiationLoading]);

  useEffect(() => {
    trackEvent('step_draft_shown', {
      step_id: primaryStep?.id,
      source_ids: primaryStep?.evidence?.map((item) => item.sourceId),
      confidence_level: primaryStep?.confidence?.level,
      confidence_score: primaryStep?.confidence?.score,
      destructive_risk: primaryStep?.safety?.risk,
      retrieval_enabled: hasRetrievedEvidence(primaryStep),
    });
    if (primaryStep?.safety?.manualOnly) {
      trackEvent('destructive_step_warning_shown', {
        step_id: primaryStep.id,
        destructive_risk: primaryStep.safety.risk,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.recommended_action.title, primaryStep?.id]);

  const handleReject = () => {
    trackEvent('action_rejected');
    onReject();
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(replyDraftValue);
      } else if (replyDraftRef.current) {
        replyDraftRef.current.focus();
        replyDraftRef.current.select();
        document.execCommand('copy');
      }
      trackEvent('reply_draft_copied');
    } catch {
      // no-op: copy failure should not block the flow
    }
  };

  const markAdjustmentIntent = () => {
    trackEvent('one_action_adjustment_clicked');
    onMarkAdjusted();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingTop: '0.25rem', alignItems: 'stretch', textAlign: 'left' }}>
      {data.requires_clarification && (
        <div style={{ padding: '1rem', background: 'var(--accent)', borderRadius: 'var(--radius)', width: '100%' }}>
          <strong>ขอข้อมูลเพิ่ม:</strong> {data.clarification_nudge}
        </div>
      )}

      <div className="action-hero-card">
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          เริ่มจาก
        </p>
        <h1 className="action-hero-title">{data.recommended_action.title}</h1>
        <p className="action-hero-rationale">{data.recommended_action.rationale}</p>
      </div>

      <StepEvidence step={primaryStep} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%', maxWidth: '42rem' }}>
        <button className="primary" onClick={onAccept}>{primaryActionLabel}</button>
        {onNotLikeThis && (
          <button
            onClick={onNotLikeThis}
            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ไม่ใช่แบบนี้
          </button>
        )}
        <button
          onClick={handleReject}
          style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {secondaryActionLabel}
        </button>
      </div>

      <details className="supporting-panel" style={{ width: '100%', maxWidth: '42rem' }} open={!focusMode}>
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
          ทำไมก้าวนี้มาก่อน
        </summary>
        <p className="supporting-summary" style={{ marginTop: '0.85rem', lineHeight: 1.6 }}>{heroReason}</p>
      </details>

      <details
        className="supporting-panel expanded"
        open={focusMode ? showTunePanel || negotiationLoading || hasConstraintSelection : true}
        style={{ width: '100%', maxWidth: '42rem' }}
        onToggle={(event) => setShowTunePanel(event.currentTarget.open)}
      >
        <summary
          style={{
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            fontWeight: 600,
            listStyle: 'none',
            textAlign: 'left',
          }}
          onClick={markAdjustmentIntent}
        >
          ปรับก้าวนี้เพิ่มเติม
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.85rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <p className="supporting-label" style={{ marginBottom: 0 }}>ข้อจำกัดตอนนี้</p>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {[
                { label: '10 นาที', value: 10 },
                { label: '25 นาที', value: 25 },
                { label: '45+ นาที', value: 45 },
              ].map((item) => {
                const active = selectedTimeBudget === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => {
                      markAdjustmentIntent();
                      onNegotiate({ mode: 'default', constraintPatch: { timeBudgetMin: item.value } });
                    }}
                    disabled={negotiationLoading}
                    style={{
                      background: active ? 'rgba(94, 106, 210, 0.2)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid rgba(94,106,210,0.38)' : '1px solid rgba(255,255,255,0.08)',
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {[
                { label: 'พลังงานต่ำ', value: 'low' as const },
                { label: 'พอไหว', value: 'medium' as const },
                { label: 'พร้อมลุย', value: 'high' as const },
              ].map((item) => {
                const active = selectedEnergy === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => {
                      markAdjustmentIntent();
                      onNegotiate({ mode: 'default', constraintPatch: { energyLevel: item.value } });
                    }}
                    disabled={negotiationLoading}
                    style={{
                      background: active ? 'rgba(94, 106, 210, 0.2)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid rgba(94,106,210,0.38)' : '1px solid rgba(255,255,255,0.08)',
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <button onClick={() => {
              markAdjustmentIntent();
              onNegotiate({ mode: 'smaller' });
            }} disabled={negotiationLoading}>เล็กลง</button>
            <button onClick={() => {
              markAdjustmentIntent();
              onNegotiate({ mode: 'faster' });
            }} disabled={negotiationLoading}>เร็วขึ้น</button>
            <button onClick={() => {
              markAdjustmentIntent();
              onNegotiate({ mode: 'safer' });
            }} disabled={negotiationLoading}>ปลอดภัยขึ้น</button>
            {workflowType === 'client_response' ? (
              <button onClick={() => {
                markAdjustmentIntent();
                onNegotiate({ mode: 'reply_first' });
              }} disabled={negotiationLoading}>ตอบลูกค้าก่อน</button>
            ) : (
              <button onClick={() => {
                markAdjustmentIntent();
                onNegotiate({ mode: 'resume_first' });
              }} disabled={negotiationLoading}>เริ่มงานก่อน</button>
            )}
          </div>
          {negotiationLoading && (
            <p aria-live="polite" className="supporting-summary" style={{ color: 'var(--text-secondary)', margin: 0 }}>
              MIND กำลังปรับก้าวนี้ให้เข้ากับเวลา พลังงาน และบริบทของงานนี้…
            </p>
          )}
        </div>
      </details>

      {situationSummary && situationSummary !== heroReason && (
        <details className="supporting-panel expanded" style={{ width: '100%', maxWidth: '42rem' }}>
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
            ดูสรุปสถานการณ์เพิ่มเติม
          </summary>
          <p className="supporting-summary" style={{ marginTop: '0.85rem' }}>{situationSummary}</p>
        </details>
      )}

      {workflowType === 'client_response' && replyDraft && (
        <details className="supporting-panel expanded" style={{ width: '100%', maxWidth: '42rem' }} open={showReplyDraft}>
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.88rem',
              fontWeight: 600,
              listStyle: 'none',
              textAlign: 'left',
            }}
            onClick={() => setShowReplyDraft((value) => !value)}
          >
            ดูร่างตอบลูกค้าเพิ่มเติม
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.85rem' }}>
            {!showReplyDraft && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  maxHeight: '8.8rem',
                  overflow: 'hidden',
                  position: 'relative',
                  color: 'rgba(255,255,255,0.78)',
                }}
              >
                {replyDraftValue}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '3rem',
                    background: 'linear-gradient(180deg, rgba(18,18,18,0) 0%, rgba(18,18,18,0.92) 100%)',
                  }}
                />
              </div>
            )}
            {showReplyDraft && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-secondary)',
                      padding: '0.45rem 0.7rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    คัดลอก ↗
                  </button>
                </div>
                <textarea
                  id="reply-draft-editor"
                  name="replyDraftEditor"
                  ref={replyDraftRef}
                  value={replyDraftValue}
                  onChange={(event) => setReplyDraftValue(event.target.value)}
                  readOnly={false}
                  className="reply-draft-textarea"
                  style={{ minHeight: '180px' }}
                />
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
