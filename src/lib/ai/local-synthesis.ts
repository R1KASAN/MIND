import type { AiSynthesisResponse } from '@/lib/ai/schema';

const THAI_FILLER_PREFIXES = [
  'ต้อง',
  'อยาก',
  'ควร',
  'จะ',
  'ขอ',
  'ช่วย',
  'วันนี้',
  'ตอนนี้',
  'พรุ่งนี้',
  'เดี๋ยว',
];

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripFiller(text: string) {
  let cleaned = normalizeWhitespace(text);
  for (const prefix of THAI_FILLER_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
    }
  }
  return cleaned;
}

function splitDump(dump: string) {
  return dump
    .split(/\n|\/|,|•|-|;|\.|!|\?| แล้ว | และ | กับ /g)
    .map((item) => stripFiller(item))
    .map((item) => item.replace(/^[:\s]+|[:\s]+$/g, ''))
    .filter((item) => item.length > 1);
}

function pickPrimarySegment(segments: string[]) {
  return segments.find((segment) => segment.length >= 6) || segments[0] || 'งานที่ค้างอยู่ตรงหน้า';
}

function titleFromSegment(segment: string) {
  const text = normalizeWhitespace(segment);
  const lower = text.toLowerCase();

  if (lower.includes('เมล') || lower.includes('อีเมล') || lower.includes('email')) {
    return 'เปิดอีเมล แล้วร่าง 3 บรรทัดแรกถึงคนที่ต้องส่งก่อน';
  }
  if (lower.includes('สไลด์') || lower.includes('presentation') || lower.includes('deck')) {
    return 'เปิดไฟล์สไลด์ แล้วพิมพ์หัวข้อของสไลด์แรก';
  }
  if (lower.includes('ประชุม') || lower.includes('meeting') || lower.includes('นัด')) {
    return 'เปิดแชตหรือปฏิทิน แล้วส่งข้อความนัดเวลา 1 ข้อความ';
  }
  if (lower.includes('โทร') || lower.includes('call')) {
    return 'เปิดรายชื่อ แล้วพิมพ์ข้อความขอนัดคุยสั้น ๆ 1 ข้อความ';
  }
  if (lower.includes('invoice') || lower.includes('ใบแจ้งหนี้') || lower.includes('บิล')) {
    return 'เปิดไฟล์ใบแจ้งหนี้ แล้วพิมพ์ข้อมูลบรรทัดแรกให้ครบ';
  }
  if (lower.includes('รายงาน') || lower.includes('report') || lower.includes('สรุป')) {
    return 'เปิดเอกสารรายงาน แล้วเขียนหัวข้อแรกของสิ่งที่ต้องสรุป';
  }
  if (lower.includes('ลูกค้า') || lower.includes('client')) {
    return 'เปิดแชตหรือลิสต์ลูกค้า แล้วพิมพ์ข้อความหาคนแรกที่ต้องตอบ';
  }

  return `เปิดสิ่งที่เกี่ยวกับ "${text}" แล้วเขียนบรรทัดแรกที่ต้องทำ`;
}

function rationaleFromSegment(segment: string) {
  return `เริ่มจากก้าวเล็กที่จับต้องได้ก่อน เพื่อให้เรื่อง "${segment}" ขยับจริงโดยไม่ต้องคิดเพิ่มอีกหลายชั้น`;
}

function microStepsFromSegment(segment: string, title: string) {
  return [
    `เปิดเครื่องมือหรือไฟล์ที่ต้องใช้กับเรื่อง "${segment}"`,
    `ทำตามก้าวนี้ทันที: ${title}`,
    'หยุดแค่ให้เกิดความคืบหน้าเล็ก ๆ แล้วค่อยตัดสินใจก้าวถัดไป',
  ];
}

function alternativeFromSegment(segment: string) {
  const text = normalizeWhitespace(segment);
  return {
    title: `เปิดสิ่งที่เกี่ยวกับ "${text}" แล้วเริ่มจากบรรทัดแรก`,
    rationale: `ถ้ายังไม่พร้อมทำเรื่องหลัก ลองขยับเรื่อง "${text}" แค่ก้าวเดียวก่อน`,
  };
}

export function synthesizeLocally(dump: string): AiSynthesisResponse {
  const segments = splitDump(dump);
  const primary = pickPrimarySegment(segments);
  const title = titleFromSegment(primary);

  return {
    requires_clarification: false,
    recommended_action: {
      title,
      rationale: rationaleFromSegment(primary),
      micro_steps: microStepsFromSegment(primary, title),
    },
    alternative_actions: segments
      .filter((segment) => segment !== primary)
      .slice(0, 2)
      .map((segment) => alternativeFromSegment(segment)),
    detected_blockers: [],
  };
}
