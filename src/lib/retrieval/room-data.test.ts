import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskContext } from '@/lib/store/idb';
import {
  answerRoomReviewQuestion,
  buildPreDeleteWarning,
  buildRoomDataSources,
  searchRoomDataSources,
  shouldUseRicherRoomRetrieval,
} from '@/lib/retrieval/room-data';

function makeTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    id: 'task-1',
    roomId: 'room-1',
    sourceText: 'Client email says phase 2 needs budget approval and contract cleanup.',
    sourceFiles: [
      {
        id: 'brief',
        name: 'Brief.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'ready',
        createdAt: 1000,
        extractedText: 'Phase 2 timeline depends on payment confirmation.',
        storageKey: 'blob-brief',
      },
      {
        id: 'scan',
        name: 'Scan.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 2048,
        status: 'failed',
        createdAt: 2000,
        failureReason: 'pdf_ocr_failed',
      },
    ],
    extractedText: 'Phase 2 timeline depends on payment confirmation.',
    createdAt: 1000,
    pendingInputs: [
      {
        kind: 'clarification',
        prompt: 'What is blocking this?',
        answer: 'Waiting for client to confirm deadline.',
        createdAt: 3000,
      },
    ],
    blockerSignals: [],
    lifecycleState: 'has_one_action',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
    currentPlan: {
      actionTitle: 'Confirm phase 2 budget',
      steps: [
        {
          id: 'step-1',
          text: 'Ask client to confirm phase 2 budget',
          evidence: [{ sourceId: 'file:brief', label: 'Brief.pdf' }],
          provenance: {
            generatedAt: 5000,
            generatedBy: 'action',
            sourceIds: ['file:brief'],
          },
        },
      ],
    },
    ...overrides,
  };
}

test('buildRoomDataSources creates searchable manual, file, and pending sources', () => {
  const sources = buildRoomDataSources(makeTask(), 1000 * 60 * 60 * 24 * 100);

  assert.equal(sources.length, 4);
  assert.ok(sources.some((source) => source.id === 'manual:task-1'));
  assert.ok(sources.some((source) => source.id === 'file:brief' && source.usedInPlanCount === 1));
  assert.ok(sources.some((source) => source.id === 'pending:clarification:0'));
  assert.ok(sources.some((source) => source.sensitiveFlags.includes('payment')));
});

test('searchRoomDataSources filters by query, type, status, and sensitive flags', () => {
  const task = makeTask();
  const sources = buildRoomDataSources(task);

  const budgetResults = searchRoomDataSources({
    sources,
    roomId: 'room-1',
    query: 'budget',
    type: 'all',
    status: 'ready',
  });
  assert.ok(budgetResults.some((source) => source.id === 'manual:task-1'));
  assert.ok(budgetResults.every((source) => source.status === 'ready'));

  const failedFiles = searchRoomDataSources({
    sources,
    roomId: 'room-1',
    query: '',
    type: 'file',
    status: 'failed',
  });
  assert.deepEqual(failedFiles.map((source) => source.id), ['file:scan']);

  const sensitive = searchRoomDataSources({
    sources,
    roomId: 'room-1',
    query: '',
    sensitiveOnly: true,
  });
  assert.ok(sensitive.length >= 2);
});

test('answerRoomReviewQuestion returns evidence-backed deterministic review answer', () => {
  const task = makeTask();
  const sources = buildRoomDataSources(task);
  const answer = answerRoomReviewQuestion('what did we agree on for phase 2 budget?', sources, 'room-1');

  assert.match(answer.answer, /phase 2|Brief|Manual/i);
  assert.ok(answer.sources.length > 0);
});

test('buildPreDeleteWarning warns on sensitive or previously used sources', () => {
  const task = makeTask();
  const sources = buildRoomDataSources(task);
  const warning = buildPreDeleteWarning(sources.filter((source) => source.id === 'file:brief'));

  assert.equal(warning?.level, 'high');
  assert.equal(warning?.usedCount, 1);
  assert.equal(warning?.sensitiveCount, 1);
});

test('shouldUseRicherRoomRetrieval enables richer retrieval for complex rooms', () => {
  const manyFiles = Array.from({ length: 31 }, (_, index) => ({
    id: `file-${index}`,
    name: `File ${index}.txt`,
    kind: 'text' as const,
    mimeType: 'text/plain',
    size: 10,
    status: 'ready' as const,
    createdAt: 1000 + index,
    extractedText: `source ${index}`,
  }));
  const task = makeTask({ sourceFiles: manyFiles });
  const sources = buildRoomDataSources(task);

  assert.equal(shouldUseRicherRoomRetrieval(task, sources), true);
});
