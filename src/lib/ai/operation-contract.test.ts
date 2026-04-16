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
    summary: 'ลูกค้าส่ง feedback เรื่อง headline กับ CTA และต้องตอบกลับวันนี้',
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
    fallbackSourceText: 'ลูกค้าส่ง feedback เรื่อง headline กับ CTA และต้องตอบกลับวันนี้',
    fallbackRoomDigest: 'ลูกค้าส่ง feedback เรื่อง headline กับ CTA และต้องตอบกลับวันนี้',
    fallbackObjective: 'สรุปสิ่งที่ลูกค้าต้องการและเตรียมตอบกลับ',
    fallbackStage: 'กำลังตีความ feedback จากลูกค้า',
  });

  assert.equal(parsed.workflowType, 'client_response');
  assert.equal(parsed.taskShape.deliverableType, 'reply');
  assert.equal(parsed.taskFrame.objective.includes('เตรียมตอบกลับ'), true);
  assert.equal(parsed.candidateActions.length >= 1, true);
  assert.equal(parsed.meta.passType, 'repair_pass');
  assert.equal(parsed.meta.durationMs, 18200);
});

test('parseAiIntakeResponse classifies proposal-start dumps by real task context', () => {
  const sourceText = 'ลูกค้าขอ proposal AI\nยังไม่ได้สรุป requirement\nมี note กระจัดกระจาย\nต้องทำ timeline\nต้อง estimate ราคา\nยังไม่ได้เริ่มเลย';
  const parsed = parseAiIntakeResponse(JSON.stringify({
    roomDigest: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
    blockers: ['unclear_scope'],
    meta: {
      model: 'qwen2.5:3b',
      repair_used: false,
    },
  }), {
    fallbackSourceText: sourceText,
    fallbackRoomDigest: sourceText,
    fallbackObjective: 'รวบ requirement และ scope ที่ยังไม่ชัดก่อนทำ proposal',
    fallbackStage: 'กำลังล็อกข้อมูลตั้งต้นเพื่อเริ่ม timeline และ estimate ได้จริง',
  });

  assert.equal(parsed.workflowType, 'client_resume');
  assert.equal(parsed.taskShape.deliverableType, 'proposal');
  assert.equal(parsed.taskShape.immediateNeed, 'define_scope');
  assert.equal(parsed.taskShape.missingInputs.includes('requirement ที่ต้องการจริง'), true);
  assert.equal(parsed.taskShape.missingInputs.includes('ข้อมูลสำหรับ estimate ราคาและ effort'), true);
  assert.equal(parsed.candidateActions[0]?.title, 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน');
});

test('parseAiIntakeResponse classifies demo-request client emails as reply-first context', () => {
  const sourceText = 'ลูกค้าจาก Alpha Retail อยากเริ่ม pilot เล็ก ๆ และอยากนัด demo 30 นาทีภายในสัปดาห์หน้า เพื่อดูว่าควรเริ่มจาก workflow แบบไหน';
  const parsed = parseAiIntakeResponse(JSON.stringify({
    roomDigest: 'ลูกค้าสนใจ MIND สำหรับทีมขายและอยากนัด demo',
    blockers: [],
    meta: {
      model: 'qwen2.5:3b',
      repair_used: false,
    },
  }), {
    fallbackSourceText: sourceText,
    fallbackRoomDigest: sourceText,
    fallbackObjective: 'สรุปสิ่งที่ลูกค้าต้องการและเตรียมตอบนัด demo',
    fallbackStage: 'กำลังจัดคำตอบรอบแรกให้ชัดว่าควรคุย pilot และ workflow ไหนก่อน',
  });

  assert.equal(parsed.workflowType, 'client_response');
  assert.equal(parsed.taskShape.deliverableType, 'reply');
  assert.equal(parsed.taskShape.immediateNeed, 'send_reply_now');
  assert.equal(parsed.taskShape.missingInputs.includes('ช่วงเวลาที่สะดวกสำหรับนัด demo'), true);
  assert.equal(parsed.candidateActions[0]?.title, 'สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน');
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

test('parseAiActionResponse uses proposal-start fallback instead of reply-first copy', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    rationale: 'ตอนนี้ควรเริ่มจากก้าวที่แตะได้จริงก่อน',
    meta: {
      model: 'qwen2.5:3b',
      pass_type: 'repair_pass',
      duration_ms: 21000,
      used_room_files: [],
      repair_used: true,
    },
  }), {
    fallbackWorkflowType: 'client_resume',
    fallbackTaskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: ['requirement ที่ต้องการจริง', 'ข้อมูลสำหรับ estimate ราคาและ effort'],
      workContext: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัดและยังเริ่มงานไม่ได้',
      confidence: 0.9,
    },
  });

  assert.equal(parsed.chosenAction.title, 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน');
  assert.equal(parsed.replyDraft, undefined);
  assert.equal(parsed.situationSummary.includes('proposal AI'), true);
  assert.equal(parsed.alternatives[0]?.title.includes('scope'), true);
});

