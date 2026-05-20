import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import type { RoomSourceFile } from '@/lib/room';
import {
  appendRoomMemoryEvent,
  clearRoomMemoryData,
  type RoomMemoryEvent,
} from '@/lib/store/room-memory-db';
import type { TaskContext } from '@/lib/store/idb';
import {
  buildActionEvidenceContext,
  buildActionEvidenceQuery,
} from './evidence-context';

function makeFile(input: {
  id: string;
  name: string;
  extractedText: string;
  createdAt?: number;
}): RoomSourceFile {
  return {
    id: input.id,
    name: input.name,
    kind: 'text',
    mimeType: 'text/plain',
    size: input.extractedText.length,
    status: 'ready',
    createdAt: input.createdAt ?? 1,
    extractedText: input.extractedText,
  };
}

function makeTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    id: 'task-1',
    roomId: 'room-1',
    workflowType: 'client_response',
    sourceText: 'บริบททั่วไปของห้องนี้',
    sourceFiles: [],
    extractedText: '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: ['timeline_unclear'],
    lifecycleState: 'has_one_action',
    currentStepIndex: 0,
    currentActionId: 'action-1',
    rescueHistory: [],
    ...overrides,
  };
}

function memoryEvent(overrides: Partial<RoomMemoryEvent> = {}): RoomMemoryEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    roomId: 'room-1',
    type: 'source_added',
    createdAt: 2000,
    actor: 'system',
    origin: 'live',
    summary: 'Room evidence entered memory.',
    refs: [],
    payloadVersion: 1,
    ...overrides,
  };
}

test('buildActionEvidenceQuery prioritizes action title and blocker signals deterministically', () => {
  const query = buildActionEvidenceQuery({
    task: makeTask({
      taskFrame: {
        objective: 'ตอบลูกค้าเรื่อง timeline',
        stage: 'awaiting_reply',
        stakeholders: ['client'],
      },
      taskShape: {
        deliverableType: 'reply',
        immediateNeed: 'send_reply_now',
        missingInputs: [],
        workContext: 'ลูกค้าถาม timeline',
      },
      currentPlan: {
        actionTitle: 'ยืนยัน deadline ใหม่',
        steps: [],
      },
    }),
    preferredCandidate: {
      title: 'สรุป timeline ก่อนตอบ',
      rationale: 'ลดความเสี่ยงตอบผิด',
    },
  });

  assert.match(query, /^สรุป timeline ก่อนตอบ สรุป timeline ก่อนตอบ/);
  assert.match(query, /timeline_unclear timeline_unclear/);
  assert.match(query, /send_reply_now/);
});

test('buildActionEvidenceContext selects ready evidence and excludes unreadable noisy sources', async () => {
  const task = makeTask({
    taskFrame: {
      objective: 'ตอบลูกค้าเรื่อง timeline',
      stage: 'awaiting_reply',
      stakeholders: ['client'],
    },
    sourceFiles: [
      {
        id: 'good-file',
        name: 'client-brief.txt',
        kind: 'text',
        mimeType: 'text/plain',
        size: 120,
        status: 'ready',
        createdAt: 1,
        extractedText: 'ลูกค้าขอ timeline ใหม่และต้องการให้ยืนยัน deadline ภายในวันนี้',
      },
      {
        id: 'bad-file',
        name: 'ocr-failed.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 1000,
        status: 'ready',
        createdAt: 1,
        extractedText: 'OCR failed unreadable text',
      },
      {
        id: 'failed-file',
        name: 'broken.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 1000,
        status: 'failed',
        createdAt: 1,
        failureReason: 'OCR failed',
      },
    ],
  });

  const context = await buildActionEvidenceContext({
    task,
    preferredCandidate: {
      title: 'ยืนยัน timeline กับลูกค้า',
      rationale: 'ลูกค้ารอ deadline ใหม่',
    },
  });

  assert.equal(context.selectionMethod, 'retrieval');
  assert.ok(context.evidenceChips.some((chip) => chip.sourceId === 'file:good-file'));
  assert.equal(context.evidenceChips.every((chip) => chip.sourceKindLabel === 'retrieved'), true);
  assert.match(context.summaryText, /client-brief\.txt/);
  assert.doesNotMatch(context.summaryText, /ocr-failed|broken|unreadable/i);
});

