"use client";

import { useState } from 'react';
import { useTrackMountEvent, trackEvent } from '@/lib/instrumentation';
import { exportAllData, clearAllData, createDefaultSession, saveSession } from '@/lib/store/idb';

interface Props {
  onClose: () => void;
  onDataDeleted: () => void;
}

// T025: Trust Triad — rationale visible, JSON export, Delete All Local Data (spec §7, FR-009)
export function TrustOverlay({ onClose, onDataDeleted }: Props) {
  useTrackMountEvent('overview_opened');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [backupAttempted, setBackupAttempted] = useState(false);
  const [backupResult, setBackupResult] = useState<'success' | 'failed' | null>(null);

  // T039: Wire JSON export download
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `mind-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent('data_exported');
    } finally {
      setIsExporting(false);
    }
  };

  const attemptBackupSnapshot = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `mind-backup-before-reset-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupResult('success');
      trackEvent('data_exported', { reason: 'pre_reset_backup' });
    } catch {
      setBackupResult('failed');
    } finally {
      setBackupAttempted(true);
    }
  };

  // T040: Wire Delete All — clears IDB and triggers full page reset
  const handleDeleteAll = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!backupAttempted) {
      await attemptBackupSnapshot();
      return;
    }
    await clearAllData();
    await saveSession(createDefaultSession());
    trackEvent('data_deleted');
    onDataDeleted();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 'var(--radius) var(--radius) 0 0',
        padding: '1.5rem', width: '100%', maxWidth: '480px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>ข้อมูลและความไว้ใจ</h2>
          <button onClick={onClose} style={{ background: 'transparent', fontSize: '1.25rem' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>🔒 ข้อมูลของคุณอยู่ในเครื่องนี้เท่านั้น</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              สิ่งที่คุณพิมพ์และผลลัพธ์จาก AI จะถูกเก็บไว้บนอุปกรณ์นี้เท่านั้น ไม่มีการส่งขึ้นเซิร์ฟเวอร์ของเรา
            </p>
          </div>

          {/* Local AI setup helper */}
          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>🤖 AI ในเครื่อง</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              MIND ใช้ <strong>Ollama</strong> ที่รันอยู่ในเครื่องคุณเอง ให้ติดตั้งโมเดลด้วย <code>npm run ollama:pull:gemma</code>,
              เปิด AI ด้วย <code>npm run ollama:serve:cpu-safe</code>, แล้วเริ่มแอปด้วย <code>npm run dev</code>
            </p>
          </div>

          {/* T039: Export */}
          <button onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'กำลังส่งออก…' : '⬇️ ส่งออกข้อมูลทั้งหมดของฉัน (JSON)'}
          </button>

          {/* T040: Delete All — requires one confirmation tap */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)' }}
            >
              🗑 ลบข้อมูลทั้งหมดในเครื่อง
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ color: 'var(--danger)', margin: 0, fontSize: '0.9rem' }}>
                แน่ใจใช่ไหม การลบนี้ย้อนกลับไม่ได้
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleDeleteAll} style={{ color: 'var(--danger)', flex: 1 }}>
                  {!backupAttempted
                    ? 'สำรองก่อน แล้วค่อยยืนยัน'
                    : backupResult === 'success'
                      ? 'ยืนยันลบหลังสำรองแล้ว'
                      : 'ยืนยันลบแม้สำรองไม่สำเร็จ'}
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(false);
                    setBackupAttempted(false);
                    setBackupResult(null);
                  }}
                  style={{ flex: 1 }}
                >
                  ยกเลิก
                </button>
              </div>
              {backupResult && (
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.82rem' }}>
                  {backupResult === 'success'
                    ? 'สร้าง backup snapshot แล้ว ต้องกดยืนยันอีกครั้งก่อนลบจริง'
                    : 'พยายาม backup แล้วแต่ไม่สำเร็จ ต้องกดยืนยันอีกครั้งก่อนลบจริง'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
