"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import type { AiRescueResponse } from '@/lib/ai/operations';
import {
  SCAFFOLD_REFINE_LOADING_COPY,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';

interface Props {
  loading?: boolean;
  rescueState?: AiRescueResponse | null;
  refineLoading?: boolean;
  refineFeedback?: ScaffoldRefineFeedback | null;
  onMakeSmaller: () => void;
  onWalkAway: () => void;
}

// T019: Two-choice Rescue: "Make it smaller" or "Walk away and come back" (spec §6)
export function Rescue({
  loading = false,
  rescueState,
  refineLoading = false,
  refineFeedback,
  onMakeSmaller,
  onWalkAway,
}: Props) {
  useTrackMountEvent('rescue_triggered');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '2rem' }}>
      <h2>ชะงักได้ ไม่เป็นไร</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        แค่ขยับต่อได้ก็พอ ตอนนี้อยากทำแบบไหนดี
      </p>

      {loading && (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius)',
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text-secondary)',
        }}>
          MIND กำลังดูให้อยู่ว่าติดเพราะอะไร และควรช่วยคุณยังไงต่อ
        </div>
      )}

      {!loading && rescueState && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{
            padding: '1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
              MIND มองว่าติดตรงนี้
            </p>
            <p style={{ margin: 0 }}>{rescueState.diagnosis.explanation}</p>
          </div>

          <div style={{
            padding: '1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(94, 106, 210, 0.12)',
            border: '1px solid rgba(94, 106, 210, 0.3)',
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.45rem' }}>
              ทางออกที่แนะนำตอนนี้
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {rescueState.rescuePlan.steps.map((step) => (
                <div key={step}>{step}</div>
              ))}
            </div>
          </div>

          {rescueState.suggestedMessage && (
            <div style={{
              padding: '1rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                ข้อความที่ใช้ต่อได้
              </p>
              <p style={{ margin: 0 }}>{rescueState.suggestedMessage}</p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
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
            {refineFeedback.message}
          </div>
        )}
        <button className="primary" disabled={refineLoading} onClick={onMakeSmaller}>
          ย่อยให้เล็กลงอีก
        </button>
        <button disabled={refineLoading} onClick={onWalkAway}>
          พักก่อน แล้วค่อยกลับมา
        </button>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          ถ้ารอบนี้ MIND ยังช่วยวินิจฉัยไม่ได้ งานนี้ยังถูกเก็บไว้ครบ คุณลองใหม่ทีหลังได้
        </p>
      </div>
    </div>
  );
}
