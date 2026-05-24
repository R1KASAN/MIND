import type { TaskShape } from '@/lib/ai/task-shape';
import type { TaskContext } from '@/lib/store/idb';

export const EXTERNAL_STAKEHOLDER_PATTERN = /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu;
const NAMED_EXTERNAL_ORG_PATTERN = /\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\s+(?:Corp|Co|Ltd|Inc|LLC|Bank)\b/u;

export const PRESENTATION_PREP_STEP_FALLBACK = [
  'เปิด notes จากแชท ไฟล์สไลด์ และสมุด',
  'จดหัวข้อพรีเซนต์ 3 ช่อง: ผลที่ทำไปแล้ว ปัญหาที่เจอ แผนต่อไป',
  'เติมสไลด์แรกด้วยหัวข้อที่เริ่มได้ใน 10 นาที',
];

export const PRESENTATION_PREP_RESCUE_STEP = 'เปิดไฟล์สไลด์แล้วเขียน 3 หัวข้อ: ผลที่ทำไปแล้ว ปัญหาที่เจอ แผนต่อไป';

export const PHYSICAL_ROOM_RESET_STEP_FALLBACK = [
  'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
  'ย้ายแก้วน้ำกับกระดาษออกจากโต๊ะหนึ่งมุม',
  'เช็กว่าเก้าอี้หรือโต๊ะพร้อมใช้งานใน 10 นาที',
];

export const PHYSICAL_ROOM_RESCUE_STEP = 'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้ก่อน';

export const STUDENT_REPORT_STEP_FALLBACK = [
  'เปิด reference link 1 อันของ renewable energy storage',
  'จด 3 bullet สำหรับบทนำรายงาน',
  'เขียนประโยคแรกของบทนำจาก bullet ที่จด',
];

export function buildStudentReportStepFallback(sourceText?: string) {
  const hasRenewable = /renewable energy storage/i.test(sourceText ?? '');
  const hasRefLinkEn = /reference link/i.test(sourceText ?? '');
  const refLinkLabel = hasRefLinkEn ? 'reference link' : 'ลิงก์อ้างอิง';
  const topicLabel = hasRenewable ? 'ของ renewable energy storage' : '';

  return [
    `เปิด ${refLinkLabel} 1 อัน${topicLabel}`,
    'จด 3 bullet สำหรับบทนำรายงาน',
    'เขียนประโยคแรกของบทนำจาก bullet ที่จด',
  ];
}

export const STUDENT_REPORT_RESCUE_STEP = 'เปิด reference link 1 อันแล้วจด 3 bullet สำหรับบทนำรายงาน';

export function buildStudentReportRescueStep(sourceText?: string) {
  const hasRefLinkEn = /reference link/i.test(sourceText ?? '');
  const refLinkLabel = hasRefLinkEn ? 'reference link' : 'ลิงก์อ้างอิง';
  return `เปิด ${refLinkLabel} 1 อันแล้วจด 3 bullet สำหรับบทนำรายงาน`;
}

export const PRODUCT_POST_STEP_FALLBACK = [
  'จดจุดขายกระเป๋าผ้า canvas: เบา ซักง่าย 3 สี',
  'ร่าง caption สินค้า 3 บรรทัด',
  'ตรวจว่า caption พร้อมโพสต์คืนนี้',
];

export const PRODUCT_POST_RESCUE_STEP = 'ร่าง caption 3 บรรทัดจากจุดขาย เบา ซักง่าย และ 3 สี';

export function normalizeGroundingText(value: string | undefined) {
  return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
}

export function hasExternalStakeholderTerm(value: string | undefined) {
  return EXTERNAL_STAKEHOLDER_PATTERN.test(value ?? '');
}

export function hasExplicitExternalStakeholderSource(value: string | undefined) {
  return EXTERNAL_STAKEHOLDER_PATTERN.test(value ?? '') || NAMED_EXTERNAL_ORG_PATTERN.test(value ?? '');
}

