"use client";

import type { RankedResumeRoom } from '@/lib/orchestrator/home-entry';

interface ResumePromptProps {
  candidate: RankedResumeRoom;
  onOpen: () => void | Promise<void>;
  onShowRooms: () => void;
}

function formatUpdatedAt(value: number) {
  const diffMs = Date.now() - value;
  if (diffMs < 1000 * 60 * 60) return 'ขยับล่าสุดในชั่วโมงนี้';
  if (diffMs < 1000 * 60 * 60 * 24) return 'ขยับล่าสุดวันนี้';
  const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  return `ขยับล่าสุด ${days} วันที่แล้ว`;
}

export function ResumePrompt({ candidate, onOpen, onShowRooms }: ResumePromptProps) {
  return (
    <section className="resume-prompt" aria-label="งานที่ควรกลับมาต่อ">
      <div className="resume-prompt-copy">
        <p className="resume-prompt-kicker">{candidate.headline}</p>
        <h2>{candidate.room.title}</h2>
        <p className="resume-prompt-summary">{candidate.summary}</p>
        <div className="resume-prompt-action">
          <span>ก้าวถัดไป</span>
          <strong>{candidate.actionTitle}</strong>
        </div>
        <p className="resume-prompt-reason">
          {candidate.reason} · {formatUpdatedAt(candidate.lastEventAt)}
        </p>
      </div>
      <div className="resume-prompt-actions">
        <button className="primary" type="button" onClick={() => void onOpen()}>
          เปิดงานนี้
        </button>
        <button type="button" className="resume-prompt-secondary" onClick={onShowRooms}>
          ดูงานอื่น
        </button>
      </div>
    </section>
  );
}
