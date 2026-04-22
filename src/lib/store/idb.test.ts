import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRenameRoomToWorkspace,
  applyRestoreRoomToWorkspace,
  applyTrashRoomToWorkspace,
  buildRoomRecordFromSession,
  createDefaultSession,
  hydrateRoomSessionFromRecord,
  normalizeSession,
} from './idb';

test('normalizeSession preserves reentry brief and action explanation on task state', () => {
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'BOUNCE_BACK',
    notThisCount: 0,
    currentActionId: 'action-1',
    task: {
      id: 'task-1',
      workflowType: 'client_resume',
      taskShape: {
        deliverableType: 'proposal',
        immediateNeed: 'define_scope',
        missingInputs: ['requirement ที่ต้องการจริง'],
        workContext: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
        confidence: 0.88,
      },
      sourceText: 'งานค้างเรื่อง proposal',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'has_one_action',
      currentStepIndex: 0,
      currentActionId: 'action-1',
      rescueHistory: [],
      actionExplanation: 'ตอนนี้ควรกลับมาล็อก proposal ก่อน เพราะเป็นจุดค้างหลัก',
      oneActionTracking: {
        hasViewedAlternative: true,
        hasAdjusted: false,
      },
      reentryBrief: {
        summary: 'เริ่มจาก proposal ก่อน แล้วค่อยกลับไปงานรอง',
        topActions: [
          {
            roomId: 'task-1',
            title: 'เปิด proposal draft',
            rationale: 'เป็นก้าวที่ impact สูงสุดและเริ่มได้เร็ว',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: ['ยังไม่ต้องจัด archive'],
        createdAt: 100,
      },
    },
  });

  assert.equal(session.uiRoute, 'BOUNCE_BACK');
  assert.equal(session.task?.actionExplanation, 'ตอนนี้ควรกลับมาล็อก proposal ก่อน เพราะเป็นจุดค้างหลัก');
  assert.equal(session.task?.taskShape?.deliverableType, 'proposal');
  assert.equal(session.task?.oneActionTracking?.hasViewedAlternative, true);
  assert.equal(session.task?.reentryBrief?.topActions[0].resumeTarget, 'ONE_ACTION');
  assert.equal(session.task?.reentryBrief?.ignoredNoise[0], 'ยังไม่ต้องจัด archive');
});

test('room records mirror and hydrate primary source preference', () => {
  const session = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-primary',
      roomTitle: 'ACME primary file',
    }),
    task: {
      id: 'task-primary',
      roomId: 'room-primary',
      workflowType: 'client_resume',
      sourceText: 'บริบทจากไฟล์หลัก',
      sourceFiles: [
        {
          id: 'file-a',
          name: 'brief-a.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          size: 1200,
          status: 'ready',
          createdAt: 1,
          extractedText: 'A',
        },
        {
          id: 'file-b',
          name: 'brief-b.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          size: 1300,
          status: 'ready',
          createdAt: 2,
          extractedText: 'B',
        },
      ],
      sourcePreference: {
        primarySourceId: 'file:file-b',
        selectedAt: 50,
        selectedBy: 'user',
      },
      extractedText: 'B',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
  });

  const room = buildRoomRecordFromSession(session, 'room-primary');
  assert.equal(room.sourcePreference?.primarySourceId, 'file:file-b');
  assert.equal(room.sourcePreference?.selectedBy, 'user');

  const staleSession = normalizeSession({
    ...session,
    task: session.task
      ? {
          ...session.task,
          sourcePreference: undefined,
        }
      : undefined,
  });
  const hydrated = hydrateRoomSessionFromRecord(staleSession, room);
  assert.equal(hydrated.task?.sourcePreference?.primarySourceId, 'file:file-b');
});