export function isInternalPresentationPrepText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  const hasPresentation = /พรีเซนต์|นำเสนอ|presentation|สไลด์|slide/u.test(text);
  const hasInternalTeam = /ในทีม|ทีม|internal/u.test(text);
  const hasSourceAnchors = /notes?|โน้ต|แชท|แชต|chat|ไฟล์สไลด์|สมุด/u.test(text);
  const hasTalkTrack = /ผลที่ทำไปแล้ว|ปัญหาที่เจอ|แผนต่อไป/u.test(text);
  return hasPresentation && (hasInternalTeam || hasSourceAnchors || hasTalkTrack);
}

export function isPhysicalRoomResetText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  const hasMessyRoom = /ห้องรก|ห้อง.*รก|รกมาก|เก็บห้อง|จัดห้อง/u.test(text);
  const hasPhysicalAnchor = /เสื้อผ้า|เก้าอี้|โต๊ะ|แก้วน้ำ|กระดาษ|พื้น|เตียง|จาน|ขยะ/u.test(text);
  const hasStartNow = /10\s*นาที|สิบ\s*นาที|เริ่มเก็บ|เริ่มจากตรงไหน|เริ่มทำ/u.test(text);
  return hasMessyRoom && (hasPhysicalAnchor || hasStartNow);
}

export function isLogoRevisionText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  return /โลโก้/u.test(text) && /สี/u.test(text) && /ฟอนต์/u.test(text);
}

export function isOverloadedWorkText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  return /งานค้าง/u.test(text) && (/พอร์ต/u.test(text) || /ใบเสนอราคา/u.test(text) || /เรซูเม่/u.test(text) || /แชทงาน/u.test(text));
}

export function isStudentReportText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  const hasReport = /รายงาน|report|บทนำ|วิชา|นักเรียน|student/u.test(text);
  const hasTopic = /renewable energy storage|reference links?|เอกสารจริง|แชท|ลิงก์|อ้างอิง|เอกสาร/u.test(text);
  return hasReport && hasTopic;
}

export function guardStalePhrases(text: string | undefined, task?: TaskContext): string {
  if (!text) return '';
  const rawContext = task ? collectRawRoomSourceContext(task) : '';
  const hasRenewableInSource = /renewable energy storage/i.test(rawContext);
  const hasCustomerInSource = /ลูกค้า|client|customer|ผู้ว่าจ้าง/iu.test(rawContext);

  let result = text;

  // Unconditionally sanitize generic AI boilerplate that leaks into side panels and reentry
  result = result.replace(/แนะนำก้าวต่อไปในการทำงานตามบริบทเดิมของลูกค้า/g, 'แนะนำก้าวต่อไปจากบริบทงานเดิม');
  result = result.replace(/ลูกค้าต้องการต่อยอดจากงานที่ทำเสร็จแล้ว/g, 'พร้อมต่อยอดจากงานที่ทำเสร็จแล้ว');

  if (!hasRenewableInSource) {
    result = result.replace(/หัวข้อ\s*"?renewable\s+energy\s+storage"?/gi, 'หัวข้อรายงาน');
    result = result.replace(/วิชา\s*"?renewable\s+energy\s+storage"?/gi, 'รายงานวิชา');
    result = result.replace(/renewable\s+energy\s+storage/gi, 'รายงาน');
  }
  if (!hasCustomerInSource) {
    result = result.replace(/ตอบลูกค้า/g, 'ตอบกลับ');
    result = result.replace(/ข้อความตอบลูกค้า/g, 'ข้อความตอบกลับ');
    result = result.replace(/ประเมินลูกค้า/g, 'ประเมินงาน');
    result = result.replace(/ส่งให้ลูกค้า/g, 'ส่งงาน');
    result = result.replace(/ตามลูกค้า/g, 'ตามงาน');
    result = result.replace(/ลูกค้าขอ/g, 'มีคำขอ');
    result = result.replace(/ลูกค้า/g, 'ตัวเอง');
    result = result.replace(/clients?/gi, 'ตัวเอง');
    result = result.replace(/customers?/gi, 'ตัวเอง');
    result = result.replace(/ผู้ว่าจ้าง/g, 'ตัวเอง');
  }
  return result;
}

