import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBusinessLoopSummary,
  buildBusinessLoopSummaryByRoom,
  buildRoadmapGateEvaluations,
  normalizeAnalyticsEvent,
} from './local-analytics';

test('buildBusinessLoopSummary calculates loop medians and commercial signals', () => {
  const events = [
    normalizeAnalyticsEvent('task_opened', {
      task_id: 'task-1',
      session_id: 'session-1',
      ui_route: 'DUMP_ENTRY',
      scenario_id: 'client_project_restart',
      icp_tag: 'consultant_boutique_agency_lead',
      source_context_count: 6,
    }, 1000),
    normalizeAnalyticsEvent('first_action_selected', {
      task_id: 'task-1',
      session_id: 'session-1',
      latency_ms: 3000,
    }, 4000),
    normalizeAnalyticsEvent('reentry_started', {
      task_id: 'task-1',
      session_id: 'session-1',
      reentry_gap_days: 3,
    }, 10000),
    normalizeAnalyticsEvent('reentry_understood', {
      task_id: 'task-1',
      session_id: 'session-1',
      latency_ms: 6000,
      reentry_gap_days: 3,
    }, 16000),
    normalizeAnalyticsEvent('rescue_triggered', {
      task_id: 'task-1',
      session_id: 'session-1',
      rescue_reason: 'unclear_scope',
    }, 17000),
    normalizeAnalyticsEvent('rescue_resolved', {
      task_id: 'task-1',
      session_id: 'session-1',
      rescue_reason: 'unclear_scope',
    }, 21000),
    normalizeAnalyticsEvent('task_completed', {
      task_id: 'task-1',
      session_id: 'session-1',
    }, 25000),
    normalizeAnalyticsEvent('task_opened', {
      task_id: 'task-2',
      session_id: 'session-2',
      ui_route: 'BOUNCE_BACK',
      scenario_id: 'client_project_restart',
      icp_tag: 'consultant_boutique_agency_lead',
      source_context_count: 4,
    }, 30000),
    normalizeAnalyticsEvent('first_action_selected', {
      task_id: 'task-2',
      session_id: 'session-2',
      latency_ms: 2000,
    }, 32000),
  ];

  const summary = buildBusinessLoopSummary(events);

  assert.equal(summary.totalEvents, 9);
  assert.equal(summary.uniqueTaskCount, 2);
  assert.equal(summary.timeToNextMoveMs.count, 2);
  assert.equal(summary.timeToNextMoveMs.median, 2000);
  assert.equal(summary.reentryTimeMs.median, 6000);
  assert.equal(summary.sourceContextCount.median, 4);
  assert.equal(summary.rescueSuccessRate, 100);
  assert.equal(summary.completionAfterInterruptionRate, 100);
  assert.equal(summary.repeatUsageRate, 0);
  assert.equal(summary.conversionRate, 50);
});

test('buildRoadmapGateEvaluations compares live metrics to baseline', () => {
  const summary = buildBusinessLoopSummary([
    normalizeAnalyticsEvent('task_opened', { task_id: 'task-1', source_context_count: 4 }, 1000),
    normalizeAnalyticsEvent('first_action_selected', { task_id: 'task-1', latency_ms: 2500 }, 3500),
    normalizeAnalyticsEvent('reentry_started', { task_id: 'task-1' }, 10000),
    normalizeAnalyticsEvent('reentry_understood', { task_id: 'task-1', latency_ms: 5000 }, 15000),
    normalizeAnalyticsEvent('rescue_triggered', { task_id: 'task-1', rescue_reason: 'too_big' }, 16000),
    normalizeAnalyticsEvent('rescue_resolved', { task_id: 'task-1', rescue_reason: 'too_big' }, 19000),
  ]);

  const gates = buildRoadmapGateEvaluations(summary, {
    baselineTimeToNextMoveMs: 10000,
    baselineReentryTimeMs: 12000,
    baselineSourceContextCount: 8,
    targetTimeToNextMoveImprovementPct: 30,
    targetReentryImprovementPct: 25,
    targetSourceReductionPct: 30,
    targetRescueSuccessRate: 70,
    wtpLow: 9,
    wtpHigh: 29,
    valueCapturePct: 15,
    pilotCommitCount: 1,
    paidPilotCount: 1,
  });

  assert.equal(gates.some((gate) => gate.status === 'pass'), true);
  assert.equal(gates.find((gate) => gate.id === 'time-to-next-move')?.status, 'pass');
  assert.equal(gates.find((gate) => gate.id === 'commercial-proof')?.status, 'pass');
});

test('buildBusinessLoopSummary summarizes value pulse signals', () => {
  const summary = buildBusinessLoopSummary([
    normalizeAnalyticsEvent('value_pulse_shown', { task_id: 'task-1', value_pulse_prompt_id: 'restart' }, 1000),
    normalizeAnalyticsEvent('value_pulse_submitted', {
      task_id: 'task-1',
      value_pulse_prompt_id: 'restart',
      value_pulse_signal: 'time',
      value_pulse_minutes_saved: 12,
      value_pulse_note: 'เริ่มงานได้เร็วขึ้น',
    }, 2000),
    normalizeAnalyticsEvent('value_pulse_dismissed', { task_id: 'task-2', value_pulse_prompt_id: 'reentry' }, 3000),
  ]);

  assert.equal(summary.valuePulseShownCount, 1);
  assert.equal(summary.valuePulseSubmittedCount, 1);
  assert.equal(summary.valuePulseDismissedCount, 1);
  assert.equal(summary.valuePulseCaptureRate, 100);
  assert.equal(summary.valuePulseSignalCounts.time, 1);
  assert.equal(summary.dominantValuePulseSignal, 'time');
  assert.equal(summary.valuePulseMinutesSaved.median, 12);
  assert.equal(summary.valuePulseLatestNotes[0], 'เริ่มงานได้เร็วขึ้น');
});

test('buildBusinessLoopSummaryByRoom groups metrics by room', () => {
  const summaries = buildBusinessLoopSummaryByRoom([
    normalizeAnalyticsEvent('task_opened', {
      room_id: 'room-a',
      room_title: 'ACME',
      room_scenario_type: 'client_project_restart',
      task_id: 'task-a',
    }, 1000),
    normalizeAnalyticsEvent('first_action_selected', {
      room_id: 'room-a',
      room_title: 'ACME',
      task_id: 'task-a',
      latency_ms: 3000,
    }, 4000),
    normalizeAnalyticsEvent('task_opened', {
      room_id: 'room-b',
      room_title: 'Northstar',
      room_scenario_type: 'sales_inquiry_demo_request',
      task_id: 'task-b',
    }, 5000),
    normalizeAnalyticsEvent('first_action_selected', {
      room_id: 'room-b',
      room_title: 'Northstar',
      task_id: 'task-b',
      latency_ms: 1500,
    }, 6500),
  ]);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.roomTitle, 'ACME');
  assert.equal(summaries.find((summary) => summary.roomId === 'room-b')?.timeToNextMoveMs.median, 1500);
});
