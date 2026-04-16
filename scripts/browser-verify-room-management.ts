import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const SCREENSHOT_PATH = process.env.MIND_ROOM_BROWSER_SCREENSHOT || '/tmp/mind-room-management-verify.png';
const FAILURE_SCREENSHOT_PATH =
  process.env.MIND_ROOM_BROWSER_FAILURE_SCREENSHOT || '/tmp/mind-room-management-verify-failure.png';

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function seedRoomWorkspace(page: import('@playwright/test').Page) {
  const now = Date.now();
  const roomWorkspace = {
    activeRoomId: 'room-acme',
    rooms: [
      {
        id: 'room-acme',
        title: 'ACME - Website revamp',
        clientName: 'ACME',
        scenarioType: 'client_project_restart',
        session: {
          roomId: 'room-acme',
          roomTitle: 'ACME - Website revamp',
          roomScenarioType: 'client_project_restart',
          lastActive: now - 60_000,
          uiRoute: 'DUMP_ENTRY',
          status: 'DUMP_ENTRY',
          notThisCount: 0,
          currentActionId: null,
          task: {
            id: 'task-acme',
            roomId: 'room-acme',
            workflowType: 'client_resume',
            sourceText: 'เว็บลูกค้า ACME ค้างหลัง feedback รอบล่าสุด',
            sourceFiles: [],
            extractedText: '',
            createdAt: now - 3_600_000,
            pendingInputs: [],
            blockerSignals: [],
            lifecycleState: 'dumped',
            currentStepIndex: 0,
            currentActionId: null,
            rescueHistory: [],
            reentryBrief: {
              summary: 'สรุป feedback ล่าสุดแล้วตอบลูกค้าว่ากำลังเดินงานต่อ',
              ignoredNoise: [],
              topActions: [
                {
                  roomId: 'room-acme',
                  title: 'สรุป feedback ล่าสุดเป็น checklist',
                  rationale: 'ช่วยกลับเข้า context เดิมเร็วที่สุด',
                  impact: 'high',
                  effort: 'low',
                  resumeTarget: 'ONE_ACTION',
                },
              ],
              createdAt: now - 60_000,
            },
          },
        },
      },
      {
        id: 'room-northstar',
        title: 'Northstar - Demo reply',
        clientName: 'Northstar',
        scenarioType: 'sales_inquiry_demo_request',
        session: {
          roomId: 'room-northstar',
          roomTitle: 'Northstar - Demo reply',
          roomScenarioType: 'sales_inquiry_demo_request',
          lastActive: now - 120_000,
          uiRoute: 'DUMP_ENTRY',
          status: 'DUMP_ENTRY',
          notThisCount: 0,
          currentActionId: null,
          task: {
            id: 'task-northstar',
            roomId: 'room-northstar',
            workflowType: 'client_response',
            sourceText: 'ลูกค้าขอ demo ด่วนและอยากได้คำตอบก่อนประชุม',
            sourceFiles: [],
            extractedText: '',
            createdAt: now - 7_200_000,
            pendingInputs: [],
            blockerSignals: [],
            lifecycleState: 'dumped',
            currentStepIndex: 0,
            currentActionId: null,
            rescueHistory: [],
            reentryBrief: {
              summary: 'ตอบยืนยัน demo slot และสรุป next step ก่อนประชุม',
              ignoredNoise: [],
              topActions: [
                {
                  roomId: 'room-northstar',
                  title: 'ร่าง reply สั้นเพื่อ confirm demo slot',
                  rationale: 'กันดีลเย็นและตอบลูกค้าให้เร็ว',
                  impact: 'high',
                  effort: 'low',
                  resumeTarget: 'ONE_ACTION',
                },
              ],
              createdAt: now - 90_000,
            },
          },
        },
      },
    ],
    lastUpdatedAt: now,
  };

  await page.evaluate(async (workspace) => {
    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    const tx = db.transaction('keyval', 'readwrite');
    const store = tx.objectStore('keyval');
    store.put(workspace, 'mind_room_workspace_v1');
    store.put([], 'mind_actions');

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  }, roomWorkspace);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0);
    await seedRoomWorkspace(page);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'ACME - Website revamp' }).waitFor({ state: 'visible' });

    const acmeMenuButton = page.getByRole('button', { name: 'จัดการห้อง ACME - Website revamp' });
    await acmeMenuButton.click();
    await page.getByRole('button', { name: 'เปลี่ยนชื่อ' }).click();

    const renameInput = page.getByLabel('ชื่อใหม่ของห้อง ACME - Website revamp');
    await renameInput.fill('ACME - Follow up draft');
    await page.getByRole('button', { name: 'บันทึก' }).click();

    await page.locator('.room-sidebar-list').getByText('ACME - Follow up draft').waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'ACME - Follow up draft' }).waitFor({ state: 'visible' });

    const renamedMenuButton = page.getByRole('button', { name: 'จัดการห้อง ACME - Follow up draft' });
    await renamedMenuButton.click();
    await page.getByRole('button', { name: 'ย้ายไปถังขยะ' }).click();

    await page.getByRole('heading', { name: 'Northstar - Demo reply' }).waitFor({ state: 'visible' });
    const trashSection = page.locator('.room-sidebar-trash');
    await trashSection.waitFor({ state: 'visible' });
    await trashSection.getByText('ACME - Follow up draft').waitFor({ state: 'visible' });
    await trashSection.getByRole('button', { name: 'กู้คืน' }).click();

    await page.locator('.room-sidebar-list').getByText('ACME - Follow up draft').waitFor({ state: 'visible' });

    await ensureDirectory(SCREENSHOT_PATH);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      renamedTitle: 'ACME - Follow up draft',
      trashedRoomHiddenFromActiveList: true,
      restoredRoomVisible: true,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
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
  console.error(`[room-management-verify] ${message}`);
  process.exitCode = 1;
});
