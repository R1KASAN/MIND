"use client";

import { useState } from 'react';
import type { RoomRecord } from '@/lib/store/idb';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void | Promise<void>;
  onCreateRoom: () => void | Promise<void>;
  onRenameRoom: (roomId: string, nextTitle: string) => void | Promise<void>;
  onTrashRoom: (roomId: string) => void | Promise<void>;
  onRestoreRoom: (roomId: string) => void | Promise<void>;
  collapsed?: boolean;
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
  onRenameRoom,
  onTrashRoom,
  onRestoreRoom,
  collapsed = false,
}: Props) {
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const activeRooms = rooms.filter((room) => typeof room.trashedAt !== 'number');
  const trashedRooms = rooms.filter((room) => typeof room.trashedAt === 'number');
  const activeMenuRoomId = collapsed || !rooms.some((room) => room.id === openMenuRoomId) ? null : openMenuRoomId;
  const activeEditingRoomId = collapsed || !rooms.some((room) => room.id === editingRoomId) ? null : editingRoomId;

  const startRename = (room: RoomRecord) => {
    setOpenMenuRoomId(null);
    setEditingRoomId(room.id);
    setDraftTitle(room.title);
  };

  const cancelRename = () => {
    setEditingRoomId(null);
    setDraftTitle('');
  };

  const submitRename = async (roomId: string) => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) return;
    await onRenameRoom(roomId, nextTitle);
    setEditingRoomId(null);
    setDraftTitle('');
  };

  return (
    <aside className={`room-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className={`room-sidebar-header ${collapsed ? 'is-collapsed' : ''}`}>
        {!collapsed && (
          <div className="room-sidebar-header-copy">
            <p className="studio-eyebrow">Rooms</p>
            <h2 style={{ fontSize: '1.02rem', lineHeight: 1.3 }}>ห้องงานลูกค้า</h2>
          </div>
        )}
        <div className={`room-sidebar-header-actions ${collapsed ? 'is-collapsed' : ''}`}>
          <button
            type="button"
            className="room-add-button"
            onClick={() => void onCreateRoom()}
            aria-label="สร้างห้องใหม่"
            title="สร้างห้องใหม่"
          >
            {collapsed ? '+' : 'ห้องใหม่'}
          </button>
        </div>
      </div>

      <div className="room-sidebar-list">
        {activeRooms.map((room, index) => {
          const active = room.id === activeRoomId;
          const freshness = freshnessCopy(room);
          const summary = room.lastKnownGoodBrief?.trim() || room.contextSummary.trim();
          const isEditing = activeEditingRoomId === room.id;
          const isMenuOpen = activeMenuRoomId === room.id;

          return (
            <div
              key={room.id}
              role="button"
              tabIndex={isEditing ? -1 : 0}
              onClick={() => {
                if (isEditing) return;
                setOpenMenuRoomId(null);
                void onSelectRoom(room.id);
              }}
              onKeyDown={(event) => {
                if (isEditing) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setOpenMenuRoomId(null);
                void onSelectRoom(room.id);
              }}
              className={`room-sidebar-item ${active ? 'is-active' : ''} ${isEditing ? 'is-editing' : ''}`}
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
                  <div className="room-sidebar-item-controls">
                    <div className="room-sidebar-meta room-sidebar-meta-compact">
                      <span className={`room-sidebar-chip room-sidebar-chip-${freshness.tone}`}>{freshness.label}</span>
                      {room.unread && <span className="room-sidebar-chip room-sidebar-chip-hot">ยังมีของค้าง</span>}
                      {room.stale && <span className="room-sidebar-dot room-sidebar-dot-warn">ค้าง</span>}
                      {active && <span className="room-sidebar-dot room-sidebar-dot-active">กำลังทำ</span>}
                    </div>
                    <div className="room-sidebar-menu-wrap">
                      <button
                        type="button"
                        className="room-sidebar-menu-trigger"
                        aria-label={`จัดการห้อง ${room.title}`}
                        aria-expanded={isMenuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuRoomId((current) => (current === room.id ? null : room.id));
                        }}
                      >
                        ⋯
                      </button>
                      {isMenuOpen && !isEditing && (
                        <div className="room-sidebar-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="room-sidebar-menu-item"
                            onClick={() => startRename(room)}
                          >
                            เปลี่ยนชื่อ
                          </button>
                          <button
                            type="button"
                            className="room-sidebar-menu-item is-danger"
                            onClick={async () => {
                              setOpenMenuRoomId(null);
                              await onTrashRoom(room.id);
                            }}
                          >
                            ย้ายไปถังขยะ
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <form
                      className="room-sidebar-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitRename(room.id);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        className="room-sidebar-rename-input"
                        aria-label={`ชื่อใหม่ของห้อง ${room.title}`}
                        autoFocus
                      />
                      <div className="room-sidebar-rename-actions">
                        <button type="submit" className="room-sidebar-inline-button primary">
                          บันทึก
                        </button>
                        <button type="button" className="room-sidebar-inline-button" onClick={cancelRename}>
                          ยกเลิก
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {summary && <p className="room-sidebar-summary">{summary}</p>}

                      <div className="room-sidebar-footnote">
                        <span>{scenarioLabel(room)}</span>
                        {room.lastKnownGoodNextMoves[0] && (
                          <span className="room-sidebar-footnote-next">เริ่ม: {room.lastKnownGoodNextMoves[0]}</span>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {!collapsed && trashedRooms.length > 0 && (
        <section className="room-sidebar-trash">
          <div className="room-sidebar-trash-header">
            <p className="studio-eyebrow">Trash</p>
            <span className="room-sidebar-trash-count">{trashedRooms.length}</span>
          </div>
          <div className="room-sidebar-trash-list">
            {trashedRooms.map((room) => (
              <div key={room.id} className="room-sidebar-trash-item">
                <div className="room-sidebar-trash-copy">
                  <strong style={{ fontSize: '0.9rem', lineHeight: 1.35 }}>{room.title}</strong>
                  <span className="room-sidebar-status-line">ย้ายออกจากรายการหลักแล้ว</span>
                </div>
                <button
                  type="button"
                  className="room-sidebar-inline-button"
                  onClick={() => void onRestoreRoom(room.id)}
                >
                  กู้คืน
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
