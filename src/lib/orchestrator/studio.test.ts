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
  assert.equal(snapshot?.readyFiles.length, 1);
  assert.equal(snapshot?.readyFiles[0]?.copy.title, 'อ่านไฟล์ได้แล้ว');
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
  assert.equal(snapshot?.readyFiles.length, 0);
});

test('buildStudioSnapshot hides raw corrupt file context when attached file extraction failed', () => {
  const snapshot = buildStudioSnapshot(
    {
      id: 'task-3',
      workflowType: 'client_resume',
      sourceText: 'ไฟล์แนบ:\n- mind-demo-brief.pdf (pdf, ลอง OCR แล้วแต่ข้อความยังไม่ชัดพอ)',
      sourceFiles: [
        {
          id: 'file-1',
          name: 'mind-demo-brief.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          size: 2400,
          status: 'failed',
          createdAt: 1,
          failureReason: 'pdf_text_garbled_after_ocr',
          failureDetail: 'fragmented_word_runs',
          failureStage: 'pdf_ocr',
          storageKey: 'room-file:demo:file',
          extractAttemptCount: 1,
        },
      ],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: ['missing_file_or_context'],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
    null,
    null,
  );

  assert.equal(snapshot?.title, 'บริบทไฟล์ยังไม่สมบูรณ์');
  assert.equal(snapshot?.summary.includes('MIND ยังอ่านได้ไม่ชัด'), true);
  assert.equal(snapshot?.fileIssues[0]?.name, 'mind-demo-brief.pdf');
  assert.equal(snapshot?.fileIssues[0]?.failureDetail, 'fragmented_word_runs');
  assert.equal(snapshot?.fileIssues[0]?.failureStage, 'pdf_ocr');
  assert.equal(snapshot?.fileIssues[0]?.storageKey, 'room-file:demo:file');
});

test('buildStudioSnapshot marks selected primary file and asks for selection when multiple ready files have no primary', () => {
  const baseTask = {
    id: 'task-multi-file',
    workflowType: 'client_resume' as const,
    sourceText: 'ไฟล์แนบ:\n- brief-a.pdf (pdf)\n- brief-b.pdf (pdf)',
    sourceFiles: [
      {
        id: 'file-a',
        name: 'brief-a.pdf',
        kind: 'pdf' as const,
        mimeType: 'application/pdf',
        size: 1200,
        status: 'ready' as const,
        createdAt: 1,
        extractedText: 'บริบทไฟล์ A',
      },
      {
        id: 'file-b',
        name: 'brief-b.pdf',
        kind: 'pdf' as const,
        mimeType: 'application/pdf',
        size: 1300,
        status: 'ready' as const,
        createdAt: 2,
        extractedText: 'บริบทไฟล์ B',
      },
    ],
    extractedText: '',
    createdAt: 10,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'dumped' as const,
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
  };

  const needsSelection = buildStudioSnapshot(baseTask, null, null);
  assert.equal(needsSelection?.needsPrimaryFileSelection, true);
  assert.equal(needsSelection?.primaryFileName, undefined);
  assert.equal(needsSelection?.readyFiles.every((file) => !file.isPrimary), true);

  const selected = buildStudioSnapshot({
    ...baseTask,
    sourcePreference: {
      primarySourceId: 'file:file-b',
      selectedAt: 20,
      selectedBy: 'user',
    },
    extractedText: 'บริบทไฟล์ B',
  }, null, null);

  assert.equal(selected?.needsPrimaryFileSelection, false);
  assert.equal(selected?.primaryFileName, 'brief-b.pdf');
  assert.equal(selected?.primaryFileSummary?.includes('บริบทไฟล์ B'), true);
  assert.equal(selected?.readyFiles.find((file) => file.id === 'file-b')?.isPrimary, true);
  assert.equal(selected?.readyFiles.find((file) => file.id === 'file-a')?.isPrimary, false);
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

// ─── Room Fallback Regression Tests ─────────────────────────────────────────
// Verify: failed PDF/image files must not block txt/md ingestion, original text,
// or Room memory — the Room must remain usable when any alternative context exists.

function makeMinimalTask(overrides: object = {}) {
  return {
    id: 'task-fallback',
    workflowType: 'client_resume' as const,
    sourceText: '',
    sourceFiles: [] as object[],
    extractedText: '',
    createdAt: 1000,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'dumped' as const,
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    ...overrides,
  };
}

test('Room fallback Case A: failed PDF only — title shows file-incomplete, no garbled text injected', () => {
  // Case A: only a failed PDF, no other context. Room should show file-incomplete state.
  const task = makeMinimalTask({
    sourceText: '',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        createdAt: 1000,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);

  assert.ok(snapshot, 'snapshot must exist even with only a failed file');
  assert.equal(snapshot.readyFiles.length, 0, 'no ready files');
  assert.equal(snapshot.fileIssues.length, 1, 'one file issue');
  assert.equal(snapshot.fileIssues[0]?.name, 'scan.pdf');
  // With no usable context at all, title should signal file-incomplete state
  assert.equal(snapshot.title, 'บริบทไฟล์ยังไม่สมบูรณ์');
  // Garbled OCR text must not appear in summary
  assert.equal(snapshot.summary.includes('garbled'), false);
});

test('Room fallback Case B: failed PDF + ready txt/md — txt/md is usable, title does not override objective', () => {
  // Case B: PDF fails but txt/md is ready. Room must use txt/md context normally.
  const task = makeMinimalTask({
    sourceText: 'บริบทงานเดิมที่พิมพ์ไว้',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        createdAt: 1000,
      },
      {
        id: 'file-txt',
        name: 'notes.txt',
        kind: 'txt',
        mimeType: 'text/plain',
        size: 400,
        status: 'ready',
        extractedText: 'ข้อความจาก txt ที่อ่านได้แล้ว',
        createdAt: 1001,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);

  assert.ok(snapshot);
  assert.equal(snapshot.readyFiles.length, 1, 'txt/md file is ready');
  assert.equal(snapshot.readyFiles[0]?.name, 'notes.txt');
  assert.equal(snapshot.fileIssues.length, 1, 'failed PDF still appears in issues');
  assert.equal(snapshot.fileIssues[0]?.name, 'scan.pdf');
  // Original text is present so title must NOT override to file-incomplete
  assert.notEqual(snapshot.title, 'บริบทไฟล์ยังไม่สมบูรณ์', 'title must not override when original text is present');
});

test('Room fallback Case C: failed PDF + original text — original text is used, PDF is retryable', () => {
  // Case C: user typed context, only the PDF failed. Original text must drive summary normally.
  const task = makeMinimalTask({
    sourceText: 'ลูกค้าส่ง feedback มาแต่ยังไม่ได้ตอบ ต้องการ next action',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 5000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_ocr_failed',
        createdAt: 1000,
      },
    ],
    lastSynthesis: {
      workflow_type: 'client_resume',
      requires_clarification: false,
      situation_summary: 'สรุปจากข้อความเดิม — งานนี้รอ feedback ลูกค้า',
      recommended_action: { title: 'ตอบ feedback ลูกค้า', rationale: '', micro_steps: [] },
      alternative_actions: [],
      detected_blockers: [],
    },
  });
  const snapshot = buildStudioSnapshot(task);

  assert.ok(snapshot);
  // Summary must come from lastSynthesis, not from garbled file
  assert.ok(snapshot.summary.includes('รอ feedback ลูกค้า'), 'summary uses lastSynthesis');
  // Failed PDF still visible in issues so it stays retryable
  assert.equal(snapshot.fileIssues.length, 1);
  // Title does not override since synthesis exists
  assert.notEqual(snapshot.title, 'บริบทไฟล์ยังไม่สมบูรณ์');
});

test('Room fallback Case D: mixed files — ready files are not poisoned by failed files', () => {
  // Case D: multiple files with mixed status. Ready ones must remain usable as evidence/context.
  const task = makeMinimalTask({
    sourceText: 'บริบทเดิม',
    sourceFiles: [
      {
        id: 'file-image',
        name: 'screenshot.png',
        kind: 'image',
        mimeType: 'image/png',
        size: 2000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_ocr_failed',
        createdAt: 1000,
      },
      {
        id: 'file-md',
        name: 'handoff.md',
        kind: 'md',
        mimeType: 'text/markdown',
        size: 600,
        status: 'ready',
        extractedText: 'ข้อความ handoff จาก md file',
        createdAt: 1001,
      },
      {
        id: 'file-pdf2',
        name: 'invoice.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 4000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        createdAt: 1002,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);

  assert.ok(snapshot);
  assert.equal(snapshot.readyFiles.length, 1, 'only ready file (handoff.md) is in readyFiles');
  assert.equal(snapshot.readyFiles[0]?.name, 'handoff.md');
  assert.equal(snapshot.fileIssues.length, 2, 'two failed files are in issues, not hidden');
  // Ready file extractedText is preserved — it was not poisoned by failures
  assert.ok(snapshot.readyFiles[0]?.extractedText?.includes('handoff จาก md file'));
  // With original text present, title must not override to file-incomplete
  assert.notEqual(snapshot.title, 'บริบทไฟล์ยังไม่สมบูรณ์');
});

// ─── Phase 1: getRoomContextStatus Unit Tests ─────────────────────────────────

import { getRoomContextStatus } from '@/lib/room';

test('getRoomContextStatus returns empty when no text and no files', () => {
  const status = getRoomContextStatus({
    sourceText: '',
    sourceFiles: [],
  });
  assert.equal(status, 'empty');
});

test('getRoomContextStatus returns ready when usable text and no failed files', () => {
  const status = getRoomContextStatus({
    sourceText: 'มีบริบทงานอยู่แล้ว',
    sourceFiles: [
      { status: 'ready' },
    ],
  });
  assert.equal(status, 'ready');
});

test('getRoomContextStatus returns partial when usable context + at least one failed file', () => {
  const status = getRoomContextStatus({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      { status: 'ready' },
      { status: 'unreadable' },
    ],
  });
  assert.equal(status, 'partial');
});

test('getRoomContextStatus returns blocked when files exist but all failed and no other context', () => {
  const status = getRoomContextStatus({
    sourceText: '',
    sourceFiles: [
      { status: 'failed_extraction' },
    ],
  });
  assert.equal(status, 'blocked');
});

test('buildStudioSnapshot includes contextStatus field', () => {
  const snapshot = buildStudioSnapshot(
    makeMinimalTask({
      sourceText: 'บริบทงาน',
      sourceFiles: [],
    }),
  );
  assert.ok(snapshot, 'snapshot must exist');
  assert.ok('contextStatus' in snapshot, 'snapshot must have contextStatus field');
  assert.equal(snapshot.contextStatus, 'ready');
});

// ─── Phase 1.5: Evidence Transparency Tests ──────────────────────────────────

test('Phase 1.5: fileIssues entries include retryable flag — true when storageKey present', () => {
  const task = makeMinimalTask({
    sourceText: '',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        storageKey: 'room-file:demo:scan',
        createdAt: 1000,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.fileIssues.length, 1, 'one file issue');
  assert.equal(snapshot.fileIssues[0]?.retryable, true, 'retryable when storageKey present');
});

test('Phase 1.5: fileIssues retryable is false when storageKey is missing', () => {
  const task = makeMinimalTask({
    sourceText: '',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'failed_extraction',
        extractedText: '',
        failureReason: 'pdf_ocr_failed',
        createdAt: 1000,
        // no storageKey
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.fileIssues[0]?.retryable, false, 'not retryable when storageKey missing');
});

test('Phase 1.5: failed PDF does not appear as usedInContext even if listed in retrievedSourceIds', () => {
  // failed files are in fileIssues, not in readyFiles — so they can never have usedInContext
  const task = makeMinimalTask({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        createdAt: 1000,
      },
    ],
  });
  // Even if the caller accidentally passes the failed file's sourceId
  const snapshot = buildStudioSnapshot(task, null, null, ['file:file-pdf']);
  assert.ok(snapshot);
  assert.equal(snapshot.readyFiles.length, 0, 'failed file must not be in readyFiles');
  assert.equal(snapshot.fileIssues.length, 1, 'failed file must be in fileIssues');
  // There is no readyFile entry so usedInContext cannot be true for the failed file
});

test('Phase 1.5: ready txt selected by retrieval shows usedInContext = true', () => {
  const task = makeMinimalTask({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      {
        id: 'file-txt',
        name: 'notes.txt',
        kind: 'text',
        mimeType: 'text/plain',
        size: 400,
        status: 'ready',
        extractedText: 'ข้อความจาก txt',
        createdAt: 1001,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task, null, null, ['file:file-txt']);
  assert.ok(snapshot);
  assert.equal(snapshot.readyFiles.length, 1, 'one ready file');
  assert.equal(snapshot.readyFiles[0]?.usedInContext, true, 'txt selected by retrieval → usedInContext');
});

test('Phase 1.5: ready but not selected file shows usedInContext = false', () => {
  const task = makeMinimalTask({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      {
        id: 'file-txt',
        name: 'notes.txt',
        kind: 'text',
        mimeType: 'text/plain',
        size: 400,
        status: 'ready',
        extractedText: 'ข้อความจาก txt',
        createdAt: 1001,
      },
      {
        id: 'file-md',
        name: 'handoff.md',
        kind: 'other',
        mimeType: 'text/markdown',
        size: 600,
        status: 'ready',
        extractedText: 'ข้อความ handoff',
        createdAt: 1002,
      },
    ],
  });
  // Only txt is retrieved; md is ready but not selected
  const snapshot = buildStudioSnapshot(task, null, null, ['file:file-txt']);
  assert.ok(snapshot);
  assert.equal(snapshot.readyFiles.length, 2, 'two ready files');
  const txt = snapshot.readyFiles.find((f) => f.id === 'file-txt');
  const md = snapshot.readyFiles.find((f) => f.id === 'file-md');
  assert.equal(txt?.usedInContext, true, 'txt retrieved → usedInContext');
  assert.equal(md?.usedInContext, false, 'md not retrieved → not usedInContext');
});

test('Phase 1.5: retrievedSourceIds defaults to empty array when not passed', () => {
  const task = makeMinimalTask({ sourceText: 'บริบทงาน', sourceFiles: [] });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.retrievedSourceIds, [], 'default retrievedSourceIds is empty');
});

// ─── Phase 2: canProceed + Recovery Flow Tests ────────────────────────────────

test('Phase 2: canProceed is true when contextStatus is ready', () => {
  const task = makeMinimalTask({ sourceText: 'บริบทงาน', sourceFiles: [] });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.contextStatus, 'ready');
  assert.equal(snapshot.canProceed, true, 'ready → canProceed');
});

test('Phase 2: canProceed is true when contextStatus is partial', () => {
  const task = makeMinimalTask({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        createdAt: 1000,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.contextStatus, 'partial');
  assert.equal(snapshot.canProceed, true, 'partial → canProceed (non-blocking)');
});

test('Phase 2: canProceed is true when contextStatus is empty', () => {
  const task = makeMinimalTask({ sourceText: '', sourceFiles: [] });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.contextStatus, 'empty');
  assert.equal(snapshot.canProceed, true, 'empty → canProceed (user may still paste)');
});

test('Phase 2: canProceed is false when contextStatus is blocked', () => {
  const task = makeMinimalTask({
    sourceText: '',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'failed_extraction',
        extractedText: '',
        failureReason: 'pdf_ocr_failed',
        createdAt: 1000,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  assert.equal(snapshot.contextStatus, 'blocked');
  assert.equal(snapshot.canProceed, false, 'blocked → canProceed is false');
});

test('Phase 2: failed file with storageKey remains in fileIssues and retryable', () => {
  const task = makeMinimalTask({
    sourceText: 'บริบทงาน',
    sourceFiles: [
      {
        id: 'file-pdf',
        name: 'brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 8000,
        status: 'unreadable',
        extractedText: '',
        failureReason: 'pdf_text_garbled_after_ocr',
        storageKey: 'room-file:demo:brief',
        createdAt: 1000,
      },
    ],
  });
  const snapshot = buildStudioSnapshot(task);
  assert.ok(snapshot);
  // Partial room: canProceed stays true
  assert.equal(snapshot.canProceed, true, 'partial room is non-blocking');
  // Failed file must stay visible in fileIssues
  assert.equal(snapshot.fileIssues.length, 1, 'failed file visible in fileIssues');
  assert.equal(snapshot.fileIssues[0]?.id, 'file-pdf');
  // retryable because storageKey present
  assert.equal(snapshot.fileIssues[0]?.retryable, true, 'failed file with storageKey is retryable');
  // Failed file must NOT appear in readyFiles
  assert.equal(snapshot.readyFiles.length, 0, 'failed file not in readyFiles');
});
