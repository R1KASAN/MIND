"use client";

import type { AiRescueResponse } from '@/lib/ai/operations';
import {
  SCAFFOLD_REFINE_LOADING_COPY,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';
import { AIProcessingIndicator } from '@/components/AI/AIProcessingIndicator';

interface Props {
  loading?: boolean;
  rescueState?: AiRescueResponse | null;
  refineLoading?: boolean;
  refineFeedback?: ScaffoldRefineFeedback | null;
  onMakeSmaller: () => void;
  onBackToStep: () => void;
  onBackToInput: () => void;
  onWalkAway: () => void;
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

// T019: Two-choice Rescue: "Make it smaller" or "Walk away and come back" (spec §6)
export function Rescue({
  loading = false,
  rescueState,
  refineLoading = false,
  refineFeedback,
  onMakeSmaller,
  onBackToStep,
  onBackToInput,
  onWalkAway,
  focusMode = true,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.85rem', paddingTop: '1.5rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {!rescueState ? (
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 650 }}>ลองเลือกดูว่า “ติด” เพราะอะไร</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            ถ้าก้าวนี้ยังใช้ได้ ให้ใช้ต่อได้เลย ถ้าใหญ่ไปให้แบ่งย่อย หรือถ้าบริบทไม่ตรงให้กลับไปแก้ข้อมูลเดิม
          </p>
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 650 }}>ผลการวิเคราะห์จุดติดขัด</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            MIND วิเคราะห์และแนะนำทางออกเพื่อให้งานขยับต่อได้ง่ายที่สุด
          </p>
        </div>
      )}

      {loading && (
        <AIProcessingIndicator
          size="panel"
          label="กำลังวินิจฉัยจุดติด"
          detail="MIND กำลังดูให้อยู่ว่าติดเพราะอะไร และควรช่วยคุณยังไงต่อ"
        />
      )}

      {rescueState && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="rescue-card-info">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.45rem' }}>
              MIND มองว่าติดตรงนี้
            </p>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{rescueState.diagnosis.explanation}</p>
          </div>

          <div className="rescue-card-recommended">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.45rem' }}>
              ทางออกที่แนะนำตอนนี้
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', lineHeight: 1.6 }}>
              {rescueState.rescuePlan.steps.map((step) => (
                <div key={step}>{step}</div>
              ))}
            </div>
          </div>

          {rescueState.suggestedMessage && (
            focusMode ? (
              <details style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, listStyle: 'none' }}>
                  ข้อความที่ใช้ต่อได้
                </summary>
                <p style={{ margin: '0.6rem 0 0', lineHeight: 1.6 }}>{rescueState.suggestedMessage}</p>
              </details>
            ) : (
              <div style={{
                padding: '1.1rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.45rem' }}>
                  ข้อความที่ใช้ต่อได้
                </p>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{rescueState.suggestedMessage}</p>
              </div>
            )
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
        {refineLoading && (
          <AIProcessingIndicator label="กำลังย่อยให้เล็กลง" detail={SCAFFOLD_REFINE_LOADING_COPY} />
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
        {rescueState ? (
          <>
            <button className="primary" disabled={refineLoading} onClick={onMakeSmaller}>
              แบ่งก้าวนี้ให้เล็กลง
            </button>
            <button disabled={refineLoading} onClick={onBackToStep}>
              ใช้ก้าวนี้ต่อ
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={refineLoading} onClick={onBackToStep}>
              ใช้ก้าวนี้ต่อ
            </button>
            <button disabled={refineLoading} onClick={onMakeSmaller}>
              แบ่งก้าวนี้ให้เล็กลง
            </button>
          </>
        )}
        <button disabled={refineLoading} onClick={onBackToInput}>
          กลับไปแก้บริบทให้ตรงเคส
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            marginTop: '0.45rem',
            paddingTop: '0.8rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            ตัวเลือกอื่น
          </p>
          <button disabled={refineLoading} onClick={onWalkAway}>
            พักงานนี้ไว้ก่อน เดี๋ยวกลับมาทำต่อ
          </button>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
            ใช้เมื่อเคสถูกแล้ว แต่ตอนนี้ยังไม่พร้อมทำต่อ งานนี้จะถูกเก็บไว้ให้กลับมาต่อได้
          </p>
        </div>
      </div>
    </div>
  );
}
