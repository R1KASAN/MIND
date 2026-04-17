import { chromium } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const SCREENSHOT_PATH = process.env.MIND_SALES_INQUIRY_SCREENSHOT || '/tmp/mind-sales-inquiry-verify.png';
const FAILURE_SCREENSHOT_PATH = process.env.MIND_SALES_INQUIRY_FAILURE_SCREENSHOT || '/tmp/mind-sales-inquiry-verify-failure.png';
const AI_WAIT_TIMEOUT_MS = Number(process.env.MIND_SALES_INQUIRY_AI_TIMEOUT_MS || 180000);
const INPUT_TEXT = process.env.MIND_SALES_INQUIRY_TEXT || `สวัสดีครับทีม MIND

ผมเป็นตัวแทนจากบริษัท Alpha Retail ที่คุยกับคุณเมื่อสัปดาห์ที่แล้วเรื่องระบบช่วยจัดการงานทีมขายครับ

สรุปสถานการณ์ตอนนี้ของเราคือ:

ทีมขายมีตัวแทนประมาณ 25 คน กระจายอยู่หลายจังหวัด

ข้อมูลลูกค้าและดีลค้างอยู่กระจัดกระจายมาก ทั้งใน Excel, LINE, และอีเมลส่วนตัว

ผู้จัดการทีมอยากเห็นภาพรวมว่า “สัปดาห์นี้ควรโฟกัสดีลไหนก่อน” แต่ทุกคนส่งข้อมูลกันคนละรูปแบบ
สิ่งที่เราอยากได้จากระบบของคุณคือ:

ช่วยดึงข้อมูลจากโน้ต/อีเมล/สเปรดชีตที่มีอยู่ แล้วสรุปให้ได้ว่าตอนนี้มีดีลสำคัญอะไรค้างอยู่บ้าง

ช่วยแนะนำ 1–2 งานสำคัญที่ทีมควรทำในแต่ละวัน เพื่อไม่ให้หลุดดีลใหญ่

ถ้าเป็นไปได้ อยากให้ระบบช่วยเตือนเวลามีดีลใกล้เดดไลน์ แต่ยังไม่มีการติดตามล่าสุด
ข้อจำกัดของเรา:

ทีมขายบางคนไม่ถนัดเครื่องมือใหม่ ๆ มากนัก เลยอยากเริ่มจากการ “วาง (paste) ข้อมูล” ลงไปก่อน มากกว่าจะต้องไปกดเมนูหลายชั้น

ช่วงนี้เรายุ่งกับการปิดไตรมาส เลยอยากเริ่มจาก pilot เล็ก ๆ กับทีมย่อยก่อน
ถ้าทีมคุณสะดวก ผมอยากนัดเดโมสั้น ๆ (ประมาณ 30 นาที) ภายในสัปดาห์หน้า เพื่อดูว่าระบบ MIND ช่วยเราในเคสนี้ได้แค่ไหน และควรเริ่มจาก workflow แบบไหนครับ
ขอบคุณมากครับ
นพดล
Sales Operations Manager
Alpha Retail`;

async function settleIntoOneAction(page: import('@playwright/test').Page) {
  const oneActionHeading = page.locator('h1.action-hero-title');
  const oneActionButton = page.getByRole('button', { name: 'ใช้ก้าวนี้' });
  const clarificationHeading = page.getByRole('heading', { name: 'ขอข้อมูลเพิ่มนิดเดียว เพื่อสรุปให้ตรง' });

  const firstResolved = await Promise.race([
    oneActionButton.waitFor({ state: 'visible', timeout: AI_WAIT_TIMEOUT_MS }).then(() => 'one_action'),
    clarificationHeading.waitFor({ state: 'visible', timeout: AI_WAIT_TIMEOUT_MS }).then(() => 'clarification'),
  ]);

  if (firstResolved === 'clarification') {
    const clarificationInput = page.getByPlaceholder('พิมพ์รายละเอียดที่ยังขาดอยู่ 1 จุด');
    await clarificationInput.fill('อยากได้คำตอบที่ยืนยันการนัด demo พร้อมชี้ use case pilot ที่ควรเริ่มก่อน');
    await page.getByRole('button', { name: 'สรุปต่อเลย' }).click();
    await oneActionButton.waitFor({ state: 'visible', timeout: AI_WAIT_TIMEOUT_MS });
  }

  await oneActionHeading.waitFor({ state: 'visible', timeout: 30000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(AI_WAIT_TIMEOUT_MS);

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('พิมพ์สภาพงานของคุณ').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel('พิมพ์สภาพงานของคุณ').fill(INPUT_TEXT);
    await page.getByRole('button', { name: 'ไปต่อ' }).click();

    await settleIntoOneAction(page);
    const heroTitle = (await page.locator('h1.action-hero-title').innerText()).trim();
    const pageText = await page.locator('body').innerText();
    const hasReplyPanel =
      (await page.getByText('ถ้าจะตอบลูกค้าตอนนี้').count()) > 0 ||
      (await page.getByRole('button', { name: 'ดูร่างเต็ม' }).count()) > 0;
    const hasMalformedSummary = /MIND อ่านว่าสถานการณ์ตอนนี้คือ\s*\{/.test(pageText);
    const looksDemoAware =
      /demo|เดโม|pilot|นัด|ตอบ/i.test(heroTitle) ||
      /demo|เดโม|pilot|นัด/i.test(pageText);
    const isGenericRegression =
      heroTitle.includes('สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี') ||
      heroTitle.includes('สรุปประเด็นหลักจากข้อความลูกค้าก่อน');

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    const summary = {
      ok: looksDemoAware && !hasMalformedSummary && !isGenericRegression,
      heroTitle,
      hasReplyPanel,
      hasMalformedSummary,
      isGenericRegression,
      consoleErrors,
      screenshotPath: SCREENSHOT_PATH,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!summary.ok) {
      throw new Error('sales inquiry UI verification failed');
    }
  } catch (error) {
    await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sales-inquiry-verify] ${message}`);
  process.exitCode = 1;
});
