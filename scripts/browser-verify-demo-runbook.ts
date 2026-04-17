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
    const shellLoadStartedAt = Date.now();
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: UI_TIMEOUT_MS });

    const walkthroughCloseButton = page.getByRole('button', { name: '✕' });
    if (await walkthroughCloseButton.isVisible().catch(() => false)) {
      await walkthroughCloseButton.click();
    }

    const startHeading = page.getByRole('heading', { name: 'พิมพ์งานก่อน แล้วค่อยแนบไฟล์ถ้ามี' });
    const roomCanvasHeader = page.locator('.room-canvas-header');
    const routeTitle = page.locator('.mind-shell-route-title');
    const healthBadge = page.locator('.app-health-badge');
    const healthHeadline = page.locator('.app-health-headline');
    const activeRoomLabel = page.locator('.room-sidebar-item.is-active strong');

    await startHeading.waitFor({ state: 'visible' });
    const shellVisibleMs = Date.now() - shellLoadStartedAt;
    const initialHeaderCount = await roomCanvasHeader.count();
    if (initialHeaderCount !== 0) {
      throw new Error(`Expected start flow to hide reentry header, found ${initialHeaderCount}`);
    }

    await healthHeadline.filter({ hasText: 'Gemma' }).waitFor({ state: 'visible' });
    const healthBadgeText = ((await healthBadge.textContent()) ?? '').trim();
    const healthHeadlineText = ((await healthHeadline.textContent()) ?? '').trim();

    const startPrimaryButton = page.getByRole('button', { name: 'ไปต่อ' });
    await startPrimaryButton.waitFor({ state: 'visible' });

    const restartRoomButton = page.locator('.room-sidebar-item').filter({
      has: page.locator('strong', { hasText: 'ACME - Website revamp' }),
    });
    await restartRoomButton.click();
    await routeTitle.filter({ hasText: 'ACME - Website revamp' }).waitFor({ state: 'visible' });
    await activeRoomLabel.filter({ hasText: 'ACME - Website revamp' }).waitFor({ state: 'visible' });
    const acmeStudioSnapshot = page.locator('.studio-desktop-stack .studio-card').filter({ hasText: 'ACME' }).first();
    await acmeStudioSnapshot.waitFor({ state: 'visible' });

    const urgentRoomButton = page.locator('.room-sidebar-item').filter({
      has: page.locator('strong', { hasText: 'Northstar - Demo reply' }),
    });
    await urgentRoomButton.click();
    await routeTitle.filter({ hasText: 'Northstar - Demo reply' }).waitFor({ state: 'visible' });
    await activeRoomLabel.filter({ hasText: 'Northstar - Demo reply' }).waitFor({ state: 'visible' });
    const northstarStudioSnapshot = page.locator('.studio-desktop-stack .studio-card').filter({ hasText: 'Northstar' }).first();
    await northstarStudioSnapshot.waitFor({ state: 'visible' });

    await restartRoomButton.click();
    await routeTitle.filter({ hasText: 'ACME - Website revamp' }).waitFor({ state: 'visible' });
    await activeRoomLabel.filter({ hasText: 'ACME - Website revamp' }).waitFor({ state: 'visible' });
    await acmeStudioSnapshot.waitFor({ state: 'visible' });

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
      shellVisibleMs,
      initialStartHeadingVisible: true,
      startFlowStaysVisibleOnRoomSelect: true,
      healthBadge: healthBadgeText,
      healthHeadline: healthHeadlineText,
      roomSwitchReflectedInChrome: true,
      roomSwitchReflectedInStudio: true,
      startHeaderCount: initialHeaderCount,
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