test('normalizeSession preserves draft plan evidence, safety, and feedback metadata', () => {
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'ONE_ACTION',
    notThisCount: 0,
    currentActionId: 'action-1',
    task: {
      id: 'task-evidence',
      sourceText: 'Client brief says confirm budget before sending proposal.',
      sourceFiles: [],
      extractedText: '',
      createdAt: 10,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'has_one_action',
      currentStepIndex: 0,
      currentActionId: 'action-1',
      rescueHistory: [],
      currentPlan: {
        actionTitle: 'Confirm budget',
        steps: [
          {
            id: 'step-1',
            text: 'Confirm budget before sending proposal',
            evidence: [
              {
                sourceId: 'manual:task-evidence',
                label: 'Manual summary by you',
                excerpt: 'Client brief says confirm budget',
                sourceKindLabel: 'manual_summary',
              },
            ],
            confidence: {
              level: 'low',
              score: 0.42,
              rationale: 'First guess — please review before acting',
              supportingSourceCount: 1,
            },
            safety: {
              destructive: false,
              risk: 'none',
              manualOnly: false,
            },
            provenance: {
              generatedAt: 20,
              generatedBy: 'action',
              sourceIds: ['manual:task-evidence'],
            },
          },
        ],
      },
      pendingPlan: {
        id: 'draft-20',
        status: 'draft',
        actionTitle: 'Confirm budget',
        steps: [
          {
            id: 'step-1',
            text: 'Confirm budget before sending proposal',
          },
        ],
        createdAt: 20,
        generatedBy: 'action',
      },
      planHistory: [
        {
          id: 'revision-20',
          planId: 'draft-20',
          status: 'draft',
          actionTitle: 'Confirm budget',
          steps: [{ id: 'step-1', text: 'Confirm budget before sending proposal' }],
          createdAt: 20,
        },
      ],
      stepFeedbackHistory: [
        {
          id: 'feedback-30',
          stepId: 'step-1',
          draftPlanId: 'draft-20',
          kind: 'not_like_this',
          note: 'Budget is already approved',
          createdAt: 30,
        },
      ],
      lastConfirmedActionAt: 40,
    },
  });

  assert.equal(session.task?.currentPlan?.steps[0]?.evidence?.[0]?.sourceKindLabel, 'manual_summary');
  assert.equal(session.task?.currentPlan?.steps[0]?.confidence?.level, 'low');
  assert.equal(session.task?.currentPlan?.steps[0]?.safety?.manualOnly, false);
  assert.equal(session.task?.pendingPlan?.status, 'draft');
  assert.equal(session.task?.planHistory?.[0]?.status, 'draft');
  assert.equal(session.task?.stepFeedbackHistory?.[0]?.kind, 'not_like_this');
  assert.equal(session.task?.lastConfirmedActionAt, 40);
});

test('normalizeSession clears completed task state instead of reviving scaffold data', () => {
  const session = normalizeSession({
    lastActive: 200,
    uiRoute: 'SCAFFOLD',
    notThisCount: 0,
    currentActionId: 'action-1',
    currentPayload: {
      workflow_type: 'client_resume',
      requires_clarification: false,
      situation_summary: 'งานนี้จบแล้ว',
      recommended_action: {
        title: 'งานนี้เสร็จแล้ว',
        rationale: 'ไม่ต้อง revive task นี้อีก',
        micro_steps: ['step 1', 'step 2', 'step 3'],
      },
      alternative_actions: [],
      detected_blockers: [],
    },
    activeDumpContext: {
      text: 'บริบทเก่าของงานนี้',
      createdAt: 150,
    },
    task: {
      id: 'task-done',
      workflowType: 'client_resume',
      taskShape: {
        deliverableType: 'execution',
        immediateNeed: 'resume_execution',
        missingInputs: [],
        workContext: 'งานนี้จบแล้ว',
      },
      sourceText: 'บริบทเก่าของงานนี้',
      sourceFiles: [],
      extractedText: '',
      createdAt: 150,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'done',
      currentStepIndex: 2,
      currentActionId: 'action-1',
      rescueHistory: [],
      lastSynthesis: {
        workflow_type: 'client_resume',
        requires_clarification: false,
        situation_summary: 'งานนี้จบแล้ว',
        recommended_action: {
          title: 'งานนี้เสร็จแล้ว',
          rationale: 'ไม่ต้อง revive task นี้อีก',
          micro_steps: ['step 1', 'step 2', 'step 3'],
        },
        alternative_actions: [],
        detected_blockers: [],
      },
    },
  });

  assert.equal(session.uiRoute, 'DUMP_ENTRY');
  assert.equal(session.task, undefined);
  assert.equal(session.currentPayload, undefined);
  assert.equal(session.currentActionId, null);
  assert.equal(session.activeDumpContext, undefined);
});

