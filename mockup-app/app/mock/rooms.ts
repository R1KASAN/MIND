export type DemoRoomType = "client_project" | "research" | "thesis" | "other";
export type DemoRoomStatus = "new" | "summarized" | "in_progress";
export type DemoProjectState = "intake" | "scaffolding" | "active" | "stuck" | "review";

export interface DemoActionStep {
  id: string;
  text: string;
  rationale: string;
  citationLabel: string;
  alternatives: string[];
  smallerStep: string;
  evidenceIds: string[];
  confidenceLabel: string;
  isManualOnly?: boolean;
}

export interface DemoRoom {
  id: string;
  title: string;
  type: DemoRoomType;
  status: DemoRoomStatus;
  projectState: DemoProjectState;
  currentStepLabel: string;
  memoryLabel: string;
  lastUpdatedFromEvidence: string;
  summary: {
    context: string;
    currentStatus: string;
    nextSteps: DemoActionStep[];
  };
}

export const canonicalRoomId = "client-a-website-redesign";

export const sampleContextText = `ลูกค้า Client A ส่งอีเมลมาว่าอยาก redesign website รอบใหม่
ตอนนี้มี proposal เก่า, note จาก meeting, และ feedback เรื่อง hero section ที่ยังไม่ชัด
งานค้างอยู่ตรงต้องสรุป scope รอบแรกให้ลูกค้า approve ก่อนเริ่มทำ wireframe`;