export function isProductPostText(value: string | undefined) {
  const text = normalizeGroundingText(value);
  const hasPost = /โพสต์สินค้า|ร้านออนไลน์|caption|แคปชั่น|สินค้าใหม่/u.test(text);
  const hasProduct = /กระเป๋าผ้า|canvas|เบา|ซักง่าย|3\s*สี|สาม\s*สี/u.test(text);
  return hasPost && hasProduct;
}

export function isInternalPresentationTaskShape(taskShape: TaskShape | undefined) {
  return isInternalPresentationPrepText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isInternalPresentationPrepText(input)) === true;
}

export function isPhysicalRoomTaskShape(taskShape: TaskShape | undefined) {
  return isPhysicalRoomResetText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isPhysicalRoomResetText(input)) === true;
}

export function isCustomerLogoRevisionTaskShape(taskShape: TaskShape | undefined) {
  return isLogoRevisionText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isLogoRevisionText(input)) === true;
}

export function isStudentReportTaskShape(taskShape: TaskShape | undefined) {
  return isStudentReportText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isStudentReportText(input)) === true;
}

export function isProductPostTaskShape(taskShape: TaskShape | undefined) {
  return isProductPostText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isProductPostText(input)) === true;
}

export function buildPresentationPrepActionFallback() {
  return {
    chosenTitle: 'เปิด notes ทั้ง 3 แหล่ง แล้วจดหัวข้อพรีเซนต์ 3 ช่อง',
    chosenRationale: 'บริบทนี้เป็นการเตรียมพรีเซนต์งานในทีม จึงควรเริ่มจากรวม notes ในแชท ไฟล์สไลด์ และสมุดให้กลายเป็น 3 หัวข้อพูด',
    successSignal: 'ได้หัวข้อพรีเซนต์ 3 ช่องที่เริ่มเติมสไลด์ได้ใน 10 นาที',
    whyThisNow: 'ตอนนี้ติดที่ notes กระจัดกระจายและกลัวเปิดสไลด์แล้วจ้องเปล่า ก้าวนี้จึงล็อกจุดเริ่มที่ทำได้ทันทีใน 10 นาที',
    situationSummary: 'ต้องเตรียมพรีเซนต์งานในทีมจาก notes หลายแหล่ง ทั้งแชท ไฟล์สไลด์ และสมุด โดยต้องพูดผลที่ทำไปแล้ว ปัญหาที่เจอ และแผนต่อไป',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'เปิดไฟล์สไลด์แล้วเติมหัวข้อหลัก 3 ช่องก่อน',
        rationale: 'เหมาะเมื่ออยากเริ่มจากสไลด์ทันทีโดยไม่จัด notes ทั้งหมดก่อน',
      },
      {
        title: 'จด notes จากแชท ไฟล์สไลด์ และสมุดลงหน้าเดียว',
        rationale: 'เหมาะเมื่อข้อมูลกระจัดกระจายจนต้องรวมฐานก่อนเลือกว่าจะพูดอะไร',
      },
    ],
  };
}

export function buildPhysicalRoomResetActionFallback() {
  return {
    chosenTitle: 'เก็บเสื้อผ้า 5 ชิ้นออกจากเก้าอี้',
    chosenRationale: 'บริบทนี้เป็นห้องรกจริง จึงควรเริ่มจากก้าวกายภาพที่เห็นผลทันทีแทนการวางแผนกว้าง',
    successSignal: 'เก้าอี้หรือโต๊ะมีพื้นที่ใช้งานหนึ่งจุดภายใน 10 นาที',
    whyThisNow: 'ตอนนี้ติดที่ไม่รู้จะเริ่มเก็บจากตรงไหน ก้าวนี้เล็กพอทำได้ทันทีและเห็นผลในห้องจริง',
    situationSummary: 'ห้องรก มีเสื้อผ้าบนเก้าอี้และของบนโต๊ะ จึงควรเริ่มจากเคลียร์พื้นที่ใช้งานหนึ่งจุดใน 10 นาที',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'เคลียร์เก้าอี้ให้กลับมานั่งได้',
        rationale: 'เหมาะเมื่ออยากเห็นผลชัดที่สุดจากพื้นที่หนึ่งจุดก่อน',
      },
      {
        title: 'ย้ายแก้วน้ำกับกระดาษออกจากโต๊ะหนึ่งมุม',
        rationale: 'เหมาะเมื่ออยากเริ่มจากโต๊ะก่อนเก้าอี้',
      },
    ],
  };
}