test('normalizeSession preserves scaffold completion assistant mode during hydration', () => {
  const session = normalizeSession({
    lastActive: 250,
    uiRoute: 'SCAFFOLD',
    notThisCount: 0,
    currentActionId: 'action-1',
    currentPayload: {
      workflow_type: 'client_resume',
      requires_clarification: false,
      situation_summary: 'proposal กำลังขยับต่อ',
      recommended_action: {
        title: 'ล็อก requirement ก่อนทำ proposal',
        rationale: 'จะได้ไม่เด้งกลับไปเริ่มจากศูนย์',
        micro_steps: ['รวบ requirement', 'แยก assumption', 'เตรียม timeline'],
      },
      alternative_actions: [],
      detected_blockers: [],
    },
    task: {
      id: 'task-2',
      workflowType: 'client_resume',
      sourceText: 'proposal AI ยังไม่จบ',
      sourceFiles: [],
      extractedText: '',
      createdAt: 150,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'in_scaffold',
      assistantMode: 'scaffold_completion',
      currentStepIndex: 2,
      currentActionId: 'action-1',
      rescueHistory: [],
      currentPlan: {
        actionTitle: 'ล็อก requirement ก่อนทำ proposal',
        successSignal: 'มี requirement และ timeline รอบแรกพร้อมแล้ว',
        steps: [
          { id: 'step-1', text: 'รวบ requirement' },
          { id: 'step-2', text: 'แยก assumption' },
          { id: 'step-3', text: 'เตรียม timeline' },
        ],
      },
    },
  });

  assert.equal(session.uiRoute, 'SCAFFOLD');
  assert.equal(session.task?.assistantMode, 'scaffold_completion');
  assert.equal(session.task?.currentStepIndex, 2);
  assert.equal(session.task?.currentPlan?.successSignal, 'มี requirement และ timeline รอบแรกพร้อมแล้ว');
});

