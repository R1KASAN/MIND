"use client";

import { useEffect, useRef, useState } from 'react';
import type { StudioIntent, StudioIntentId, StudioSnapshot } from '@/lib/orchestrator/studio';
import { AIProcessingIndicator } from '@/components/AI/AIProcessingIndicator';
import { ContextSnapshot } from './ContextSnapshot';

type StudioMode = 'dump' | 'action' | 'scaffold' | 'rescue' | 'reentry';

interface Props {
  snapshot: StudioSnapshot | null;
  intents: StudioIntent[];
  loadingIntentId?: StudioIntentId | null;
  onIntent: (intent: StudioIntent) => void | Promise<void>;
  onEditContext?: () => void;
  onRetryFile?: (fileId: string) => void | Promise<void>;
  onSelectPrimaryFile?: (fileId: string) => void | Promise<void>;
  retryingFileId?: string | null;
  mode?: StudioMode;
  isCompactViewport?: boolean;
  focusMode?: boolean;
}

const PANEL_COPY: Record<StudioMode, { title: string; detail: string }> = {
  dump: {
    title: 'ดูบริบทเดิมแล้วค่อยไปต่อ',
    detail: 'ดูจุดล่าสุดก่อน แล้วค่อยเลือกตัวช่วย',
  },
  action: {
    title: 'บริบทที่ใช้กับก้าวนี้',
    detail: 'ดูที่มาและเหตุผลก่อนปรับทางต่อ',
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
    title: 'บริบทที่ใช้กลับมาต่อ',
    detail: 'ดูสถานะค้างและเหตุผลของทางเริ่ม',
  },
};

export function StudioPanel({
  snapshot,
  intents,
  loadingIntentId = null,
  onIntent,
  onEditContext,
  onRetryFile,
  onSelectPrimaryFile,
  retryingFileId = null,
  mode = 'dump',
  isCompactViewport = false,
  focusMode = true,
}: Props) {
  const [expandMobileIntents, setExpandMobileIntents] = useState(false);
  const [expandDesktopIntents, setExpandDesktopIntents] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [blockedIntentId, setBlockedIntentId] = useState<StudioIntentId | null>(null);
  const [snapshotEmphasized, setSnapshotEmphasized] = useState(false);
  const snapshotRef = useRef<HTMLDivElement | null>(null);
  const copy = PANEL_COPY[mode];
  const prioritizeContextOnMobile = isCompactViewport && (mode === 'action' || mode === 'reentry');
  const primaryIntents = prioritizeContextOnMobile
    ? intents.filter((intent) => intent.id === 'review_status').slice(0, 1)
    : intents.slice(0, 2);
  const primaryIntentIds = new Set(primaryIntents.map((intent) => intent.id));
  const extraIntents = intents.filter((intent) => !primaryIntentIds.has(intent.id));
  const showAllDesktopIntents = !focusMode || expandDesktopIntents;
  const showAllMobileIntents = !focusMode || expandMobileIntents;

  useEffect(() => {
    if (!snapshotEmphasized) return;
    const timeoutId = window.setTimeout(() => setSnapshotEmphasized(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [snapshotEmphasized]);

  const handleIntentClick = async (intent: StudioIntent) => {
    if (!intent.active) {
      setBlockedMessage(intent.blockedReason ?? intent.description);
      setBlockedIntentId(intent.id);
      await onIntent(intent);
      return;
    }

    setBlockedMessage(null);
    setBlockedIntentId(null);
    await onIntent(intent);

    if (intent.id === 'review_status' && snapshot) {
      snapshotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setSnapshotEmphasized(true);
    }
  };

  const renderIntentButton = (intent: StudioIntent) => {
    const isLoading = loadingIntentId === intent.id;
    const showBlockedMessage = !intent.active && blockedIntentId === intent.id && blockedMessage;
    return (
      <div key={intent.id} className="studio-intent-item">
        <button
          type="button"
          data-blocked={!intent.active ? 'true' : undefined}
          onClick={() => void handleIntentClick(intent)}
          className={`studio-intent-button ${intent.active ? 'is-active' : 'is-blocked'}`}
        >
          <span style={{ fontWeight: 600, textAlign: 'left' }}>
            {intent.label}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', textAlign: 'left', lineHeight: 1.5 }}>
            {intent.active ? intent.description : intent.blockedReason ?? intent.description}
          </span>
        </button>
        {isLoading ? (
          <AIProcessingIndicator
            label="กำลังใช้บริบทเดิม"
            detail="MIND กำลังใช้บริบทล่าสุดของห้องนี้"
          />
        ) : null}
        {showBlockedMessage ? <p className="studio-inline-note">{blockedMessage}</p> : null}
      </div>
    );
  };

  return (
    <aside className="studio-panel">
      <div className="studio-panel-intro">
        <div className="studio-panel-intro-copy">
          <p className="studio-eyebrow">บริบทที่ใช้ช่วยคุณ</p>
          <h2 className="studio-panel-title">{copy.title}</h2>
        </div>
        <p className="studio-panel-detail">
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
              onRetryFile={onRetryFile}
              onSelectPrimaryFile={onSelectPrimaryFile}
              retryingFileId={retryingFileId}
              emphasized={snapshotEmphasized}
              trackView={isCompactViewport}
              powerMode={!focusMode}
            />
          </div>
        )}
        <div className="studio-mobile-chip-row">
          {primaryIntents.map((intent) => renderIntentButton(intent))}
        </div>
        {extraIntents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => setExpandMobileIntents((value) => !value)}
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
              onRetryFile={onRetryFile}
              onSelectPrimaryFile={onSelectPrimaryFile}
              retryingFileId={retryingFileId}
              emphasized={snapshotEmphasized}
              trackView={!isCompactViewport}
              powerMode={!focusMode}
            />
          </div>
        ) : (
          <section className="studio-card studio-card-empty" style={{ gap: '0.6rem' }}>
            <p className="studio-eyebrow">บริบทที่ MIND ใช้อยู่</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              ยังไม่มีจุดล่าสุดของงานนี้ เพราะ MIND ยังมีบริบทไม่พอให้สรุป
            </p>
          </section>
        )}

        <div className="studio-card studio-card-actions" style={{ gap: '0.65rem' }}>
          <div className="studio-section-header">
            <div className="studio-section-header-copy">
              <p className="studio-eyebrow">ทำอะไรต่อได้บ้าง</p>
              <p className="studio-section-note">เลือกใช้ทีละอย่างตามจังหวะของงานนี้</p>
            </div>
            {extraIntents.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandDesktopIntents((value) => !value)}
                className="studio-more-button"
              >
                {showAllDesktopIntents ? 'ซ่อนเพิ่ม' : 'ดูเพิ่ม'}
              </button>
            )}
          </div>
          <div className="studio-intent-list">
            {(showAllDesktopIntents ? intents : primaryIntents).map((intent) => renderIntentButton(intent))}
          </div>
        </div>
      </div>
    </aside>
  );
}
