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

test('buildBusinessLoopSummary calculates v1.5 reentry and evidence metrics', () => {
  const summary = buildBusinessLoopSummary([
    normalizeAnalyticsEvent('task_opened', { task_id: 'task-1' }, 1000),
    normalizeAnalyticsEvent('step_draft_shown', { task_id: 'task-1', step_id: 'step-1' }, 1200),
    normalizeAnalyticsEvent('step_evidence_clicked', { task_id: 'task-1', step_id: 'step-1' }, 1500),
    normalizeAnalyticsEvent('reentry_brief_shown', { task_id: 'task-1' }, 2000),
    normalizeAnalyticsEvent('step_confirmed', { task_id: 'task-1', step_id: 'step-1' }, 4000),
    normalizeAnalyticsEvent('task_opened', { task_id: 'task-2' }, 10000),
    normalizeAnalyticsEvent('step_draft_shown', { task_id: 'task-2', step_id: 'step-2' }, 11000),
    normalizeAnalyticsEvent('step_not_like_this', { task_id: 'task-2', step_id: 'step-2' }, 12000),
    normalizeAnalyticsEvent('destructive_step_warning_shown', { task_id: 'task-2', step_id: 'step-2' }, 13000),
  ]);

  assert.equal(summary.timeToFirstConfirmedActionMs.median, 3000);
  assert.equal(summary.reentryToConfirmedActionRate5m, 100);
  assert.equal(summary.notLikeThisRate, 50);
  assert.equal(summary.evidenceClickRate, 50);
  assert.equal(summary.draftToConfirmConversionRate, 50);
  assert.equal(summary.destructiveWarningHitRate, 0);
});

test('buildBusinessLoopSummary calculates OCR ingest metrics', () => {
  const summary = buildBusinessLoopSummary([
    normalizeAnalyticsEvent('ocr_extract_finished', {
      file_name: 'mind-demo-ready.pdf',
      file_kind: 'pdf',
      file_status: 'ready',
      ocr_engine: 'text-layer',
    }, 1000),
    normalizeAnalyticsEvent('ocr_extract_finished', {
      file_name: 'mind-demo-garbled.pdf',
      file_kind: 'pdf',
      file_status: 'failed',
      failure_reason: 'pdf_text_garbled_after_ocr',
      ocr_engine: 'tesseract',
      fragmented_run_count: 3,
    }, 2000),
    normalizeAnalyticsEvent('ocr_extract_finished', {
      file_name: 'client-scan.pdf',
      file_kind: 'pdf',
      file_status: 'failed',
      failure_reason: 'pdf_ocr_failed',
      ocr_engine: 'tesseract',
    }, 3000),
    normalizeAnalyticsEvent('room_file_retry_finished', {
      fileName: 'client-scan.pdf',
      status: 'ready',
    }, 4000),
  ]);

  assert.equal(summary.ocrFailureRate, 66.66666666666666);
  assert.equal(summary.ocrGarbledRate, 33.33333333333333);
  assert.equal(summary.demoPdfReadyRate, 50);
  assert.equal(summary.ocrRetrySuccessRate, 100);
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

test('normalizeAnalyticsEvent preserves make_smaller refinement outcome details', () => {
  const noChange = normalizeAnalyticsEvent('make_smaller_no_change', {
    task_id: 'task-1',
    rescue_reason: 'too_big',
    outcome_label: 'rescue',
  }, 1000);
  const failed = normalizeAnalyticsEvent('make_smaller_failed', {
    task_id: 'task-2',
    outcome_label: 'retry',
  }, 2000);

  assert.equal(noChange.eventName, 'make_smaller_no_change');
  assert.equal(noChange.rescueReason, 'too_big');
  assert.equal(noChange.outcomeLabel, 'rescue');
  assert.equal(failed.eventName, 'make_smaller_failed');
  assert.equal(failed.outcomeLabel, 'retry');
});