test('normalizeSession preserves room metadata on session and task', () => {
  const session = normalizeSession({
    roomId: 'room-acme',
    roomTitle: 'ACME - Website revamp',
    roomScenarioType: 'client_project_restart',
    lastActive: 250,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    task: {
      id: 'task-room',
      roomId: 'room-acme',
      workflowType: 'client_resume',
      sourceText: 'งานค้างของ ACME',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
  });

  assert.equal(session.roomId, 'room-acme');
  assert.equal(session.roomTitle, 'ACME - Website revamp');
  assert.equal(session.roomScenarioType, 'client_project_restart');
  assert.equal(session.task?.roomId, 'room-acme');
});

test('normalizeSession preserves source file retry metadata', () => {
  const session = normalizeSession({
    roomId: 'room-acme',
    lastActive: 260,
    uiRoute: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    task: {
      id: 'task-file-retry',
      roomId: 'room-acme',
      workflowType: 'client_resume',
      sourceText: 'งานค้างของ ACME',
      sourceFiles: [
        {
          id: 'file-1',
          name: 'brief.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          size: 2048,
          status: 'failed',
          createdAt: 100,
          failureReason: 'pdf_ocr_failed',
          failureDetail: 'pdf_ocr_timeout',
          failureStage: 'pdf_ocr',
          storageKey: 'room-file:room-acme:brief',
          lastExtractAttemptAt: 200,
          extractAttemptCount: 2,
          ocrEngine: 'tesseract',
          ocrMetrics: {
            rawTextLength: 120,
            normalizedTextLength: 90,
            fragmentedRunCount: 3,
            spaceDensity: 0.45,
            normalWordRatio: 0.25,
            pageCountProcessed: 2,
            durationMs: 9000,
          },
        },
      ],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: ['missing_file_or_context'],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
  });

  const file = session.task?.sourceFiles[0];
  assert.equal(file?.storageKey, 'room-file:room-acme:brief');
  assert.equal(file?.failureDetail, 'pdf_ocr_timeout');
  assert.equal(file?.failureStage, 'pdf_ocr');
  assert.equal(file?.lastExtractAttemptAt, 200);
  assert.equal(file?.extractAttemptCount, 2);
  assert.equal(file?.ocrEngine, 'tesseract');
  assert.equal(file?.ocrMetrics?.fragmentedRunCount, 3);
  assert.equal(file?.ocrMetrics?.pageCountProcessed, 2);
});

test('buildRoomRecordFromSession seeds lastKnownGood room data when no AI brief exists yet', () => {
  const session = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-seed',
      roomTitle: 'ACME - Seed room',
      roomScenarioType: 'client_project_restart',
    }),
    task: {
      id: 'task-seed',
      roomId: 'room-seed',
      workflowType: 'client_resume',
      sourceText: 'ลูกค้า ACME ขอให้กลับมาสรุป proposal ที่ค้างไว้',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      currentPlan: {
        actionTitle: 'สรุป proposal draft ที่ค้างอยู่',
        steps: [
          { id: 'step-1', text: 'เปิด proposal draft ล่าสุด' },
          { id: 'step-2', text: 'จด assumption ที่ยังไม่ชัด' },
          { id: 'step-3', text: 'เลือก next move ที่เริ่มได้ทันที' },
        ],
      },
    },
  });

  const room = buildRoomRecordFromSession(session, 'room-seed');

  assert.equal(room.lastKnownGoodBrief?.includes('ลูกค้า ACME'), true);
  assert.deepEqual(room.lastKnownGoodNextMoves, [
    'เปิด proposal draft ล่าสุด',
    'จด assumption ที่ยังไม่ชัด',
    'เลือก next move ที่เริ่มได้ทันที',
  ]);
  assert.equal(room.aiFreshness, 'fallback');
  assert.equal(typeof room.lastKnownGoodAt, 'number');
});

test('buildRoomRecordFromSession preserves prior lastKnownGood room data for failed session', () => {
  const successSession = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-stable',
      roomTitle: 'Northstar - Stable room',
      roomScenarioType: 'client_project_restart',
    }),
    uiRoute: 'BOUNCE_BACK',
    task: {
      id: 'task-stable',
      roomId: 'room-stable',
      workflowType: 'client_resume',
      sourceText: 'งานลูกค้า Northstar ค้างอยู่',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'stalled',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      reentryBrief: {
        summary: 'เริ่มจากตอบลูกค้าก่อน แล้วค่อยกลับไปเก็บ scope',
        topActions: [
          {
            roomId: 'room-stable',
            title: 'ร่าง reply update ให้ลูกค้า',
            rationale: 'กันดีลเย็น',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
        createdAt: Date.now(),
      },
    },
  });
  const stableRoom = buildRoomRecordFromSession(successSession, 'room-stable');

  const failedSession = normalizeSession({
    ...successSession,
    uiRoute: 'MANUAL_FALLBACK',
    status: 'MANUAL_FALLBACK',
    task: {
      ...successSession.task!,
      reentryBrief: undefined,
      lifecycleState: 'failed',
      lastFailureReason: 'request_timeout',
    },
  });

  const preservedRoom = buildRoomRecordFromSession(failedSession, 'room-stable', stableRoom);

  assert.equal(preservedRoom.lastKnownGoodBrief, 'เริ่มจากตอบลูกค้าก่อน แล้วค่อยกลับไปเก็บ scope');
  assert.deepEqual(preservedRoom.lastKnownGoodNextMoves, ['ร่าง reply update ให้ลูกค้า']);
  assert.equal(preservedRoom.aiFreshness, 'fallback');
});

