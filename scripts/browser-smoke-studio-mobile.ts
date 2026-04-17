import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import {
  DUMP_HERO_HEADING,
  DUMP_TEXTBOX_LABEL,
  EDIT_CONTEXT_CTA,
  STUDIO_SNAPSHOT_TARGET_SELECTOR,
  seedStudioSession,
  STUDIO_BLOCKED_INTENT,
  STUDIO_BLOCKED_REASON,
  STUDIO_STATUS_INTENT,
  waitForAnalyticsEventCount,
} from './studio-smoke-shared';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const FINAL_SCREENSHOT =
  process.env.MIND_STUDIO_MOBILE_SMOKE_SCREENSHOT || '/tmp/mind-browser-smoke-studio-mobile.png';
const FAILURE_SCREENSHOT =
  process.env.MIND_STUDIO_MOBILE_SMOKE_FAILURE_SCREENSHOT || '/tmp/mind-browser-smoke-studio-mobile-failure.png';

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
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

  const unexpectedAiRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/ai/')) return;
    if (url.includes('/api/ai/health')) return;
    unexpectedAiRequests.push(url);
  });
  page.on('pageerror', (error) => {
    console.error('[SMOKE][pageerror]', error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error('[SMOKE][console-error]', message.text());
    }
  });

  try {
    console.log('[SMOKE] opening mobile app shell');
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: 30000 });

    console.log('[SMOKE] seeding mobile studio session');
    const sourceText = await seedStudioSession(page);

    console.log('[SMOKE] reloading mobile dump route');
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel(DUMP_TEXTBOX_LABEL).waitFor({ state: 'visible', timeout: 30000 });
    const studioToggle = page.getByRole('button', { name: 'ตัวช่วย', exact: true });
    await studioToggle.waitFor({ state: 'visible', timeout: 30000 });
    await studioToggle.click();
    const studioDrawer = page.locator('.mind-room-studio-wrap.is-open');
    await studioDrawer.waitFor({ state: 'visible', timeout: 30000 });
    const mobileStudio = page.locator('.studio-panel');
    await mobileStudio.waitFor({ state: 'visible', timeout: 30000 });
    const snapshotTargets = mobileStudio.locator(STUDIO_SNAPSHOT_TARGET_SELECTOR);
    const snapshotTargetCount = await snapshotTargets.count();
    if (snapshotTargetCount !== 1) {
      throw new Error(`expected one studio snapshot target, received ${snapshotTargetCount}`);
    }
    await snapshotTargets.first().waitFor({ state: 'visible', timeout: 30000 });
    const provenanceSummary = mobileStudio.locator('.studio-mobile-intents .studio-provenance > summary').first();
    await provenanceSummary.waitFor({ state: 'visible', timeout: 30000 });
    await provenanceSummary.click();
    await mobileStudio.locator('.studio-mobile-intents .studio-provenance-body').first().waitFor({ state: 'visible', timeout: 30000 });
    await waitForAnalyticsEventCount(page, 'studio_snapshot_viewed', 1);

    console.log('[SMOKE] reviewing status on mobile');
    const statusButton = mobileStudio.getByRole('button', { name: STUDIO_STATUS_INTENT });
    await statusButton.waitFor({ state: 'visible', timeout: 30000 });
    await statusButton.click();
    await waitForAnalyticsEventCount(page, 'studio_snapshot_viewed', 1);

    console.log('[SMOKE] expanding mobile secondary intents');
    const showMoreButton = mobileStudio.getByRole('button', { name: 'ดูตัวช่วยเพิ่ม' });
    if (await showMoreButton.count()) {
      await showMoreButton.first().waitFor({ state: 'visible', timeout: 30000 });
      await showMoreButton.first().click();
    }

    console.log('[SMOKE] checking blocked advanced intent copy on mobile');
    const blockedIntent = mobileStudio.getByRole('button', { name: STUDIO_BLOCKED_INTENT });
    await blockedIntent.waitFor({ state: 'visible', timeout: 30000 });
    await blockedIntent.click({ force: true });
    const blockedNote = mobileStudio
      .locator('.studio-mobile-intents .studio-inline-note')
      .filter({ hasText: STUDIO_BLOCKED_REASON })
      .first();
    await blockedNote.waitFor({ state: 'visible', timeout: 30000 });
    const blockedNoteText = (await blockedNote.textContent())?.trim() ?? '';
    if (!blockedNoteText.includes(STUDIO_BLOCKED_REASON)) {
      throw new Error(`expected blocked intent copy to mention "${STUDIO_BLOCKED_REASON}", received: ${blockedNoteText}`);
    }

    console.log('[SMOKE] returning to dump with current context intact on mobile');
    const editContextButton = page.getByRole('button', { name: EDIT_CONTEXT_CTA }).first();
    await editContextButton.waitFor({ state: 'visible', timeout: 30000 });
    await editContextButton.click();
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    const textarea = page.getByLabel(DUMP_TEXTBOX_LABEL);
    await textarea.waitFor({ state: 'visible', timeout: 30000 });

    const textareaValue = await textarea.inputValue();
    if (textareaValue !== sourceText) {
      throw new Error(`expected edit context to preserve the original dump text, received: ${textareaValue}`);
    }

    if (unexpectedAiRequests.length > 0) {
      throw new Error(`mobile studio smoke unexpectedly triggered live AI routes: ${unexpectedAiRequests.join(', ')}`);
    }

    console.log('[SMOKE] capturing mobile final screenshot');
    await ensureDirectory(FINAL_SCREENSHOT);
    await page.screenshot({ path: FINAL_SCREENSHOT, fullPage: true });

    console.log('[SMOKE] mobile studio pass complete', {
      baseUrl: BASE_URL,
      screenshot: FINAL_SCREENSHOT,
    });
  } catch (error) {
    await ensureDirectory(FAILURE_SCREENSHOT);
    await page.screenshot({ path: FAILURE_SCREENSHOT, fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('[SMOKE] mobile studio pass failed', error);
  process.exitCode = 1;
});
