import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import {
  DUMP_HERO_HEADING,
  DUMP_TEXTBOX_LABEL,
  EDIT_CONTEXT_CTA,
  seedStudioSession,
  STUDIO_BLOCKED_INTENT,
  STUDIO_BLOCKED_REASON,
  STUDIO_PANEL_HEADING,
  STUDIO_SNAPSHOT_HEADING,
  STUDIO_STATUS_INTENT,
} from './studio-smoke-shared';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const FINAL_SCREENSHOT =
  process.env.MIND_STUDIO_SMOKE_SCREENSHOT || '/tmp/mind-browser-smoke-studio.png';
const FAILURE_SCREENSHOT =
  process.env.MIND_STUDIO_SMOKE_FAILURE_SCREENSHOT || '/tmp/mind-browser-smoke-studio-failure.png';

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
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
    console.log('[SMOKE] opening app shell');
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: 30000 });

    console.log('[SMOKE] seeding single-room studio session');
    const sourceText = await seedStudioSession(page);

    console.log('[SMOKE] reloading seeded dump route');
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel(DUMP_TEXTBOX_LABEL).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('heading', { name: STUDIO_PANEL_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    const desktopStudio = page.locator('.studio-desktop-stack');
    await desktopStudio.waitFor({ state: 'visible', timeout: 30000 });
    await desktopStudio.getByText(STUDIO_SNAPSHOT_HEADING).waitFor({ state: 'visible', timeout: 30000 });
    await desktopStudio.getByText('สรุปสถานะล่าสุดของ landing page ลูกค้า').waitFor({ state: 'visible', timeout: 30000 });
    await desktopStudio
      .getByText('งานนี้ยังขยับได้ ถ้าเริ่มจากการสรุปสถานะล่าสุดก่อน แล้วค่อยตอบลูกค้ากลับจากบริบทเดิม')
      .waitFor({ state: 'visible', timeout: 30000 });

    console.log('[SMOKE] reviewing status without live AI');
    const statusButton = desktopStudio.getByRole('button', { name: STUDIO_STATUS_INTENT });
    await statusButton.waitFor({ state: 'visible', timeout: 30000 });
    await statusButton.click();
    await desktopStudio.locator('.studio-card-emphasis').waitFor({ state: 'visible', timeout: 30000 });

    console.log('[SMOKE] checking blocked advanced intent copy');
    const showMoreButton = desktopStudio.getByRole('button', { name: 'ดูเพิ่ม' });
    await showMoreButton.waitFor({ state: 'visible', timeout: 30000 });
    await showMoreButton.click();
    const blockedIntent = desktopStudio.getByRole('button', { name: STUDIO_BLOCKED_INTENT });
    console.log('[SMOKE] waiting for blocked intent button');
    await blockedIntent.waitFor({ state: 'visible', timeout: 30000 });
    console.log('[SMOKE] clicking blocked intent button');
    await blockedIntent.click({ force: true });
    console.log('[SMOKE] waiting for blocked intent explanation');
    const blockedNote = desktopStudio.locator('.studio-inline-note');
    await blockedNote.waitFor({ state: 'visible', timeout: 30000 });
    const blockedNoteText = (await blockedNote.textContent())?.trim() ?? '';
    if (!blockedNoteText.includes(STUDIO_BLOCKED_REASON)) {
      throw new Error(`expected blocked intent copy to mention "${STUDIO_BLOCKED_REASON}", received: ${blockedNoteText}`);
    }

    console.log('[SMOKE] returning to dump with current context intact');
    const editContextButton = desktopStudio.getByRole('button', { name: EDIT_CONTEXT_CTA });
    console.log('[SMOKE] waiting for edit context CTA');
    await editContextButton.waitFor({ state: 'visible', timeout: 30000 });
    console.log('[SMOKE] clicking edit context CTA');
    await editContextButton.click();
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    const textarea = page.getByLabel(DUMP_TEXTBOX_LABEL);
    await textarea.waitFor({ state: 'visible', timeout: 30000 });

    const textareaValue = await textarea.inputValue();
    if (textareaValue !== sourceText) {
      throw new Error(`expected edit context to preserve the original dump text, received: ${textareaValue}`);
    }

    if (unexpectedAiRequests.length > 0) {
      throw new Error(`studio-only smoke unexpectedly triggered live AI routes: ${unexpectedAiRequests.join(', ')}`);
    }

    console.log('[SMOKE] capturing final screenshot');
    await ensureDirectory(FINAL_SCREENSHOT);
    await page.screenshot({ path: FINAL_SCREENSHOT, fullPage: true });

    console.log('[SMOKE] studio-only pass complete', {
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
  console.error('[SMOKE] studio-only pass failed', error);
  process.exitCode = 1;
});
