"use client";

import { useDeferredValue, useState } from 'react';
import {
  filterAiOpsEntries,
  summarizeAiOpsEntries,
  type AiOpsDebugEntry,
} from '@/lib/ai/ai-ops-debug';

interface Props {
  entries: AiOpsDebugEntry[];
  open: boolean;
  onToggle: () => void;
}

const PASS_LABELS: Record<AiOpsDebugEntry['passType'], string> = {
  primary_pass: 'primary',
  repair_pass: 'repair',
  fallback_pass: 'fallback',
  timeout: 'timeout',
  validation_failed: 'validation',
  endpoint_failed: 'endpoint',
};

const PASS_COLORS: Record<AiOpsDebugEntry['passType'], string> = {
  primary_pass: 'rgba(34, 197, 94, 0.16)',
  repair_pass: 'rgba(245, 158, 11, 0.18)',
  fallback_pass: 'rgba(96, 165, 250, 0.18)',
  timeout: 'rgba(244, 63, 94, 0.2)',
  validation_failed: 'rgba(249, 115, 22, 0.2)',
  endpoint_failed: 'rgba(239, 68, 68, 0.22)',
};

export function AiOpsDebugPanel({ entries, open, onToggle }: Props) {
  const [query, setQuery] = useState('');
  const [activePassTypes, setActivePassTypes] = useState<AiOpsDebugEntry['passType'][]>([]);
  const deferredQuery = useDeferredValue(query);
  const recentEntries = entries.slice(0, 12);
  const visibleEntries = filterAiOpsEntries(recentEntries, {
    query: deferredQuery,
    passTypes: activePassTypes,
  });
  const summary = summarizeAiOpsEntries(visibleEntries);

  const togglePassType = (passType: AiOpsDebugEntry['passType']) => {
    setActivePassTypes((current) => (
      current.includes(passType)
        ? current.filter((value) => value !== passType)
        : [...current, passType]
    ));
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 80,
        width: 'min(360px, calc(100vw - 1.5rem))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          alignSelf: 'flex-end',
          padding: '0.55rem 0.85rem',
          fontSize: '0.8rem',
          background: 'rgba(15,15,15,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
        }}
      >
        {open ? 'ซ่อน AI Ops' : 'AI Ops'}
      </button>
      {open && (
        <div
          style={{
            borderRadius: '18px',
            background: 'rgba(10,10,10,0.94)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.34)',
            padding: '0.95rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '0.74rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                AI Ops
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                ดู pass ล่าสุดของแต่ละ operation แบบไม่ต้องเปิด console
              </p>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              {visibleEntries.length}/{recentEntries.length} รายการ
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหา operation, model หรือ error"
              style={{
                padding: '0.8rem 0.9rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '0.84rem',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {Object.keys(PASS_LABELS).map((key) => {
                const passType = key as AiOpsDebugEntry['passType'];
                const active = activePassTypes.includes(passType);
                return (
                  <button
                    key={passType}
                    onClick={() => togglePassType(passType)}
                    style={{
                      padding: '0.38rem 0.62rem',
                      borderRadius: '999px',
                      background: active ? PASS_COLORS[passType] : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`,
                      color: 'var(--text-primary)',
                      fontSize: '0.74rem',
                    }}
                  >
                    {PASS_LABELS[passType]}
                  </button>
                );
              })}
              {(query || activePassTypes.length > 0) && (
                <button
                  onClick={() => {
                    setQuery('');
                    setActivePassTypes([]);
                  }}
                  style={{
                    padding: '0.38rem 0.62rem',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.74rem',
                  }}
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {Object.entries(summary).map(([key, count]) => (
              <span
                key={key}
                style={{
                  padding: '0.32rem 0.6rem',
                  borderRadius: '999px',
                  background: PASS_COLORS[key as AiOpsDebugEntry['passType']],
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}
              >
                {PASS_LABELS[key as AiOpsDebugEntry['passType']]} x{count}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {visibleEntries.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {recentEntries.length === 0 ? 'ยังไม่มี operation ในรอบนี้' : 'ไม่เจอ operation ที่ตรงกับตัวกรองนี้'}
              </p>
            ) : (
              visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '0.8rem 0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{entry.operationName}</strong>
                    <span
                      style={{
                        padding: '0.2rem 0.45rem',
                        borderRadius: '999px',
                        background: PASS_COLORS[entry.passType],
                        fontSize: '0.72rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {PASS_LABELS[entry.passType]}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    model: {entry.model ?? 'unknown'} · {entry.durationMs ?? 0}ms · repair {entry.repairUsed ? 'on' : 'off'}
                  </p>
                  {entry.detail && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.55 }}>
                      {entry.detail}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