test('buildActionEvidenceContext covers five client-facing evidence fixtures', async () => {
  await clearRoomMemoryData();
  await appendRoomMemoryEvent(memoryEvent({
    refs: [
      {
        id: 'file:stale-handoff',
        kind: 'text',
        label: 'stale-handoff.md',
        excerpt: 'Last unfinished item was the pricing table and client follow-up.',
      },
    ],
  }));

  const cases: Array<{
    name: string;
    task: TaskContext;
    preferredCandidate: { title: string; rationale: string; kind?: string };
    expectedSourceId: string;
  }> = [
      {
        name: 'client reply',
        task: makeTask({
          id: 'task-client-reply',
          sourceText: 'ลูกค้าส่ง feedback ยาวหลายข้อเกี่ยวกับ landing page',
          taskFrame: {
            objective: 'ตอบลูกค้าเรื่อง feedback วันนี้',
            stage: 'awaiting_reply',
            stakeholders: ['client'],
          },
          taskShape: {
            deliverableType: 'reply',
            immediateNeed: 'send_reply_now',
            missingInputs: [],
            workContext: 'ต้องตอบ feedback landing page ให้ชัด',
          },
          blockerSignals: ['feedback_overload'],
          sourceFiles: [
            makeFile({
              id: 'client-feedback',
              name: 'client-feedback.txt',
              extractedText: 'Client feedback asks for hero copy changes and a reply today before the landing page review.',
            }),
            makeFile({
              id: 'unrelated-invoice',
              name: 'invoice-note.txt',
              extractedText: 'Invoice payment note unrelated to landing page feedback.',
            }),
          ],
        }),
        preferredCandidate: {
          title: 'Draft the client reply about landing page feedback',
          rationale: 'The client is waiting for a reply today.',
        },
        expectedSourceId: 'file:client-feedback',
      },
      {
        name: 'proposal scope',
        task: makeTask({
          id: 'task-proposal-scope',
          sourceText: 'ต้องทำ proposal แต่ scope ยังไม่ชัด',
          workflowType: 'client_resume',
          taskFrame: {
            objective: 'ล็อก scope proposal ก่อน estimate',
            stage: 'scope_definition',
            stakeholders: ['client'],
          },
          taskShape: {
            deliverableType: 'proposal',
            immediateNeed: 'define_scope',
            missingInputs: ['final scope'],
            workContext: 'proposal ยังขาดขอบเขตและ timeline',
          },
          blockerSignals: ['unclear_scope'],
          pendingInputs: [
            {
              kind: 'clarification',
              prompt: 'scope ที่ชัดแล้วคืออะไร',
              answer: 'Scope confirmed: CRM automation only. Do not include analytics dashboard. Timeline estimate still needed.',
              createdAt: 2,
            },
          ],
        }),
        preferredCandidate: {
          title: 'Clarify proposal scope before estimating timeline',
          rationale: 'Scope must exclude the analytics dashboard.',
        },
        expectedSourceId: 'pending:clarification:0',
      },
      {
        name: 'stale task reentry',
        task: makeTask({
          id: 'task-stale-reentry',
          roomId: 'room-1',
          sourceText: 'กลับมางานเดิมหลังหายไปหลายวัน',
          workflowType: 'client_resume',
          taskFrame: {
            objective: 'กลับมาเริ่ม proposal ต่อจากจุดค้าง',
            stage: 'reentry',
            stakeholders: ['client'],
          },
          taskShape: {
            deliverableType: 'proposal',
            immediateNeed: 'resume_execution',
            missingInputs: [],
            workContext: 'ต้องรู้จุดค้างล่าสุดก่อนเริ่มใหม่',
          },
          blockerSignals: ['stale_context'],
          sourceFiles: [
            makeFile({
              id: 'stale-handoff',
              name: 'stale-handoff.md',
              extractedText: 'Last unfinished item was the pricing table. Next action is update estimate and send client follow-up.',
            }),
          ],
        }),
        preferredCandidate: {
          title: 'Resume from the stale handoff and update estimate',
          rationale: 'The handoff identifies the unfinished pricing table.',
        },
        expectedSourceId: 'file:stale-handoff',
      },
      {
        name: 'missing context',
        task: makeTask({
          id: 'task-missing-context',
          sourceText: 'งานติดเพราะข้อมูลไม่ครบ',
          workflowType: 'client_resume',
          taskFrame: {
            objective: 'ปลดล็อกข้อมูลที่ขาดก่อนเดินงานต่อ',
            stage: 'blocked',
            stakeholders: ['client'],
          },
          taskShape: {
            deliverableType: 'unknown',
            immediateNeed: 'ask_clarifying_question' as any,
            missingInputs: ['access credentials', 'final asset folder'],
            workContext: 'ยังไม่มีข้อมูลพอจะทำงานต่อ',
          },
          blockerSignals: ['missing_context'],
          pendingInputs: [
            {
              kind: 'clarification',
              prompt: 'ข้อมูลอะไรที่ยังขาด',
              answer: 'Missing context: client access credentials and final asset folder are required before implementation.',
              createdAt: 3,
            },
          ],
        }),
        preferredCandidate: {
          title: 'Ask client for access credentials and final asset folder',
          rationale: 'These missing inputs block implementation.',
        },
        expectedSourceId: 'pending:clarification:0',
      },
      {
        name: 'low energy restart',
        task: makeTask({
          id: 'task-low-energy',
          sourceText: 'Low energy restart: do the five minute smallest step by opening the invoice checklist and marking one client follow-up item.',
          workflowType: 'client_resume',
          taskFrame: {
            objective: 'เริ่มงานค้างแบบใช้แรงน้อยที่สุด',
            stage: 'low_energy_restart',
            stakeholders: ['client'],
          },
          taskShape: {
            deliverableType: 'follow_up' as any,
            immediateNeed: 'resume_execution',
            missingInputs: [],
            workContext: 'ผู้ใช้พลังงานต่ำและต้องเริ่มจากก้าวเล็ก',
          },
          blockerSignals: ['low_energy'],
        }),
        preferredCandidate: {
          title: 'Open the invoice checklist and mark one client follow-up',
          rationale: 'This is the smallest five minute restart step.',
        },
        expectedSourceId: 'manual:task-low-energy',
      },
    ];

  try {
    for (const item of cases) {
      const context = await buildActionEvidenceContext({
        task: item.task,
        preferredCandidate: item.preferredCandidate,
      });

      assert.equal(context.selectionMethod, 'retrieval', item.name);
      assert.ok(
        context.evidenceChips.some((chip) => chip.sourceId === item.expectedSourceId),
        item.name,
      );
      assert.equal(context.evidenceChips.every((chip) => chip.sourceKindLabel === 'retrieved'), true, item.name);
    }
  } finally {
    await clearRoomMemoryData();
  }
});
