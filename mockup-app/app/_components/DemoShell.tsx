"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { getEvidenceForRoom, type DemoEvidence } from "../mock/evidence";
import {
  canonicalRoomId,
  getCanonicalRoom,
  getMockRoom,
  getRoomAnchorHref,
  mockRooms,
  sampleContextText,
  type DemoActionStep,
  type DemoProjectState,
  type DemoRoom,
  type DemoRoomType,
} from "../mock/rooms";
import styles from "./MindDemoMockup.module.css";

type AskMindMode = "help" | "scaffold" | "rescue";

const activeRoomStorageKey = "mind.mockup.activeRoomId";
const activeRoomStorageEvent = "mind.mockup.activeRoomChanged";
const latestActionStorageKey = "mind.mockup.latestAction";
const latestActionStorageEvent = "mind.mockup.latestActionChanged";
const scaffoldStateStorageKey = "mind.mockup.scaffoldState";
const scaffoldStateStorageEvent = "mind.mockup.scaffoldStateChanged";

type ScaffoldRoomState = {
  completedStepIds: string[];
  savedAt: string;
  latestAction: string | null;
};

type ScaffoldStateStore = Record<string, ScaffoldRoomState>;

type ChecklistState = {
  roomCreated: boolean;
  evidenceAdded: boolean;
  summarized: boolean;
};

const completedChecklist: ChecklistState = {
  roomCreated: true,
  evidenceAdded: true,
  summarized: true,
};

const roomTypeLabels: Record<DemoRoomType, string> = {
  client_project: "โปรเจกต์ลูกค้า",
  research: "งานวิจัย",
  thesis: "Thesis",
  other: "อื่นๆ",
};

const projectStates: Array<{ id: DemoProjectState; label: string }> = [
  { id: "intake", label: "Intake" },
  { id: "scaffolding", label: "Scaffolding" },
  { id: "active", label: "Active" },
  { id: "stuck", label: "Stuck" },
  { id: "review", label: "Review" },
];

const projectStatePrompts: Record<DemoProjectState, string> = {
  intake: "เริ่ม",
  scaffolding: "ทำต่อทีละขั้น",
  active: "กำลังทำ",
  stuck: "ช่วยตอนติด",
  review: "ทบทวนก่อนส่ง",
};

const projectStateLabel = Object.fromEntries(projectStates.map((state) => [state.id, state.label])) as Record<
  DemoProjectState,
  string
>;

function getActiveRoomSnapshot() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeRoomStorageKey);
}

function subscribeToActiveRoom(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(activeRoomStorageEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(activeRoomStorageEvent, callback);
  };
}

function rememberActiveRoom(roomId: string) {
  window.localStorage.setItem(activeRoomStorageKey, roomId);
  window.dispatchEvent(new Event(activeRoomStorageEvent));
}

function getLatestActionSnapshot() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(latestActionStorageKey);
}

function subscribeToLatestAction(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(latestActionStorageEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(latestActionStorageEvent, callback);
  };
}

function rememberLatestAction(action: string) {
  window.localStorage.setItem(latestActionStorageKey, action);
  window.dispatchEvent(new Event(latestActionStorageEvent));
}

function parseScaffoldStateStore(rawValue: string | null): ScaffoldStateStore {
  try {
    if (!rawValue) return {};
    return JSON.parse(rawValue) as ScaffoldStateStore;
  } catch {
    return {};
  }
}

function getScaffoldStateSnapshot() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(scaffoldStateStorageKey) ?? "";
}

function subscribeToScaffoldState(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(scaffoldStateStorageEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(scaffoldStateStorageEvent, callback);
  };
}

function rememberRoomScaffoldState(roomId: string, state: ScaffoldRoomState) {
  const nextStore = {
    ...parseScaffoldStateStore(window.localStorage.getItem(scaffoldStateStorageKey)),
    [roomId]: state,
  };

  window.localStorage.setItem(scaffoldStateStorageKey, JSON.stringify(nextStore));
  window.dispatchEvent(new Event(scaffoldStateStorageEvent));
}

function getRoomShellKicker(room?: DemoRoom) {
  if (!room) return "เริ่ม";
  return projectStatePrompts[room.projectState];
}

function getRoomSidebarSummary(room: DemoRoom) {
  return projectStateLabel[room.projectState];
}

function getRoomInspectorSummary(room: DemoRoom, latestAction: string | null) {
  return {
    kicker: "Studio / ตัวช่วย",
    title: "กลับมาดูสถานะ",
    rows: [
      `Room memory: ${room.memoryLabel}`,
      `State: ${projectStateLabel[room.projectState]}`,
      latestAction ? `Latest action: ${latestAction}` : `Updated: ${room.lastUpdatedFromEvidence}`,
    ],
    primaryHref: getRoomAnchorHref(room.id, "next-steps"),
    primaryLabel: "ดู next move",
    secondaryHref: getRoomAnchorHref(room.id, "evidence"),
    secondaryLabel: "หลักฐาน",
  };
}

function getRoomTopbarSummary(room: DemoRoom) {
  const actionCopy = room.summary.nextSteps[0]?.text ?? "เริ่มจาก next move ของห้องนี้";
  return `${projectStateLabel[room.projectState]} · ${actionCopy}`;
}

