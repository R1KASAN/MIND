"use client";

import type { CompletedRoomContextState } from '@/lib/orchestrator/home-entry';

interface CompletedContextCardProps {
  state: CompletedRoomContextState;
  onPrimary: () => void | Promise<void>;
  onShowRooms: () => void;
}

export function CompletedContextCard({
  state,
  onPrimary,
  onShowRooms,
}: CompletedContextCardProps) {
  return (
    <section className="resume-prompt completed-context-card" aria-label="บริบทของงานที่เสร็จแล้ว">
      <div className="resume-prompt-copy">
        <p className="resume-prompt-kicker">{state.headline}</p>
        <h2>{state.room.title}</h2>
        <p className="resume-prompt-summary">{state.summary}</p>
        <div className="resume-prompt-action completed-context-action">
          <span>บริบทที่พร้อมใช้ต่อ</span>
          <strong>{state.actionTitle}</strong>
        </div>
        <p className="resume-prompt-reason">{state.reason}</p>
        {state.trustItems.length > 0 && (
          <ul className="active-reentry-trust-strip" aria-label="บริบทที่ MIND เก็บไว้">
            {state.trustItems.map((item) => (
              <li key={item.id} className={`active-reentry-trust-item is-${item.tone}`}>
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="resume-prompt-actions completed-context-actions">
        <button className="primary" type="button" onClick={() => void onPrimary()}>
          {state.primaryCta}
        </button>
        <button type="button" className="resume-prompt-secondary" onClick={onShowRooms}>
          {state.secondaryCta}
        </button>
      </div>
    </section>
  );
}