test('applyRenameRoomToWorkspace updates room title and active session title together', () => {
  const roomSession = normalizeSession(createDefaultSession({
    roomId: 'room-a',
    roomTitle: 'ACME - Website revamp',
    roomScenarioType: 'client_project_restart',
  }));
  const otherSession = normalizeSession(createDefaultSession({
    roomId: 'room-b',
    roomTitle: 'Northstar - Demo reply',
    roomScenarioType: 'sales_inquiry_demo_request',
  }));
  const workspace = {
    activeRoomId: 'room-a',
    rooms: [
      buildRoomRecordFromSession(roomSession, 'room-a'),
      buildRoomRecordFromSession(otherSession, 'room-a'),
    ],
    lastUpdatedAt: 1,
  };

  const result = applyRenameRoomToWorkspace(workspace, 'room-a', 'ACME - Follow up draft', roomSession);

  assert.equal(result.workspace.rooms[0]?.title, 'ACME - Follow up draft');
  assert.equal(result.workspace.rooms[0]?.session.roomTitle, 'ACME - Follow up draft');
  assert.equal(result.session?.roomTitle, 'ACME - Follow up draft');
});

test('applyTrashRoomToWorkspace moves active room to trash and falls forward to next visible room', () => {
  const roomASession = normalizeSession(createDefaultSession({
    roomId: 'room-a',
    roomTitle: 'ACME - Website revamp',
    roomScenarioType: 'client_project_restart',
  }));
  const roomBSession = normalizeSession(createDefaultSession({
    roomId: 'room-b',
    roomTitle: 'Northstar - Demo reply',
    roomScenarioType: 'sales_inquiry_demo_request',
  }));
  const workspace = {
    activeRoomId: 'room-a',
    rooms: [
      buildRoomRecordFromSession(roomASession, 'room-a'),
      buildRoomRecordFromSession(roomBSession, 'room-a'),
    ],
    lastUpdatedAt: 1,
  };

  const result = applyTrashRoomToWorkspace(workspace, 'room-a', roomASession);

  assert.equal(typeof result.workspace.rooms[0]?.trashedAt, 'number');
  assert.equal(result.workspace.activeRoomId, 'room-b');
  assert.equal(result.session?.roomId, 'room-b');
});

test('applyRestoreRoomToWorkspace restores trashed room without changing list order', () => {
  const roomASession = normalizeSession(createDefaultSession({
    roomId: 'room-a',
    roomTitle: 'ACME - Website revamp',
    roomScenarioType: 'client_project_restart',
  }));
  const roomBSession = normalizeSession(createDefaultSession({
    roomId: 'room-b',
    roomTitle: 'Northstar - Demo reply',
    roomScenarioType: 'sales_inquiry_demo_request',
  }));
  const trashedWorkspace = applyTrashRoomToWorkspace({
    activeRoomId: 'room-a',
    rooms: [
      buildRoomRecordFromSession(roomASession, 'room-a'),
      buildRoomRecordFromSession(roomBSession, 'room-a'),
    ],
    lastUpdatedAt: 1,
  }, 'room-a', roomASession).workspace;

  const restored = applyRestoreRoomToWorkspace(trashedWorkspace, 'room-a');

  assert.equal(restored.workspace.rooms[0]?.id, 'room-a');
  assert.equal(restored.workspace.rooms[1]?.id, 'room-b');
  assert.equal(restored.workspace.rooms[0]?.trashedAt, undefined);
});

test('buildRoomRecordFromSession preserves prior lastKnownGood room data for dumped session', () => {
  const successfulRoom = buildRoomRecordFromSession(
    normalizeSession({
      ...createDefaultSession({
        roomId: 'room-dumped',
        roomTitle: 'Client room with cached brief',
        roomScenarioType: 'client_project_restart',
      }),
      task: {
        id: 'task-dumped-success',
        roomId: 'room-dumped',
        workflowType: 'client_resume',
        sourceText: 'งานค้างของ client room นี้',
        sourceFiles: [],
        extractedText: '',
        createdAt: 100,
        pendingInputs: [],
        blockerSignals: [],
        lifecycleState: 'stalled',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
        reentryBrief: {
          summary: 'เปิดข้อความล่าสุดแล้วตอบ update ก่อน',
          topActions: [
            {
              roomId: 'room-dumped',
              title: 'ร่าง reply update',
              rationale: 'กันงานเย็น',
              impact: 'high',
              effort: 'low',
              resumeTarget: 'ONE_ACTION',
            },
          ],
          ignoredNoise: [],
          createdAt: 123,
        },
      },
    }),
    'room-dumped',
  );

  const dumpedSession = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-dumped',
      roomTitle: 'Client room with cached brief',
      roomScenarioType: 'client_project_restart',
    }),
    uiRoute: 'DUMP_ENTRY',
    task: {
      ...successfulRoom.session.task!,
      lifecycleState: 'dumped',
      reentryBrief: undefined,
      lastStableSummary: undefined,
    },
  });

  const preservedRoom = buildRoomRecordFromSession(dumpedSession, 'room-dumped', successfulRoom);

  assert.equal(preservedRoom.lastKnownGoodBrief, 'เปิดข้อความล่าสุดแล้วตอบ update ก่อน');
  assert.deepEqual(preservedRoom.lastKnownGoodNextMoves, ['ร่าง reply update']);
  assert.equal(preservedRoom.aiFreshness, 'stale');
});

