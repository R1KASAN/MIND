"use client";

import { useEffect, useRef, useState } from 'react';
import type { StudioIntent, StudioIntentId, StudioSnapshot } from '@/lib/orchestrator/studio';
import { ContextSnapshot } from './ContextSnapshot';

type StudioMode = 'dump' | 'action' | 'scaffold' | 'rescue' | 'reentry';

interface Props {
  snapshot: StudioSnapshot | null;
  intents: StudioIntent[];
  loadingIntentId?: StudioIntentId | null;
  onIntent: (intent: StudioIntent) => void | Promise<void>;
  onEditContext?: () => void;
  mode?: StudioMode;
  isCompactViewport?: boolean;
}

const PANEL_COPY: Record<StudioMode, { title: string; detail: string }> = {
  dump: {
    title: 'ดูบริบทเดิมแล้วค่อยไปต่อ',
    detail: 'ดูจุดล่าสุดก่อน แล้วค่อยเลือกตัวช่วย',
  },
  action: {
    title: 'ช่วยก้าวนี้',
    detail: 'ดูเหตุผลสั้น ๆ หรือปรับทางต่อ',
  },
  scaffold: {
    title: 'ช่วยย่อยงาน',
    detail: 'ย่อยให้เล็กลงหรือเช็กจุดติด',
  },
  rescue: {
    title: 'ช่วยตอนติด',
    detail: 'ดูทางออกสั้น ๆ ก่อนเริ่มใหม่',
  },
  reentry: {
    title: 'กลับเข้าห้องเดิม',
    detail: 'สรุปค้างและทางเริ่มที่สั้นสุด',
  },
};

export function StudioPanel({
  snapshot,
  intents,
  loadingIntentId = null,
  onIntent,
  onEditContext,
  mode = 'dump',
  isCompactViewport = false,
}: Props) {
  const [showAllMobileIntents, setShowAllMobileIntents] = useState(false);
  const [showAllDesktopIntents, setShowAllDesktopIntents] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [snapshotEmphasized, setSnapshotEmphasized] = useState(false);
  const primaryIntents = intents.slice(0, 2);
  const extraIntents = intents.slice(2);
  const snapshotRef = useRef<HTMLDivElement | null>(null);
  const copy = PANEL_COPY[mode];

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
      <div className="studio-panel-intro">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
          <p className="studio-eyebrow">Studio / ตัวช่วย</p>
          <h2 style={{ fontSize: '0.96rem', lineHeight: 1.28 }}>{copy.title}</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.45 }}>
          {copy.detail}
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
              trackView={isCompactViewport}
            />
          </div>
        )}
        <div className="studio-mobile-chip-row">
          {primaryIntents.map((intent) => renderIntentButton(intent))}
        </div>
        {blockedMessage && <p className="studio-inline-note">{blockedMessage}</p>}
        {extraIntents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => setShowAllMobileIntents((value) => !value)}
              className="studio-more-button"
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
        {snapshot ? (
          <div ref={snapshotRef}>
            <ContextSnapshot
              snapshot={snapshot}
              surface="dump_studio"
              onEditContext={onEditContext}
              emphasized={snapshotEmphasized}
              trackView={!isCompactViewport}
            />
          </div>
        ) : (
          <section className="studio-card" style={{ gap: '0.6rem' }}>
            <p className="studio-eyebrow">บริบทที่ MIND ใช้อยู่</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              ยังไม่มีจุดล่าสุดของงานนี้ เพราะ MIND ยังมีบริบทไม่พอให้สรุป
            </p>
          </section>
        )}

        <div className="studio-card" style={{ gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <p className="studio-eyebrow">ทำอะไรต่อได้บ้าง</p>
            {extraIntents.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllDesktopIntents((value) => !value)}
                className="studio-more-button"
              >
                {showAllDesktopIntents ? 'ซ่อนเพิ่ม' : 'ดูเพิ่ม'}
              </button>
            )}
          </div>
          <div className="studio-intent-list">
            {(showAllDesktopIntents ? intents : primaryIntents).map((intent) => renderIntentButton(intent))}
          </div>
          {blockedMessage && <p className="studio-inline-note">{blockedMessage}</p>}
        </div>
      </div>
    </aside>
  );
}
