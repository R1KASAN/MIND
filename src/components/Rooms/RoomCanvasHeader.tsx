"use client";

import type { RoomRecord } from '@/lib/store/idb';

interface Props {
  room: RoomRecord | null;
  onContinue: () => void | Promise<void>;
  onMakeSmaller: () => void | Promise<void>;
  continueDisabled?: boolean;
  makeSmallerDisabled?: boolean;
}

function scenarioCopy(room: RoomRecord) {
  if (room.scenarioType === 'sales_inquiry_demo_request') {
    return 'โฟกัสตอบลูกค้าให้ทัน โดยไม่หลุดบริบทของดีล';
  }
  if (room.scenarioType === 'client_project_restart') {
    return 'โฟกัสกลับเข้างานเดิมให้เร็ว แล้วเริ่มจากจุดที่เบาสุด';
  }
  return 'ห้องนี้เก็บบริบทของงานนี้ไว้ให้กลับมาต่อได้ง่าย';
}

function getFreshnessState(room: RoomRecord) {
  if (room.aiFreshness === 'fallback') {
    return {
      tone: 'fallback',
      title: 'ใช้จุดล่าสุด',
      detail: 'MIND ใช้สรุปล่าสุดที่เชื่อถือได้ไว้ก่อน',
    };
  }

  if (room.aiFreshness === 'stale') {
    return {
      tone: 'stale',
      title: 'ยังไม่อัปเดต',
      detail: 'เปิดห้องแล้วเริ่มต่อได้เลย แม้ยังไม่ได้สรุปรอบใหม่',
    };
  }

  return {
    tone: 'fresh',
    title: 'พร้อมใช้',
    detail: 'จุดล่าสุดนี้เพิ่งอัปเดตและพร้อมใช้ต่อทันที',
  };
}

function formatUpdatedAt(timestamp?: number) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp ?? Date.now()));
}

export function RoomCanvasHeader({
  room,
  onContinue,
  onMakeSmaller,
  continueDisabled = false,
  makeSmallerDisabled = false,
}: Props) {
  if (!room) return null;

  const brief = room.lastKnownGoodBrief?.trim() || room.lastReentryBrief?.summary?.trim() || '';
  const nextMoves = room.lastKnownGoodNextMoves.filter((item) => item.trim().length > 0).slice(0, 3);
  const freshness = getFreshnessState(room);
  const roomIdentity = room.contextSummary.trim() && room.contextSummary.trim() !== brief
    ? room.contextSummary.trim()
    : scenarioCopy(room);
  const briefSummary = brief || roomIdentity;
  const updatedAt = formatUpdatedAt(room.lastKnownGoodAt ?? room.lastUpdatedAt);
  const hasSavePoint = brief.length > 0 || nextMoves.length > 0;
  const primaryNextMove = nextMoves[0];
  const extraNextMoves = nextMoves.slice(1);
  const showMore = extraNextMoves.length > 0 || freshness.detail.length > 0;

  return (
    <section className="room-canvas-header">
      <div className="room-canvas-header-top">
        <div className="room-canvas-title-stack">
          <p className="studio-eyebrow">จุดล่าสุด</p>
          <h2 className="room-canvas-title">{room.title}</h2>
          <p className="room-canvas-subtitle">{roomIdentity}</p>
        </div>
        <div className="room-reentry-actions">
          <button
            type="button"
            className="room-reentry-action room-reentry-action-primary"
            onClick={() => void onContinue()}
            disabled={continueDisabled}
          >
            ต่อจากจุดนี้
          </button>
          <button
            type="button"
            className="room-reentry-action room-reentry-action-secondary"
            onClick={() => void onMakeSmaller()}
            disabled={makeSmallerDisabled}
          >
            ทำให้เริ่มง่ายขึ้น
          </button>
        </div>
      </div>

      <div className="room-canvas-meta">
        <span className="studio-chip">{room.lastState}</span>
        <span className={`studio-chip room-freshness-chip room-freshness-chip-${freshness.tone}`}>
          {freshness.title}
        </span>
        <span className="studio-chip">{updatedAt}</span>
        {room.stale && <span className="studio-chip studio-chip-danger">ค้างมาหลายวัน</span>}
      </div>

      {!hasSavePoint ? (
        <div className="room-reentry-empty">
          <p className="room-reentry-empty-title">ห้องนี้ยังไม่มีจุดล่าสุด</p>
          <p className="room-reentry-empty-copy">
            วางงานนี้ก่อน แล้วให้ MIND ช่วยสรุปจุดค้างกับทางเริ่ม
          </p>
        </div>
      ) : (
        <article className="room-reentry-summary">
          <p className="room-reentry-label">ค้างตรงนี้</p>
          <p className="room-reentry-copy">{briefSummary}</p>
          <p className="room-reentry-next-inline">
            <span className="room-reentry-next-inline-label">เริ่มตรงนี้</span>
            <span>
              {primaryNextMove ?? 'กดต่อจากจุดนี้เพื่อให้ MIND พากลับเข้าจังหวะเดิมก่อน'}
            </span>
          </p>
        </article>
      )}

      {showMore && (
        <details className="room-reentry-more">
          <summary>ดูเพิ่ม</summary>
          <div className="room-reentry-more-body">
            {extraNextMoves.length > 0 && (
              <div className="room-next-moves">
                {extraNextMoves.map((item) => (
                  <span key={item} className="room-next-move-chip">{item}</span>
                ))}
              </div>
            )}
            <p className="room-canvas-ai-note">
              <span className="room-canvas-ai-note-label">MIND ใช้อะไร</span>
              <span>{freshness.detail}</span>
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
