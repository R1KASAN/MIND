"use client";

import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';
import type { CurrentPlanStep } from '@/lib/store/idb';
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
  onBackToSteps: () => void;
  onStartNew: () => void;
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
  onBackToSteps,
  onStartNew,
}: Props) {
  useTrackMountEvent('scaffold_started');
  const visibleSteps = steps.length > 0
    ? steps
    : action.micro_steps.map((step, index) => ({ id: `step-${index + 1}`, text: step }));
  const activeStepIndex = Math.min(currentStepIndex, Math.max(visibleSteps.length - 1, 0));

  if (isCompletion) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingTop: '2rem' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingTop: '2rem' }}>
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
