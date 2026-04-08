"use client";

import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import {
  SCAFFOLD_REFINE_LOADING_COPY,
  type ScaffoldRefineFeedback,
} from '@/lib/orchestrator/scaffold-refine';

interface Props {
  action: AiSynthesisResponse['recommended_action'];
  currentStepIndex: number;
  refineLoading?: boolean;
  refineFeedback?: ScaffoldRefineFeedback | null;
  onRescue: () => void;
  onMakeSmaller: () => void;
  onComplete: () => void;
}

export function Scaffold({
  action,
  currentStepIndex,
  refineLoading = false,
  refineFeedback,
  onRescue,
  onMakeSmaller,
  onComplete,
}: Props) {
  useTrackMountEvent('scaffold_started');
  const activeStepIndex = Math.min(currentStepIndex, Math.max(action.micro_steps.length - 1, 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingTop: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{action.title}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '-0.35rem' }}>
        ตอนนี้อยู่ที่ขั้นตอน {action.micro_steps.length === 0 ? '0' : `${activeStepIndex + 1} / ${action.micro_steps.length}`}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
        {action.micro_steps.map((step, idx) => (
          <div
            key={idx}
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
            <span>{step}</span>
          </div>
        ))}
      </div>

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
            {refineFeedback.message}
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
        <button disabled={refineLoading} onClick={onRescue} style={{ color: 'var(--danger)' }}>ฉันติดอยู่</button>
      </div>
    </div>
  );
}
