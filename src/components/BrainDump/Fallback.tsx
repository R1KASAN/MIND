"use client";

import { useEffect, useState } from 'react';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import type { AiFailureReason } from '@/lib/store/idb';

interface Props {
  onRescue: (action: string) => void;
  onRetry: () => Promise<void>;
  onManualContinue: () => void;
  lastFailureReason?: AiFailureReason;
  suggestedActions?: string[];
  retryable: boolean;
  focusMode?: boolean;
}

const reasonLabels: Record<AiFailureReason, string> = {
  service_down: 'Ollama ไม่ได้เปิดอยู่ในขณะนี้',
  model_missing: 'ยังไม่ได้ติดตั้งโมเดล',
  runtime_boot_failed: 'โมเดลโหลดไม่สำเร็จ',
  metal_init_failed: 'GPU ไม่พร้อม — ลองเปิด Ollama ใหม่',
  request_timeout: 'ใช้เวลานานเกินไป — Ollama อาจยังกำลังโหลด',
  unknown: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ',
};

export function ManualFallback({
  onRescue,
  onRetry,
  onManualContinue,
  lastFailureReason = 'unknown',
  suggestedActions = [],
  retryable,
  focusMode = true,
}: Props) {
  useTrackMountEvent('manual_fallback_triggered', { reason: lastFailureReason });
  const [manualStep, setManualStep] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [showManualEditor, setShowManualEditor] = useState(false);

  useEffect(() => {
    trackEvent('recovery_retry_shown');
  }, []);

  const handleRetry = async () => {
    if (!retryable || isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    trackEvent('retry_clicked');

    try {
      await onRetry();
      trackEvent('retry_success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ลองใหม่ไม่สำเร็จ';
      setRetryError(msg);
      trackEvent('retry_failed', { reason: msg });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleManualChoice = () => {
    setShowManualEditor(true);
    onManualContinue();
    trackEvent('recovery_manual_chosen');
  };

  const canRetry = retryable && !isRetrying;
  const failureLabel = reasonLabels[lastFailureReason];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '2rem' }}>
      <h2>ไปต่อกันเถอะ</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        AI ในเครื่องยังไม่พร้อมสำหรับรอบนี้ แต่ข้อความเดิมของคุณยังอยู่ครบ และลองใหม่ได้ทันที
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '-0.25rem' }}>
        {failureLabel}
      </p>

      <button
        className="primary"
        onClick={handleRetry}
        disabled={!canRetry}
        style={{ width: '100%' }}
      >
        {isRetrying ? 'กำลังลองให้ AI ใหม่…' : 'ลองให้ AI อีกครั้ง'}
      </button>

      {retryError && (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{retryError}</p>
      )}

      {suggestedActions.length > 0 && (
        <details style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }} open={!focusMode}>
          <summary style={{ cursor: 'pointer' }}>วิธีแก้ที่แนะนำ</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
            {suggestedActions.map((action) => (
              <code
                key={action}
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem 0.9rem',
                  color: 'var(--text-primary)',
                }}
              >
                {action}
              </code>
            ))}
          </div>
        </details>
      )}

      <hr style={{ borderColor: 'rgba(255,255,255,0.08)', width: '100%' }} />

      {!showManualEditor ? (
        <button
          onClick={handleManualChoice}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            width: '100%',
          }}
        >
          ข้าม AI สำหรับรอบนี้
        </button>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            โหมดนี้คือการข้าม AI สำหรับรอบนี้ แล้วไปต่อด้วยก้าวที่คุณเลือกเอง
          </p>
          <textarea
            id="manual-fallback-step"
            name="manualFallbackStep"
            value={manualStep}
            onChange={(e) => setManualStep(e.target.value)}
            placeholder="เขียนก้าวเล็กที่สุดที่คุณทำได้ทันทีตอนนี้"
            style={{ minHeight: '160px' }}
            autoFocus
          />

          <button
            onClick={() => onRescue(manualStep.trim())}
            disabled={!manualStep.trim() || isRetrying}
          >
            ใช้ก้าวนี้
          </button>
        </>
      )}
    </div>
  );
}
