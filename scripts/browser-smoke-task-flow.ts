import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Page, type Response } from '@playwright/test';

// Phase 4 note:
// This smoke is the primary live single-room loop check for
// DUMP -> action -> scaffold -> rescue -> reentry -> mobile continuity.
// It should be interpreted separately from the deterministic Studio gates.
// If Studio smokes pass but this script fails during rescue, count it as a
// rescue-loop blocker. If it fails before rescue, count it as loop integration.

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const RESCUE_BASELINE_LABEL = process.env.MIND_RESCUE_BASELINE_LABEL || 'unspecified';
const FINAL_SCREENSHOT = process.env.MIND_SMOKE_SCREENSHOT || '/tmp/mind-browser-smoke-task-flow.png';
const FAILURE_SCREENSHOT = process.env.MIND_SMOKE_FAILURE_SCREENSHOT || '/tmp/mind-browser-smoke-task-flow-failure.png';
const SUMMARY_PATH = process.env.MIND_SMOKE_TASK_FLOW_SUMMARY_PATH;
const SCAFFOLD_LOADING_COPY = 'MIND กำลังหาวิธีย่อยให้เล็กลงที่ยังมีความหมายอยู่…';
const DUMP_TEXTBOX_LABEL = 'พิมพ์สภาพงานของคุณ';
const DUMP_HERO_HEADING = 'พิมพ์สภาพงานมาก่อน แล้วค่อยแนบไฟล์ถ้ามี';
const DUMP_REASSURANCE_COPY = 'ไม่มีไฟล์ก็เริ่มได้ MIND จะใช้ข้อความที่คุณพิมพ์ก่อน แล้วค่อยอ่านไฟล์เป็น context เสริมถ้ามี';
const STUDIO_EMPTY_PANEL_HEADING = 'เริ่มจากข้อความก่อน แล้วค่อยใช้ Studio ต่อ';
const STUDIO_STATUS_INTENT = 'กลับมาดูสถานะ';
const STUDIO_EMPTY_SNAPSHOT = 'ยังไม่มี snapshot ของงานนี้ เพราะ MIND ยังไม่มีข้อความหรือบริบทพอให้สรุป';
const STUDIO_SNAPSHOT_HEADING = 'บริบทที่ MIND ใช้อยู่';
const BOUNCE_BACK_FRESH_NOTE = 'เริ่มใหม่ = พิมพ์งานก่อนได้เลย ไม่มีไฟล์ก็เริ่มได้';
const ONE_ACTION_HEADER = 'MIND คิดว่าควรเริ่มจากตรงนี้ก่อน';
const ONE_ACTION_PRIMARY_CTA = 'ใช้ก้าวนี้ แล้วแตกเป็นขั้นตอน';
const ONE_ACTION_SECONDARY_CTA = 'ลองอีกทางจากข้อความเดิม';
const DECISION_BOARD_HEADER = 'โอเค ลองอีกทางจากข้อความเดิมเดียวกัน';
const DECISION_BOARD_BACK_CTA = 'กลับไปใช้ข้อเสนอแรก';
const REPLY_PREVIEW_TOGGLE = 'ดูร่างเต็ม';

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function writeSummaryReport(summary: Record<string, unknown>) {
  if (!SUMMARY_PATH) return;
  await ensureDirectory(SUMMARY_PATH);
  await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function extractFailureField(detail: string | undefined) {
  if (!detail) return undefined;

  const schemaPath = detail.match(/schema_validation_failed:\s*([a-zA-Z0-9_.[\]]+):/);
  if (schemaPath?.[1]) {
    return schemaPath[1];
  }

  const directPath = detail.match(/(?:^|\s)([a-zA-Z0-9_.[\]]+):/);
  if (directPath?.[1]) {
    return directPath[1];
  }

  const quotedPath = detail.match(/at ["']?([a-zA-Z0-9_.[\]]+)["']?/);
  return quotedPath?.[1];
}

async function readStoredSession(page: Page) {
  return page.evaluate(async () => {
    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const tx = db.transaction('keyval', 'readonly');
    const store = tx.objectStore('keyval');
    const session = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const request = store.get('mind_session');
      request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return session ?? null;
  });
}

async function waitForAiResponse(page: Page, routeFragment: string) {
  const response = await page.waitForResponse(
    (candidate) => candidate.url().includes(routeFragment) && candidate.request().method() === 'POST',
    { timeout: 90000 },
  );

  const body = await response.json().catch(() => null);
  return { response, body };
}

async function settleIntoOneAction(page: Page) {
  const oneActionButton = page.getByRole('button', { name: ONE_ACTION_PRIMARY_CTA });
  const clarificationHeading = page.getByRole('heading', { name: 'ขอข้อมูลเพิ่มนิดเดียว เพื่อสรุปให้ตรง' });
  const firstResolved = await Promise.race([
    oneActionButton.waitFor({ state: 'visible', timeout: 90000 }).then(() => 'one_action'),
    clarificationHeading.waitFor({ state: 'visible', timeout: 90000 }).then(() => 'clarification'),
  ]);

  if (firstResolved === 'clarification') {
    await page.getByPlaceholder('พิมพ์รายละเอียดที่ยังขาดอยู่ 1 จุด').fill('ขอเริ่มจากการสรุปสถานะล่าสุดและร่างข้อความถามกลับลูกค้าก่อน');
    await page.getByRole('button', { name: 'สรุปต่อเลย' }).click();
    await oneActionButton.waitFor({ state: 'visible', timeout: 90000 });
  }

  await page.getByText(ONE_ACTION_HEADER).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: ONE_ACTION_SECONDARY_CTA }).waitFor({ state: 'visible', timeout: 30000 });
}

async function readOperationResponse(response: Response, routeFragment: string) {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new Error(`${routeFragment} returned an invalid JSON body`);
  }
  return {
    status: response.status(),
    ok: response.ok(),
    body,
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  let stage:
    | 'boot'
    | 'dump'
    | 'action'
    | 'decision_board'
    | 'scaffold'
    | 'rescue'
    | 'post_rescue_scaffold'
    | 'dump_reset'
    | 'reentry'
    | 'complete' = 'boot';
  const summary = {
    baseline: RESCUE_BASELINE_LABEL,
    reachedAction: false,
    reachedScaffold: false,
    reachedRescue: false,
    reachedReentry: false,
    reachedCompletionReset: false,
    rescueStatus: undefined as number | undefined,
    scaffoldStatus: undefined as number | undefined,
    scaffoldRetryStatus: undefined as number | undefined,
    rescuePassType: undefined as string | undefined,
    rescueFailureDetail: undefined as string | undefined,
    rescueFailureField: undefined as string | undefined,
  };
  page.on('pageerror', (error) => {
    console.error('[SMOKE][pageerror]', error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error('[SMOKE][console-error]', message.text());
    }
  });

  try {
    stage = 'dump';
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: 30000 });
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'แนบไฟล์เพิ่ม' }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('heading', { name: STUDIO_EMPTY_PANEL_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: STUDIO_STATUS_INTENT }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByText(STUDIO_EMPTY_SNAPSHOT).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel(DUMP_TEXTBOX_LABEL).fill(
      'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องตอบลูกค้ากลับวันนี้ ช่วยสรุปสถานการณ์ ร่างข้อความตอบกลับ แล้วบอกก้าวแรกที่ควรทำต่อทันที',
    );
    await page.getByRole('button', { name: 'สรุปให้เลย' }).click();

    stage = 'action';
    await settleIntoOneAction(page);
    summary.reachedAction = true;
    stage = 'decision_board';
    await page.getByRole('button', { name: ONE_ACTION_SECONDARY_CTA }).click();
    await page.getByRole('heading', { name: DECISION_BOARD_HEADER }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: DECISION_BOARD_BACK_CTA }).waitFor({ state: 'visible', timeout: 30000 });
    const decisionBoardOption = page.getByText('ก้าวแรกแบบอื่น').first();
    await decisionBoardOption.waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: DECISION_BOARD_BACK_CTA }).click();
    await page.getByText(ONE_ACTION_HEADER).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: ONE_ACTION_PRIMARY_CTA }).waitFor({ state: 'visible', timeout: 30000 });

    const replyPreviewToggle = page.getByRole('button', { name: REPLY_PREVIEW_TOGGLE });
    await replyPreviewToggle.waitFor({ state: 'visible', timeout: 30000 });
    if (await page.locator('textarea.reply-draft-textarea').count()) {
      throw new Error('reply draft should be collapsed by default in ONE_ACTION');
    }
    await replyPreviewToggle.click();
    await page.locator('textarea.reply-draft-textarea').waitFor({ state: 'visible', timeout: 30000 });

    stage = 'scaffold';
    await page.getByRole('button', { name: ONE_ACTION_PRIMARY_CTA }).click();
    const smallerButton = page.getByRole('button', { name: 'ย่อยให้เล็กลงอีก' });
    await smallerButton.waitFor({ state: 'visible' });
    const firstStepCard = page.locator('div').filter({ hasText: 'ขั้นตอน 1' }).first();
    const firstStepBefore = await firstStepCard.textContent();

    const scaffoldPromise = waitForAiResponse(page, '/api/ai/scaffold');
    await smallerButton.click();
    await page.getByText(SCAFFOLD_LOADING_COPY).waitFor({ state: 'visible' });
    if (!(await smallerButton.isDisabled())) {
      throw new Error('scaffold refine button should be disabled while loading');
    }
    const { response: scaffoldResponse } = await scaffoldPromise;
    const scaffoldResult = await readOperationResponse(scaffoldResponse, '/api/ai/scaffold');
    summary.scaffoldStatus = scaffoldResult.status;
    await page.getByRole('button', { name: 'ฉันติดอยู่' }).waitFor({ state: 'visible' });
    summary.reachedScaffold = true;
    const firstStepAfter = await firstStepCard.textContent();
    if (firstStepBefore === firstStepAfter) {
      throw new Error('scaffold refinement did not change the visible first step');
    }
    if (scaffoldResult.ok && (!Array.isArray((scaffoldResult.body as { steps?: unknown }).steps) || (scaffoldResult.body as { steps?: unknown[] }).steps!.length < 3)) {
      throw new Error('/api/ai/scaffold returned fewer than 3 steps');
    }
    const resumableSession = await readStoredSession(page);
    if (!resumableSession?.task) {
      throw new Error('expected a resumable scaffold session before rescue');
    }

    stage = 'rescue';
    const rescuePromise = waitForAiResponse(page, '/api/ai/rescue');
    await page.getByRole('button', { name: 'ฉันติดอยู่' }).click();
    const { response: rescueResponse } = await rescuePromise;
    const rescueResult = await readOperationResponse(rescueResponse, '/api/ai/rescue');
    summary.rescueStatus = rescueResult.status;
    summary.rescuePassType =
      (rescueResult.body as { meta?: { passType?: string }; error?: { telemetry?: { passType?: string } } }).meta?.passType ??
      (rescueResult.body as { error?: { telemetry?: { passType?: string } } }).error?.telemetry?.passType;
    summary.rescueFailureDetail = (rescueResult.body as { error?: { detail?: string } }).error?.detail;
    summary.rescueFailureField = extractFailureField(summary.rescueFailureDetail);
    await page.getByText('MIND มองว่าติดตรงนี้').waitFor({ state: 'visible' });
    await page.getByText('ทางออกที่แนะนำตอนนี้').waitFor({ state: 'visible' });
    summary.reachedRescue = true;
    if (rescueResult.ok && (!Array.isArray((rescueResult.body as { rescuePlan?: { steps?: unknown } }).rescuePlan?.steps) ||
      (rescueResult.body as { rescuePlan?: { steps?: unknown[] } }).rescuePlan!.steps!.length < 2)) {
      throw new Error('/api/ai/rescue returned fewer than 2 rescue steps');
    }

    stage = 'post_rescue_scaffold';
    const scaffoldAgainPromise = waitForAiResponse(page, '/api/ai/scaffold');
    await page.getByRole('button', { name: 'ย่อยให้เล็กลงอีก' }).click();
    await page.getByText(SCAFFOLD_LOADING_COPY).waitFor({ state: 'visible' });
    const { response: scaffoldAgainResponse } = await scaffoldAgainPromise;
    const scaffoldAgainResult = await readOperationResponse(scaffoldAgainResponse, '/api/ai/scaffold');
    const rescueFailureCopy = page.getByText('รอบนี้ MIND ยังย่อยก้าวนี้ให้เล็กลงแบบมีความหมายไม่ได้ ลองใหม่อีกครั้ง หรือกด “ฉันติดอยู่”');
    const returnedToScaffold = await Promise.race([
      page.getByRole('button', { name: 'ฉันติดอยู่' }).waitFor({ state: 'visible', timeout: 30000 }).then(() => true),
      rescueFailureCopy.waitFor({ state: 'visible', timeout: 30000 }).then(() => false),
    ]);
    if (returnedToScaffold) {
      await page.getByText('MIND มองว่าติดตรงนี้').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
    }

    stage = 'dump_reset';
    await page.evaluate(async (seedSession) => {
      const openRequest = indexedDB.open('keyval-store');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      store.put(seedSession, 'mind_session');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, resumableSession);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'เสร็จแล้ว' }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'เสร็จแล้ว' }).click();
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByText(DUMP_REASSURANCE_COPY).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel(DUMP_TEXTBOX_LABEL).waitFor({ state: 'visible', timeout: 30000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByText(DUMP_REASSURANCE_COPY).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel(DUMP_TEXTBOX_LABEL).waitFor({ state: 'visible', timeout: 30000 });
    summary.reachedCompletionReset = true;

    stage = 'reentry';
    await page.evaluate(async (seedSession) => {
      const openRequest = indexedDB.open('keyval-store');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const now = Date.now();
      const task = seedSession.task && typeof seedSession.task === 'object'
        ? {
            ...(seedSession.task as Record<string, unknown>),
            lifecycleState: 'dumped',
            currentActionId: null,
            currentStepIndex: 0,
            reentryBrief: {
              summary: 'งานนี้ยังขยับได้ ถ้าเริ่มจากการสรุปสถานะล่าสุดก่อน',
              ignoredNoise: ['ยังไม่ต้องเปิดทุกไฟล์'],
              topActions: [
                {
                  roomId: 'dump-task',
                  title: 'สรุปสถานะล่าสุด',
                  rationale: 'ช่วยกลับเข้าบริบทโดยไม่ต้องอ่านใหม่ทั้งหมด',
                  impact: 'high',
                  effort: 'low',
                  resumeTarget: 'ONE_ACTION',
                },
              ],
              createdAt: now,
            },
          }
        : seedSession.task;
      store.put({
        ...seedSession,
        uiRoute: 'DUMP_ENTRY',
        status: 'DUMP_ENTRY',
        currentActionId: null,
        currentPayload: undefined,
        lastActive: now,
        task,
      }, 'mind_session');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, resumableSession);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('.studio-card:visible').filter({ hasText: STUDIO_SNAPSHOT_HEADING }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: STUDIO_STATUS_INTENT }).click();
    await page.locator('.studio-card:visible').filter({ hasText: 'งานนี้ยังขยับได้ ถ้าเริ่มจากการสรุปสถานะล่าสุดก่อน' }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'แก้บริบทนี้' }).waitFor({ state: 'visible', timeout: 30000 });

    await page.evaluate(async (seedSession) => {
      const openRequest = indexedDB.open('keyval-store');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const staleLastActive = Date.now() - (25 * 60 * 60 * 1000);
      const task = seedSession.task && typeof seedSession.task === 'object'
        ? { ...(seedSession.task as Record<string, unknown>), reentryBrief: undefined }
        : seedSession.task;
      store.put({
        ...seedSession,
        uiRoute: 'SCAFFOLD',
        status: 'SCAFFOLD',
        lastActive: staleLastActive,
        task,
      }, 'mind_session');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, resumableSession);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'กลับมาแล้ว งานนี้ยังไปต่อได้' }).waitFor({ state: 'visible', timeout: 90000 });
    await page.locator('.studio-card:visible').filter({ hasText: STUDIO_SNAPSHOT_HEADING }).first().waitFor({ state: 'visible', timeout: 90000 });
    await page.getByText('วันนี้ยังไม่ต้องสนใจ').waitFor({ state: 'visible', timeout: 90000 }).catch(() => undefined);
    await page.getByText(BOUNCE_BACK_FRESH_NOTE).waitFor({ state: 'visible', timeout: 90000 });
    await page.getByRole('button', { name: 'เริ่มใหม่' }).click();
    await page.getByRole('heading', { name: DUMP_HERO_HEADING }).waitFor({ state: 'visible', timeout: 90000 });
    await page.getByText(DUMP_REASSURANCE_COPY).waitFor({ state: 'visible', timeout: 90000 });

    await page.evaluate(async (seedSession) => {
      const openRequest = indexedDB.open('keyval-store');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const staleLastActive = Date.now() - (25 * 60 * 60 * 1000);
      const task = seedSession.task && typeof seedSession.task === 'object'
        ? { ...(seedSession.task as Record<string, unknown>), reentryBrief: undefined }
        : seedSession.task;
      store.put({
        ...seedSession,
        uiRoute: 'SCAFFOLD',
        status: 'SCAFFOLD',
        lastActive: staleLastActive,
        task,
      }, 'mind_session');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, resumableSession);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'กลับมาแล้ว งานนี้ยังไปต่อได้' }).waitFor({ state: 'visible', timeout: 90000 });
    await page.locator('.studio-card:visible').filter({ hasText: STUDIO_SNAPSHOT_HEADING }).first().waitFor({ state: 'visible', timeout: 90000 });

    const suggestedButton = page.getByRole('button', { name: /ทำอันนี้ก่อน:/ });
    if (await suggestedButton.isVisible().catch(() => false)) {
      await suggestedButton.click();
    } else {
      await page.getByRole('button', { name: 'กลับไปต่อจากจุดเดิม' }).click();
    }

    await Promise.race([
      page.getByRole('button', { name: 'ฉันติดอยู่' }).waitFor({ state: 'visible', timeout: 90000 }),
      page.getByRole('button', { name: ONE_ACTION_PRIMARY_CTA }).waitFor({ state: 'visible', timeout: 90000 }),
      page.getByLabel(DUMP_TEXTBOX_LABEL).waitFor({ state: 'visible', timeout: 90000 }),
    ]);
    summary.reachedReentry = true;

    stage = 'complete';
    await ensureDirectory(FINAL_SCREENSHOT);
    await page.screenshot({ path: FINAL_SCREENSHOT, fullPage: true });
    const report = {
      smoke: 'task-flow',
      result: 'passed',
      baseUrl: BASE_URL,
      stage,
      screenshot: FINAL_SCREENSHOT,
      summary: {
        ...summary,
        scaffoldRetryStatus: scaffoldAgainResult.status,
      },
    };
    await writeSummaryReport(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await ensureDirectory(FAILURE_SCREENSHOT);
    await page.screenshot({ path: FAILURE_SCREENSHOT, fullPage: true }).catch(() => undefined);
    const report = {
      smoke: 'task-flow',
      result: 'failed',
      baseUrl: BASE_URL,
      baseline: RESCUE_BASELINE_LABEL,
      stage,
      screenshot: FAILURE_SCREENSHOT,
      summary,
      error: error instanceof Error ? error.message : String(error),
    };
    await writeSummaryReport(report);
    console.error(JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('[SMOKE] task flow failed', error);
  process.exitCode = 1;
});
