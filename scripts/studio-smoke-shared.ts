import type { Page } from '@playwright/test';

export const DUMP_HERO_HEADING = 'พิมพ์งานก่อน แล้วค่อยแนบไฟล์ถ้ามี';
export const DUMP_TEXTBOX_LABEL = 'พิมพ์สภาพงานของคุณ';
export const STUDIO_PANEL_HEADING = 'ดูบริบทเดิมแล้วค่อยไปต่อ';
export const STUDIO_SNAPSHOT_HEADING = 'บริบทที่ MIND ใช้อยู่';
export const STUDIO_PROVENANCE_HEADING = 'ทำไม MIND ใช้ชุดนี้';
export const STUDIO_STATUS_INTENT = 'กลับมาดูสถานะ';
export const STUDIO_BLOCKED_INTENT = 'ย่อยงานให้เล็ก';
export const STUDIO_BLOCKED_REASON = 'ต้องมีก้าวปัจจุบันก่อนถึงจะย่อยต่อได้';
export const EDIT_CONTEXT_CTA = 'แก้บริบทนี้';
export const STUDIO_SNAPSHOT_TARGET_SELECTOR = '[data-studio-snapshot-target]:visible';

export async function getAnalyticsEventCount(page: Page, eventName: string) {
  return page.evaluate(async (targetEventName) => {
    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    const tx = db.transaction('keyval', 'readonly');
    const store = tx.objectStore('keyval');
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = store.get('mind_analytics_events');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();

    if (!Array.isArray(value)) return 0;
    return value.filter((event) => event && typeof event === 'object' && 'eventName' in event && (event as { eventName?: unknown }).eventName === targetEventName).length;
  }, eventName);
}

export async function waitForAnalyticsEventCount(page: Page, eventName: string, expectedCount: number, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await getAnalyticsEventCount(page, eventName);
    if (count === expectedCount) return;
    await page.waitForTimeout(100);
  }

  const count = await getAnalyticsEventCount(page, eventName);
  throw new Error(`expected ${eventName} count to be ${expectedCount}, received ${count}`);
}

type StudioSmokeSession = {
  lastActive: number;
  uiRoute: 'DUMP_ENTRY';
  status: 'DUMP_ENTRY';
  notThisCount: number;
  currentActionId: null;
  activeDumpContext: {
    text: string;
    createdAt: number;
  };
  lastWorkflowType: 'client_resume';
  task: {
    id: string;
    workflowType: 'client_resume';
    sourceText: string;
    sourceFiles: Array<{
      id: string;
      name: string;
      kind: 'pdf';
      mimeType: 'application/pdf';
      size: number;
      status: 'ready';
      createdAt: number;
      extractedText: string;
    }>;
    extractedText: string;
    createdAt: number;
    lastAttemptAt: number;
    pendingInputs: [];
    blockerSignals: string[];
    lifecycleState: 'dumped';
    currentStepIndex: number;
    currentActionId: null;
    rescueHistory: [];
    taskFrame: {
      objective: string;
      stage: string;
      stakeholders: string[];
    };
    reentryBrief: {
      summary: string;
      ignoredNoise: string[];
      topActions: Array<{
        roomId: string;
        title: string;
        rationale: string;
        impact: 'high' | 'medium';
        effort: 'low' | 'medium';
        resumeTarget: 'ONE_ACTION' | 'SCAFFOLD' | 'DUMP_ENTRY';
      }>;
      createdAt: number;
    };
  };
};

export async function seedStudioSession(page: Page) {
  const now = Date.now();
  const sourceText =
    'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page และผมต้องสรุปสถานะล่าสุดก่อนตอบกลับวันนี้';

  const session: StudioSmokeSession = {
    lastActive: now - 60_000,
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    activeDumpContext: {
      text: sourceText,
      createdAt: now - 3_600_000,
    },
    lastWorkflowType: 'client_resume',
    task: {
      id: 'studio-seeded-task',
      workflowType: 'client_resume',
      sourceText,
      sourceFiles: [
        {
          id: 'studio-file-1',
          name: 'client-feedback.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          size: 18_240,
          status: 'ready',
          createdAt: now - 7_200_000,
          extractedText: 'ลูกค้าขอให้สรุปสถานะล่าสุดและยืนยันก้าวถัดไปก่อนสิ้นวัน',
        },
      ],
      extractedText: 'ลูกค้าขอให้สรุปสถานะล่าสุดและยืนยันก้าวถัดไปก่อนสิ้นวัน',
      createdAt: now - 7_200_000,
      lastAttemptAt: now - 120_000,
      pendingInputs: [],
      blockerSignals: ['ยังไม่ได้สรุปสถานะล่าสุด', 'ยังไม่ได้ตอบลูกค้ากลับ'],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      taskFrame: {
        objective: 'สรุปสถานะล่าสุดของ landing page ลูกค้า',
        stage: 'awaiting_reply',
        stakeholders: ['ลูกค้า', 'เรา'],
      },
      reentryBrief: {
        summary:
          'งานนี้ยังขยับได้ ถ้าเริ่มจากการสรุปสถานะล่าสุดก่อน แล้วค่อยตอบลูกค้ากลับจากบริบทเดิม',
        ignoredNoise: ['ยังไม่ต้องเปิดทุกไฟล์', 'ยังไม่ต้องจัดรายการงานใหม่ทั้งโปรเจกต์'],
        topActions: [
          {
            roomId: 'studio-seeded-task',
            title: 'สรุปสถานะล่าสุดแล้วเลือกก้าวถัดไป',
            rationale: 'ช่วยกลับเข้าบริบทเดิมโดยไม่ต้องอ่านทุกอย่างใหม่',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        createdAt: now,
      },
    },
  };

  await page.evaluate(async (seedSession) => {
    const openRequest = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    const tx = db.transaction('keyval', 'readwrite');
    const store = tx.objectStore('keyval');
    store.put(seedSession, 'mind_session');
    store.delete('mind_room_workspace_v1');
    store.put([], 'mind_actions');

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  }, session);

  return sourceText;
}
