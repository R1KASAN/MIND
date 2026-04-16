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
    return 'โฟกัสกลับเข้างานเดิมให้เร็ว แล้วหา next move ที่เริ่มได้จริง';
  }
  return 'ห้องนี้เก็บบริบทของงานนี้ไว้ให้กลับมาต่อได้ง่าย';
}

function getFreshnessState(room: RoomRecord) {
  if (room.aiFreshness === 'fallback') {
    return {
      tone: 'fallback',
      title: 'ใช้ brief ล่าสุด',
      detail: 'MIND กำลังยึด save point ล่าสุดที่เชื่อถือได้ไว้ก่อน',
    };
  }

  if (room.aiFreshness === 'stale') {
    return {
      tone: 'stale',
      title: 'ยังไม่ refresh',
      detail: 'เปิดห้องแล้วเริ่มต่อได้เลย แม้ AI ยังไม่ได้สรุปรอบใหม่',
    };
  }

  return {
    tone: 'fresh',
    title: 'AI สด',
    detail: 'save point นี้เพิ่งอัปเดตและพร้อมใช้ต่อทันที',
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
  const updatedAt = formatUpdatedAt(room.lastKnownGoodAt ?? room.lastUpdatedAt);
  const hasSavePoint = brief.length > 0 || nextMoves.length > 0;
  const primaryNextMove = nextMoves[0];

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
          <p className="room-reentry-empty-title">ห้องนี้ยังไม่มี save point</p>
          <p className="room-reentry-empty-copy">
            วาง chaos ของงานนี้ก่อน แล้วให้ MIND สร้างจุดล่าสุดกับ next move แรกให้ห้องนี้
          </p>
        </div>
      ) : (
        <div className="room-reentry-grid room-reentry-grid-slim">
          <article className="room-reentry-block">
            <p className="room-reentry-label">ค้างตรงนี้</p>
            <p className="room-reentry-copy">{brief}</p>
          </article>

          <article className="room-reentry-block">
            <p className="room-reentry-label">เริ่มตรงนี้</p>
            {primaryNextMove ? (
              <p className="room-reentry-copy">{primaryNextMove}</p>
            ) : (
              <p className="room-reentry-copy room-reentry-copy-muted">
                ยังไม่มี next move ที่ชัดพอ กดต่อจากจุดนี้เพื่อให้ MIND พากลับเข้า flow เดิมก่อน
              </p>
            )}
          </article>
        </div>
      )}

      {nextMoves.length > 1 && (
        <div className="room-next-moves">
          {nextMoves.slice(1).map((item) => (
            <span key={item} className="room-next-move-chip">{item}</span>
          ))}
        </div>
      )}

      <p className="room-canvas-ai-note">
        <span className="room-canvas-ai-note-label">AI ใช้ข้อมูลอะไร</span>
        <span>{freshness.detail}</span>
      </p>
    </section>
  );
}