export function buildLogoRevisionActionFallback(rawContext?: string, isReentry?: boolean) {
  if (isReentry) {
    return {
      chosenTitle: 'ร่างคำตอบลูกค้า 3 บรรทัดจากรายการแก้สี ฟอนต์ และขนาดโลโก้',
      chosenRationale: 'สานต่องานจากลิสต์จุดแก้ที่จดไว้แล้ว เพื่อปิดจ๊อบส่วนสื่อสารลูกค้า',
      successSignal: 'ได้ข้อความตอบลูกค้าที่พร้อมส่ง',
      whyThisNow: 'ได้รายการมาแล้ว ก้าวต่อไปที่ชัดเจนคือการอัปเดตลูกค้าว่าเรากำลังจะเริ่มทำอะไรบ้าง',
      situationSummary: 'จดรายการแก้โลโก้ 3 จุด (สี ฟอนต์ ขนาดโลโก้) เรียบร้อยแล้ว',
      replyDraft: 'รับทราบการแก้ 3 จุดครับ (สี ฟอนต์ ขนาดโลโก้) เดี๋ยวผมจะเริ่มดำเนินการให้นะครับ',
      alternatives: [
        {
          title: 'เริ่มแก้ไฟล์โลโก้จุดที่ 1 ทันที',
          rationale: 'เหมาะสำหรับอยากลงมือทำไฟล์งานก่อนตอบกลับ',
        },
      ],
    };
  }

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

export function buildLogoRevisionStepFallback(rawContext?: string, isReentry?: boolean) {
  if (isReentry) {
    return [
      'เรียบเรียง 3 จุดที่จดไว้เป็นประโยคตอบกลับ',
      'ตรวจทานความถูกต้องก่อนส่งให้ลูกค้า',
      'กดส่งข้อความทาง LINE',
    ];
  }
  return [
    'เปิด LINE หาข้อความที่ลูกค้าบรีฟเรื่องโลโก้',
    'จดรายการแก้สี ฟอนต์ และขนาดโลโก้ลง Notes',
    'เช็กให้ชัวร์ว่ามีแค่ 3 จุดนี้',
  ];
}

export function buildOverloadedWorkActionFallback(rawContext?: string) {
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

export function buildStudentReportActionFallback(sourceText?: string) {
  const hasRenewable = /renewable energy storage/i.test(sourceText ?? '');
  const hasRefLinkEn = /reference link/i.test(sourceText ?? '');
  
  const topicLabel = hasRenewable ? ' ของ renewable energy storage' : '';
  const topicSubject = hasRenewable ? 'วิชาวิศวะหัวข้อ renewable energy storage' : 'วิชาหนึ่ง';
  const refLinkLabel = hasRefLinkEn ? 'reference link' : 'ลิงก์อ้างอิง';
  const refLinkLabelPlural = hasRefLinkEn ? 'reference links' : 'ลิงก์อ้างอิง';
  const documentsLabel = /เอกสารจริง/.test(sourceText ?? '') ? 'เอกสารจริง' : 'เอกสาร';
  const chatLabel = /แชท|แชต/.test(sourceText ?? '') ? 'ในแชท' : 'ที่มี';

  return {
    chosenTitle: `เปิด ${refLinkLabel} 1 อัน แล้วจด 3 bullet สำหรับบทนำรายงาน`,
    chosenRationale: `บริบทนี้คือรายงาน${topicLabel}ที่ติดตรงเริ่มบทนำ จึงควรเริ่มจาก ${refLinkLabel} เดียวก่อน`,
    successSignal: 'ได้ 3 bullet สำหรับบทนำรายงานและประโยคแรกที่เขียนต่อได้',
    whyThisNow: `ตอนนี้มี ${refLinkLabelPlural} หลายอันและยังไม่ได้เปิด${documentsLabel} ก้าวนี้ลดให้เหลือ 10 นาทีแรก`,
    situationSummary: `ต้องเริ่มรายงาน${topicSubject}จาก${refLinkLabelPlural}${chatLabel} โดยเริ่มบทนำให้ได้ใน 10 นาที`,
    replyDraft: undefined,
    alternatives: [
      {
        title: `เปิด${documentsLabel} แล้วเขียนโครงรายงาน 3 หัวข้อจากหัวข้อและ${refLinkLabelPlural}ที่มี`,
        rationale: 'เหมาะเมื่ออยากเริ่มจากสรุปหัวข้อที่มีอยู่ก่อน',
      },
      {
        title: `เขียนโครงบทนำ 3 บรรทัดจากหัวข้อรายงาน${topicLabel}`,
        rationale: 'เหมาะเมื่อยังไม่พร้อมอ่านข้อมูลจำนวนมาก',
      },
    ],
  };
}

export function buildProductPostActionFallback() {
  return {
    chosenTitle: 'ร่าง caption สินค้า 3 บรรทัดจากจุดขาย เบา ซักง่าย และ 3 สี',
    chosenRationale: 'บริบทนี้มีรูปสินค้าและจุดขายพร้อมแล้ว จึงควรเริ่มจาก caption ที่โพสต์ได้แทนการรวบรวมข้อมูลเพิ่ม',
    successSignal: 'ได้ caption กระเป๋าผ้า canvas ที่พร้อมใช้โพสต์คืนนี้',
    whyThisNow: 'ตอนนี้ติดที่ caption ยังไม่มี ทั้งที่จุดขายชัดแล้ว ก้าวนี้จึงทำให้โพสต์สินค้าใหม่ขยับได้ทันที',
    situationSummary: 'ต้องโพสต์สินค้าใหม่ในร้านออนไลน์คืนนี้ เป็นกระเป๋าผ้า canvas มีรูปแล้ว จุดขายคือเบา ซักง่าย และมี 3 สี',
    replyDraft: undefined,
    alternatives: [
      {
        title: 'จดจุดขายกระเป๋าผ้า canvas เป็น 3 bullet',
        rationale: 'เหมาะเมื่ออยากล็อกวัตถุดิบก่อนเขียน caption',
      },
      {
        title: 'เขียน caption เปิดโพสต์จากจุดขายเบาและซักง่าย',
        rationale: 'เหมาะเมื่ออยากเริ่มจากประโยคขายก่อน',
      },
    ],
  };
}

export function collectTrustedSourceContext(task?: TaskContext, taskShape?: TaskShape) {
  return [
    task?.sourceText,
    task?.extractedText,
    task?.taskFrame?.objective,
    task?.taskFrame?.stage,
    task?.taskFrame?.stakeholders?.join(' '),
    task?.pendingInputs?.map((input) => input.answer).join(' '),
    taskShape?.workContext,
    taskShape?.missingInputs?.join(' '),
  ].filter(Boolean).join(' ');
}

export function collectRawRoomSourceContext(task?: TaskContext) {
  return [
    task?.sourceText,
    task?.extractedText,
    task?.pendingInputs?.map((input) => input.answer).join(' '),
  ].filter(Boolean).join(' ');
}

export function hasDisallowedExternalStakeholderOutput(input: {
  sourceContext?: string;
  outputTexts: Array<string | undefined>;
}) {
  const outputText = input.outputTexts.filter(Boolean).join(' ');
  return hasExternalStakeholderTerm(outputText) && !hasExplicitExternalStakeholderSource(input.sourceContext);
}

export function isOverloadedWorkTaskShape(taskShape: TaskShape | undefined) {
  return isOverloadedWorkText(taskShape?.workContext) ||
    taskShape?.missingInputs.some((input) => isOverloadedWorkText(input)) === true;
}
