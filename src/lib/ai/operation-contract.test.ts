import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAiActionResponse,
  parseAiIntakeResponse,
  parseAiReentryResponse,
  parseAiRescueResponse,
  parseAiScaffoldResponse,
} from './operation-contract';

test('parseAiIntakeResponse fills missing intake structure from fallback context', () => {
  const parsed = parseAiIntakeResponse(JSON.stringify({
    summary: 'ลูกค้าส่ง feedback เรื่อง headline กับ CTA',
    blockers: ['unclear_scope'],
    meta: {
      model: 'qwen2.5:3b',
      pass_type: 'repair_pass',
      duration_ms: 18200,
      used_room_files: [],
      repair_used: true,
    },
  }), {
    fallbackWorkflowType: 'client_response',
    fallbackRoomDigest: 'ลูกค้าส่ง feedback เรื่อง headline กับ CTA',
    fallbackObjective: 'สรุปสิ่งที่ลูกค้าต้องการและเตรียมตอบกลับ',
    fallbackStage: 'กำลังตีความ feedback จากลูกค้า',
  });

  assert.equal(parsed.workflowType, 'client_response');
  assert.equal(parsed.taskFrame.objective.includes('เตรียมตอบกลับ'), true);
  assert.equal(parsed.candidateActions.length >= 1, true);
  assert.equal(parsed.meta.passType, 'repair_pass');
  assert.equal(parsed.meta.durationMs, 18200);
});

test('parseAiActionResponse accepts a negotiated action payload', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    chosenAction: {
      title: 'ตอบลูกค้าด้วยกรอบเวลาใหม่',
      rationale: 'เคลียร์ความคาดหวังและลดแรงกดดันทันที',
      successSignal: 'ลูกค้ารู้ timeline ใหม่และตอบกลับได้',
    },
    alternatives: [
      {
        title: 'สรุป backlog ก่อน',
        rationale: 'เหมาะถ้ายังไม่พร้อมตอบทันที',
      },
    ],
    whyThisNow: 'ตอนนี้ต้องลด uncertainty ให้ลูกค้าก่อน เพื่อให้คุยงานต่อได้ง่าย',
    replyDraft: 'ขออัปเดต timeline ภายในวันนี้ครับ',
    situationSummary: 'ลูกค้ารอความชัดเจนเรื่อง timeline อยู่',
    meta: {
      model: 'qwen2.5:3b',
      confidence: 0.82,
      usedRoomFiles: ['brief.pdf'],
      repairUsed: false,
    },
  }));

  assert.equal(parsed.chosenAction.title, 'ตอบลูกค้าด้วยกรอบเวลาใหม่');
  assert.equal(parsed.whyThisNow.includes('uncertainty'), true);
  assert.equal(parsed.meta.usedRoomFiles[0], 'brief.pdf');
});

test('parseAiActionResponse fills missing action structure from fallback context', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    rationale: 'ตอนนี้ต้องเริ่มจากก้าวที่แตะได้จริงก่อน',
    meta: {
      model: 'qwen2.5:3b',
      pass_type: 'repair_pass',
      duration_ms: 24000,
      used_room_files: [],
      repair_used: true,
    },
  }), {
    fallbackChosenTitle: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
    fallbackChosenRationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวน',
    fallbackSuccessSignal: 'ได้สรุปสั้นที่ใช้ตอบหรือไปต่อได้',
    fallbackWhyThisNow: 'ตอนนี้ควรลด uncertainty ก่อน',
    fallbackSituationSummary: 'ลูกค้าส่ง feedback หลายข้อและยังไม่ได้ตอบกลับ',
    fallbackWorkflowType: 'client_response',
  });

  assert.equal(parsed.chosenAction.title, 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน');
  assert.equal(parsed.situationSummary.includes('feedback'), true);
  assert.equal(parsed.meta.passType, 'repair_pass');
  assert.equal(parsed.alternatives.length, 2);
  assert.equal(parsed.alternatives[0]?.title.includes('สรุปประเด็นหลัก'), true);
});

