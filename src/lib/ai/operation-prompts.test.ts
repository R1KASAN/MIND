import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskContext } from '@/lib/store/idb';
import type { TaskContext, RescueHistoryItem, PendingInput } from '@/lib/store/idb';
import {
  ACTION_SYSTEM_PROMPT,
  RESCUE_SYSTEM_PROMPT,
  buildActionUserPrompt,
  buildReentryUserPrompt,
} from '@/lib/ai/operation-prompts';

function makeTask(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    ...createTaskContext('test source text'),
    ...overrides,
  };
}

function makeRescue(reason: string, mode = 'decompose'): RescueHistoryItem {
  return { reason: reason as RescueHistoryItem['reason'], mode: mode as RescueHistoryItem['mode'], createdAt: Date.now() };
}

function makePending(kind: PendingInput['kind'], answer: string, prompt?: string): PendingInput {
  return { kind, answer, prompt, createdAt: Date.now() };
}

// ---

test('ONE_ACTION prompt: enough context biases toward concrete 15-30 minute action', () => {
  const task = makeTask({
    workflowType: 'client_resume',
    pendingInputs: [],
    taskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: [],
      workContext: 'client proposal scope',
      confidence: 0.82,
    },
    constraints: {
      timeBudgetMin: 10,
      energyLevel: 'medium',
    },
  });

  const prompt = buildActionUserPrompt(task, null, null, {
    summaryText: '[source-1] Client brief: งบประมาณรอบแรกคือ 120k และต้องการ scope หน้า landing',
    evidenceChips: [],
    selectionMethod: 'retrieval',
  });

  assert.ok(ACTION_SYSTEM_PROMPT.includes('15-30 นาที'), 'system prompt must set the concrete time horizon');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('"เตรียม..."'), 'system prompt must ban vague meta openers');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('"วางแผน..."'), 'system prompt must ban planning-only openers');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('"ทบทวน..."'), 'system prompt must ban review-only openers');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('ห้ามเป็น object, array'), 'system prompt must keep semantic text fields out of structured fragments');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('situationSummary สะท้อนคำสำคัญจาก input'), 'action prompt must mirror user wording before advising');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('ห้ามให้คำแนะนำ productivity generic'), 'action prompt must reject generic productivity advice');
  assert.ok(prompt.includes('actionDecision:'), 'user prompt must include actionDecision block');
  assert.ok(prompt.includes('actionMode: propose'), 'enough context should use propose mode');
  assert.ok(prompt.includes('behaviorIntent: client_delivery'), 'prompt should expose behavior intent for tone selection');
  assert.ok(prompt.includes('modeInstruction: propose one concrete 15-30 minute next action'), 'propose mode should demand a concrete 15-30 minute action');
  assert.ok(prompt.includes('Retrieved evidence:'), 'evidence block must remain present');
});

test('operation prompts include support-mode guardrails for personal friction', () => {
  assert.ok(ACTION_SYSTEM_PROMPT.includes('behaviorIntent = personal_friction'), 'action prompt should recognize personal friction as its own mode');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('behaviorIntent = admin_task'), 'action prompt should route admin tasks away from client delivery tone');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('behaviorIntent = client_delivery'), 'action prompt should preserve real client delivery context');
  assert.ok(ACTION_SYSTEM_PROMPT.includes('ห้ามแต่งบริบทลูกค้าหรือไฟล์ขึ้นมาเอง'), 'action prompt must not invent client/file context');
  assert.ok(RESCUE_SYSTEM_PROMPT.includes('mirror คำสำคัญจากบริบทผู้ใช้'), 'rescue prompt should mirror user wording before diagnosis');
  assert.ok(RESCUE_SYSTEM_PROMPT.includes('low_energy หรือ shrink/pause_cleanly'), 'rescue prompt should route personal friction gently');
});

test('ONE_ACTION prompt: two unanswered pendingInputs biases toward one focused question', () => {
  const task = makeTask({
    pendingInputs: [
      makePending('clarification', '', 'What budget should this assume?'),
      makePending('manual_rescue', '   ', 'Which stakeholder approves this?'),
    ],
    taskShape: {
      deliverableType: 'proposal',
      immediateNeed: 'define_scope',
      missingInputs: ['budget', 'approver'],
      workContext: 'client proposal scope',
      confidence: 0.72,
    },
  });

  const prompt = buildActionUserPrompt(task);

  assert.ok(prompt.includes('actionMode: ask'), 'multiple unanswered pending inputs should ask first');
  assert.ok(prompt.includes('unansweredPendingInputs: 2'), 'prompt should expose unanswered count');
  assert.ok(prompt.includes('ask exactly one focused clarifying question'), 'ask mode must request one focused question');
  assert.ok(prompt.includes('reason=unansweredPendingInputs=2'), 'ask reason should name pending input count');
});

test('ONE_ACTION prompt: low taskShape confidence biases toward ask-first behavior', () => {
  const task = makeTask({
    pendingInputs: [],
    taskShape: {
      deliverableType: 'unknown',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'unclear client context',
      confidence: 0.32,
    },
  });

  const prompt = buildActionUserPrompt(task);

  assert.ok(prompt.includes('actionMode: ask'), 'low taskShape confidence should ask first');
  assert.ok(prompt.includes('taskShapeConfidence: 0.32'), 'prompt should expose low confidence');
  assert.ok(prompt.includes('reason=taskShapeConfidence=0.32'), 'ask reason should name low confidence');
});

