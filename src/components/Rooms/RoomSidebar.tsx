"use client";

import type { RoomSidebarItemView } from '@/lib/orchestrator/home-entry';
import type { RoomRecord } from '@/lib/store/idb';

interface Props {
  items?: RoomSidebarItemView[];
  onSelectRoom: (roomId: string) => void | Promise<void>;
  onCreateRoom: () => void | Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  focusMode?: boolean;
}

export function scenarioLabel(room: RoomRecord) {
  if (room.scenarioType === 'sales_inquiry_demo_request') return 'ต้องตอบลูกค้า';
  if (room.scenarioType === 'client_project_restart') return 'งานค้าง';
  return 'ห้องงาน';
}

function freshnessCopy(room: RoomRecord) {
  if (room.aiFreshness === 'fallback') {
    return {
      label: 'กลับมาทำต่อ',
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
    label: 'พร้อมใช้',
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
  items = [],
  onSelectRoom,
  onCreateRoom,
  collapsed = false,
  focusMode = true,
}: Props) {
  return (
    <aside className={`room-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="room-sidebar-header">
        <div className="room-sidebar-header-copy">
          <p className="studio-eyebrow">ห้องงาน</p>
          {!collapsed && <h2 style={{ fontSize: '1.02rem', lineHeight: 1.3 }}>ห้องงาน</h2>}
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
        {items.length === 0 && !collapsed ? (
          <div className="room-sidebar-empty" role="status">
            <p>ยังไม่มีห้องงาน</p>
            <span>วางบริบทงานแรก แล้ว MIND จะสร้างห้องให้เอง</span>
          </div>
        ) : null}
        {items.map((item, index) => {
          const { room } = item;
          const active = item.isActive;
          const freshness = freshnessCopy(room);
          const summary = room.lastKnownGoodBrief?.trim() || room.contextSummary.trim();
          const statusLine = item.headline ?? roomStatusLine(room);

          return (
            <button
              key={room.id}
              type="button"
              onClick={() => void onSelectRoom(room.id)}
              className={`room-sidebar-item ${active ? 'is-active' : ''} ${item.isRecommended ? 'is-recommended' : ''}`}
              aria-pressed={active}
              aria-label={`${room.title} ${statusLine}`}
            >
              <div className="room-sidebar-item-top">
                <span className="room-sidebar-avatar" aria-hidden="true">
                  {roomInitial(room.title)}
                </span>
                {!collapsed && (
                  <>
                    <div className="room-sidebar-item-copy">
                      <strong style={{ fontSize: '0.92rem', lineHeight: 1.3, textAlign: 'left' }}>{room.title}</strong>
                      <span className="room-sidebar-status-line">{statusLine}</span>
                    </div>
                    <span className="room-sidebar-index">{index + 1}</span>
                  </>
                )}
              </div>

              {collapsed ? (
                <>
                  <div className="room-sidebar-collapsed-markers" aria-hidden="true">
                    {item.isRecommended && <span className="room-sidebar-mini-dot room-sidebar-mini-dot-recommended" />}
                    <span className={`room-sidebar-mini-dot room-sidebar-mini-dot-${freshness.tone}`} />
                    {room.unread && <span className="room-sidebar-mini-dot room-sidebar-mini-dot-hot" />}
                    {room.stale && <span className="room-sidebar-mini-dot room-sidebar-mini-dot-warn" />}
                  </div>
                  <span className={`room-sidebar-mini-active room-sidebar-mini-active-${active ? 'active' : item.isRecommended ? 'recommended' : room.unread ? 'unread' : room.stale ? 'stale' : 'idle'}`} aria-hidden="true" />
                  <span className="room-sidebar-collapsed-index" aria-hidden="true">{index + 1}</span>
                </>
              ) : (
                <>
                  <div className="room-sidebar-meta room-sidebar-meta-compact">
                    {item.isRecommended && (
                      <span className="room-sidebar-chip room-sidebar-chip-recommended">
                        {item.headline ?? 'ต่อได้เลย'}
                      </span>
                    )}
                    <span className={`room-sidebar-chip room-sidebar-chip-${freshness.tone}`}>{freshness.label}</span>
                    {room.unread && <span className="room-sidebar-chip room-sidebar-chip-hot">ยังมีของค้าง</span>}
                    {room.stale && <span className="room-sidebar-dot room-sidebar-dot-warn">ค้าง</span>}
                    {item.activityLabel === 'งานนี้เสร็จแล้ว' && (
                      <span className="room-sidebar-chip room-sidebar-chip-fallback">{item.activityLabel}</span>
                    )}
                    {item.showActiveBadge && <span className="room-sidebar-dot room-sidebar-dot-active">กำลังทำ</span>}
                  </div>

                  {item.nextAction && (
                    <p className="room-sidebar-next-action">
                      ก้าวถัดไป: {item.nextAction}
                    </p>
                  )}

                  {!focusMode && summary && <p className="room-sidebar-summary">{summary}</p>}

                  {!focusMode && (
                    <div className="room-sidebar-footnote">
                      <span>{scenarioLabel(room)}</span>
                      {room.lastKnownGoodNextMoves[0] && (
                        <span className="room-sidebar-footnote-next">เริ่ม: {room.lastKnownGoodNextMoves[0]}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