test('parseAiActionResponse rewrites generic proposal alternatives into concrete task-shaped alternatives', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    chosenAction: {
      title: 'รวบ requirement ที่มีและจุดที่ยังขาดก่อน',
      rationale: 'ต้องล็อก requirement ก่อน',
      successSignal: 'ได้ requirement ชุดแรก',
    },
    alternatives: [
      {
        title: 'จัดการกับ blocker ที่มีอยู่',
        rationale: 'generic',
      },
      {
        title: 'สรุปข้อมูลที่มีอยู่',
        rationale: 'generic',
      },
    ],
    whyThisNow: 'ตอนนี้ยังไม่ควรกระโดดไปทำ timeline หรือ estimate',
    situationSummary: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    fallbackWorkflowType: 'client_resume',
    fallbackTaskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: ['requirement ที่ต้องการจริง'],
      workContext: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
      confidence: 0.9,
    },
  });

  assert.equal(parsed.alternatives[0]?.title, 'ตั้งสมมติฐาน scope เพื่อทำ timeline และ estimate รอบแรก');
  assert.equal(parsed.alternatives[1]?.title, 'แยกสิ่งที่ต้องรู้ก่อนตีราคา proposal');
});

test('parseAiActionResponse rejects reply-first titles for proposal-start tasks', () => {
  assert.throws(() => parseAiActionResponse(JSON.stringify({
    chosenAction: {
      title: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
      rationale: 'จะได้ตอบลูกค้าเร็วขึ้น',
      successSignal: 'ได้ draft ตอบกลับ',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้ควรตอบลูกค้าก่อน',
    replyDraft: 'เดี๋ยวผมส่งให้ครับ',
    situationSummary: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    fallbackWorkflowType: 'client_resume',
    fallbackTaskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: ['requirement ที่ต้องการจริง'],
      workContext: 'ลูกค้าขอ proposal AI แต่ requirement ยังไม่ชัด',
      confidence: 0.9,
    },
  }), /proposal work, not reply-first/);
});

test('parseAiActionResponse uses demo-request reply fallback for inbound client emails', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    rationale: 'ควรตอบกลับเพื่อคง momentum ของลูกค้าไว้',
    meta: {
      model: 'qwen2.5:3b',
      pass_type: 'repair_pass',
      duration_ms: 18000,
      used_room_files: [],
      repair_used: true,
    },
  }), {
    fallbackWorkflowType: 'client_response',
    fallbackTaskShape: {
      deliverableType: 'reply',
      immediateNeed: 'send_reply_now',
      missingInputs: ['ช่วงเวลาที่สะดวกสำหรับนัด demo', 'workflow pilot ที่ควรเสนอในการคุยรอบแรก'],
      workContext: 'ลูกค้ากำลังสนใจใช้ MIND ขอ pilot เล็ก ๆ และอยากนัด demo ภายในสัปดาห์หน้า',
      confidence: 0.91,
    },
  });

  assert.equal(parsed.chosenAction.title, 'สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน');
  assert.equal(parsed.replyDraft?.includes('demo 30 นาที'), true);
  assert.equal(parsed.alternatives[0]?.title, 'เลือก use case pilot ที่ควรหยิบไปเดโมก่อน');
});

