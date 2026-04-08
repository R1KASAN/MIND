"use client";

import { useEffect, useState } from 'react';
import { useTrackMountEvent } from '@/lib/instrumentation';

interface Step {
  label: string;
  title: string;
  body: string;
  action: string;
}

interface Props {
  onClose: () => void;
  onFinish: () => void;
}

const steps: Step[] = [
  {
    label: 'หน้าจอ 1',
    title: 'พิมพ์สภาพงานตรง ๆ ได้เลย',
    body: 'ไม่มีไฟล์ก็เริ่มได้ แค่เล่าว่าตอนนี้งานค้างตรงไหน ถ้ามีไฟล์ค่อยแนบเพิ่มทีหลัง',
    action: 'พิมพ์สถานการณ์หรือวางข้อความลูกค้า แล้วกด "สรุปให้เลย"',
  },
  {
    label: 'หน้าจอ 2',
    title: 'ดูสรุปสถานการณ์ + คำตอบ + ก้าวแรก',
    body: 'MIND จะสรุปสิ่งที่เกิดขึ้นจากข้อความก่อน แล้วค่อยอ่านไฟล์ถ้ามี ร่างข้อความตอบกลับถ้าเป็นงานลูกค้า และบอกก้าวแรกที่เริ่มได้ทันที',
    action: 'อ่านผลลัพธ์บนการ์ดหลักก่อน แล้วค่อยเลือกไปต่อ',
  },
  {
    label: 'หน้าจอ 3',
    title: 'ทำทีละ micro-step ที่เริ่มได้จริง',
    body: 'ถ้ากดเริ่มแล้ว คุณจะเห็น 3 ขั้นสั้น ๆ ที่ทำได้จริง หน้าจอนี้ไว้ช่วยโฟกัส ไม่ใช่ช่วยจับเวลา',
    action: 'ทำทีละข้อ แล้วกด "เสร็จแล้ว" เมื่อจบแต่ละรอบ',
  },
  {
    label: 'หน้าจอ 4',
    title: 'ถ้าติดหรือ AI ไม่พร้อม',
    body: 'ถ้าวันนั้น AI ยังไม่พร้อม หรือข้อมูลยังไม่พอ MIND จะพาไปทางสำรองแบบไม่ต้องเริ่มใหม่ทั้งหมด',
    action: 'กด "ฉันติดอยู่" เพื่อย่อยงาน หรือพิมพ์ก้าวเล็กที่สุดเองใน Manual Fallback',
  },
  {
    label: 'หน้าจอ 5',
    title: 'กลับมาเมื่อไรก็ได้ โดยไม่เสียจังหวะ',
    body: 'หายไปนานแล้วกลับมา ระบบจะพาเข้าหน้ากลับมาต่อ และยังมีภาพรวม คลังเก็บ กับข้อมูลความไว้ใจให้เปิดดูเมื่อจำเป็น',
    action: 'ใช้ "ไปต่อ" หรือ "เริ่มใหม่" แล้วค่อยเปิดภาพรวม คลังเก็บ หรือข้อมูลเมื่อจำเป็น',
  },
];

export function WalkthroughOverlay({ onClose, onFinish }: Props) {
  useTrackMountEvent('walkthrough_opened');
  const [index, setIndex] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const current = steps[index];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const syncLayout = () => {
      setIsCompact(window.innerWidth <= 720);
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  const finish = () => {
    onFinish();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 120,
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(8px)',
      padding: '1rem',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      overflowY: 'auto',
    }}>
      <div style={{
        width: 'min(100%, 760px)',
        background: 'linear-gradient(180deg, rgba(28,28,28,0.98), rgba(17,17,17,0.98))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '24px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        padding: '1.25rem',
        display: 'grid',
        gap: '1rem',
        maxHeight: 'calc(100dvh - 2rem)',
        overflowY: 'auto',
        margin: 'auto 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              วิธีใช้ MIND
            </p>
            <h2 style={{ fontSize: isCompact ? '1.25rem' : '1.6rem', fontWeight: 650, marginTop: '0.35rem', lineHeight: 1.15 }}>
              พิมพ์สภาพงานก่อน ไฟล์เป็นแค่ตัวช่วยเสริม
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', maxWidth: '42rem', fontSize: isCompact ? '0.9rem' : '1rem' }}>
              ถ้ายังไม่แน่ใจว่าจะพิมพ์อะไร ให้เริ่มจากข้อความล้วนได้เลย MIND จะอ่านข้อความก่อน แล้วค่อยอ่านไฟล์ถ้ามี เพื่อสรุปสถานการณ์ ร่างคำตอบ และบอกก้าวแรกให้โดยไม่ต้องไล่อ่านใหม่ทั้งหมด
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', padding: '0.3rem 0.55rem', fontSize: '1.1rem' }}>
            ✕
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? 'minmax(0, 1fr)' : 'minmax(0, 220px) minmax(0, 1fr)',
          gap: '1rem',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: isCompact ? 'row' : 'column',
            gap: '0.5rem',
            paddingRight: '0.25rem',
            overflowX: isCompact ? 'auto' : 'visible',
            paddingBottom: isCompact ? '0.25rem' : 0,
          }}>
            {steps.map((step, stepIndex) => {
              const active = stepIndex === index;
              return (
                <button
                  key={step.label}
                  onClick={() => setIndex(stepIndex)}
                  style={{
                    textAlign: 'left',
                    padding: '0.85rem 0.95rem',
                    background: active ? 'rgba(94,106,210,0.18)' : 'transparent',
                    border: active ? '1px solid rgba(94,106,210,0.38)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    minWidth: isCompact ? '180px' : 'auto',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {step.label}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.94rem' }}>{step.title}</span>
                </button>
              );
            })}
          </div>

          <div style={{
            padding: '1.1rem',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            minHeight: isCompact ? 'auto' : '320px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isCompact ? 'flex-start' : 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.35rem 0.7rem',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
              }}>
                {index + 1} / {steps.length}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: isCompact ? '12rem' : 'none' }}>
                ทุกหน้าจอชี้ว่า “ต้องใส่อะไร” และ “จะได้อะไร”
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {current.label}
              </p>
              <h3 style={{ fontSize: isCompact ? '1.2rem' : '1.55rem', fontWeight: 650, lineHeight: 1.15 }}>
                {current.title}
              </h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: isCompact ? '0.95rem' : '1rem' }}>
                {current.body}
              </p>
            </div>

            <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                ต้องทำอะไรต่อ
              </p>
              <p style={{ lineHeight: 1.7 }}>
                {current.action}
              </p>
            </div>

            <div style={{
              padding: '0.95rem 1rem',
              borderRadius: '16px',
              background: 'rgba(94,106,210,0.12)',
              border: '1px solid rgba(94,106,210,0.24)',
            }}>
              <p style={{ margin: 0, fontWeight: 600 }}>จำไว้ว่าไม่มีไฟล์ก็เริ่มได้</p>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: isCompact ? '0.92rem' : '0.96rem' }}>
                พิมพ์ข้อความก่อน แล้วค่อยแนบไฟล์เมื่อมันช่วยให้ MIND เข้าใจงานนี้ได้ดีขึ้น
              </p>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
                disabled={index === 0}
                style={{ minWidth: '110px' }}
              >
                ย้อนกลับ
              </button>
              {index < steps.length - 1 ? (
                <button className="primary" onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}>
                  ถัดไป
                </button>
              ) : (
                <button className="primary" onClick={finish}>
                  เริ่มใช้งาน
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
