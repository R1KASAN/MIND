"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '@/lib/instrumentation';
import type { ValuePulseContext, ValuePulseSignal } from '@/lib/value-pulse';
import { markValuePulseSeen } from '@/lib/value-pulse';

interface Props {
  context: ValuePulseContext;
  onClose: () => void;
}

const SIGNAL_OPTIONS: Array<{ id: ValuePulseSignal; label: string; helper: string }> = [
  { id: 'time', label: 'ประหยัดเวลา', helper: 'เริ่ม/กลับมาต่อได้เร็วขึ้น' },
  { id: 'mental_load', label: 'สมองเบาลง', helper: 'ไม่ต้องแบก context เองเยอะ' },
  { id: 'risk', label: 'กันงานหลุด', helper: 'จบงานทัน / ไม่หลุดโฟกัส' },
  { id: 'mixed', label: 'ได้หลายอย่าง', helper: 'ช่วยทั้งเวลาและความมั่นใจ' },
  { id: 'not_much', label: 'ยังไม่ค่อยช่วย', helper: 'ยังไม่ค่อยเห็น value ชัด' },
];

function optionTone(active: boolean) {
  return {
    background: active ? 'rgba(94, 106, 210, 0.18)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(94, 106, 210, 0.42)' : '1px solid rgba(255,255,255,0.08)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}

export function ValuePulse({ context, onClose }: Props) {
  const [selectedSignal, setSelectedSignal] = useState<ValuePulseSignal | null>(null);
  const [minutesSaved, setMinutesSaved] = useState('');
  const [note, setNote] = useState('');
  const shownContextRef = useRef<string | null>(null);
  const {
    taskId,
    roomId,
    roomTitle,
    roomScenarioType,
    sessionId,
    scenarioId,
    icpTag,
    route,
    mode,
    promptId,
  } = context;

  useEffect(() => {
    if (shownContextRef.current === context.id) return;
    shownContextRef.current = context.id;
    trackEvent('value_pulse_shown', {
      task_id: taskId,
      room_id: roomId,
      room_title: roomTitle,
      room_scenario_type: roomScenarioType,
      session_id: sessionId,
      scenario_id: scenarioId,
      icp_tag: icpTag,
      ui_route: route,
      value_pulse_mode: mode,
      value_pulse_prompt_id: promptId,
    });
  }, [context.id, icpTag, mode, promptId, roomId, roomScenarioType, roomTitle, route, scenarioId, sessionId, taskId]);

  const usesMinutesField = useMemo(
    () => selectedSignal === 'time' || selectedSignal === 'mixed',
    [selectedSignal],
  );

  const handleDismiss = () => {
    markValuePulseSeen(context.id);
    trackEvent('value_pulse_dismissed', {
      task_id: taskId,
      room_id: roomId,
      room_title: roomTitle,
      room_scenario_type: roomScenarioType,
      session_id: sessionId,
      scenario_id: scenarioId,
      icp_tag: icpTag,
      ui_route: route,
      value_pulse_mode: mode,
      value_pulse_prompt_id: promptId,
      value_pulse_signal: selectedSignal ?? 'unknown',
    });
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedSignal) return;

    const parsedMinutes = Number(minutesSaved);
    const safeMinutes = Number.isFinite(parsedMinutes) && parsedMinutes >= 0 ? parsedMinutes : undefined;
    const noteText = note.trim();
    const payloadNote = usesMinutesField ? noteText || undefined : noteText || undefined;

    trackEvent('value_pulse_submitted', {
      task_id: taskId,
      room_id: roomId,
      room_title: roomTitle,
      room_scenario_type: roomScenarioType,
      session_id: sessionId,
      scenario_id: scenarioId,
      icp_tag: icpTag,
      ui_route: route,
      value_pulse_mode: mode,
      value_pulse_prompt_id: promptId,
      value_pulse_signal: selectedSignal,
      value_pulse_minutes_saved: safeMinutes,
      value_pulse_note: payloadNote,
    });
    markValuePulseSeen(context.id);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 90,
        width: 'min(100vw - 2rem, 27rem)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(15, 15, 15, 0.94)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '1.35rem',
          boxShadow: '0 24px 70px rgba(0,0,0,0.38)',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.74rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Optional value pulse
            </p>
            <h3 style={{ margin: '0.3rem 0 0', fontSize: '1.05rem', lineHeight: 1.25 }}>
              {context.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="ปิด value pulse"
            style={{
              background: 'transparent',
              padding: '0.15rem 0.35rem',
              color: 'var(--text-secondary)',
              fontSize: '1rem',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.92rem' }}>
          {context.body}
        </p>

        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {SIGNAL_OPTIONS.map((option) => {
            const active = selectedSignal === option.id;
            const tones = optionTone(active);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedSignal(option.id)}
                style={{
                  textAlign: 'left',
                  padding: '0.85rem 0.95rem',
                  borderRadius: '1rem',
                  ...tones,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.18rem',
                }}
              >
                <strong style={{ fontSize: '0.95rem' }}>{option.label}</strong>
                <span style={{ fontSize: '0.82rem', color: tones.color, lineHeight: 1.45 }}>{option.helper}</span>
              </button>
            );
          })}
        </div>

        {selectedSignal && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {usesMinutesField ? context.followUpLabel : 'ถ้าอยาก เล่าเพิ่มอีกนิดว่าตรงไหนช่วยจริง'}
            </span>
            {usesMinutesField ? (
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={context.followUpPlaceholder}
                value={minutesSaved}
                onChange={(event) => setMinutesSaved(event.target.value)}
                style={{
                  borderRadius: '0.95rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-primary)',
                  padding: '0.8rem 0.9rem',
                }}
              />
            ) : (
              <input
                type="text"
                placeholder={context.followUpPlaceholder}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                style={{
                  borderRadius: '0.95rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-primary)',
                  padding: '0.8rem 0.9rem',
                }}
              />
            )}
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
            ใช้แค่ครั้งนี้ก็พอ เราอ่านเป็น value signal ไม่ใช่ survey
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleDismiss} style={{ background: 'transparent' }}>
              ข้าม
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSubmit}
              disabled={!selectedSignal}
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