test('ONE_ACTION prompt: does not inject notThisCount when unavailable in TaskContext', () => {
  const task = makeTask({
    pendingInputs: [],
    taskShape: {
      deliverableType: 'execution',
      immediateNeed: 'resume_execution',
      missingInputs: [],
      workContext: 'resume existing task',
      confidence: 0.8,
    },
  });

  const prompt = buildActionUserPrompt(task);

  assert.ok(!prompt.includes('notThisCount'), 'notThisCount is not part of TaskContext/buildActionUserPrompt context');
});

test('reentryConstraints: includes activeBlockers and lastRescue when both present', () => {
  const task = makeTask({
    blockerSignals: ['unclear_scope', 'too_big'],
    rescueHistory: [makeRescue('too_big', 'decompose')],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  assert.ok(prompt.includes('activeBlockers: unclear_scope, too_big'), 'should list active blockers');
  assert.ok(prompt.includes('lastRescueReason: too_big'), 'should include last rescue reason');
  assert.ok(prompt.includes('mode: decompose'), 'should include rescue mode');
});

test('reentryConstraints: filters out waiting/dependency blockers from activeBlockers line', () => {
  const task = makeTask({
    blockerSignals: ['waiting_client', 'dependency_on_design', 'unclear_scope'],
    rescueHistory: [],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  // Extract only the reentryConstraints block (between its header and the next blank line)
  const blockStart = prompt.indexOf('reentryConstraints:\n') + 'reentryConstraints:\n'.length;
  const blockEnd = prompt.indexOf('\n\ncurrentAction:');
  const constraintBlock = prompt.slice(blockStart, blockEnd);

  assert.ok(!constraintBlock.includes('waiting_client'), 'waiting_client must not appear in activeBlockers');
  assert.ok(!constraintBlock.includes('dependency_on_design'), 'dependency blocker must not appear in activeBlockers');
  assert.ok(constraintBlock.includes('unclear_scope'), 'non-waiting blocker must appear in activeBlockers');
});

test('reentryConstraints: separates unresolved and resolved pendingInputs', () => {
  const task = makeTask({
    blockerSignals: [],
    rescueHistory: [],
    pendingInputs: [
      makePending('clarification', '', 'What is the deadline?'),
      makePending('clarification', 'End of month', 'Who is the main contact?'),
      makePending('manual_rescue', '', undefined),
    ],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  assert.ok(prompt.includes('unresolvedQuestions:'), 'unresolvedQuestions section must exist');
  assert.ok(prompt.includes('What is the deadline?'), 'unanswered question prompt should appear');
  assert.ok(prompt.includes('manual_rescue'), 'unanswered manual_rescue kind should appear');
  assert.ok(prompt.includes('resolvedConcerns:'), 'resolvedConcerns section must exist');
  assert.ok(prompt.includes('clarification'), 'resolved clarification kind should appear');
  assert.ok(prompt.includes('do not resurface these'), 'resolved guard instruction must be present');
});

test('reentryConstraints: returns ไม่มี when all relevant fields are empty', () => {
  const task = makeTask({
    blockerSignals: [],
    rescueHistory: [],
    pendingInputs: [],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  // The block header must still be present
  assert.ok(prompt.includes('reentryConstraints:'), 'block header must always appear');
  // Value must be the fallback
  const afterHeader = prompt.split('reentryConstraints:\n')[1] ?? '';
  assert.ok(afterHeader.startsWith('ไม่มี'), 'empty task should yield ไม่มี');
});

test('reentryConstraints: appears between task context and currentAction', () => {
  const task = makeTask({
    blockerSignals: ['unclear_scope'],
    rescueHistory: [],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  const constraintsPos = prompt.indexOf('reentryConstraints:');
  const currentActionPos = prompt.indexOf('currentAction:');
  const roomMemoryPos = prompt.indexOf('roomMemoryContext:');

  assert.ok(constraintsPos !== -1, 'reentryConstraints must be present');
  assert.ok(currentActionPos !== -1, 'currentAction must be present');
  assert.ok(roomMemoryPos !== -1, 'roomMemoryContext must be present');
  assert.ok(constraintsPos < currentActionPos, 'reentryConstraints must precede currentAction');
  assert.ok(currentActionPos < roomMemoryPos, 'currentAction must precede roomMemoryContext');
});

test('reentryConstraints: waiting_only blockers produce ไม่มี for activeBlockers section', () => {
  const task = makeTask({
    blockerSignals: ['waiting_on_client', 'dependency'],
    rescueHistory: [],
    pendingInputs: [],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  assert.ok(!prompt.includes('activeBlockers:'), 'no activeBlockers line when all are filtered');
  assert.ok(prompt.includes('reentryConstraints:'), 'block header still present');
});

test('reentryConstraints: uses last rescue only (not all history)', () => {
  const task = makeTask({
    blockerSignals: [],
    rescueHistory: [
      makeRescue('too_big', 'decompose'),
      makeRescue('low_energy', 'simplify'),
    ],
  });

  const prompt = buildReentryUserPrompt(task, null, 'bounce_back');

  assert.ok(prompt.includes('low_energy'), 'last rescue reason must appear');
  assert.ok(prompt.includes('simplify'), 'last rescue mode must appear');
  // first rescue should not create a second lastRescueReason line
  const count = (prompt.match(/lastRescueReason:/g) ?? []).length;
  assert.equal(count, 1, 'only one lastRescueReason line');
});
