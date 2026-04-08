"use client";

import { useTrackMountEvent } from '@/lib/instrumentation';
import { AiSynthesisResponse } from '@/lib/ai/schema';

interface Props {
  alternatives: AiSynthesisResponse['alternative_actions'];
  onBack: () => void;
  onSelect: (actionId: number) => void;
}

export function DecisionBoard({ alternatives, onBack, onSelect }: Props) {
  useTrackMountEvent('one_action_viewed_alternative');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', paddingTop: '2.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          อีกทางจากข้อความเดิม
        </p>
        <h2 style={{ fontSize: '1.85rem', lineHeight: 1.15 }}>โอเค ลองอีกทางจากข้อความเดิมเดียวกัน</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          MIND จะลองเสนอทางเลือกอื่นให้คุณเริ่มจากตอนนี้ โดยยังใช้บริบทเดิมของงานนี้อยู่
        </p>
      </div>

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
          padding: '0.55rem 0.85rem',
          fontSize: '0.9rem',
        }}
      >
        กลับไปใช้ข้อเสนอแรก
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {alternatives.map((alt, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              textAlign: 'left',
              gap: '0.55rem',
              padding: '1.15rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.25rem 0.55rem',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
              }}
            >
              ก้าวแรกแบบอื่น
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{alt.title}</span>
            <span style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>{alt.rationale}</span>
          </button>
        ))}
        {alternatives.length === 0 && (
          <div className="supporting-panel expanded">
            <p className="supporting-label">ตอนนี้ยังไม่มีทางเลือกอื่นเพิ่ม</p>
            <p className="supporting-summary">
              ถ้าข้อเสนอแรกยังใกล้เคียงที่สุด กลับไปใช้ข้อเสนอแรกก่อนได้เลย
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