test('buildRoomRecordFromSession preserves lastKnownGood data per room across room switching', () => {
  const roomASession = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-a',
      roomTitle: 'ACME - Website revamp',
      roomScenarioType: 'client_project_restart',
    }),
    uiRoute: 'BOUNCE_BACK',
    task: {
      id: 'task-a',
      roomId: 'room-a',
      workflowType: 'client_resume',
      sourceText: 'งาน ACME ค้างที่ feedback รอบล่าสุด',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'stalled',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      reentryBrief: {
        summary: 'ACME ควรเริ่มจากสรุป feedback ล่าสุดก่อน',
        topActions: [
          {
            roomId: 'room-a',
            title: 'สรุป feedback ล่าสุดเป็น checklist',
            rationale: 'กลับเข้า context ให้เร็ว',
            impact: 'high',
            effort: 'low',
            resumeTarget: 'ONE_ACTION',
          },
        ],
        ignoredNoise: [],
        createdAt: Date.now(),
      },
    },
  });
  const roomA = buildRoomRecordFromSession(roomASession, 'room-a');

  const roomBSession = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-b',
      roomTitle: 'Northstar - Demo reply',
      roomScenarioType: 'sales_inquiry_demo_request',
    }),
    task: {
      id: 'task-b',
      roomId: 'room-b',
      workflowType: 'client_response',
      sourceText: 'ลูกค้า Northstar ขอ demo ด่วน',
      sourceFiles: [],
      extractedText: '',
      createdAt: 120,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'dumped',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
      currentPlan: {
        actionTitle: 'ร่าง reply ยืนยัน demo slot',
        steps: [
          { id: 'step-1', text: 'เปิดข้อความลูกค้าล่าสุด' },
          { id: 'step-2', text: 'ร่าง reply ยืนยัน demo slot' },
          { id: 'step-3', text: 'เช็ก tone ก่อนส่ง' },
        ],
      },
    },
  });
  const roomB = buildRoomRecordFromSession(roomBSession, 'room-a');

  assert.equal(roomA.lastKnownGoodBrief, 'ACME ควรเริ่มจากสรุป feedback ล่าสุดก่อน');
  assert.deepEqual(roomA.lastKnownGoodNextMoves, ['สรุป feedback ล่าสุดเป็น checklist']);
  assert.equal(roomB.lastKnownGoodBrief?.includes('ลูกค้า Northstar ขอ demo ด่วน'), true);
  assert.deepEqual(roomB.lastKnownGoodNextMoves, [
    'เปิดข้อความลูกค้าล่าสุด',
    'ร่าง reply ยืนยัน demo slot',
    'เช็ก tone ก่อนส่ง',
  ]);
  const roomAAfterSwitch = buildRoomRecordFromSession(roomASession, 'room-b', roomA);
  const roomBAfterSwitch = buildRoomRecordFromSession(roomBSession, 'room-b', roomB);

  assert.equal(roomAAfterSwitch.lastKnownGoodBrief, 'ACME ควรเริ่มจากสรุป feedback ล่าสุดก่อน');
  assert.deepEqual(roomAAfterSwitch.lastKnownGoodNextMoves, ['สรุป feedback ล่าสุดเป็น checklist']);
  assert.equal(roomBAfterSwitch.aiFreshness, 'fallback');
});

