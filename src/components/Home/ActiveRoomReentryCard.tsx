"use client";

import type { ActiveRoomReentryState } from '@/lib/orchestrator/home-entry';

interface ActiveRoomReentryCardProps {
  state: ActiveRoomReentryState;
  onPrimary: () => void | Promise<void>;
  onWhy: () => void;
  onShowRooms: () => void;
}

export function ActiveRoomReentryCard({
  state,
  onPrimary,
  onWhy,
  onShowRooms,
}: ActiveRoomReentryCardProps) {
  return (
    <section className="resume-prompt active-reentry-card" aria-label="จุดกลับมาทำงานนี้ต่อ">
      <div className="resume-prompt-copy">
        <p className="resume-prompt-kicker">{state.headline}</p>
        <h2>{state.room.title}</h2>
        <p className="resume-prompt-summary">{state.summary}</p>
        <div className="resume-prompt-action active-reentry-next">
          <span>{state.primaryAction === 'answer_question' ? 'คำถามเดียวที่ต้องตอบ' : 'ก้าวถัดไป'}</span>
          <strong>{state.actionTitle}</strong>
        </div>
        <p className="resume-prompt-reason">{state.reason}</p>
        {state.trustItems.length > 0 && (
          <ul className="active-reentry-trust-strip" aria-label="บริบทที่ MIND ใช้">
            {state.trustItems.map((item) => (
              <li key={item.id} className={`active-reentry-trust-item is-${item.tone}`}>
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="resume-prompt-actions active-reentry-actions">
        <button className="primary" type="button" onClick={() => void onPrimary()}>
          {state.primaryCta}
        </button>
        <button type="button" className="resume-prompt-secondary" onClick={onWhy}>
          ดูเหตุผล
        </button>
        <button type="button" className="resume-prompt-secondary" onClick={onShowRooms}>
          {state.secondaryCta}
        </button>
      </div>
    </section>
  );
}
