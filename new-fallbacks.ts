import { normalizeGroundingText } from './src/lib/source-grounding';

export function isLogoRevisionText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  return /โลโก้/u.test(text) && /สี/u.test(text) && /ฟอนต์/u.test(text);
}

export function buildLogoRevisionActionFallback(rawContext: string) {
  return {
    chosenTitle: 'เปิด LINE แล้วจดรายการแก้โลโก้ 3 จุด: สี / ฟอนต์ / ขนาดโลโก้',
    chosenRationale: 'รวมจุดที่ต้องแก้ให้อยู่ที่เดียวกันก่อน จะได้ไม่ตกหล่น',
    successSignal: 'ได้รายการแก้โลโก้ 3 จุดที่ชัดเจน',
    whyThisNow: 'ลูกค้าขอแก้งานผ่าน LINE ที่กระจัดกระจาย การจดออกมาก่อนจะช่วยให้เริ่มทำทีละจุดได้ง่ายขึ้น',
    situationSummary: 'ลูกค้าขอแก้งานโลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้) ข้อมูลอยู่กระจายใน LINE ยังไม่ตอบลูกค้า',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'ร่างคำตอบลูกค้าก่อนลงมือทำ',
        rationale: 'แจ้งลูกค้าให้ทราบว่าได้รับเรื่องแล้ว',
      },
    ],
  };
}

export function buildLogoRevisionStepFallback(rawContext?: string) {
  return [
    'เปิด LINE หาข้อความที่ลูกค้าบรีฟเรื่องโลโก้',
    'จดรายการแก้สี ฟอนต์ และขนาดโลโก้ลง Notes',
    'เช็กให้ชัวร์ว่ามีแค่ 3 จุดนี้',
  ];
}

export function isOverloadedWorkText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  return /งานค้าง/u.test(text) && (/พอร์ต/u.test(text) || /ใบเสนอราคา/u.test(text) || /เรซูเม่/u.test(text) || /แชทงาน/u.test(text));
}

export function buildOverloadedWorkActionFallback(rawContext: string) {
  return {
    chosenTitle: 'เลือกทำงานค้าง 1 อย่าง (แก้ไฟล์พอร์ต หรือ ส่งใบเสนอราคา)',
    chosenRationale: 'ลดความสับสนจากการเปิดหลายแท็บ ให้โฟกัสแค่ทีละงาน',
    successSignal: 'เคลียร์งานค้างได้ 1 ชิ้น',
    whyThisNow: 'เปิดหลายแท็บจนงง ควรเริ่มจากเคลียร์ไปทีละอย่างโดยไม่ต้องจัดตารางทั้งวัน',
    situationSummary: 'มีงานค้างหลายอย่าง (พอร์ต ใบเสนอราคา เรซูเม่ แชทงาน) เปิดหลายแท็บจนงง',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'ทยอยตอบแชทงานให้ครบทุกแชท',
        rationale: 'เคลียร์การสื่อสารออกไปให้หมดก่อน',
      },
    ],
  };
}

export function buildOverloadedWorkStepFallback(rawContext?: string) {
  return [
    'ปิดแท็บที่ไม่เกี่ยวกับงานชิ้นแรก',
    'เคลียร์การแก้ไฟล์พอร์ต หรือ ส่งใบเสนอราคา',
    'ตรวจทานความเรียบร้อยก่อนขยับไปงานถัดไป',
  ];
}

console.log("Ready to patch source-grounding.ts");
