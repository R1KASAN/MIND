"use client";

import type { RoomRecord } from '@/lib/store/idb';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void | Promise<void>;
  onCreateRoom: () => void | Promise<void>;
}

function scenarioLabel(room: RoomRecord) {
  if (room.scenarioType === 'sales_inquiry_demo_request') return 'Urgent reply';
  if (room.scenarioType === 'client_project_restart') return 'Project restart';
  return 'Client room';
}

function freshnessCopy(room: RoomRecord) {
  if (room.aiFreshness === 'fallback') {
    return {
      label: 'ใช้ brief ล่าสุด',
      tone: 'fallback',
    };
  }

  if (room.aiFreshness === 'stale') {
    return {
      label: 'ยังไม่ refresh',
      tone: 'stale',
    };
  }

  return {
    label: 'AI สด',
    tone: 'fresh',
  };
}

export function RoomSidebar({ rooms, activeRoomId, onSelectRoom, onCreateRoom }: Props) {
  return (
    <aside className="room-sidebar">
      <div className="room-sidebar-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <p className="studio-eyebrow">Rooms</p>
          <h2 style={{ fontSize: '1.02rem', lineHeight: 1.3 }}>สลับ client</h2>
        </div>
        <button type="button" className="room-add-button" onClick={() => void onCreateRoom()}>
          ห้องใหม่
        </button>
      </div>

      <div className="room-sidebar-list">
        {rooms.map((room, index) => {
          const active = room.id === activeRoomId;
          const freshness = freshnessCopy(room);
          const summary = room.lastKnownGoodBrief?.trim() || room.contextSummary;
          const primaryNextMove = room.lastKnownGoodNextMoves[0] || room.nextMoves[0];
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => void onSelectRoom(room.id)}
              className={`room-sidebar-item ${active ? 'is-active' : ''}`}
              aria-pressed={active}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', minWidth: 0 }}>
                  <strong style={{ fontSize: '0.92rem', lineHeight: 1.3, textAlign: 'left' }}>{room.title}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', textAlign: 'left' }}>
                    {scenarioLabel(room)}
                  </span>
                </div>
                <span className="room-sidebar-index">{index + 1}</span>
              </div>

              <p className="room-sidebar-summary">{summary}</p>

              <div className="room-sidebar-meta">
                <span className={`room-sidebar-chip room-sidebar-chip-${freshness.tone}`}>{freshness.label}</span>
                {primaryNextMove && <span className="room-sidebar-chip">ต่อไป: {primaryNextMove}</span>}
                {room.stale && <span className="room-sidebar-chip room-sidebar-chip-warn">ค้างมาหลายวัน</span>}
                {room.unread && <span className="room-sidebar-chip room-sidebar-chip-hot">ยังมีของค้าง</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