test('parseAiActionResponse salvages plain-text action output with safe fallback structure', () => {
  const parsed = parseAiActionResponse(`
เริ่มจากสรุปประเด็นหลักของลูกค้าก่อน เพื่อให้เห็นว่าต้องตอบอะไรเป็นลำดับแรก
ลูกค้าส่ง feedback หลายข้อและตอนนี้ยังไม่ควรกระโดดไปแก้ทั้งหมดพร้อมกัน
  `, {
    fallbackChosenTitle: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
    fallbackChosenRationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวน',
    fallbackSuccessSignal: 'ได้สรุปสั้นที่ใช้ตอบหรือไปต่อได้',
    fallbackWhyThisNow: 'ตอนนี้ควรลด uncertainty ก่อน',
    fallbackSituationSummary: 'ลูกค้าส่ง feedback หลายข้อและยังไม่ได้ตอบกลับ',
    fallbackWorkflowType: 'client_response',
  });

  assert.equal(parsed.chosenAction.title, 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน');
  assert.equal(parsed.whyThisNow.includes('สรุปประเด็นหลัก'), true);
  assert.equal(parsed.situationSummary.includes('ลูกค้าส่ง feedback'), true);
  assert.equal(parsed.alternatives.length, 2);
  assert.equal(parsed.alternatives[1]?.title.includes('ร่างข้อความถามกลับ'), true);
});

test('parseAiReentryResponse unwraps nested envelopes and aliases', () => {
  const raw = JSON.stringify({
    response: JSON.stringify({
      reentry_summary: 'ตอนนี้ยังไม่ต้องอ่านทุกไฟล์ใหม่ เริ่มจากอัปเดตลูกค้าก่อน',
      top_actions: [
        {
          room_id: 'task-1',
          title: 'เปิด reply draft แล้วเติม timeline',
          rationale: 'เป็นทางที่ impact สูงและเริ่มได้เร็วที่สุด',
          impact: 'high',
          effort: 'low',
          resume_target: 'ONE_ACTION',
        },
      ],
      ignored_noise: ['ยังไม่ต้องรีแฟกเตอร์ไฟล์เก่า'],
      meta: {
        model: 'qwen2.5:3b',
        used_room_files: ['feedback.png'],
        repair_used: true,
      },
    }),
  });

  const parsed = parseAiReentryResponse(raw);

  assert.equal(parsed.reentrySummary.includes('อัปเดตลูกค้าก่อน'), true);
  assert.equal(parsed.topActions[0].resumeTarget, 'ONE_ACTION');
  assert.equal(parsed.meta.repairUsed, true);
});

test('parseAiReentryResponse fills missing reentry structure from fallback context', () => {
  const parsed = parseAiReentryResponse(JSON.stringify({
    top_actions: [
      {
        title: 'กลับไปอ่านไฟล์นั้นก่อน',
      },
    ],
    meta: {
      model: 'qwen2.5:3b',
      pass_type: 'repair_pass',
      duration_ms: 31000,
      used_room_files: [],
      repair_used: true,
    },
  }), {
    fallbackRoomId: 'task-1',
    fallbackActionTitle: 'เปิด proposal draft',
    fallbackCurrentStep: 'เติมบรรทัดแรกของ proposal',
    fallbackResumeTarget: 'SCAFFOLD',
  });

  assert.equal(parsed.reentrySummary.includes('เติมบรรทัดแรกของ proposal'), true);
  assert.equal(parsed.topActions[0].roomId, 'task-1');
  assert.equal(parsed.topActions[0].resumeTarget, 'SCAFFOLD');
  assert.equal(parsed.meta.passType, 'repair_pass');
});

test('parseAiScaffoldResponse fills missing plan title and steps from fallback context', () => {
  const parsed = parseAiScaffoldResponse(JSON.stringify({
    steps: [
      {
        title: 'สรุปสถานะงานที่เราทำไปแล้ว',
      },
      {},
    ],
    revised_current_step_index: 0,
    meta: {
      model: 'qwen2.5:3b',
      used_room_files: [],
      repair_used: false,
    },
  }), {
    fallbackPlanTitle: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
    fallbackCurrentStep: 'สรุปสถานะงานที่เราทำไปแล้ว',
    fallbackSteps: [
      'สรุปสถานะงานที่เราทำไปแล้ว',
      'ถามลูกค้าว่าต้องการให้เริ่มจากจุดไหน',
      'ร่างข้อความตอบกลับเพื่อขอ clarification',
    ],
    fallbackCurrentStepIndex: 0,
  });

  assert.equal(parsed.planTitle, 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด');
  assert.equal(parsed.steps.length >= 3, true);
  assert.equal(parsed.steps[0]?.text.includes('สรุปสถานะงาน'), true);
  assert.equal(parsed.steps[1]?.text.includes('ถามลูกค้า'), true);
});

test('parseAiRescueResponse fills missing explanation and steps from fallback context', () => {
  const parsed = parseAiRescueResponse(JSON.stringify({
    diagnosis: {
      primary_reason: 'too_big',
    },
    rescue_plan: {
      mode: 'shrink',
      steps: ['ตัดให้เหลือก้าวเล็กที่สุด', {}],
    },
    meta: {
      model: 'qwen2.5:3b',
      used_room_files: ['brief.pdf'],
      repair_used: false,
    },
  }), {
    fallbackReason: 'too_big',
    fallbackActionTitle: 'สรุปสถานะงานและขอ clarification ที่ยังไม่ชัด',
    fallbackCurrentStep: 'สรุปสถานะงานที่เราทำไปแล้ว',
  });

  assert.equal(parsed.diagnosis.primaryReason, 'too_big');
  assert.equal(parsed.diagnosis.explanation.includes('ใหญ่เกินไป') || parsed.diagnosis.explanation.includes('ก้าวปัจจุบัน'), true);
  assert.equal(parsed.rescuePlan.steps.length >= 2, true);
});

test('parseAiRescueResponse canonicalizes alias reasons before schema validation', () => {
  const parsed = parseAiRescueResponse(JSON.stringify({
    diagnosis: {
      primaryReason: 'too large',
      explanation: 'งานนี้ยังใหญ่เกินไปสำหรับเริ่มตอนนี้',
    },
    rescuePlan: {
      mode: 'make smaller',
      steps: ['ตัดก้าวนี้ให้เล็กลงก่อน', 'เริ่มจากส่วนที่เล็กที่สุด'],
    },
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: true,
    },
  }));

  assert.equal(parsed.diagnosis.primaryReason, 'too_big');
  assert.equal(parsed.rescuePlan.mode, 'shrink');
});

test('parseAiRescueResponse falls back to fallbackReason when reason cannot be mapped', () => {
  const parsed = parseAiRescueResponse(JSON.stringify({
    diagnosis: {
      primaryReason: 'something weird happened',
      explanation: 'อาการยังเล่าไม่ชัด',
    },
    rescuePlan: {
      mode: '???',
      steps: ['จดสิ่งที่ยังไม่ชัด', 'ถามกลับเฉพาะจุดที่ขาด'],
    },
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    fallbackReason: 'missing_context',
  });

  assert.equal(parsed.diagnosis.primaryReason, 'missing_context');
  assert.equal(parsed.rescuePlan.mode, 'clarify');
});

test('parseAiRescueResponse defaults unknown when unmapped reason has no fallback', () => {
  const parsed = parseAiRescueResponse(JSON.stringify({
    diagnosis: {
      primaryReason: 'mystery state',
      explanation: 'ยังไม่รู้ว่าติดเพราะอะไร',
    },
    rescuePlan: {
      steps: ['หยุดแล้วดูว่ายังติดตรงไหน', 'เลือกก้าวที่เล็กที่สุดก่อน'],
    },
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }));

  assert.equal(parsed.diagnosis.primaryReason, 'unknown');
  assert.equal(parsed.rescuePlan.mode, 'shrink');
});

test('parseAiRescueResponse derives mode from normalized reason when mode is invalid', () => {
  const parsed = parseAiRescueResponse(JSON.stringify({
    diagnosis: {
      primaryReason: 'external dependency',
      explanation: 'ต้องรอข้อมูลจากลูกค้าก่อน',
    },
    rescuePlan: {
      mode: 'help_me',
      steps: ['ระบุ dependency ที่ต้องรอ', 'ส่ง follow-up สั้น ๆ'],
    },
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: true,
    },
  }));

  assert.equal(parsed.diagnosis.primaryReason, 'dependency');
  assert.equal(parsed.rescuePlan.mode, 'follow_up');
});