export function FirstTimeLanding() {
  const router = useRouter();
  const [contextText, setContextText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusMode, setFocusMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const savedRoomId = useSyncExternalStore(subscribeToActiveRoom, getActiveRoomSnapshot, () => null);
  const latestAction = useSyncExternalStore(subscribeToLatestAction, getLatestActionSnapshot, () => null);
  const activeRoom = savedRoomId ? getMockRoom(savedRoomId) : null;
  const featuredRooms = mockRooms.slice(0, 3);

  const useSample = () => {
    setContextText(sampleContextText);
  };

  const createRoomFromDump = () => {
    if (!contextText.trim() || isLoading) return;
    setIsLoading(true);
    rememberActiveRoom(canonicalRoomId);
    window.setTimeout(() => {
      router.push(`/rooms/${canonicalRoomId}`);
    }, 1350);
  };

  return (
    <main className="container">
      <div className={styles.demoShell}>
        <header className={styles.topbar}>
          <Link href="/" className={`${styles.backButton} ${styles.linkReset}`} aria-label="กลับหน้าแรก">
            ←
          </Link>

          <div className={styles.landingTopbarTitle}>
            <div className={styles.healthRail}>
              <span className={styles.healthDot} />
              <span className={styles.healthLabel}>AI พร้อม</span>
              <strong>Gemma พร้อมแล้ว</strong>
            </div>
            <h1>ห้องงานลูกค้า</h1>
          </div>

          <div className={styles.topbarActions}>
            <button type="button" className={styles.secondaryLink} onClick={() => setFocusMode((value) => !value)}>
              {focusMode ? "โหมดละเอียด" : "โหมดโฟกัส"}
            </button>
            <button type="button" className={styles.secondaryLink} onClick={() => setSidebarCollapsed((value) => !value)}>
              {sidebarCollapsed ? "ขยาย sidebar" : "หุบ sidebar"}
            </button>
            <Link href="/settings" className={`${styles.secondaryLink} ${styles.linkReset}`}>
              เครื่องมือ
            </Link>
          </div>
        </header>

        <div
          className={`${styles.roomShell} ${focusMode ? styles.roomShellFocus : ""} ${sidebarCollapsed ? styles.roomShellCollapsed : ""}`}
          data-focus-mode={focusMode ? "on" : "off"}
          data-sidebar-collapsed={sidebarCollapsed ? "on" : "off"}
        >
          <aside className={styles.leftRail}>
            <div className={styles.railHero}>
              <p className={styles.kicker}>Rooms</p>
              <h2>ห้องงานลูกค้า</h2>
              <Link href="/rooms/new" className={`${styles.primaryLink} ${styles.linkReset}`}>
                ห้องใหม่
              </Link>
            </div>

            <div className={styles.railList}>
              {featuredRooms.map((room, index) => {
                const isActive = room.id === activeRoom?.id;
                return (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className={`${styles.demoRailRoom} ${isActive ? styles.demoRailRoomActive : ""} ${styles.linkReset}`}
                  >
                    <span className={styles.demoRailIndex}>{index + 1}</span>
                    <span className={styles.demoRailBody}>
                      <strong>{room.title}</strong>
                      <span>{room.memoryLabel}</span>
                    </span>
                    <span className={styles.demoRailChip}>{room.currentStepLabel}</span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <section className={styles.mainStage}>
            <div className={styles.surfaceStack}>
              <div className={styles.hintBanner}>
                วางอีเมล โน้ต แชต หรือ brief ที่ค้างอยู่ แล้วให้ MIND สร้างห้องงานพร้อมสรุปสถานะให้ทันที
              </div>

              <section className={styles.intakeCard} aria-label="วาง context เพื่อสร้างห้องงาน">
                <div className={styles.sectionHeader}>
                  <p className={styles.kicker}>Paste client chaos</p>
                  <h2>Paste client chaos. MIND turns it into a Room.</h2>
                  <p className={styles.inlineCopy}>ครั้งต่อไปที่คุณเปิดห้องนี้ MIND จะเล่าให้ฟังว่าเราค้างตรงไหน</p>
                </div>

                {isLoading ? (
                  <MindLoadingState label="MIND กำลังสร้างห้องและสรุปจาก evidence..." compact />
                ) : (
                  <>
                    <label className={styles.fieldGroup}>
                      <span>
                        Paste client chaos here <Tooltip label="Room" text="ห้อง = โปรเจ็กต์/ลูกค้าหนึ่งงาน ที่ MIND จะจำทุกอย่างให้" />
                      </span>
                      <textarea
                        className={styles.landingTextarea}
                        value={contextText}
                        onChange={(event) => setContextText(event.target.value)}
                        placeholder="วางอีเมล โน้ต แชต หรือ brief ที่ค้างอยู่..."
                        rows={10}
                      />
                    </label>

                    <div className={styles.actionRow}>
                      <button type="button" className={styles.secondaryButton} onClick={useSample}>
                        ใช้ตัวอย่าง
                      </button>
                      <button type="button" className={styles.primaryButton} onClick={createRoomFromDump} disabled={!contextText.trim()}>
                        ให้ MIND สร้างห้องและสรุปให้
                      </button>
                      <Link href="/rooms/new" className={`${styles.secondaryLink} ${styles.linkReset}`}>
                        สร้างแบบฟอร์มละเอียด
                      </Link>
                    </div>
                  </>
                )}
              </section>

              {activeRoom ? (
                <div className={styles.continuePanel} aria-label="ห้องล่าสุด">
                  <p className={styles.kicker}>Continue your room</p>
                  <h2>{activeRoom.title}</h2>
                  <p className={styles.continuePanelCopy}>กลับเข้า memory, state, evidence และ next step ของห้องล่าสุดได้ทันที</p>
                  {latestAction && <p className={styles.latestActionLine}>Latest action: {latestAction}</p>}
                  <div className={styles.previewRows}>
                    <Link href={getRoomAnchorHref(activeRoom.id, "memory")} className={`${styles.memoryChipLink} ${styles.linkReset}`}>
                      Room memory
                    </Link>
                    <Link href={getRoomAnchorHref(activeRoom.id, "state")} className={`${styles.memoryChipLink} ${styles.linkReset}`}>
                      State
                    </Link>
                    <Link href={getRoomAnchorHref(activeRoom.id, "evidence")} className={`${styles.memoryChipLink} ${styles.linkReset}`}>
                      Evidence
                    </Link>
                    <Link href={getRoomAnchorHref(activeRoom.id, "next-steps")} className={`${styles.memoryChipLink} ${styles.linkReset}`}>
                      Next step
                    </Link>
                  </div>
                  <Link href={`/rooms/${activeRoom.id}`} className={`${styles.primaryLink} ${styles.linkReset}`}>
                    กลับเข้าห้องงานนี้
                  </Link>
                </div>
              ) : (
                <div className={styles.previewPanel} aria-label="สิ่งที่ MIND จะสร้างให้">
                  <p className={styles.kicker}>What MIND remembers</p>
                  <h2>Room memory, state, evidence, next step</h2>
                  <div className={styles.previewRows}>
                    <span>Room memory: Client A redesign scope</span>
                    <span>State: Scaffolding</span>
                    <span>Evidence-backed rescue if stuck</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className={styles.rightRail}>
            <div className={styles.previewPanel}>
              <p className={styles.kicker}>Studio / ตัวช่วย</p>
              <h2>ดูบริบทเดิมแล้วค่อยไปต่อ</h2>
              <div className={styles.previewRows}>
                <span>Room memory: Client A redesign scope</span>
                <span>State: Scaffolding</span>
                <span>Latest action: {latestAction || "ยังไม่มี save point ล่าสุด"}</span>
              </div>
            </div>

            <div className={styles.continuePanel}>
              <p className={styles.kicker}>System hint</p>
              <p className={styles.continuePanelCopy}>
                หน้าแรกนี้ทำหน้าที่เหมือน control room: วาง context, ดู memory ล่าสุด, แล้วกลับเข้าห้องเดิมได้เร็ว
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function RoomsDashboard() {
  return (
    <DemoFrame variant="dashboard" checklist={{ roomCreated: true, evidenceAdded: true, summarized: false }}>
      <section className={styles.surfaceStack}>
        <div className={styles.heroPanel}>
          <p className={styles.kicker}>Rooms</p>
          <h2>ห้องงานของคุณ</h2>
          <p>เลือกห้องเพื่อดูว่า MIND จำอะไรไว้ และควรเริ่มทำอะไรต่อ</p>
          <div className={styles.actionRow}>
            <Link href="/rooms/new" className={`${styles.primaryLink} ${styles.linkReset}`}>
              สร้างห้องใหม่
            </Link>
          </div>
        </div>

        <div className={styles.roomGrid}>
          {mockRooms.map((room) => (
            <Link key={room.id} href={`/rooms/${room.id}`} className={`${styles.roomCard} ${styles.linkReset}`}>
              <span className={styles.softPill}>{roomTypeLabels[room.type]}</span>
              <h3>{room.title}</h3>
              <p>{room.summary.context}</p>
              <span className={styles.cardRoute}>เปิดห้อง →</span>
            </Link>
          ))}
        </div>
      </section>
    </DemoFrame>
  );
}

export function CreateRoomForm() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState<DemoRoomType>("client_project");
  const [contextText, setContextText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const hasEvidence = contextText.trim().length > 0;

  const useSample = () => {
    setRoomName("Client A – Website Redesign");
    setRoomType("client_project");
    setContextText(sampleContextText);
  };

  const createRoom = () => {
    if (isLoading) return;
    setIsLoading(true);
    rememberActiveRoom(canonicalRoomId);
    window.setTimeout(() => {
      router.push(`/rooms/${canonicalRoomId}`);
    }, 1400);
  };

  return (
    <DemoFrame variant="compose" checklist={{ roomCreated: false, evidenceAdded: hasEvidence, summarized: false }} compact>
      <section className={styles.createLayout}>
        <div className={styles.createCard}>
          <div className={styles.sectionHeader}>
            <p className={styles.kicker}>Create Room</p>
            <h1>สร้างห้องงานแรก</h1>
            <p>ใส่ context สั้น ๆ แล้วให้ MIND สรุปงานนี้ให้เห็นทันที</p>
          </div>

          <label className={styles.fieldGroup}>
            <span>
              Room name <Tooltip label="Room" text="ห้อง = โปรเจ็กต์/ลูกค้าหนึ่งงาน ที่ MIND จะจำทุกอย่างให้" />
            </span>
            <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Client A – Website Redesign" />
          </label>

          <label className={styles.fieldGroup}>
            <span>Room type/template</span>
            <select value={roomType} onChange={(event) => setRoomType(event.target.value as DemoRoomType)}>
              <option value="client_project">โปรเจกต์ลูกค้า</option>
              <option value="research">งานวิจัย</option>
              <option value="thesis">Thesis</option>
              <option value="other">อื่นๆ</option>
            </select>
          </label>

          <label className={styles.fieldGroup}>
            <span>
              วางข้อความตัวอย่าง <Tooltip label="Evidence" text="Evidence = ข้อความ/ไฟล์/โน้ตที่ใช้เป็นหลักฐานว่างานนี้ทำอะไรไปแล้ว" />
            </span>
            <textarea
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder="วางอีเมล โน้ต หรือ brief ที่ค้างอยู่..."
              rows={7}
            />
          </label>

          <div className={styles.actionRow}>
            <button type="button" className={styles.secondaryButton} onClick={useSample}>
              ใช้ตัวอย่างให้ลองก่อน
            </button>
            <button type="button" className={styles.primaryButton} onClick={createRoom} disabled={!hasEvidence || isLoading}>
              สร้างห้องและให้ MIND สรุป
            </button>
          </div>
        </div>

        <aside className={styles.loadingAside}>
          {isLoading ? (
            <MindLoadingState label="MIND กำลังอ่าน context ในห้องนี้..." />
          ) : (
            <div className={styles.tinyGuide}>
              <p className={styles.kicker}>What happens next</p>
              <h2>หลังจากสร้างห้อง</h2>
              <p>MIND จะจำ evidence นี้ไว้ในห้องเดียว แล้วสร้าง summary, status และ next steps แบบ mock ให้ดูทันที</p>
            </div>
          )}
        </aside>
      </section>
    </DemoFrame>
  );
}

export function RoomDetailOnboarding({ room, evidence }: { room: DemoRoom; evidence: DemoEvidence[] }) {
  const [askMode, setAskMode] = useState<AskMindMode | null>(null);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    rememberActiveRoom(room.id);
  }, [room.id]);

  const revealEvidence = (evidenceId: string) => {
    setHighlightedEvidenceId(evidenceId);
    window.setTimeout(() => setHighlightedEvidenceId(null), 1700);
    window.requestAnimationFrame(() => {
      document.getElementById(`evidence-${evidenceId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  return (
    <DemoFrame variant="room" room={room} checklist={completedChecklist} highlightedEvidenceId={highlightedEvidenceId}>
      <section className={styles.surfaceStack}>
        <div className={styles.reentryBanner}>
          <span className={styles.reentryLabel}>Morning brief / Re-entry</span>
          <span className={styles.reentryCopy}>
            กลับมาที่งานนี้แล้ว · ตอนนี้อยู่ที่ {projectStateLabel[room.projectState]} · เริ่มจาก next move ด้านล่าง
          </span>
        </div>

        <RoomSummaryCard room={room} evidence={evidence} onAskMind={setAskMode} onRevealEvidence={revealEvidence} />
      </section>

      {askMode && <AskMindModal mode={askMode} onClose={() => setAskMode(null)} />}
    </DemoFrame>
  );
}

function DemoFrame({
  children,
  room = getCanonicalRoom(),
  checklist,
  compact = false,
  highlightedEvidenceId = null,
  variant = "room",
}: {
  children: ReactNode;
  room?: DemoRoom;
  checklist: ChecklistState;
  compact?: boolean;
  highlightedEvidenceId?: string | null;
  variant?: "dashboard" | "room" | "compose";
}) {
  const evidence = getEvidenceForRoom(room.id);
  const [focusMode, setFocusMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const latestAction = useSyncExternalStore(subscribeToLatestAction, getLatestActionSnapshot, () => null);
  const activeRoomId = useSyncExternalStore(subscribeToActiveRoom, getActiveRoomSnapshot, () => null) ?? room.id;
  const activeRoom = getMockRoom(activeRoomId) ?? room;
  const inspectorRoom = variant === "dashboard" ? activeRoom : room;
  const inspector = getRoomInspectorSummary(inspectorRoom, latestAction);
  const topbarKicker = variant === "compose" ? "MIND first-time demo" : variant === "dashboard" ? "Rooms" : getRoomShellKicker(room);
  const topbarTitle = variant === "compose" ? "สร้างห้องแรกของคุณ" : variant === "dashboard" ? "ห้องงานลูกค้า" : room.title;
  const topbarSubtitle =
    variant === "room"
      ? getRoomTopbarSummary(room)
      : variant === "dashboard"
        ? "เลือกห้องแล้วกลับเข้าบริบทงานต่อได้ทันที"
        : undefined;

  return (
    <main className="container">
      <div className={styles.demoShell}>
        <header className={styles.topbar}>
          <Link href="/" className={`${styles.backButton} ${styles.linkReset}`} aria-label="กลับหน้าแรก">
            ←
          </Link>
          <div className={styles.topbarTitle}>
            <div className={styles.healthRail}>
              <span className={styles.healthDot} />
              <span className={styles.healthLabel}>AI พร้อม</span>
              <strong>Gemma พร้อมแล้ว</strong>
            </div>
            <p className={styles.kicker}>{topbarKicker}</p>
            <h1>{topbarTitle}</h1>
            {topbarSubtitle && <p className={styles.topbarSubtitle}>{topbarSubtitle}</p>}
          </div>
          <div className={styles.topbarActions}>
            <button type="button" className={styles.secondaryLink} onClick={() => setFocusMode((value) => !value)}>
              {focusMode ? "โหมดรายละเอียด" : "โหมดโฟกัส"}
            </button>
            <button type="button" className={styles.secondaryLink} onClick={() => setSidebarCollapsed((value) => !value)}>
              {sidebarCollapsed ? "ขยาย sidebar" : "หุบ sidebar"}
            </button>
            <Link href="/settings" className={`${styles.secondaryLink} ${styles.linkReset}`}>
              เครื่องมือ
            </Link>
          </div>
        </header>

        <div
          className={`${compact ? styles.singleColumnShell : styles.roomShell} ${focusMode ? styles.roomShellFocus : ""} ${
            sidebarCollapsed ? styles.roomShellCollapsed : ""
          }`}
          data-focus-mode={focusMode ? "on" : "off"}
          data-sidebar-collapsed={sidebarCollapsed ? "on" : "off"}
        >
          {!compact && (
            <aside className={styles.leftRail}>
              <div className={styles.railHero}>
                <p className={styles.kicker}>Rooms</p>
                <h2>ห้องงานลูกค้า</h2>
                <p className={styles.railHeroCopy}>{projectStateLabel[activeRoom.projectState]}</p>
                <Link href="/rooms/new" className={`${styles.primaryLink} ${styles.linkReset}`}>
                  ห้องใหม่
                </Link>
              </div>

              <div className={styles.railList}>
                {mockRooms.map((item, index) => {
                  const isActive = item.id === activeRoom.id;
                  return (
                    <Link
                      key={item.id}
                      href={`/rooms/${item.id}`}
                      className={`${styles.demoRailRoom} ${isActive ? styles.demoRailRoomActive : ""} ${styles.linkReset}`}
                    >
                      <span className={styles.demoRailIndex}>{index + 1}</span>
                      <span className={styles.demoRailBody}>
                        <strong>{item.title}</strong>
                        <span>{getRoomSidebarSummary(item)}</span>
                      </span>
                      <span className={styles.demoRailChip}>{item.currentStepLabel}</span>
                    </Link>
                  );
                })}
              </div>
            </aside>
          )}

          <div className={styles.mainStage}>{children}</div>

          {!compact && (
            <aside className={`${styles.rightRail} ${styles.anchorTarget}`} id="evidence">
              <div className={styles.studioSnapshotCard}>
                <p className={styles.kicker}>{inspector.kicker}</p>
                <h2>{inspector.title}</h2>
                <div className={styles.studioSnapshotRows}>
                  {inspector.rows.map((row) => (
                    <span key={row}>{row}</span>
                  ))}
                </div>
                <div className={styles.studioSnapshotActions}>
                  <Link href={inspector.primaryHref} className={`${styles.primaryLink} ${styles.linkReset}`}>
                    {inspector.primaryLabel}
                  </Link>
                  <Link href={inspector.secondaryHref} className={`${styles.secondaryLink} ${styles.linkReset}`}>
                    {inspector.secondaryLabel}
                  </Link>
                </div>
              </div>

              <EvidenceAttachmentPanel evidence={evidence} highlightedEvidenceId={highlightedEvidenceId ?? null} />
            </aside>
          )}
        </div>

        <OnboardingChecklist state={checklist} />
      </div>
    </main>
  );
}

export function RoomSummaryCard({
  room,
  evidence,
  onAskMind,
  onRevealEvidence,
}: {
  room: DemoRoom;
  evidence: DemoEvidence[];
  onAskMind: (mode: AskMindMode) => void;
  onRevealEvidence: (evidenceId: string) => void;
}) {
  const latestAction = useSyncExternalStore(subscribeToLatestAction, getLatestActionSnapshot, () => null);

  return (
    <article className={`${styles.summaryCard} ${styles.anchorTarget}`} id="memory">
      <div className={styles.summaryHeader}>
        <div>
          <p className={styles.kicker}>Room Summary</p>
          <h2>{room.title}</h2>
        </div>
        <span className={styles.stepBadge}>{room.currentStepLabel}</span>
      </div>

      <div className={styles.memoryStrip} aria-label="Room memory">
        <span>{room.memoryLabel}</span>
        <span>Evidence: {evidence.length} items</span>
        <span>Updated: {room.lastUpdatedFromEvidence}</span>
        {latestAction && <span>Latest action: {latestAction}</span>}
      </div>

      <ProjectStateMachine activeState={room.projectState} />

      <details className={styles.summarySupport}>
        <summary>ดูบริบทที่สรุปได้</summary>
        <div className={styles.summarySupportBody}>
          <p className={styles.summaryLead}>{room.summary.currentStatus}</p>
        </div>
      </details>

      <section className={`${styles.nextSteps} ${styles.anchorTarget}`} id="next-steps">
        <h3>
          ควรทำอะไรต่อ <Tooltip label="Next steps" text="Next steps = สิ่งที่ MIND แนะนำให้คุณทำต่อจากบริบทในห้องนี้" />
        </h3>
        <NextStepScaffold room={room} evidence={evidence} onAskMind={onAskMind} onRevealEvidence={onRevealEvidence} />
      </section>
    </article>
  );
}

function NextStepScaffold({
  room,
  evidence,
  onAskMind,
  onRevealEvidence,
}: {
  room: DemoRoom;
  evidence: DemoEvidence[];
  onAskMind: (mode: AskMindMode) => void;
  onRevealEvidence: (evidenceId: string) => void;
}) {
  const steps = room.summary.nextSteps;
  const scaffoldStateRaw = useSyncExternalStore(subscribeToScaffoldState, getScaffoldStateSnapshot, () => "");
  const savedScaffoldState = parseScaffoldStateStore(scaffoldStateRaw)[room.id] ?? null;
  const validStepIds = new Set(steps.map((step) => step.id));
  const completedStepIds = savedScaffoldState?.completedStepIds.filter((stepId) => validStepIds.has(stepId)) ?? [];
  const isComplete = completedStepIds.length >= steps.length;
  const activeStepIndex = Math.min(completedStepIds.length, Math.max(steps.length - 1, 0));
  const activeStep = steps[activeStepIndex];
  const progressLabel = isComplete ? `${steps.length} / ${steps.length}` : `${activeStepIndex + 1} / ${steps.length}`;

  const completeActiveStep = () => {
    if (!activeStep || completedStepIds.includes(activeStep.id)) return;

    const nextCompletedStepIds = [...completedStepIds, activeStep.id];
    const nextIsComplete = nextCompletedStepIds.length >= steps.length;
    const nextLatestAction = nextIsComplete
      ? `Completed scope confirmation scaffold · ${room.lastUpdatedFromEvidence}`
      : `ทำเสร็จ: ${activeStep.text}`;

    rememberLatestAction(nextLatestAction);
    rememberRoomScaffoldState(room.id, {
      completedStepIds: nextCompletedStepIds,
      savedAt: room.lastUpdatedFromEvidence,
      latestAction: nextLatestAction,
    });
  };

  const resetScaffold = () => {
    rememberRoomScaffoldState(room.id, {
      completedStepIds: [],
      savedAt: room.lastUpdatedFromEvidence,
      latestAction: null,
    });
  };

  if (isComplete) {
    return (
      <div className={styles.scaffoldPanel} aria-label="Scaffold complete">
        <div className={styles.scaffoldHeader}>
          <div>
            <p className={styles.kicker}>Save point</p>
            <strong>ทำครบ {steps.length} ขั้นตอนของรอบนี้แล้ว</strong>
          </div>
          <span className={styles.stepBadge}>{progressLabel}</span>
        </div>
        <p className={styles.scaffoldCopy}>Save point ล่าสุด · {room.lastUpdatedFromEvidence}</p>
        <button type="button" className={styles.secondaryButton} onClick={resetScaffold}>
          เริ่มรอบใหม่
        </button>
        <div className={styles.stepListCompact}>
          {steps.map((step) => (
            <StepRow key={step.id} step={step} evidence={evidence} isDone onRevealEvidence={onRevealEvidence} />
          ))}
        </div>
      </div>
    );
  }

  if (!activeStep) return null;

  return (
    <ActiveStepScaffold
      key={activeStep.id}
      activeStep={activeStep}
      steps={steps}
      evidence={evidence}
      progressLabel={progressLabel}
      completedStepIds={completedStepIds}
      onAskMind={onAskMind}
      onRevealEvidence={onRevealEvidence}
      onComplete={completeActiveStep}
    />
  );
}

function ActiveStepScaffold({
  activeStep,
  steps,
  evidence,
  progressLabel,
  completedStepIds,
  onAskMind,
  onRevealEvidence,
  onComplete,
}: {
  activeStep: DemoActionStep;
  steps: DemoActionStep[];
  evidence: DemoEvidence[];
  progressLabel: string;
  completedStepIds: string[];
  onAskMind: (mode: AskMindMode) => void;
  onRevealEvidence: (evidenceId: string) => void;
  onComplete: () => void;
}) {
  const [smallerStep, setSmallerStep] = useState<string | null>(null);
  const [stepMode, setStepMode] = useState<"suggested" | "active">("suggested");
  const [alternativeIndex, setAlternativeIndex] = useState(0);
  const alternativeOptions = activeStep.alternatives;
  const isShowingAlternative = alternativeIndex > 0 && Boolean(alternativeOptions[alternativeIndex - 1]);
  const displayedStepTitle = isShowingAlternative ? alternativeOptions[alternativeIndex - 1] : activeStep.text;
  const displayedRationale = isShowingAlternative
    ? "ทางเลือกนี้ยังขยับงานเดียวกัน แต่เปลี่ยนวิธีเริ่มให้เบากับจังหวะตอนนี้มากขึ้น"
    : activeStep.rationale;

  return (
    <div className={styles.scaffoldPanel} aria-label="Next step scaffold">
      <div className={styles.nextMoveCard}>
        <div>
          <p className={styles.kicker}>The Next Move</p>
          <strong>{displayedStepTitle}</strong>
          <p>{displayedRationale}</p>
        </div>
        <span className={styles.stepBadge}>{progressLabel}</span>
      </div>

      <StepEvidenceChips step={activeStep} evidence={evidence} onRevealEvidence={onRevealEvidence} />

      {smallerStep && (
        <div className={styles.refinementBox}>
          <p className={styles.kicker}>Make it smaller</p>
          <strong>{smallerStep}</strong>
        </div>
      )}

      <div className={styles.scaffoldActions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            if (stepMode === "suggested") {
              setStepMode("active");
              return;
            }

            onComplete();
          }}
        >
          {stepMode === "suggested" ? "ใช้ก้าวนี้" : "เสร็จแล้ว"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            if (alternativeOptions.length === 0) return;
            setAlternativeIndex((current) => (current + 1) % (alternativeOptions.length + 1));
            setStepMode("suggested");
          }}
          disabled={alternativeOptions.length === 0}
        >
          ลองอีกทาง
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => setSmallerStep(activeStep.smallerStep)}>
          ย่อยให้เล็กลง
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => onAskMind("scaffold")}>
          ดู micro-steps
        </button>
        <button type="button" className={`${styles.secondaryButton} ${styles.rescueButton}`} onClick={() => onAskMind("rescue")}>
          ฉันติดอยู่
        </button>
      </div>

      <details className={styles.stepDetails}>
        <summary>ทางเลือกสำรอง</summary>
        <div className={styles.alternativeList}>
          {activeStep.alternatives.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </details>

      <details className={styles.stepDetails}>
        <summary>ดูขั้นตอนทั้งหมด</summary>
        <div className={styles.stepListCompact}>
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              evidence={evidence}
              isActive={step.id === activeStep.id}
              isDone={completedStepIds.includes(step.id)}
              onRevealEvidence={onRevealEvidence}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function StepRow({
  step,
  evidence,
  isActive = false,
  isDone = false,
  onRevealEvidence,
}: {
  step: DemoActionStep;
  evidence: DemoEvidence[];
  isActive?: boolean;
  isDone?: boolean;
  onRevealEvidence?: (evidenceId: string) => void;
}) {
  return (
    <div className={`${styles.stepRow} ${isActive ? styles.stepRowActive : ""} ${isDone ? styles.stepRowDone : ""}`}>
      <span className={styles.stepStatusDot}>{isDone ? "✓" : ""}</span>
      <div>
        <strong>{step.text}</strong>
        <p className={styles.stepRationale}>{step.rationale}</p>
        <StepEvidenceChips step={step} evidence={evidence} compact onRevealEvidence={onRevealEvidence} />
      </div>
    </div>
  );
}

function StepEvidenceChips({
  step,
  evidence,
  compact = false,
  onRevealEvidence,
}: {
  step: DemoActionStep;
  evidence: DemoEvidence[];
  compact?: boolean;
  onRevealEvidence?: (evidenceId: string) => void;
}) {
  const linkedEvidence = step.evidenceIds
    .map((evidenceId) => evidence.find((item) => item.id === evidenceId))
    .filter((item): item is DemoEvidence => Boolean(item));

  return (
    <div className={`${styles.stepMetaRow} ${compact ? styles.stepMetaRowCompact : ""}`}>
      <span>{step.confidenceLabel}</span>
      <span>{step.citationLabel}</span>
      {linkedEvidence.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.citationButton}
          onClick={() => onRevealEvidence?.(item.id)}
        >
          {item.title}
        </button>
      ))}
      {step.isManualOnly && <span>ทำด้วยมือเท่านั้น</span>}
    </div>
  );
}

function ProjectStateMachine({ activeState }: { activeState: DemoProjectState }) {
  return (
    <section className={`${styles.projectStateBlock} ${styles.anchorTarget}`} id="state" aria-label="Project state">
      <div className={styles.stateMachine}>
        {projectStates.map((state) => {
          const isActive = state.id === activeState;
          return (
            <span key={state.id} className={`${styles.statePill} ${isActive ? styles.statePillActive : ""}`} aria-current={isActive ? "step" : undefined}>
              <span className={styles.stateDot} />
              {state.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function getEvidenceKindLabel(kind: DemoEvidence["kind"]) {
  const labels: Record<DemoEvidence["kind"], string> = {
    email: "email",
    file: "file",
    note: "note",
    screenshot: "shot",
    summary: "save",
  };
  return labels[kind];
}

function getEvidenceFreshnessLabel(freshness: DemoEvidence["freshness"]) {
  const labels: Record<DemoEvidence["freshness"], string> = {
    new: "new",
    used: "used",
    stale: "stale",
  };
  return labels[freshness];
}

function EvidenceAttachmentPanel({
  evidence,
  highlightedEvidenceId,
}: {
  evidence: DemoEvidence[];
  highlightedEvidenceId: string | null;
}) {
  const [manualExpandedEvidenceId, setManualExpandedEvidenceId] = useState<string | null>(evidence[0]?.id ?? null);
  const expandedEvidenceId = highlightedEvidenceId ?? manualExpandedEvidenceId;

  return (
    <div className={styles.attachmentPanel}>
      <div className={styles.inspectorHeader}>
        <p className={styles.kicker}>Context</p>
        <h2>หลักฐานที่ใช้สรุป</h2>
        <p>{evidence.length} รายการในห้องนี้</p>
      </div>

      <div className={styles.attachmentList}>
        {evidence.map((item) => {
          const isExpanded = expandedEvidenceId === item.id;
          const isHighlighted = highlightedEvidenceId === item.id;
          return (
            <button
              key={item.id}
              id={`evidence-${item.id}`}
              type="button"
              className={`${styles.attachmentRow} ${isExpanded ? styles.attachmentRowActive : ""} ${isHighlighted ? styles.attachmentRowHighlighted : ""}`}
              aria-expanded={isExpanded}
              onClick={() => setManualExpandedEvidenceId(isExpanded ? null : item.id)}
            >
              <span className={styles.attachmentIcon}>{getEvidenceKindLabel(item.kind)}</span>
              <span className={styles.attachmentBody}>
                <span className={styles.attachmentTitle}>{item.title}</span>
                <span className={styles.attachmentSource}>{item.sourceLabel}</span>
                {isExpanded && <span className={styles.attachmentExcerpt}>{item.excerpt}</span>}
              </span>
              <span className={`${styles.freshnessChip} ${styles[`freshness_${item.freshness}`]}`}>
                {getEvidenceFreshnessLabel(item.freshness)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EvidenceList({ evidence }: { evidence: DemoEvidence[] }) {
  return (
    <section className={`${styles.evidenceSection} ${styles.anchorTarget}`} id="evidence">
      <div className={styles.sectionHeaderInline}>
        <div>
          <p className={styles.kicker}>Evidence in this room</p>
          <h2>
            หลักฐานที่ MIND ใช้สรุป <Tooltip label="Evidence" text="Evidence = ข้อความ/ไฟล์/โน้ตที่ใช้เป็นหลักฐานว่างานนี้ทำอะไรไปแล้ว" />
          </h2>
        </div>
      </div>
      <div className={styles.compactEvidenceList}>
        {evidence.map((item) => (
          <article key={item.id} className={styles.compactEvidenceItem}>
            <span className={styles.softPill}>{item.kind}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.excerpt}</p>
              <small>{item.sourceLabel}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OnboardingChecklist({ state }: { state: ChecklistState }) {
  const [open, setOpen] = useState(false);
  const items = [
    { done: state.roomCreated, label: "สร้างห้องแรก" },
    { done: state.evidenceAdded, label: "เพิ่ม evidence อย่างน้อย 1 อย่าง" },
    { done: state.summarized, label: "กดให้ MIND สรุปงาน" },
  ];
  const completedCount = items.filter((item) => item.done).length;

  return (
    <aside className={styles.checklistPanel} aria-label="Onboarding checklist">
      <button type="button" className={styles.checklistToggle} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={styles.kicker}>Onboarding</span>
        <strong>
          {completedCount}/{items.length}
        </strong>
      </button>
      {open && (
        <div className={styles.checklistBody}>
          {items.map((item) => (
            <div key={item.label} className={styles.checklistItem}>
              <span className={item.done ? styles.checkDone : styles.checkEmpty}>{item.done ? "✓" : ""}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export function Tooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={styles.tooltipWrap}>
      <button
        type="button"
        className={styles.tooltipButton}
        aria-label={`อธิบาย ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open && <span className={styles.tooltipBubble}>{text}</span>}
    </span>
  );
}

export function AskMindModal({ mode, onClose }: { mode: AskMindMode; onClose: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 950);
    return () => window.clearTimeout(timer);
  }, []);

  const titleByMode: Record<AskMindMode, string> = {
    help: "Re-entry brief",
    scaffold: "Make it smaller",
    rescue: "Diagnosis / Rescue mode",
  };

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="ถาม MIND">
      <div className={styles.askModal}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Ask MIND</p>
            <h2>{titleByMode[mode]}</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </div>

        {!ready ? (
          <MindLoadingState label="MIND กำลังอ่าน context ในห้องนี้..." compact />
        ) : (
          <AskMindModalBody mode={mode} />
        )}
      </div>
    </div>
  );
}

function AskMindModalBody({ mode }: { mode: AskMindMode }) {
  if (mode === "scaffold") {
    return (
      <div className={styles.qaBlock}>
        <strong>ทางที่เล็กลงตอนนี้</strong>
        <ol className={styles.modalResultList}>
          <li>ร่าง email confirm scope 3 บรรทัด</li>
          <li>สร้าง checklist งานย่อย 3 ข้อ</li>
          <li>นัด review กับลูกค้า 30 นาที</li>
        </ol>
        <p className={styles.provenanceHint}>อิงจาก old proposal PDF + meeting note + client email</p>
      </div>
    );
  }

  if (mode === "rescue") {
    return (
      <div className={styles.qaBlock}>
        <strong>Diagnosis: ขอบเขตงานยังไม่ชัด</strong>
        <p>Evidence: note ประชุม 10 เม.ย. + email ลูกค้าล่าสุด</p>
        <p>Rescue plan: ส่งคำถาม confirm scope 1 ข้อก่อนเริ่ม wireframe</p>
        <p className={styles.provenanceHint}>MIND ใช้ evidence ในห้องนี้เพื่อวิเคราะห์ blocker ไม่ใช่เดาคำตอบลอย ๆ</p>
      </div>
    );
  }

  return (
    <div className={styles.qaBlock}>
      <strong>What changed since last time</strong>
      <p>งานยังอยู่ที่ Scaffolding เพราะต้อง confirm scope ก่อนเริ่ม wireframe และมี screenshot feedback ใหม่เข้ามาเป็น context เพิ่ม</p>
      <strong>Start from this</strong>
      <p>ลูกค้าวงจุดที่ hero copy และ CTA เพิ่มเติม ทำให้ next move ยังควรเป็นการสรุป scope ให้ชัดก่อน</p>
      <p className={styles.provenanceHint}>อิงจาก client email, old proposal PDF และ homepage screenshot</p>
    </div>
  );
}

export function MindLoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`${styles.mindLoading} ${compact ? styles.mindLoadingCompact : ""}`} role="status" aria-live="polite">
      <div className={styles.loadingOrb} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <h3>{label}</h3>
        <div className={styles.loadingSteps}>
          <span>อ่าน evidence</span>
          <span>สรุปสถานะงาน</span>
          <span>หา next step</span>
        </div>
      </div>
    </div>
  );
}

export function SettingsSurface() {
  const [localOnly, setLocalOnly] = useState(true);

  return (
    <DemoFrame checklist={completedChecklist} compact>
      <section className={styles.surfaceStack}>
        <div className={styles.heroPanel}>
          <p className={styles.kicker}>Settings</p>
          <h2>Demo settings</h2>
          <p>หน้านี้เป็น local state สำหรับโชว์ว่า mock-up ไม่มีระบบจริงเชื่อมอยู่</p>
          <button type="button" className={styles.settingToggle} onClick={() => setLocalOnly((value) => !value)}>
            <span>Static-only mode</span>
            <strong>{localOnly ? "On" : "Off"}</strong>
          </button>
        </div>
      </section>
    </DemoFrame>
  );
}
