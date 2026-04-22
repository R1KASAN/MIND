"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import type { ReentryBrief } from '@/lib/store/idb';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';
import { ContextSnapshot } from '@/components/Studio/ContextSnapshot';

interface Props {
  actionTitle: string;
  reentryBrief?: ReentryBrief;
  loading?: boolean;
  onUseSuggested?: () => void;
  onContinue: () => void;
  onStartFresh: () => void;
  snapshot?: StudioSnapshot | null;
  onEditContext?: () => void;
  focusMode?: boolean;
}

export function BounceBack({
  actionTitle,
  reentryBrief,
  loading = false,
  onUseSuggested,
  onContinue,
  onStartFresh,
  snapshot,
  onEditContext,
  focusMode = true,
}: Props) {
  useTrackMountEvent('bounce_back_opened', { actionTitle });
  useTrackMountEvent('reentry_brief_shown', { has_top_action: Boolean(reentryBrief?.topActions[0]) }, Boolean(reentryBrief));
  useTrackMountEvent('catch_up_mode_opened', { surface: 'bounce_back' }, Boolean(reentryBrief));
  const primaryTopAction = reentryBrief?.topActions[0];
  const secondaryTopActions = reentryBrief?.topActions.slice(1) ?? [];
  const hasSuggestedAction = Boolean(reentryBrief && onUseSuggested);

  return (
    <div className="reentry-hero-shell">
      <div className="reentry-hero-header reentry-hero-header-left">
        <p className="reentry-hero-kicker">กลับเข้าบริบท</p>
        <h2 className="reentry-hero-title">Catch up in 2 minutes</h2>
      </div>
      {reentryBrief ? (
        <>
          <div className="reentry-hero-support">
            <p className="reentry-hero-support-title">What is this work about?</p>
            <p className="reentry-hero-card-copy">{reentryBrief.summary}</p>
            <p className="reentry-hero-support-title">Where did I leave off last time?</p>
            <p className="reentry-hero-card-copy">
              {primaryTopAction ? primaryTopAction.rationale : 'MIND เก็บ save point ล่าสุดไว้ในห้องนี้แล้ว'}
            </p>
            <p className="reentry-hero-support-title">What is a safe next step now?</p>
            <p className="reentry-hero-card-copy">
              {primaryTopAction ? primaryTopAction.title : actionTitle}
            </p>
          </div>
          <p className="reentry-hero-summary">{reentryBrief.summary}</p>
          {primaryTopAction && (
            <div className="reentry-hero-card">
              <p className="reentry-hero-card-label">ก้าวที่ควรเริ่ม</p>
              <strong className="reentry-hero-card-title">{primaryTopAction.title}</strong>
              <p className="reentry-hero-card-copy">{primaryTopAction.rationale}</p>
            </div>
          )}
          <div className="reentry-hero-actions">
            {hasSuggestedAction ? (
              <button className="primary" onClick={onUseSuggested}>
                Okay, continue here
              </button>
            ) : (
              <button className="primary" onClick={onContinue}>Okay, continue here</button>
            )}
            <button
              className="reentry-hero-secondary"
              onClick={hasSuggestedAction ? onContinue : onStartFresh}
            >
              {hasSuggestedAction ? 'กลับไปจุดเดิม' : 'เริ่มใหม่'}
            </button>
          </div>
          {(snapshot || reentryBrief.ignoredNoise.length > 0 || secondaryTopActions.length > 0 || hasSuggestedAction) && (
            <details className="reentry-hero-more" open={!focusMode}>
              <summary>ดูเพิ่ม</summary>
              <div className="reentry-hero-more-body">
                {snapshot && (
                  <ContextSnapshot
                    snapshot={snapshot}
                    surface="bounce_back"
                    onEditContext={onEditContext}
                    powerMode={!focusMode}
                  />
                )}
                {reentryBrief.ignoredNoise.length > 0 && (
                  <div className="reentry-hero-support">
                    <p className="reentry-hero-support-title">วันนี้ยังไม่ต้องสนใจ</p>
                    <ul className="reentry-hero-support-list">
                      {reentryBrief.ignoredNoise.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {secondaryTopActions.length > 0 && (
                  <div className="reentry-hero-alt-list">
                    {secondaryTopActions.map((item, index) => (
                      <div key={`${item.roomId}-${item.title}-${index}`} className="reentry-hero-alt-card">
                        <div className="reentry-hero-alt-head">
                          <strong>{item.title}</strong>
                          <span>
                            {item.resumeTarget === 'SCAFFOLD' ? 'กลับไปทำต่อ' : item.resumeTarget === 'ONE_ACTION' ? 'กลับไปเลือกก้าว' : 'เริ่มใหม่'}
                          </span>
                        </div>
                        <p>{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={onStartFresh}>เริ่มใหม่</button>
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="reentry-hero-support">
          <p className="reentry-hero-summary" style={{ maxWidth: 'none' }}>
            เมื่อกี้คุณกำลังทำ <strong>{actionTitle}</strong> อยู่ MIND จะช่วยพากลับเข้าบริบทเดิมให้เร็วที่สุด
          </p>
          <div className="reentry-hero-alt-card">
            <p className="reentry-hero-support-title">เริ่มจากพิมพ์งานได้เลย</p>
            <p className="reentry-hero-card-copy">
              ไม่มีไฟล์ก็เริ่มได้ ถ้าจะเริ่มใหม่ตอนนี้ พิมพ์สภาพงานก่อน แล้วค่อยแนบไฟล์เป็น context เสริมเมื่อจำเป็น
            </p>
          </div>
        </div>
      )}

      {loading && (
        <p className="reentry-hero-loading">
          MIND กำลังสรุปว่าควรกลับเข้างานนี้แบบไหนดี
        </p>
      )}
      {!reentryBrief && (
        <div className="reentry-hero-actions">
          <button className="primary" onClick={onContinue}>กลับไปต่อจากจุดเดิม</button>
          <button className="reentry-hero-secondary" onClick={onStartFresh}>เริ่มใหม่</button>
        </div>
      )}
    </div>
  );
}
