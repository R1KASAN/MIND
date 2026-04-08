"use client";

import { useState } from 'react';
import { useTrackMountEvent } from '@/lib/instrumentation';

interface Props {
  prompt: string;
  onSubmit: (answer: string) => void;
}

export function Clarification({ prompt, onSubmit }: Props) {
  useTrackMountEvent('clarification_shown', { prompt });
  const [value, setValue] = useState('');
  const examples = [
    'ลูกค้าต้องการให้แก้ทั้งหมด แต่ยังไม่ชัดว่าต้องเริ่มจากจุดไหน',
    'ยังรอไฟล์จากลูกค้าอยู่ เลยยังไม่แน่ใจว่าจะ follow up แบบไหน',
    'อยากเริ่มงานค้างต่อ แต่ยังไม่รู้ว่าสถานะล่าสุดคืออะไร',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          ต้องถามเพิ่ม 1 จุด
        </p>
        <h2 style={{ margin: 0 }}>ขอข้อมูลเพิ่มนิดเดียว เพื่อสรุปให้ตรง</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          MIND ขอถามเพิ่มแค่ครั้งเดียว แล้วจะสรุปก้าวถัดไปให้ชัดขึ้นทันที
        </p>
      </div>

      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
        {prompt}
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.9rem 1rem',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
          ตัวอย่างคำตอบสั้น ๆ
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setValue(example)}
              style={{
                textAlign: 'left',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
                borderRadius: '12px',
                padding: '0.75rem 0.85rem',
                fontSize: '0.9rem',
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="พิมพ์รายละเอียดที่ยังขาดอยู่ 1 จุด"
        autoFocus
      />

      <button
        className="primary"
        disabled={!value.trim()}
        onClick={() => {
          const trimmed = value.trim();
          if (!trimmed) return;
          onSubmit(trimmed);
          setValue('');
        }}
      >
        สรุปต่อเลย
      </button>
    </div>
  );
}
