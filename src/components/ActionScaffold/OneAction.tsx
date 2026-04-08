"use client";

import { useEffect, useRef, useState } from 'react';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import type { Action, TaskConstraints } from '@/lib/store/idb';
import type { ActionNegotiationInput } from '@/lib/orchestrator/task-controller';

interface Props {
  data: AiSynthesisResponse;
  action?: Action | null;
  whyThisNow?: string;
  constraints?: TaskConstraints;
  negotiationLoading?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMarkAdjusted: () => void;
  onNegotiate: (input: ActionNegotiationInput) => void;
}

export function OneAction({
  data,
  action,
  whyThisNow,
  constraints,
  negotiationLoading = false,
  onAccept,
  onReject,
  onMarkAdjusted,
  onNegotiate,
}: Props) {
  useTrackMountEvent('action_shown');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [showWhyThisNow, setShowWhyThisNow] = useState(false);
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
  const primaryActionLabel = 'ใช้ก้าวนี้ แล้วแตกเป็นขั้นตอน';
  const secondaryActionLabel = 'ลองอีกทางจากข้อความเดิม';
  const nextStepHelper =
    'ถ้าอันนี้ใกล้ที่สุด กดปุ่มสีม่วงได้เลย MIND จะพาไปแตกเป็นขั้นตอนเล็ก ๆ ต่อทันที';
  const [showReplyDraft, setShowReplyDraft] = useState(false);

  useEffect(() => {
    setSummaryExpanded(false);
    const timeoutId = window.setTimeout(() => {
      setSummaryExpanded(true);
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [situationSummary, data.recommended_action.title]);

  useEffect(() => {
    setReplyDraftValue(replyDraft);
  }, [replyDraft]);

  useEffect(() => {
    setShowWhyThisNow(false);
  }, [whyThisNow, data.recommended_action.title]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem', paddingTop: '3.5rem', alignItems: 'center', textAlign: 'center' }}>
      {data.requires_clarification && (
        <div style={{ padding: '1rem', background: 'var(--accent)', borderRadius: 'var(--radius)', width: '100%' }}>
          <strong>ขอข้อมูลเพิ่ม:</strong> {data.clarification_nudge}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', alignItems: 'center', maxWidth: '38rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          หลังจากอ่านข้อความก้อนนี้
        </p>
        <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
          MIND คิดว่าควรเริ่มจากตรงนี้ก่อน
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {nextStepHelper}
        </p>
      </div>
      {/* HIERARCHY RULE: action card must always render first — do not reorder */}
      <div className="action-hero-card">
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          เริ่มจาก
        </p>
        <h1 className="action-hero-title">{data.recommended_action.title}</h1>
        <p className="action-hero-rationale">{data.recommended_action.rationale}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
        <button className="primary" onClick={onAccept}>{primaryActionLabel}</button>
        <button onClick={handleReject}>{secondaryActionLabel}</button>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
          ยังไม่ต้องแตะตัวเลือกด้านล่างก็ได้ แค่เลือกว่าจะใช้ก้าวนี้ต่อหรือดูอีกทางก่อน
        </p>
      </div>

      <section className="supporting-panel expanded" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
            <p className="supporting-label">อยากปรับข้อเสนอนี้ให้เข้ากับตอนนี้ไหม</p>
            <p className="supporting-summary" style={{ margin: 0 }}>
              ยังไม่ต้องใช้ส่วนนี้ก็ได้ ถ้าก้าวนี้ใกล้เคียงอยู่แล้ว
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
            <button
              aria-expanded={showTunePanel}
              onClick={() => {
                markAdjustmentIntent();
                setShowTunePanel((value) => !value);
              }}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
            >
              {showTunePanel ? 'ซ่อนตัวเลือกปรับก้าวนี้' : 'ปรับก้าวนี้ให้เข้ากับตอนนี้'}
            </button>
            {whyThisNow && (
              <button
                onClick={() => setShowWhyThisNow((value) => !value)}
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
              >
                {showWhyThisNow ? 'ซ่อนเหตุผล' : 'ทำไม MIND เลือกอันนี้ก่อน'}
              </button>
            )}
          </div>
        </div>
        {showTunePanel && (
          <>
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
          </>
        )}
        {negotiationLoading && (
          <p aria-live="polite" className="supporting-summary" style={{ color: 'var(--text-secondary)' }}>
            MIND กำลังปรับก้าวนี้ให้เข้ากับเวลา พลังงาน และบริบทของงานนี้…
          </p>
        )}
      </section>

      {whyThisNow && showWhyThisNow && (
        <section className="supporting-panel expanded">
          <p className="supporting-label">เหตุผลที่ MIND เลือกอันนี้ก่อน</p>
          <p className="supporting-summary">{whyThisNow}</p>
        </section>
      )}

      {situationSummary && (
        <section className={`supporting-panel ${summaryExpanded ? 'expanded' : 'collapsed'}`}>
          <p className="supporting-label">MIND อ่านว่าสถานการณ์ตอนนี้คือ</p>
          <p className="supporting-summary">{situationSummary}</p>
        </section>
      )}

      {workflowType === 'client_response' && replyDraft && (
        <section className="supporting-panel expanded">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <p className="supporting-label">ถ้าจะตอบลูกค้าตอนนี้ ลองใช้ร่างนี้ได้</p>
              <p className="supporting-summary" style={{ margin: 0 }}>
                ตอนนี้เราโชว์แค่ preview ก่อน เพื่อให้ก้าวแรกยังเด่นที่สุดบนหน้าจอ
              </p>
            </div>
            <button
              onClick={() => setShowReplyDraft((value) => !value)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
                padding: '0.45rem 0.7rem',
                fontSize: '0.8rem',
              }}
            >
              {showReplyDraft ? 'ซ่อนร่างเต็ม' : 'ดูร่างเต็ม'}
            </button>
          </div>
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
                ref={replyDraftRef}
                value={replyDraftValue}
                onChange={(event) => setReplyDraftValue(event.target.value)}
                readOnly={false}
                className="reply-draft-textarea"
                style={{ minHeight: '180px' }}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
