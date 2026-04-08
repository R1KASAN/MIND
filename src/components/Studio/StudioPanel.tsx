"use client";

import { useEffect, useRef, useState } from 'react';
import type { StudioIntent, StudioIntentId, StudioSnapshot } from '@/lib/orchestrator/studio';
import { ContextSnapshot } from './ContextSnapshot';

interface Props {
  snapshot: StudioSnapshot | null;
  intents: StudioIntent[];
  loadingIntentId?: StudioIntentId | null;
  onIntent: (intent: StudioIntent) => void | Promise<void>;
  onEditContext?: () => void;
}

export function StudioPanel({
  snapshot,
  intents,
  loadingIntentId = null,
  onIntent,
  onEditContext,
}: Props) {
  const [showAllMobileIntents, setShowAllMobileIntents] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [snapshotEmphasized, setSnapshotEmphasized] = useState(false);
  const primaryIntents = intents.slice(0, 2);
  const extraIntents = intents.slice(2);
  const snapshotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!snapshotEmphasized) return;
    const timeoutId = window.setTimeout(() => setSnapshotEmphasized(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [snapshotEmphasized]);

  const handleIntentClick = async (intent: StudioIntent) => {
    if (!intent.active) {
      setBlockedMessage(intent.blockedReason ?? intent.description);
      await onIntent(intent);
      return;
    }

    setBlockedMessage(null);
    await onIntent(intent);

    if (intent.id === 'review_status' && snapshot) {
      snapshotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setSnapshotEmphasized(true);
    }
  };

  const renderIntentButton = (intent: StudioIntent) => {
    const isLoading = loadingIntentId === intent.id;
    return (
      <button
        key={intent.id}
        type="button"
        aria-disabled={!intent.active}
        onClick={() => void handleIntentClick(intent)}
        className={`studio-intent-button ${intent.active ? 'is-active' : 'is-blocked'}`}
      >
        <span style={{ fontWeight: 600, textAlign: 'left' }}>
          {isLoading ? 'กำลังใช้บริบทเดิม…' : intent.label}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', textAlign: 'left', lineHeight: 1.5 }}>
          {intent.active ? intent.description : intent.blockedReason ?? intent.description}
        </span>
      </button>
    );
  };

  return (
    <aside className="studio-panel">
      <div className="studio-card" style={{ gap: '0.8rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <p className="studio-eyebrow">Studio</p>
          <h2 style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>
            {snapshot
              ? 'ใช้บริบทของงานนี้ต่อได้เลย โดยไม่ต้องพิมพ์ใหม่'
              : 'เริ่มจากข้อความก่อน แล้วค่อยใช้ Studio ต่อ'}
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {snapshot
            ? 'ถ้ากลับมาแล้วอยากดูสถานะ หาทางเริ่ม หรือขอให้ MIND พากลับเข้าบริบทเดิม กดจากตรงนี้ได้เลย'
            : 'พิมพ์หรือวางสภาพงานก่อน เมื่อ MIND มีบริบทของงานนี้แล้ว Studio จะช่วยดูสถานะ หาทางเริ่ม และพากลับเข้าบริบทเดิมให้'}
        </p>
      </div>

      <div className="studio-mobile-intents">
        {snapshot && (
          <div ref={snapshotRef}>
            <ContextSnapshot
              snapshot={snapshot}
              surface="dump_studio"
              onEditContext={onEditContext}
              emphasized={snapshotEmphasized}
            />
          </div>
        )}
        <div className="studio-mobile-chip-row">
          {primaryIntents.map((intent) => renderIntentButton(intent))}
        </div>
        {blockedMessage && (
          <p className="studio-inline-note">{blockedMessage}</p>
        )}
        {extraIntents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => setShowAllMobileIntents((value) => !value)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
                padding: '0.65rem 0.85rem',
                fontSize: '0.84rem',
              }}
            >
              {showAllMobileIntents ? 'ซ่อนตัวช่วยเพิ่ม' : 'ดูตัวช่วยเพิ่ม'}
            </button>
            {showAllMobileIntents && (
              <div className="studio-mobile-more">
                {extraIntents.map((intent) => renderIntentButton(intent))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="studio-desktop-stack">
        <div className="studio-intent-list">
          {intents.map((intent) => renderIntentButton(intent))}
        </div>
        {blockedMessage && (
          <p className="studio-inline-note">{blockedMessage}</p>
        )}
        {snapshot ? (
          <div ref={snapshotRef}>
            <ContextSnapshot
              snapshot={snapshot}
              surface="dump_studio"
              onEditContext={onEditContext}
              emphasized={snapshotEmphasized}
            />
          </div>
        ) : (
          <section className="studio-card" style={{ gap: '0.6rem' }}>
            <p className="studio-eyebrow">บริบทที่ MIND ใช้อยู่</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              ยังไม่มี snapshot ของงานนี้ เพราะ MIND ยังไม่มีข้อความหรือบริบทพอให้สรุป
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
