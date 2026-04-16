import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const SCREENSHOT_PATH = process.env.MIND_DEMO_BROWSER_SCREENSHOT || '/tmp/mind-demo-browser-verify.png';
const FAILURE_SCREENSHOT_PATH =
  process.env.MIND_DEMO_BROWSER_FAILURE_SCREENSHOT || '/tmp/mind-demo-browser-verify-failure.png';
const UI_TIMEOUT_MS = Number(process.env.MIND_DEMO_BROWSER_TIMEOUT_MS || 30000) || 30000;

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(UI_TIMEOUT_MS);

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    const initialUrl = `${BASE_URL}/?demo=presentation&scenario=restart&walkthrough=off&ritual=off`;
    const cardLoadStartedAt = Date.now();
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: UI_TIMEOUT_MS });

    const walkthroughCloseButton = page.getByRole('button', { name: '✕' });
    if (await walkthroughCloseButton.isVisible().catch(() => false)) {
      await walkthroughCloseButton.click();
    }

    const roomCanvasHeader = page.locator('.room-canvas-header');
    const reentrySummaryBlock = page.locator('.room-canvas-header .room-reentry-block').filter({
      has: page.locator('.room-reentry-label', { hasText: 'ค้างตรงนี้' }),
    });
    const reentryNextMoveBlock = page.locator('.room-canvas-header .room-reentry-block').filter({
      has: page.locator('.room-reentry-label', { hasText: 'เริ่มตรงนี้' }),
    });
    const primaryRoomHeading = page.getByRole('heading', { name: 'ACME - Website revamp' });
    const healthBadge = page.locator('.app-health-badge');
    const healthHeadline = page.locator('.app-health-headline');
    const continueButton = page.getByRole('button', { name: 'ต่อจากจุดนี้' });
    const makeSmallerButton = page.getByRole('button', { name: 'ทำให้เริ่มง่ายขึ้น' });

    await roomCanvasHeader.waitFor({ state: 'visible' });
    await primaryRoomHeading.waitFor({ state: 'visible' });
    const cardVisibleMs = Date.now() - cardLoadStartedAt;
    const cachedSummaryBeforeRefresh = (await reentrySummaryBlock.innerText()).replace(/\s+/g, ' ').trim();
    const cachedNextMoveBlockText = (await reentryNextMoveBlock.innerText()).replace(/\s+/g, ' ').trim();
    const cachedNextMoveBeforeRefresh = cachedNextMoveBlockText.replace(/^เริ่มตรงนี้\s*/, '').trim();
    if (cachedNextMoveBeforeRefresh.length < 1) {
      throw new Error('Reentry card did not show next moves before refresh wait');
    }

    await page.waitForTimeout(3000);

    await page.getByText('ค้างตรงนี้').waitFor({ state: 'visible' });
    await page.getByText('เริ่มตรงนี้').waitFor({ state: 'visible' });
    await page.getByText('AI ใช้ข้อมูลอะไร').waitFor({ state: 'visible' });
    await continueButton.waitFor({ state: 'visible' });
    await makeSmallerButton.waitFor({ state: 'visible' });

    await healthHeadline.filter({ hasText: 'Gemma' }).waitFor({ state: 'visible' });
    const healthBadgeText = ((await healthBadge.textContent()) ?? '').trim();
    const healthHeadlineText = ((await healthHeadline.textContent()) ?? '').trim();

    const freshIndicators = page.getByText('AI สด');
    const freshCount = await freshIndicators.count();
    if (freshCount < 2) {
      throw new Error(`Expected both sidebar and reentry card to show AI สด, found ${freshCount}`);
    }

    const initialSummary = (
      await reentrySummaryBlock.innerText()
    ).replace(/\s+/g, ' ').trim();

    const urgentRoomButton = page.locator('.room-sidebar-item').filter({
      has: page.locator('strong', { hasText: 'Northstar - Demo reply' }),
    });
    await urgentRoomButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    const urgentRoomHeading = page.getByRole('heading', { name: 'Northstar - Demo reply' });
    await urgentRoomHeading.waitFor({ state: 'visible' });
    await urgentRoomButton.getByText('Urgent reply').first().waitFor({ state: 'visible' });
    const urgentNextMoveText = (
      await reentryNextMoveBlock.innerText()
    ).replace(/\s+/g, ' ').trim().replace(/^เริ่มตรงนี้\s*/, '').trim();
    if (urgentNextMoveText.length < 1) {
      throw new Error('Urgent room did not show any next moves in the reentry card');
    }
    const urgentContinueButton = page.getByRole('button', { name: 'ต่อจากจุดนี้' });
    if (!(await urgentContinueButton.isEnabled())) {
      throw new Error('Urgent room continue CTA is disabled');
    }
    const urgentSummary = (
      await reentrySummaryBlock.innerText()
    ).replace(/\s+/g, ' ').trim();

    const restartRoomButton = page.locator('.room-sidebar-item').filter({
      has: page.locator('strong', { hasText: 'ACME - Website revamp' }),
    });
    await restartRoomButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await primaryRoomHeading.waitFor({ state: 'visible' });
    const restoredRestartSummary = (
      await reentrySummaryBlock.innerText()
    ).replace(/\s+/g, ' ').trim();
    if (initialSummary !== restoredRestartSummary) {
      throw new Error('Restart room summary changed after switching away and back');
    }
    await urgentRoomButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await urgentRoomHeading.waitFor({ state: 'visible' });

    const restoredUrgentSummary = (
      await reentrySummaryBlock.innerText()
    ).replace(/\s+/g, ' ').trim();

    if (urgentSummary !== restoredUrgentSummary) {
      throw new Error('Urgent room summary changed after switching away and back');
    }

    const hasErrorSplash =
      (await page.getByText('ติดตั้งโมเดลก่อนเพื่อเปิด AI loop').count()) > 0 ||
      (await page.getByText('AI ยังไม่พร้อม').count()) > 0;
    if (hasErrorSplash) {
      throw new Error('App rendered an AI unavailable state during demo browser verification');
    }

    await ensureDirectory(SCREENSHOT_PATH);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    const summary = {
      ok: true,
      baseUrl: BASE_URL,
      cardVisibleMs,
      cachedCardVisibleBeforeRefresh: cachedSummaryBeforeRefresh.length > 0 && cachedNextMoveBeforeRefresh.length > 0,
      cachedNextMoveCountBeforeRefresh: cachedNextMoveBeforeRefresh.length > 0 ? 1 : 0,
      healthBadge: healthBadgeText,
      healthHeadline: healthHeadlineText,
      freshCount,
      restoredSummaryMatches: initialSummary === restoredRestartSummary,
      urgentNextMoveCount: urgentNextMoveText.length > 0 ? 1 : 0,
      urgentContinueEnabled: await urgentContinueButton.isEnabled(),
      urgentSummaryPreserved: urgentSummary === restoredUrgentSummary,
      cachedSummaryPreview: cachedSummaryBeforeRefresh,
      consoleErrors,
      screenshotPath: SCREENSHOT_PATH,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await ensureDirectory(FAILURE_SCREENSHOT_PATH);
    await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo-browser-verify] ${message}`);
  process.exitCode = 1;
});