test('hydrateRoomSessionFromRecord recovers transient synthesizing session from cached room save point', () => {
  const transientSession = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-recover',
      roomTitle: 'Recovered room',
      roomScenarioType: 'client_project_restart',
    }),
    uiRoute: 'SYNTHESIZING',
    status: 'SYNTHESIZING',
    task: {
      id: 'task-recover',
      roomId: 'room-recover',
      workflowType: 'client_resume',
      sourceText: 'ลูกค้าส่งไฟล์มาแล้วแต่ยังไม่ได้ follow up',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'synthesizing',
      currentStepIndex: 0,
      currentActionId: null,
      rescueHistory: [],
    },
  });

  const hydrated = hydrateRoomSessionFromRecord(transientSession, {
    id: 'room-recover',
    title: 'Recovered room',
    clientName: 'Recovered room',
    scenarioType: 'client_project_restart',
    session: transientSession,
    lastKnownGoodBrief: 'เปิด thread ล่าสุดแล้วตอบ update กลับลูกค้าก่อน',
    lastKnownGoodNextMoves: ['ร่าง reply update', 'สรุปสิ่งที่ค้างไว้'],
    lastReentryBrief: {
      summary: 'เริ่มจากตอบ update กลับลูกค้าก่อน แล้วค่อยไล่ scope ที่ค้าง',
      topActions: [
        {
          roomId: 'room-recover',
          title: 'ร่าง reply update',
          rationale: 'กันจังหวะงานเย็น',
          impact: 'high',
          effort: 'low',
          resumeTarget: 'ONE_ACTION',
        },
      ],
      ignoredNoise: [],
      createdAt: 150,
    },
    lastUpdatedAt: 150,
    unread: false,
    stale: false,
    lastState: 'SYNTHESIZING',
    contextSummary: 'เปิด thread ล่าสุดแล้วตอบ update กลับลูกค้าก่อน',
    nextMoves: ['ร่าง reply update', 'สรุปสิ่งที่ค้างไว้'],
    aiFreshness: 'fallback',
  });

  assert.equal(hydrated.uiRoute, 'DUMP_ENTRY');
  assert.equal(hydrated.task?.lifecycleState, 'dumped');
  assert.equal(hydrated.task?.lastStableSummary, 'เปิด thread ล่าสุดแล้วตอบ update กลับลูกค้าก่อน');
  assert.equal(hydrated.task?.reentryBrief?.topActions[0].title, 'ร่าง reply update');
});

test('hydrateRoomSessionFromRecord leaves active non-transient room route unchanged', () => {
  const session = normalizeSession({
    ...createDefaultSession({
      roomId: 'room-steady',
      roomTitle: 'Steady room',
      roomScenarioType: 'client_project_restart',
    }),
    uiRoute: 'ONE_ACTION',
    status: 'ONE_ACTION',
    task: {
      id: 'task-steady',
      roomId: 'room-steady',
      workflowType: 'client_resume',
      sourceText: 'งานนี้กำลังขยับอยู่',
      sourceFiles: [],
      extractedText: '',
      createdAt: 100,
      pendingInputs: [],
      blockerSignals: [],
      lifecycleState: 'has_one_action',
      currentStepIndex: 0,
      currentActionId: 'action-1',
      rescueHistory: [],
    },
  });

  const hydrated = hydrateRoomSessionFromRecord(session, {
    id: 'room-steady',
    title: 'Steady room',
    clientName: 'Steady room',
    scenarioType: 'client_project_restart',
    session,
    lastKnownGoodBrief: 'มี save point อยู่',
    lastKnownGoodNextMoves: ['ทำต่อจาก action เดิม'],
    lastUpdatedAt: 150,
    unread: false,
    stale: false,
    lastState: 'ONE_ACTION',
    contextSummary: 'มี save point อยู่',
    nextMoves: ['ทำต่อจาก action เดิม'],
    aiFreshness: 'fresh',
  });

  assert.equal(hydrated, session);
});
