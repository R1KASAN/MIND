import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStudioSnapshot,
  formatRelativeTimestamp,
  getStudioIntents,
  hasFreshReentryBrief,
} from './studio';
import type { AppSession } from '@/lib/store/idb';

test('buildStudioSnapshot prefers reentry summary and current action title', () => {
  const snapshot = buildStudioSnapshot(
    {
      id: 'task-1',
      workflowType: 'client_resume',
      sourceText: 'ลูกค้าส่ง feedback ยาวมากและงานนี้ค้างอยู่',
      sourceFiles: [{ id: 'file-1', name: 'brief.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1200, status: 'ready', createdAt: 1 }],
      extractedText: '',
      createdAt: 10,
      lastAttemptAt: 30,
      pendingInputs: [],
      blockerSignals: ['รอคำตอบลูกค้า', 'ยังไม่ได้สรุปสถานะ'],
      lifecycleState: 'has_one_action',
      currentStepIndex: 0,
      currentActionId: 'action-1',
      rescueHistory: [],
      lastStableSummary: 'สรุปเดิมที่ยังไม่ตอบลูกค้าต่อ',
      lastSynthesis: {
        workflow_type: 'client_resume',
        requires_clarification: false,
        situation_summary: 'สรุปเดิมจากรอบก่อน',
        recommended_action: {
          title: 'สรุปสถานะล่าสุด',
          rationale: 'เริ่มตรงนี้ก่อน',
          micro_steps: ['เปิดข้อความลูกค้า'],
        },
        alternative_actions: [],
        detected_blockers: [],
      },
      currentPlan: {
        actionTitle: 'สรุปสถานะล่าสุด',
        steps: [],
      },
      reentryBrief: {
        summary: 'ยังไม่ต้องเปิดทุกไฟล์ เริ่มจากการสรุปสถานะล่าสุดก่อน',
        topActions: [
          {
            roomId: 'task-1',
            title: 'สรุปสถานะล่าสุด',
            rationale: 'เริ่มได้เร็วที่สุด',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
        createdAt: 40,
      },
    },
    {
      id: 'action-1',
      createdAt: 10,
      title: 'สรุปสถานะล่าสุด',
      rationale: 'เริ่มตรงนี้ก่อน',
      microSteps: ['เปิดข้อความลูกค้า'],
      isPinned: false,
      state: 'PENDING',
    },
    null,
  );

  assert.equal(snapshot?.title, 'สรุปสถานะล่าสุด');
  assert.equal(snapshot?.summary.includes('สรุปสถานะล่าสุดก่อน'), true);
  assert.equal(snapshot?.fileCount, 1);
  assert.equal(snapshot?.blockers.length, 2);
  assert.equal(snapshot?.provenance?.confidence, 'high');
  assert.equal(snapshot?.provenance?.inputsUsed[0], 'reentry brief');
  assert.equal(snapshot?.provenance?.inputsUsed.includes('แผนปัจจุบัน'), true);
  assert.equal(snapshot?.provenance?.inputsUsed.includes('สรุปล่าสุด'), true);
  assert.equal(snapshot?.provenance?.changesSince.some((item) => item.includes('stable summary')), true);
  assert.equal(snapshot?.provenance?.changesSince.some((item) => item.includes('synthesis ล่าสุด')), true);
  assert.equal(snapshot?.provenance?.whyThisNow.includes('reentry brief ล่าสุด'), true);
});

test('buildStudioSnapshot falls back to source text provenance when structured context is missing', () => {
  const snapshot = buildStudioSnapshot(
    {
      id: 'task-2',
      workflowType: 'client_resume',
      sourceText: 'ลูกค้าขออัปเดตสั้น ๆ ก่อนประชุม',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
    null,
    null,
  );

  assert.equal(snapshot?.provenance?.confidence, 'low');
  assert.equal(snapshot?.provenance?.inputsUsed.includes('ข้อความต้นทาง'), true);
  assert.equal(snapshot?.provenance?.changesSince[0], 'ยังไม่เห็นการเปลี่ยนจากรอบก่อน');
  assert.equal(snapshot?.provenance?.whyThisNow.includes('ข้อความต้นทาง'), true);
});

test('getStudioIntents blocks advanced actions without current action context', () => {
  const session: AppSession = {
    lastActive: 100,
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    task: {
      id: 'task-1',
      workflowType: 'client_resume',
      sourceText: 'งานค้าง',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
  };

  const intents = getStudioIntents(session, null, null);
  assert.equal(intents.find((intent) => intent.id === 'review_status')?.active, true);
  assert.equal(intents.find((intent) => intent.id === 'next_move')?.active, true);
  assert.equal(intents.find((intent) => intent.id === 'make_smaller')?.active, false);
  assert.equal(intents.find((intent) => intent.id === 'unstick')?.active, false);
});

test('getStudioIntents blocks scaffold-only actions while completion summary is open', () => {
  const session: AppSession = {
    lastActive: 100,
    uiRoute: 'SCAFFOLD',
    status: 'SCAFFOLD',
    notThisCount: 0,
    currentActionId: 'action-1',
    currentPayload: {
      workflow_type: 'client_resume',
      requires_clarification: false,
      situation_summary: 'proposal กำลังขยับต่อ',
      recommended_action: {
        title: 'ล็อก requirement ก่อนทำ proposal',
        rationale: 'เริ่มตรงนี้ก่อน',
        micro_steps: ['รวบ requirement', 'แยก assumption', 'เตรียม timeline'],
      },
      alternative_actions: [],
      detected_blockers: [],
    },
    task: {
      id: 'task-1',
      workflowType: 'client_resume',
      sourceText: 'proposal AI',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_completion',
      currentStepIndex: 2,
      currentActionId: 'action-1',
      rescueHistory: [],
    },
  };

  const intents = getStudioIntents(session, {
    id: 'action-1',
    createdAt: 10,
    title: 'ล็อก requirement ก่อนทำ proposal',
    rationale: 'เริ่มตรงนี้ก่อน',
    microSteps: ['รวบ requirement', 'แยก assumption', 'เตรียม timeline'],
    isPinned: false,
    state: 'IN_PROGRESS',
  }, session.currentPayload);

  assert.equal(intents.find((intent) => intent.id === 'make_smaller')?.active, false);
  assert.equal(intents.find((intent) => intent.id === 'unstick')?.active, false);
  assert.equal(intents.find((intent) => intent.id === 'make_smaller')?.blockedReason?.includes('completion summary'), true);
});

test('hasFreshReentryBrief compares brief timestamp against session activity', () => {
  assert.equal(
    hasFreshReentryBrief({
      id: 'task-1',
      workflowType: 'client_resume',
      sourceText: 'งานค้าง',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'stalled',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      reentryBrief: {
        summary: 'เริ่มต่อได้',
        topActions: [
          {
            roomId: 'task-1',
            title: 'กลับไปเปิดงาน',
            rationale: 'เริ่มได้ทันที',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
        createdAt: 200,
      },
    }, 150),
    true,
  );

  assert.equal(formatRelativeTimestamp(60 * 1000, 2 * 60 * 60 * 1000), 'อัปเดต 1 ชั่วโมงที่แล้ว');
});
