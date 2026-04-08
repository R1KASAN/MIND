import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const BOUNCE_BACK_SCREENSHOT =
  process.env.MIND_MOBILE_BOUNCE_BACK_SCREENSHOT || '/tmp/mind-bounceback-mobile.png';
const MORNING_SCREENSHOT =
  process.env.MIND_MOBILE_MORNING_SCREENSHOT || '/tmp/mind-morning-mobile.png';
const STUDIO_SNAPSHOT_HEADING = 'บริบทที่ MIND ใช้อยู่';

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function seedReentrySession(page: Page, uiRoute: 'BOUNCE_BACK' | 'MORNING_RITUAL') {
  await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: 30000 });

  await page.evaluate(async ({ uiRoute }) => {
    const now = Date.now();
    const session = {
      lastActive: uiRoute === 'BOUNCE_BACK' ? now - (26 * 60 * 60 * 1000) : now,
      uiRoute,
      status: uiRoute,
      notThisCount: 0,
      currentActionId: 'demo-action',
      task: {
        id: 'demo-task',
        workflowType: 'client_resume',
        sourceText: 'ลูกค้าส่ง feedback ยาวและงานค้างอยู่หลายวัน',
        sourceFiles: [],
        extractedText: '',
        createdAt: now - 100000,
        pendingInputs: [],
        blockerSignals: ['feedback หลายข้อ', 'ยังไม่ได้สรุปสถานะล่าสุด'],
        lifecycleState: uiRoute === 'BOUNCE_BACK' ? 'stalled' : 'dumped',
        currentStepIndex: 0,
        currentActionId: 'demo-action',
        rescueHistory: [],
        actionExplanation: 'ตอนนี้ควรเริ่มจากการสรุปสถานะล่าสุดก่อน แล้วค่อยขยับก้าวแรกที่เล็กที่สุด',
        reentryBrief: {
          summary: 'งานนี้ยังขยับได้ ถ้ากลับมาเริ่มจากการสรุปสถานะล่าสุดก่อน คุณจะตอบลูกค้าหรือเริ่มงานต่อได้ไวขึ้นมาก',
          ignoredNoise: ['ยังไม่ต้องเปิดทุกไฟล์', 'ยังไม่ต้องจัด todo ใหม่ทั้งโปรเจกต์'],
          topActions: [
            {
              roomId: 'demo-task',
              title: 'สรุปสถานะล่าสุดและเลือกก้าวถัดไป',
              rationale: 'ช่วยให้คุณกลับเข้าบริบทของงานนี้โดยไม่ต้องอ่านทุกอย่างใหม่',
              impact: 'high',
              effort: 'low',
              resumeTarget: uiRoute === 'BOUNCE_BACK' ? 'ONE_ACTION' : 'SCAFFOLD',
            },
            {
              roomId: 'demo-task',
              title: 'ตอบลูกค้ากลับสั้น ๆ ว่ากำลังไล่สรุป',
              rationale: 'ลดแรงกดดันภายนอกก่อน แล้วค่อยกลับมาทำงานหลัก',
              impact: 'medium',
              effort: 'low',
              resumeTarget: 'DUMP_ENTRY',
            },
          ],
          createdAt: now,
        },
      },
    };

    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const tx = db.transaction('keyval', 'readwrite');
    tx.objectStore('keyval').put(session, 'mind_session');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { uiRoute });
}

async function captureBounceBack(page: Page) {
  await seedReentrySession(page, 'BOUNCE_BACK');
  await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'กลับมาแล้ว งานนี้ยังไปต่อได้' }).waitFor({ state: 'visible' });
  await page.getByText(STUDIO_SNAPSHOT_HEADING).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /ทำอันนี้ก่อน:/ }).waitFor({ state: 'visible' });
  await page.getByText('เริ่มใหม่ = พิมพ์งานก่อนได้เลย ไม่มีไฟล์ก็เริ่มได้').waitFor({ state: 'visible' });
  await ensureDirectory(BOUNCE_BACK_SCREENSHOT);
  await page.screenshot({ path: BOUNCE_BACK_SCREENSHOT, fullPage: true });
}

async function captureMorning(page: Page) {
  await seedReentrySession(page, 'MORNING_RITUAL');
  await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Today with MIND').waitFor({ state: 'visible' });
  await page.getByText(STUDIO_SNAPSHOT_HEADING).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'เริ่มจากก้าวที่คุ้มสุดก่อน' }).waitFor({ state: 'visible' });
  await ensureDirectory(MORNING_SCREENSHOT);
  await page.screenshot({ path: MORNING_SCREENSHOT, fullPage: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  try {
    await captureBounceBack(page);
    await captureMorning(page);

    console.log('[SMOKE] reentry mobile pass complete', {
      baseUrl: BASE_URL,
      bounceBackScreenshot: BOUNCE_BACK_SCREENSHOT,
      morningScreenshot: MORNING_SCREENSHOT,
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('[SMOKE] reentry mobile pass failed', error);
  process.exitCode = 1;
});
