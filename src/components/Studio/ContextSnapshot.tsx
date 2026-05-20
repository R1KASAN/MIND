"use client";

import { useState } from 'react';
import { useTrackMountEvent } from '@/lib/instrumentation';
import type { StudioSnapshot } from '@/lib/orchestrator/studio';

interface Props {
  snapshot: StudioSnapshot;
  surface: 'dump_studio' | 'morning_ritual' | 'bounce_back';
  onEditContext?: () => void;
  emphasized?: boolean;
  trackView?: boolean;
  powerMode?: boolean;
  onRetryFile?: (fileId: string) => void | Promise<void>;
  onSelectPrimaryFile?: (fileId: string) => void | Promise<void>;
  retryingFileId?: string | null;
}

export function ContextSnapshot({
  snapshot,
  surface,
  onEditContext,
  emphasized = false,
  trackView = true,
  powerMode = false,
  onRetryFile,
  onSelectPrimaryFile,
  retryingFileId = null,
}: Props) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const summaryText = snapshot.summary || '';
  const shouldTruncateSummary = summaryText.length > 200;
  const displaySummary = shouldTruncateSummary && !summaryExpanded
    ? `${summaryText.slice(0, 180)}…`
    : summaryText;

  useTrackMountEvent('studio_snapshot_viewed', { surface }, trackView);
  const provenance = snapshot.provenance;
  const detailLabel = provenance ? 'ดูว่าทำไม' : 'ดูเพิ่ม';
  const confidenceLabel =
    provenance?.confidence === 'high'
      ? 'มั่นใจสูง'
      : provenance?.confidence === 'medium'
        ? 'มั่นใจกลาง'
        : 'มั่นใจต่ำ';
  const readyCount = snapshot.readyFiles.length;
  const issueCount = snapshot.fileIssues.length;
  const pendingCount = snapshot.fileIssues.filter((file) => file.status === 'pending').length;
  const failedCount = issueCount - pendingCount;

  return (
    <section
      className={`studio-card ${emphasized ? 'studio-card-emphasis' : ''}`}
      data-studio-snapshot-target
      style={{ gap: '0.85rem' }}
    >
      <div className="studio-snapshot-head">
        <div className="studio-snapshot-copy">
          <p className="studio-eyebrow">บริบทที่ MIND ใช้อยู่</p>
          <h3 className="studio-snapshot-title">{snapshot.title}</h3>
        </div>
        {onEditContext && (
          <button
            type="button"
            onClick={onEditContext}
            className="studio-context-button"
          >
            แก้บริบทนี้
          </button>
        )}
      </div>

      <div className="studio-snapshot-summary-container">
        <p className="studio-snapshot-summary" style={{ margin: 0 }}>
          {displaySummary}
        </p>
        {shouldTruncateSummary && (
          <button
            type="button"
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0.2rem 0',
              fontSize: '0.78rem',
              color: 'var(--accent, #8B8CF6)',
              cursor: 'pointer',
              textDecoration: 'underline',
              display: 'inline-block',
              marginTop: '0.25rem',
            }}
          >
            {summaryExpanded ? 'ย่อสรุป' : 'อ่านสรุปทั้งหมด'}
          </button>
        )}
      </div>

      <div className="studio-snapshot-meta">
        <span className="studio-chip">{snapshot.contextLabel}</span>
        <span className="studio-chip">{snapshot.lastUpdatedLabel}</span>
      </div>

      {snapshot.contextStatus === 'partial' && (
        <div className="studio-context-status-badge studio-context-status-partial" role="status">
          <span>⚠</span>
          <span>มีบางไฟล์อ่านไม่สำเร็จ แต่ห้องยังทำงานต่อได้จากไฟล์หรือข้อความที่พร้อมอยู่</span>
        </div>
      )}

      {snapshot.contextStatus === 'blocked' && (
        <div className="studio-context-status-badge studio-context-status-blocked" role="status">
          <span>⛔</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span>ยังไม่มีบริบทที่พร้อมใช้ — ลอง retry ไฟล์ที่ล้มเหลว หรือเพิ่มข้อความสรุปแทนไฟล์นั้น</span>
            <span style={{ opacity: 0.75, fontSize: '0.8rem' }}>คุณยังสามารถเพิ่มข้อความสรุปเองเพื่อให้ระบบทำงานต่อได้</span>
          </div>
        </div>
      )}

      {snapshot.contextStatus === 'empty' && (
        <div className="studio-context-status-badge studio-context-status-partial" role="status" style={{ opacity: 0.72 }}>
          <span>📋</span>
          <span>เพิ่มข้อความหรือไฟล์เพื่อเริ่มสร้างบริบทของห้อง</span>
        </div>
      )}

      {(readyCount > 0 || issueCount > 0) && (
        <div className="studio-snapshot-status-row">
          {readyCount > 0 && (
            <div className="studio-snapshot-status studio-snapshot-status-ready">
              <span className="studio-snapshot-status-kicker">พร้อมใช้</span>
              <strong>{readyCount} ไฟล์</strong>
              <p>อ่านได้แล้วและดึงเข้าบริบทของงานได้</p>
            </div>
          )}
          {issueCount > 0 && (
            <div className="studio-snapshot-status studio-snapshot-status-failed">
              <span className="studio-snapshot-status-kicker">{failedCount > 0 ? 'อ่านไม่สำเร็จ' : 'กำลังสกัดข้อความ'}</span>
              <strong>{issueCount} ไฟล์</strong>
              <p>{pendingCount > 0 ? 'PDF/รูปภาพกำลังอ่านข้อความอยู่ ห้องยังไปต่อได้ด้วยบริบทที่พร้อมแล้ว' : 'ไฟล์ที่อ่านไม่สำเร็จยัง retry ได้ โดยไม่บล็อกไฟล์อื่น'}</p>
            </div>
          )}
        </div>
      )}

      {snapshot.readyFiles.length > 1 && (
        <div className="studio-primary-source-callout">
          <div>
            <p className="studio-eyebrow" style={{ marginBottom: 0 }}>เลือกไฟล์หลัก</p>
            <p className="studio-inline-note" style={{ margin: 0 }}>
              {snapshot.primaryFileName
                ? `ตอนนี้สรุปงานยึด ${snapshot.primaryFileName} เป็นฐาน และใช้ไฟล์อื่นเป็นหลักฐานประกอบ`
                : 'มีหลายไฟล์ที่อ่านได้แล้ว เลือกไฟล์หลักก่อนเพื่อไม่ให้ MIND ยำ context รวมกันเอง'}
            </p>
          </div>
          {snapshot.primaryFileName && (
            <span className="studio-chip studio-chip-success">ไฟล์หลัก: {snapshot.primaryFileName}</span>
          )}
        </div>
      )}

      {snapshot.readyFiles.length > 1 && (
        <details className="studio-file-compare">
          <summary>เปรียบเทียบไฟล์แบบเร็ว</summary>
          <div className="studio-file-compare-grid">
            {snapshot.readyFiles.map((file) => (
              <article key={file.id} className="studio-file-compare-card">
                <div className="studio-file-row-head">
                  <strong>{file.name}</strong>
                  <span className={`studio-chip ${file.isPrimary ? 'studio-chip-success' : ''}`}>
                    {file.isPrimary ? 'ตัวจริงตอนนี้' : 'ไฟล์ประกอบ'}
                  </span>
                </div>
                <p className="studio-inline-note" style={{ margin: 0 }}>
                  {file.extractedText
                    ? file.extractedText.replace(/\s+/g, ' ').slice(0, 180)
                    : 'ไม่มี excerpt ให้แสดง'}
                </p>
              </article>
            ))}
          </div>
          <p className="studio-inline-note" style={{ margin: 0 }}>
            ถ้าเนื้อหาไม่ตรงกัน MIND จะไม่รวมเอง ให้เลือกไฟล์ที่เป็นตัวจริง หรือใช้ไฟล์อื่นเป็น evidence ประกอบ
          </p>
        </details>
      )}

      <div className="studio-primary-summary">
        <p className="studio-eyebrow" style={{ marginBottom: 0 }}>สรุปจากไฟล์หลัก</p>
        {snapshot.primaryFileName ? (
          <>
            <strong>{snapshot.primaryFileName}</strong>
            <p className="studio-inline-note" style={{ margin: 0 }}>
              {snapshot.primaryFileSummary || 'ไฟล์นี้ถูกใช้เป็นฐานของบริบท แต่ยังไม่มี excerpt ที่สั้นพอให้แสดง'}
            </p>
          </>
        ) : snapshot.readyFiles.length > 1 ? (
          <p className="studio-inline-note" style={{ margin: 0 }}>
            เลือกไฟล์หลักเพื่อสร้างสรุปและ next move จากไฟล์นั้นก่อน ไฟล์อื่นจะยังอยู่เป็น evidence/supporting sources
          </p>
        ) : (
          <p className="studio-inline-note" style={{ margin: 0 }}>
            ยังไม่มีไฟล์หลักที่พร้อมใช้ ถ้ามีไฟล์ failed ให้ลองอ่านไฟล์อีกครั้ง หรือเพิ่มข้อความสรุปเองก่อน
          </p>
        )}
      </div>

      {snapshot.readyFiles.length > 0 && (
        <div className="studio-file-group studio-file-group-ready">
          <div className="studio-file-group-head">
            <div className="studio-file-group-copy">
              <p className="studio-eyebrow" style={{ marginBottom: 0 }}>ไฟล์ที่อ่านได้แล้ว</p>
              <p className="studio-inline-note" style={{ margin: 0 }}>
                MIND ดึงข้อความจากไฟล์เหล่านี้มาใช้เป็นบริบทของงานได้แล้ว
              </p>
            </div>
            <span className="studio-chip studio-chip-success">{readyCount} ไฟล์</span>
          </div>
          <div className="studio-file-stack">
            {snapshot.readyFiles.map((file) => {
              const hasRetrievalInfo = snapshot.retrievedSourceIds.length > 0;
              return (
                <article key={file.id} className="studio-file-row studio-file-row-ready">
                  <div className="studio-file-row-main">
                    <div className="studio-file-row-head">
                      <span className="studio-eyebrow" style={{ marginBottom: 0 }}>
                        {file.copy.title}
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`studio-chip ${file.isPrimary ? 'studio-chip-success' : ''}`}>
                          {file.isPrimary ? (file.isAutoPrimary ? 'ไฟล์หลักอัตโนมัติ' : 'ไฟล์หลัก') : file.copy.cta}
                        </span>
                        {hasRetrievalInfo && (
                          <span className={`studio-chip ${file.usedInContext ? 'studio-chip-evidence-used' : 'studio-chip-evidence-unused'}`}>
                            {file.usedInContext ? 'ใช้เป็นบริบทแล้ว' : 'ไม่ได้ใช้ในการสรุปรอบนี้'}
                          </span>
                        )}
                      </div>
                    </div>
                    <strong className="studio-file-row-title">{file.name}</strong>
                    <p className="studio-inline-note" style={{ margin: 0 }}>
                      {file.copy.body}
                    </p>
                  </div>
                  {!file.isPrimary && onSelectPrimaryFile && (
                    <button
                      type="button"
                      className="studio-context-button"
                      onClick={() => void onSelectPrimaryFile(file.id)}
                    >
                      ใช้เป็นไฟล์หลัก
                    </button>
                  )}
                  <p className="studio-file-row-detail">{file.copy.detail}</p>
                  {file.extractedText && (
                    <details className="studio-provenance">
                      <summary
                        style={{
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          listStyle: 'none',
                        }}
                      >
                        ดูข้อความที่อ่านได้
                      </summary>
                      <p className="studio-inline-note" style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>
                        {file.extractedText}
                      </p>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {snapshot.fileIssues.length > 0 && (
        <div className="studio-file-group studio-file-group-failed">
          <div className="studio-file-group-head">
            <div className="studio-file-group-copy">
              <p className="studio-eyebrow" style={{ marginBottom: 0 }}>
                {failedCount > 0 ? 'ไฟล์ที่อ่านไม่สำเร็จ' : 'ไฟล์ที่กำลังสกัดข้อความ'}
              </p>
              <p className="studio-inline-note" style={{ margin: 0 }}>
                MIND จะใช้ข้อความเดิมและไฟล์ที่อ่านได้ต่อไปก่อน ไฟล์ที่กำลังอ่านจะเปลี่ยนเป็นอ่านได้แล้วหรืออ่านไม่สำเร็จเมื่อเสร็จ
              </p>
            </div>
            <span className="studio-chip studio-chip-danger">
              {pendingCount > 0 && failedCount > 0
                ? `${pendingCount} กำลังอ่าน · ${failedCount} อ่านไม่สำเร็จ`
                : `${issueCount} ไฟล์`}
            </span>
          </div>
          <div className="studio-file-stack">
            {snapshot.fileIssues.map((file) => {
              const retrying = retryingFileId === file.id;
              const pending = file.status === 'pending';
              return (
                <article key={file.id} className="studio-file-row studio-file-row-failed">
                  <div className="studio-file-row-main">
                    <div className="studio-file-row-head">
                      <span className="studio-eyebrow" style={{ marginBottom: 0 }}>
                        {file.copy.title}
                      </span>
                      <span className="studio-chip studio-chip-danger">{file.copy.cta}</span>
                    </div>
                    <strong className="studio-file-row-title">{file.name}</strong>
                    <p className="studio-inline-note" style={{ margin: 0 }}>
                      {file.copy.body}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="studio-context-button"
                    disabled={pending || !onRetryFile || !file.storageKey || retrying}
                    onClick={() => {
                      if (!onRetryFile || !file.storageKey || pending) return;
                      void onRetryFile(file.id);
                    }}
                    title={pending ? 'ไฟล์นี้กำลังถูกอ่านอยู่เบื้องหลัง' : file.storageKey ? undefined : 'ไม่มีไฟล์ต้นฉบับในเครื่องสำหรับลองอ่านซ้ำ'}
                  >
                    {pending ? 'กำลังอ่านไฟล์...' : retrying ? 'กำลังลองอ่านไฟล์อีกครั้ง...' : file.copy.cta}
                  </button>
                  <p className="studio-file-row-detail">{file.copy.detail}</p>
                  {(file.failureDetail || file.failureStage || file.failureReason || file.extractAttemptCount) && (
                    <details className="studio-provenance">
                      <summary
                        style={{
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          listStyle: 'none',
                        }}
                      >
                        ดูรายละเอียด
                      </summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem' }}>
                        {file.failureReason && (
                          <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            reason: {file.failureReason}
                          </code>
                        )}
                        {file.failureStage && (
                          <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            stage: {file.failureStage}
                          </code>
                        )}
                        {file.failureDetail && (
                          <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>
                            detail: {file.failureDetail}
                          </code>
                        )}
                        <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>
                          ux: {file.copy.detail}
                        </code>
                        {file.extractAttemptCount !== undefined && (
                          <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            attempts: {file.extractAttemptCount}
                          </code>
                        )}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {(provenance || snapshot.actionTitle) && (
        <details
          className="studio-provenance"
          open={powerMode}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}
        >
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              fontWeight: 600,
              listStyle: 'none',
            }}
          >
            {detailLabel}
          </summary>
          <div className="studio-provenance-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.35rem' }}>
            {snapshot.actionTitle && (
              <p className="studio-inline-note" style={{ margin: 0 }}>
                ก้าวล่าสุด: {snapshot.actionTitle}
              </p>
            )}
            {provenance && (
              <>
                <p className="studio-inline-note" style={{ margin: 0 }}>
                  {provenance.whyThisNow}
                </p>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span className="studio-chip">{confidenceLabel}</span>
                  {provenance.inputsUsed.slice(0, 3).map((item) => (
                    <span key={item} className="studio-chip">{item}</span>
                  ))}
                </div>
                {provenance.changesSince.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <p className="studio-eyebrow" style={{ marginBottom: 0 }}>เปลี่ยนจากรอบก่อน</p>
                    <p className="studio-inline-note" style={{ margin: 0 }}>
                      {provenance.changesSince.join(' · ')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}

      {snapshot.blockers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p className="studio-eyebrow" style={{ marginBottom: 0 }}>สิ่งที่ยังค้างอยู่</p>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {snapshot.blockers.map((item) => (
              <span key={item} className="studio-chip studio-chip-danger">{item}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
