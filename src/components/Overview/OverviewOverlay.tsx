"use client";

import { useEffect, useState } from 'react';
import { useTrackMountEvent } from '@/lib/instrumentation';
import { Action, getActions, AppSession } from '@/lib/store/idb';

interface Props {
  session: AppSession;
  onClose: () => void;
}

// T023: Read-only overview — current action + max 3 pinned items (spec §5, FR-005)
export function OverviewOverlay({ session, onClose }: Props) {
  useTrackMountEvent('overview_opened');
  const [pinnedActions, setPinnedActions] = useState<Action[]>([]);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);

  useEffect(() => {
    getActions().then((actions) => {
      const active = actions.find((a) => a.id === session.currentActionId) || null;
      setCurrentAction(active);
      // Cap at 3 pinned items — spec §5
      const pinned = actions.filter((a) => a.isPinned && a.state !== 'ARCHIVED').slice(0, 3);
      setPinnedActions(pinned);
    });
  }, [session.currentActionId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 'var(--radius) var(--radius) 0 0',
        padding: '1.5rem', width: '100%', maxWidth: '480px', maxHeight: '60vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>ภาพรวมแบบสั้น</h2>
          <button onClick={onClose} style={{ background: 'transparent', fontSize: '1.25rem' }}>✕</button>
        </div>

        {/* Current action — read-only */}
        {currentAction ? (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>ตอนนี้</p>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{currentAction.title}</p>
              {currentAction.rationale && (
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {currentAction.rationale}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>ตอนนี้ยังไม่มีก้าวที่กำลังทำอยู่</p>
        )}

        {/* Pinned items — max 3, read-only (FR-005) */}
        {pinnedActions.length > 0 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
              ปักหมุดไว้ ({pinnedActions.length}/3)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pinnedActions.map((action) => (
                <div key={action.id} style={{
                  padding: '0.75rem', background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  <span>📌</span>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{action.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {pinnedActions.length === 0 && !currentAction && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1rem' }}>
            เริ่มเทสิ่งที่อยู่ในหัวก่อน แล้วภาพรวมสั้น ๆ จะค่อยปรากฏขึ้น
          </p>
        )}
      </div>
    </div>
  );
}
