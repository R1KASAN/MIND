export interface DemoEvidence {
  id: string;
  roomId: string;
  kind: "note" | "email" | "file" | "summary" | "screenshot";
  title: string;
  sourceLabel: string;
  excerpt: string;
  freshness: "new" | "used" | "stale";
}

export const mockEvidence: DemoEvidence[] = [
  {
    id: "acme-brief",
    roomId: "acme-website-revamp",
    kind: "file",
    title: "ACME brief PDF",
    sourceLabel: "acme-brief.pdf",
    excerpt: "brief รอบแรกยังไม่ล็อกขอบเขต แต่ระบุว่าต้องการให้หน้าแรกดูชัดและ modern กว่าเดิม",
    freshness: "new",
  },
  {
    id: "acme-chat",
    roomId: "acme-website-revamp",
    kind: "note",
    title: "Chat follow-up",
    sourceLabel: "slack-thread.md",
    excerpt: "ลูกค้าถามเพิ่มเรื่อง timeline และอยากรู้ว่าต้องใช้กี่รอบถึงจะ approve",
    freshness: "used",
  },
  {
    id: "acme-internal-note",
    roomId: "acme-website-revamp",
    kind: "summary",
    title: "Internal note",
    sourceLabel: "mind-save-point",
    excerpt: "ต้อง confirm owner กับ deadline ก่อนเริ่ม wireframe ไม่งั้นจะหลุด scope ได้ง่าย",
    freshness: "stale",
  },
  {
    id: "orchid-board",
    roomId: "orchid-studio-brand-refresh",
    kind: "file",
    title: "Brand board",
    sourceLabel: "orchid-board.pdf",
    excerpt: "brand direction ชี้ไปที่ mood สะอาดขึ้น ใช้ภาพใหญ่ และลดสีที่ตีกัน",
    freshness: "used",
  },
  {
    id: "orchid-feedback",
    roomId: "orchid-studio-brand-refresh",
    kind: "screenshot",
    title: "Feedback screenshot",
    sourceLabel: "client-feedback.png",
    excerpt: "ลูกค้าขีดเส้นไว้ที่ตัวอย่างที่ 2 ว่าตอบโจทย์ความนิ่งและความ premium มากกว่า",
    freshness: "new",
  },
  {
    id: "orchid-note",
    roomId: "orchid-studio-brand-refresh",
    kind: "note",
    title: "Meeting note",
    sourceLabel: "orchid-meeting.md",
    excerpt: "รอบถัดไปควรย่อ deck เหลือ 3 หน้า เพื่อให้คุยตัดสินใจได้เร็ว",
    freshness: "used",
  },
  {
    id: "client-a-email",
    roomId: "client-a-website-redesign",
    kind: "email",
    title: "Email: redesign request",
    sourceLabel: "client-a-email.txt",
    excerpt: "ลูกค้าอยากให้หน้าแรกดู modern ขึ้น แต่ยังไม่อยากเปลี่ยนระบบหลังบ้านในรอบแรก",
    freshness: "used",
  },
  {
    id: "client-a-meeting-note",
    roomId: "client-a-website-redesign",
    kind: "note",
    title: "Meeting note",
    sourceLabel: "meeting-note.md",
    excerpt: "ทีมตกลงว่าจะเริ่มจาก hero section, navigation และ CTA หลักก่อน แล้วค่อยดูหน้าอื่น",
    freshness: "used",
  },
  {
    id: "client-a-proposal",
    roomId: "client-a-website-redesign",
    kind: "file",
    title: "Old proposal PDF",
    sourceLabel: "client-a-old-proposal.pdf",
    excerpt: "proposal เก่ามี scope กว้างเกินไป ต้องตัดให้เหลือ redesign รอบแรกที่ approve ได้เร็ว",
    freshness: "used",
  },
  {
    id: "client-a-screenshot",
    roomId: "client-a-website-redesign",
    kind: "screenshot",
    title: "Homepage screenshot",
    sourceLabel: "homepage-feedback.png",
    excerpt: "ลูกค้าวงจุดไว้ที่ hero copy และปุ่ม CTA ว่ายังไม่ชัดสำหรับ lead ใหม่",
    freshness: "new",
  },
  {
    id: "client-a-internal-note",
    roomId: "client-a-website-redesign",
    kind: "summary",
    title: "Internal reminder",
    sourceLabel: "mind-save-point",
    excerpt: "อย่าเริ่ม wireframe ก่อน confirm scope เพราะลูกค้ายังไม่แน่ใจว่าจะรวม pricing page ด้วยไหม",
    freshness: "stale",
  },
  {
    id: "northstar-email",
    roomId: "northstar-demo-reply",
    kind: "email",
    title: "Northstar email",
    sourceLabel: "northstar-reply.txt",
    excerpt: "ลูกค้าถามว่า demo รอบนี้จะมี timeline กับราคาคร่าว ๆ หรือไม่",
    freshness: "new",
  },
  {
    id: "northstar-note",
    roomId: "northstar-demo-reply",
    kind: "note",
    title: "Saved note",
    sourceLabel: "northstar-note.md",
    excerpt: "ควรตอบสั้นให้เห็น scope ก่อน แล้วค่อยเปิด detail ถ้าลูกค้าถามเพิ่ม",
    freshness: "used",
  },
  {
    id: "northstar-reminder",
    roomId: "northstar-demo-reply",
    kind: "summary",
    title: "Internal reminder",
    sourceLabel: "mind-save-point",
    excerpt: "รอบนี้ต้องระวัง tone และไม่ promise เกินจากที่ทีมทำได้จริง",
    freshness: "stale",
  },
];

export function getEvidenceForRoom(roomId: string): DemoEvidence[] {
  return mockEvidence.filter((item) => item.roomId === roomId);
}
