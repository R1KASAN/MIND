import type { MonetizationGateSettings } from '@/lib/analytics/local-analytics';

export type ProductPositioning = 'overlay-first' | 'hub-first';

export type IcpTag =
  | 'consultant_boutique_agency_lead'
  | 'freelance_retainer_dev_designer';

export interface ICPProfile {
  id: IcpTag;
  label: string;
  painNarrative: string;
  outcomeNarrative: string;
  wtpQuestions: string[];
}

export interface MonetizationHypothesis {
  primaryIcp: ICPProfile;
  secondaryIcp: ICPProfile;
  positioning: ProductPositioning;
  valueCaptureRule: string;
  priceBand: string;
  nextBestAlternative: string;
}

export const PRIMARY_ICP: ICPProfile = {
  id: 'consultant_boutique_agency_lead',
  label: 'Consultant / boutique agency lead',
  painNarrative:
    'หลาย client threads, หลายวันหายจากงานเดิม, ต้องตอบลูกค้าเร็วแต่ context กระจัดกระจาย และดีลเสียได้ถ้ากลับเข้าบริบทช้า',
  outcomeNarrative:
    'กลับมาแล้วรู้ next move ในไม่กี่นาที ไม่ต้อง reread กองเดิม และไม่ปล่อยงานลูกค้าค้างจนเสีย momentum',
  wtpQuestions: [
    'ครั้งล่าสุดที่กลับมางานค้างหลังหายไป 2–3 วัน คุณใช้เวลากี่นาทีกว่าจะรู้ว่าต้องทำอะไรต่อ?',
    'ถ้าเวลานั้นลดลงครึ่งหนึ่ง คุณคิดว่าคุ้มกับเงินเท่าไรต่อเดือน?',
    'งานแบบนี้เกิดกี่ครั้งต่อสัปดาห์ และมันกระทบดีล / รายได้ / ความไว้ใจแค่ไหน?',
    'ถ้าต้องเปรียบกับ workflow เดิม คุณจะยอมจ่ายเมื่อไหร่และเพราะอะไร?',
    'อะไรคือ threshold ที่ทำให้คุณไม่เปลี่ยน workflow?',
  ],
};

export const SECONDARY_ICP: ICPProfile = {
  id: 'freelance_retainer_dev_designer',
  label: 'Freelance dev / designer with retainers',
  painNarrative:
    'ต้องรับงานหลายลูกค้าแบบต่อเนื่อง งานค้างวนกลับมาเรื่อย ๆ และการ reentry ทำให้เสียสมาธิและเสียเวลาเปิด context ซ้ำ',
  outcomeNarrative:
    'พอเปิดงานเก่าอีกครั้ง จะเห็นก้าวที่เริ่มได้ทันทีและกลับเข้าจังหวะงานเดิมได้เร็วขึ้น',
  wtpQuestions: [
    'ในหนึ่งสัปดาห์ คุณกลับไปเปิดงานเดิมกี่ครั้ง?',
    'เวลาที่เสียไปกับการ reread หรือหาข้อมูลเก่า คุณคิดเป็นกี่ชั่วโมงต่อเดือน?',
    'ถ้าเครื่องมือนี้ช่วยลดเวลานั้นลงได้ คุณจะจ่ายเท่าไรต่อเดือน?',
    'คุณจะยอมเปลี่ยน workflow แค่ไหนถ้าใช้งานได้ทันทีโดยไม่ต้องย้ายทุกอย่าง?',
    'ถ้าบริบทนี้หายไป คุณจะเสียดายเพราะอะไรที่สุด?',
  ],
};

export const DEFAULT_MONETIZATION_HYPOTHESIS: MonetizationHypothesis = {
  primaryIcp: PRIMARY_ICP,
  secondaryIcp: SECONDARY_ICP,
  positioning: 'overlay-first',
  valueCaptureRule: 'Capture ประมาณ 10–20% ของ value ที่สร้างจากเวลา reentry / time-to-next-move ที่ลดลง',
  priceBand: '$9–29 solo / $49–79 small team pilot',
  nextBestAlternative: 'Notion + AI, ChatGPT/Claude, manual reread, Slack/email thread hopping',
};

export const DEFAULT_GATE_SETTINGS: MonetizationGateSettings = {
  targetTimeToNextMoveImprovementPct: 35,
  targetReentryImprovementPct: 25,
  targetSourceReductionPct: 30,
  targetRescueSuccessRate: 70,
  valueCapturePct: 15,
  positioning: 'overlay-first',
  primaryIcp: PRIMARY_ICP.id,
  secondaryIcp: SECONDARY_ICP.id,
};

export function buildOutcomePitch(): string {
  return 'MIND ช่วยให้กลับจาก context chaos ไปถึง next move ได้เร็วขึ้น โดยไม่ต้อง reread กองเดิม และช่วยให้งานลูกค้ากลับมาเดินต่อได้จริง';
}