export const mockRooms: DemoRoom[] = [
  {
    id: "acme-website-revamp",
    title: "ACME – Website Revamp",
    type: "client_project",
    status: "new",
    projectState: "intake",
    currentStepLabel: "Step 1 of 3",
    memoryLabel: "ACME homepage brief",
    lastUpdatedFromEvidence: "20 Apr, 09:10",
    summary: {
      context:
        "งาน revamp ของ ACME ยังอยู่ที่การรวบรวม brief รอบแรก เพราะลูกค้ายังส่ง feedback กระจัดกระจายอยู่หลายแชต",
      currentStatus: "ยังอยู่ในช่วง intake ต้องรวม evidence และสรุปสิ่งที่ต้องถามกลับก่อนเริ่มงาน",
      nextSteps: [
        {
          id: "collect-brief",
          text: "รวม brief และ feedback ให้เหลือจุดเดียว",
          rationale: "เพราะตอนนี้ข้อมูลกระจายหลายที่ การรวมเข้าห้องก่อนจะทำให้เห็น scope จริง",
          citationLabel: "อ้างอิง: client brief + chat note",
          alternatives: ["รอให้ลูกค้าส่ง brief ฉบับเต็ม", "สรุปจาก meeting note ก่อน"],
          smallerStep: "ดึงหัวข้อหลักจาก brief 3 ข้อแล้วรวมเป็น summary สั้น",
          evidenceIds: ["acme-brief", "acme-chat"],
          confidenceLabel: "Medium confidence",
        },
        {
          id: "ask-clarify",
          text: "ถาม 1 คำถามเรื่อง deadline และ owner",
          rationale: "เพราะขาดคำตอบสองจุดนี้จะทำให้ลำดับงานยังไม่ชัด",
          citationLabel: "อ้างอิง: internal note",
          alternatives: ["ถาม deadline อย่างเดียว", "ถาม owner ผ่าน Slack"],
          smallerStep: "เขียนคำถาม 1 ประโยคที่ถาม deadline กับผู้รับผิดชอบพร้อมกัน",
          evidenceIds: ["acme-internal-note"],
          confidenceLabel: "High confidence",
          isManualOnly: true,
        },
      ],
    },
  },
  {
    id: "orchid-studio-brand-refresh",
    title: "Orchid Studio – Brand Refresh",
    type: "client_project",
    status: "in_progress",
    projectState: "active",
    currentStepLabel: "Step 3 of 4",
    memoryLabel: "Orchid brand direction",
    lastUpdatedFromEvidence: "20 Apr, 16:40",
    summary: {
      context:
        "ห้องนี้กำลังเดินงาน refresh brand ที่มี brand direction ชัดแล้ว แต่ยังต้องเลือกแนวภาพหลักให้ตรงก่อน finalize deck",
      currentStatus: "มี direction แล้ว แต่ยังต้องย่อยเป็น deliverable ที่ทำต่อได้เร็ว",
      nextSteps: [
        {
          id: "lock-visual-direction",
          text: "เลือก visual direction หลัก 1 แบบ",
          rationale: "เพราะตอนนี้ทีมมีทางเลือกหลายแบบและต้องล็อกหนึ่งทางก่อนเดินต่อ",
          citationLabel: "อ้างอิง: brand board + client feedback",
          alternatives: ["เลือกเฉพาะ palette ก่อน", "เลือก mood board แบบสั้น"],
          smallerStep: "เทียบ mood board 2 แบบแล้วเลือก 1 แบบให้ลูกค้ายืนยัน",
          evidenceIds: ["orchid-board", "orchid-feedback"],
          confidenceLabel: "High confidence",
        },
        {
          id: "prep-review",
          text: "เตรียม review deck สำหรับคุยรอบถัดไป",
          rationale: "เพราะต้องมีสรุปที่สั้นพอให้ลูกค้าตัดสินใจได้เร็ว",
          citationLabel: "อ้างอิง: meeting note",
          alternatives: ["ทำเฉพาะ executive summary", "ทำ deck 5 หน้าแบบย่อ"],
          smallerStep: "ย่อ deck เหลือ 3 หน้า: direction, tradeoff, recommendation",
          evidenceIds: ["orchid-note"],
          confidenceLabel: "Medium confidence",
        },
      ],
    },
  },
  {
    id: canonicalRoomId,
    title: "Client A – Website Redesign",
    type: "client_project",
    status: "summarized",
    projectState: "scaffolding",
    currentStepLabel: "Step 2 of 4",
    memoryLabel: "Client A redesign scope",
    lastUpdatedFromEvidence: "21 Apr, 14:32",
    summary: {
      context:
        "งานนี้คือโปรเจกต์ redesign เว็บไซต์ให้ Client A โดยต้องจัด scope รอบแรกจาก email, meeting note และ proposal เก่าให้ชัดก่อนเริ่ม wireframe",
      currentStatus:
        "มี evidence พอให้สรุปทิศทางแล้ว แต่ยังต้อง confirm scope ก่อนลงมือออกแบบ",
      nextSteps: [
        {
          id: "confirm-scope",
          text: "ส่งสรุป scope รอบแรกให้ลูกค้า confirm",
          rationale:
            "เพราะงานนี้ติดอยู่ที่ scope ยังไม่ชัด และการ confirm ก่อนจะลดความเสี่ยงก่อนเริ่ม wireframe",
          citationLabel: "อ้างอิง: email ลูกค้า + proposal เก่า",
          alternatives: ["เริ่ม wireframe เฉพาะ hero ก่อน", "ขอ call 15 นาทีเพื่อเคลียร์ scope"],
          smallerStep: "ร่าง email 3 บรรทัด: scope รอบแรก, สิ่งที่ไม่รวม, คำถาม confirm 1 ข้อ",
          evidenceIds: ["client-a-email", "client-a-proposal"],
          confidenceLabel: "High confidence",
          isManualOnly: true,
        },
        {
          id: "split-redesign",
          text: "แยกงาน redesign เป็น hero, navigation, และ conversion section",
          rationale:
            "เพราะ meeting note ระบุพื้นที่ที่ต้องแก้ชัดเจน การแยกเป็น section จะทำให้เริ่มได้โดยไม่ overload",
          citationLabel: "อ้างอิง: meeting note + screenshot",
          alternatives: ["ทำเฉพาะ hero copy ก่อน", "ทำ checklist ของ navigation labels ก่อน"],
          smallerStep: "สร้าง checklist 3 แถว: hero copy, nav labels, CTA/conversion target",
          evidenceIds: ["client-a-meeting-note", "client-a-screenshot"],
          confidenceLabel: "Medium confidence",
        },
        {
          id: "prepare-questions",
          text: "เตรียมคำถาม 2 ข้อเรื่อง brand direction และ deadline",
          rationale:
            "เพราะยังมีจุดตัดสินใจที่ต้องให้ลูกค้ายืนยันก่อนลงมือออกแบบรายละเอียด",
          citationLabel: "อ้างอิง: internal reminder + email ล่าสุด",
          alternatives: ["ถามเรื่อง deadline อย่างเดียว", "แนบคำถามไปพร้อม scope summary"],
          smallerStep: "เขียนคำถามสั้น 2 ข้อ แล้วแนบกับ email confirm scope",
          evidenceIds: ["client-a-internal-note", "client-a-email"],
          confidenceLabel: "High confidence",
          isManualOnly: true,
        },
      ],
    },
  },
  {
    id: "northstar-demo-reply",
    title: "Northstar – Demo reply",
    type: "client_project",
    status: "summarized",
    projectState: "review",
    currentStepLabel: "Step 2 of 3",
    memoryLabel: "Northstar demo reply",
    lastUpdatedFromEvidence: "19 Apr, 11:05",
    summary: {
      context:
        "งานนี้คือการตอบ demo reply ให้ลูกค้า Northstar โดยมีคำถามค้างอยู่เรื่อง timeline และราคา",
      currentStatus: "สรุปได้แล้วว่าเคสนี้ควรตอบกลับสั้นและชัด แต่ยังต้อง confirm detail ก่อนส่ง",
      nextSteps: [
        {
          id: "draft-reply",
          text: "ร่าง reply สั้นเพื่อยืนยัน scope",
          rationale: "เพราะงานนี้ต้องตอบกลับให้เร็วและไม่เปิดประเด็นเกินจำเป็น",
          citationLabel: "อ้างอิง: latest email + saved note",
          alternatives: ["ตอบเฉพาะ timeline", "ตอบแยกเรื่องราคา"],
          smallerStep: "เขียน reply 2 บรรทัด: confirm scope + timeline",
          evidenceIds: ["northstar-email", "northstar-note"],
          confidenceLabel: "High confidence",
          isManualOnly: true,
        },
        {
          id: "send-review",
          text: "ส่งให้คนในทีมช่วยเช็กก่อนส่ง",
          rationale: "เพราะข้อความสั้นแต่มีความเสี่ยงเรื่อง tone และคำสัญญา",
          citationLabel: "อ้างอิง: internal reminder",
          alternatives: ["ส่งเองทันที", "แนบคำถามเพิ่มก่อนส่ง"],
          smallerStep: "เช็กว่าไม่มีคำพูดที่ promise เกิน scope",
          evidenceIds: ["northstar-reminder"],
          confidenceLabel: "Medium confidence",
        },
      ],
    },
  },
];

export function getMockRoom(roomId: string): DemoRoom | undefined {
  return mockRooms.find((room) => room.id === roomId);
}

export function getRoomAnchorHref(roomId: string, anchor: "memory" | "state" | "evidence" | "next-steps") {
  return `/rooms/${roomId}#${anchor}`;
}

export function getCanonicalRoom(): DemoRoom {
  return mockRooms[0];
}
