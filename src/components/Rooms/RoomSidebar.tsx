"use client";

import type { RoomRecord } from '@/lib/store/idb';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void | Promise<void>;
  onCreateRoom: () => void | Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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

function roomStatusLine(room: RoomRecord) {
  if (room.unread) return 'มีของค้างที่ยังไม่ตอบ';
  if (room.stale) return 'ค้างมาหลายวัน';
  return scenarioLabel(room);
}

function roomInitial(title: string) {
  const trimmed = title.trim();
  return trimmed ? trimmed[0].toUpperCase() : 'R';
}

export function RoomSidebar({
  rooms,
  activeRoomId,
  onSelectRoom,
  onCreateRoom,
  collapsed = false,
}: Props) {
  return (
    <aside className={`room-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="room-sidebar-header">
        <div className="room-sidebar-header-copy">
          <p className="studio-eyebrow">Rooms</p>
          {!collapsed && <h2 style={{ fontSize: '1.02rem', lineHeight: 1.3 }}>ห้องงานลูกค้า</h2>}
        </div>
        <div className="room-sidebar-header-actions">
          <button
            type="button"
            className="room-add-button"
            onClick={() => void onCreateRoom()}
            aria-label="สร้างห้องใหม่"
          >
            {collapsed ? '+' : 'ห้องใหม่'}
          </button>
        </div>
      </div>

      <div className="room-sidebar-list">
        {rooms.map((room, index) => {
          const active = room.id === activeRoomId;
          const freshness = freshnessCopy(room);
          const summary = room.lastKnownGoodBrief?.trim() || room.contextSummary.trim();

          return (
            <button
              key={room.id}
              type="button"
              onClick={() => void onSelectRoom(room.id)}
              className={`room-sidebar-item ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              aria-label={`${room.title} ${roomStatusLine(room)}`}
            >
              <div className="room-sidebar-item-top">
                <span className="room-sidebar-avatar" aria-hidden="true">
                  {roomInitial(room.title)}
                </span>
                {!collapsed && (
                  <>
                    <div className="room-sidebar-item-copy">
                      <strong style={{ fontSize: '0.92rem', lineHeight: 1.3, textAlign: 'left' }}>{room.title}</strong>
                      <span className="room-sidebar-status-line">{roomStatusLine(room)}</span>
                    </div>
                    <span className="room-sidebar-index">{index + 1}</span>
                  </>
                )}
              </div>

              {collapsed ? (
                <>
                  <div className="room-sidebar-collapsed-markers" aria-hidden="true">
                    <span className={`room-sidebar-mini-dot room-sidebar-mini-dot-${freshness.tone}`} />
                    {room.unread && <span className="room-sidebar-mini-dot room-sidebar-mini-dot-hot" />}
                    {room.stale && <span className="room-sidebar-mini-dot room-sidebar-mini-dot-warn" />}
                  </div>
                  <span className={`room-sidebar-mini-active room-sidebar-mini-active-${active ? 'active' : room.unread ? 'unread' : room.stale ? 'stale' : 'idle'}`} aria-hidden="true" />
                  <span className="room-sidebar-collapsed-index" aria-hidden="true">{index + 1}</span>
                </>
              ) : (
                <>
                  <div className="room-sidebar-meta room-sidebar-meta-compact">
                    <span className={`room-sidebar-chip room-sidebar-chip-${freshness.tone}`}>{freshness.label}</span>
                    {room.unread && <span className="room-sidebar-chip room-sidebar-chip-hot">ยังมีของค้าง</span>}
                    {room.stale && <span className="room-sidebar-dot room-sidebar-dot-warn">ค้าง</span>}
                    {active && <span className="room-sidebar-dot room-sidebar-dot-active">กำลังทำ</span>}
                  </div>

                  {summary && <p className="room-sidebar-summary">{summary}</p>}

                  <div className="room-sidebar-footnote">
                    <span>{scenarioLabel(room)}</span>
                    {room.lastKnownGoodNextMoves[0] && (
                      <span className="room-sidebar-footnote-next">เริ่ม: {room.lastKnownGoodNextMoves[0]}</span>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