test('parseAiActionResponse rewrites overly generic titles for demo-request reply tasks', () => {
  const parsed = parseAiActionResponse(JSON.stringify({
    chosenAction: {
      title: 'สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี',
      rationale: 'ช่วยให้เห็นภาพรวมก่อน',
      successSignal: 'ได้ summary',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้ควรเริ่มจากภาพรวมก่อน',
    replyDraft: 'ขอบคุณมากครับ',
    situationSummary: 'ลูกค้าสนใจ pilot และอยากนัด demo ภายในสัปดาห์หน้า',
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    fallbackWorkflowType: 'client_response',
    fallbackTaskShape: {
      deliverableType: 'reply',
      immediateNeed: 'send_reply_now',
      missingInputs: ['ช่วงเวลาที่สะดวกสำหรับนัด demo'],
      workContext: 'ลูกค้ากำลังสนใจใช้ MIND ขอ pilot เล็ก ๆ และอยากนัด demo ภายในสัปดาห์หน้า',
      confidence: 0.91,
    },
  });

  assert.equal(parsed.chosenAction.title, 'สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน');
  assert.equal(parsed.replyDraft, 'ขอบคุณมากครับ');
  assert.equal(parsed.situationSummary.includes('pilot'), true);
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

test('parseAiActionResponse falls back to readable text when plain-text fallback receives a malformed JSON blob', () => {
  const parsed = parseAiActionResponse(`
{"chosenAction":{"title":"สรุปประเด็นหลักจากข้อความลูกค้าก่อน","rationale":"ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวน","successSignal":"ได้สรุปสั้นที่ใช้ตอบหรือไปต่อได้"},"alternatives":[{"title":"ขอเวลาเพิ่มเพื่อทำความเข้าใจข้อความลูกค้า","rationale":"อาจต้องใช้เวลาเพื่อทำความเข้าใจเนื้อหาที่ซับซ้อน"}],"whyThisNow":"ต้องการสรุปประเด็นหลักเพื่อตอบกลับอย่างรวดเร็วและชัดเจน","situationSummary":"ลูกค้าไม่ได้ส่งข้อความหรือไม่มีแนบ แต่เราทราบว่ามีโปรเจกต์ลูกค้าค้างมาสองสัปดาห์"
  `, {
    fallbackChosenTitle: 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน',
    fallbackChosenRationale: 'ช่วยให้ตอบกลับได้ตรงประเด็นโดยไม่ต้องอ่านวน',
    fallbackSuccessSignal: 'ได้สรุปสั้นที่ใช้ตอบหรือไปต่อได้',
    fallbackWhyThisNow: 'ตอนนี้ควรลด uncertainty ก่อน',
    fallbackSituationSummary: 'ลูกค้าส่ง feedback หลายข้อและยังไม่ได้ตอบกลับ',
    fallbackWorkflowType: 'client_response',
  });

  assert.equal(parsed.chosenAction.title, 'สรุปประเด็นหลักจากข้อความลูกค้าก่อน');
  assert.equal(parsed.whyThisNow, 'ตอนนี้ควรลด uncertainty ก่อน');
  assert.equal(parsed.situationSummary, 'ลูกค้าส่ง feedback หลายข้อและยังไม่ได้ตอบกลับ');
  assert.equal(parsed.situationSummary.includes('"chosenAction"'), false);
});

test('parseAiActionResponse rejects malformed structured summary fragments', () => {
  assert.throws(() => parseAiActionResponse(JSON.stringify({
    chosenAction: {
      title: 'สรุปสิ่งที่ลูกค้าต้องการและร่างข้อความตอบนัด demo ก่อน',
      rationale: 'ช่วยให้ตอบกลับได้ตรงประเด็น',
      successSignal: 'ได้ draft ตอบกลับ',
    },
    alternatives: [],
    whyThisNow: 'ตอนนี้ควรตอบกลับก่อน',
    situationSummary: '{',
    meta: {
      model: 'qwen2.5:3b',
      usedRoomFiles: [],
      repairUsed: false,
    },
  }), {
    fallbackWorkflowType: 'client_response',
  }), /malformed structured text/);
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
