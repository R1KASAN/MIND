import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSession } from './idb';

test('normalizeSession preserves reentry brief and action explanation on task state', () => {
  const session = normalizeSession({
    lastActive: 100,
    uiRoute: 'BOUNCE_BACK',
    notThisCount: 0,
    currentActionId: 'action-1',
    task: {
      id: 'task-1',
      workflowType: 'client_resume',
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
  assert.equal(session.task?.oneActionTracking?.hasViewedAlternative, true);
  assert.equal(session.task?.reentryBrief?.topActions[0].resumeTarget, 'ONE_ACTION');
  assert.equal(session.task?.reentryBrief?.ignoredNoise[0], 'ยังไม่ต้องจัด archive');
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
