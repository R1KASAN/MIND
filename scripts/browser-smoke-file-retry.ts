import { readFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://localhost:3000';
const PDF_PATH = process.env.MIND_FILE_RETRY_PDF || 'generated/mind-demo-brief.pdf';

async function getIdbValue<T>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(async (targetKey) => {
    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    const tx = db.transaction('keyval', 'readonly');
    const store = tx.objectStore('keyval');
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = store.get(targetKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return value;
  }, key) as Promise<T | undefined>;
}

async function seedFailedRetryRoom(page: Page, pdfBase64: string) {
  const now = Date.now();
  const storageKey = `room-file:retry-room:${now}:mind-demo-brief.pdf`;

  await page.evaluate(async ({ pdfBase64: encodedPdf, now: seededAt, storageKey: seededStorageKey }) => {
    const bytes = Uint8Array.from(atob(encodedPdf), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const failedFile = {
      id: 'retry-file-1',
      name: 'mind-demo-brief.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: blob.size,
      status: 'failed',
      createdAt: seededAt - 10_000,
      failureReason: 'pdf_ocr_failed',
      failureDetail: 'Cannot find module as expression is too dynamic',
      failureStage: 'pdf_ocr',
      storageKey: seededStorageKey,
      lastExtractAttemptAt: seededAt - 5000,
      extractAttemptCount: 2,
    };
    const sourceText = 'ไฟล์แนบ:\n- mind-demo-brief.pdf (pdf, ลอง OCR แล้วแต่ยังอ่าน PDF ไม่สำเร็จ)';
    const session = {
      roomId: 'retry-room',
      roomTitle: 'Retry OCR room',
      roomScenarioType: 'client_project_restart',
      lastActive: seededAt,
      uiRoute: 'DUMP_ENTRY',
      status: 'DUMP_ENTRY',
      notThisCount: 0,
      currentActionId: null,
      activeDumpContext: {
        text: sourceText,
        createdAt: seededAt - 20_000,
        lastAttemptAt: seededAt - 5000,
      },
      hasSeenResetNotice: true,
      hasSeenWalkthrough: true,
      lastWorkflowType: 'client_resume',
      task: {
        id: 'retry-task',
        roomId: 'retry-room',
        workflowType: 'client_resume',
        sourceText,
        sourceFiles: [failedFile],
        extractedText: '',
        createdAt: seededAt - 20_000,
        lastAttemptAt: seededAt - 5000,
        pendingInputs: [],
        blockerSignals: ['missing_file_or_context'],
        lifecycleState: 'dumped',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      },
    };
    const room = {
      id: 'retry-room',
      title: 'Retry OCR room',
      clientName: 'Retry OCR room',
      scenarioType: 'client_project_restart',
      lastState: 'DUMP_ENTRY',
      lastKnownGoodNextMoves: [],
      aiFreshness: 'fallback',
      lastUpdatedAt: seededAt,
      unread: false,
      stale: false,
      contextSummary: sourceText,
      nextMoves: [],
      session,
    };
    const workspace = {
      activeRoomId: 'retry-room',
      rooms: [room],
      lastUpdatedAt: seededAt,
    };

    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onupgradeneeded = () => openRequest.result.createObjectStore('keyval');
    });
    const tx = db.transaction('keyval', 'readwrite');
    const store = tx.objectStore('keyval');
    store.put(session, 'mind_session');
    store.put(workspace, 'mind_room_workspace_v1');
    store.put({
      [seededStorageKey]: {
        blob,
        name: 'mind-demo-brief.pdf',
        mimeType: 'application/pdf',
        size: blob.size,
        savedAt: seededAt,
      },
    }, 'mind_room_file_blobs_v1');
    store.put([], 'mind_actions');

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { pdfBase64, now, storageKey });
}

type SmokeSession = {
  task?: {
    sourceFiles?: Array<{ status?: string; extractedText?: string }>;
    blockerSignals?: string[];
    extractedText?: string;
  };
};

type SmokeWorkspace = {
  activeRoomId?: string;
  rooms?: Array<{
    id?: string;
    session?: SmokeSession;
  }>;
};

async function run() {
  const pdfBase64 = (await readFile(PDF_PATH)).toString('base64');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);

  page.on('pageerror', (error) => {
    console.error('[SMOKE][pageerror]', error.message);
  });

  try {
    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0);

    await seedFailedRetryRoom(page, pdfBase64);

    await page.goto(`${BASE_URL}/?walkthrough=off&ritual=off`, { waitUntil: 'domcontentloaded' });
    const studio = page.locator('.studio-desktop-stack');
    await studio.waitFor({ state: 'visible' });
    await studio.getByText('ไฟล์แนบอ่านไม่สำเร็จ').waitFor({ state: 'visible' });

    const retryButton = studio.getByRole('button', { name: 'ลองอ่านไฟล์อีกครั้ง' });
    await retryButton.waitFor({ state: 'visible' });
    await retryButton.click();

    await page.waitForFunction(() => {
      const studio = document.querySelector('.studio-desktop-stack');
      return Boolean(studio && !studio.textContent?.includes('ไฟล์แนบอ่านไม่สำเร็จ'));
    }, undefined, { timeout: 90_000 });

    const session = await getIdbValue<SmokeSession>(page, 'mind_session');
    const workspace = await getIdbValue<SmokeWorkspace>(page, 'mind_room_workspace_v1');
    const activeRoom = workspace?.rooms?.find((room) => room.id === workspace.activeRoomId);
    const sessionFile = session?.task?.sourceFiles?.[0];
    const roomFile = activeRoom?.session?.task?.sourceFiles?.[0];
    const bodyText = await page.locator('body').innerText();

    if (sessionFile?.status !== 'ready' || roomFile?.status !== 'ready') {
      throw new Error(`expected retry to mark file ready, session=${sessionFile?.status}, room=${roomFile?.status}`);
    }
    if (!sessionFile.extractedText || !roomFile.extractedText) {
      throw new Error('expected retry to persist extracted text in session and room record');
    }
    if (session?.task?.blockerSignals?.includes('missing_file_or_context')) {
      throw new Error('expected retry to remove missing_file_or_context from active session');
    }
    if (activeRoom?.session?.task?.blockerSignals?.includes('missing_file_or_context')) {
      throw new Error('expected retry to remove missing_file_or_context from active room');
    }
    if (bodyText.includes('missing_file_or_context')) {
      throw new Error('expected Studio UI to stop showing missing_file_or_context after retry success');
    }

    console.log('[SMOKE] file retry pass complete', {
      baseUrl: BASE_URL,
      status: sessionFile.status,
      extractedLength: session?.task?.extractedText?.length ?? 0,
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('[SMOKE] file retry failed', error);
  process.exitCode = 1;
});
