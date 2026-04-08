import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAiOpsFailureEntry,
  buildAiOpsSuccessEntry,
  filterAiOpsEntries,
  inferAiOpsFailurePassType,
  summarizeAiOpsEntries,
} from './ai-ops-debug';

test('buildAiOpsSuccessEntry maps meta into a readable debug record', () => {
  const entry = buildAiOpsSuccessEntry('scaffold', {
    model: 'qwen2.5:3b',
    passType: 'repair_pass',
    durationMs: 1234,
    usedRoomFiles: [],
    repairUsed: true,
  });

  assert.equal(entry.operationName, 'scaffold');
  assert.equal(entry.passType, 'repair_pass');
  assert.equal(entry.durationMs, 1234);
  assert.equal(entry.repairUsed, true);
});

test('inferAiOpsFailurePassType prefers timeout and validation detail when present', () => {
  assert.equal(inferAiOpsFailurePassType('request_timeout', undefined), 'timeout');
  assert.equal(inferAiOpsFailurePassType('unknown', { passType: 'validation_failed' }), 'validation_failed');
  assert.equal(inferAiOpsFailurePassType('service_down', undefined), 'endpoint_failed');
});

test('buildAiOpsFailureEntry preserves detail and model context', () => {
  const entry = buildAiOpsFailureEntry({
    operationName: 'reentry',
    reason: 'service_down',
    detail: 'Ollama endpoint could not be reached',
    telemetry: {
      passType: 'endpoint_failed',
      durationMs: 4500,
      repairUsed: false,
      model: 'qwen2.5:3b',
    },
  });

  assert.equal(entry.operationName, 'reentry');
  assert.equal(entry.passType, 'endpoint_failed');
  assert.equal(entry.model, 'qwen2.5:3b');
  assert.equal(entry.detail, 'Ollama endpoint could not be reached');
});

test('filterAiOpsEntries supports pass-type and free-text filtering', () => {
  const entries = [
    buildAiOpsSuccessEntry('scaffold', {
      model: 'qwen2.5:3b',
      passType: 'primary_pass',
      durationMs: 1200,
      usedRoomFiles: [],
      repairUsed: false,
    }),
    buildAiOpsFailureEntry({
      operationName: 'rescue',
      reason: 'service_down',
      detail: 'repair endpoint timed out',
      telemetry: {
        passType: 'timeout',
        durationMs: 4500,
        repairUsed: true,
        model: 'qwen2.5:3b',
      },
    }),
  ];

  const timeoutOnly = filterAiOpsEntries(entries, { passTypes: ['timeout'] });
  const scaffoldQuery = filterAiOpsEntries(entries, { query: 'scaffold' });

  assert.equal(timeoutOnly.length, 1);
  assert.equal(timeoutOnly[0]?.operationName, 'rescue');
  assert.equal(scaffoldQuery.length, 1);
  assert.equal(scaffoldQuery[0]?.operationName, 'scaffold');
});

test('summarizeAiOpsEntries counts pass types for the visible feed', () => {
  const entries = [
    buildAiOpsSuccessEntry('intake', {
      model: 'qwen2.5:3b',
      passType: 'primary_pass',
      durationMs: 900,
      usedRoomFiles: [],
      repairUsed: false,
    }),
    buildAiOpsSuccessEntry('scaffold', {
      model: 'qwen2.5:3b',
      passType: 'repair_pass',
      durationMs: 1500,
      usedRoomFiles: [],
      repairUsed: true,
    }),
    buildAiOpsSuccessEntry('action', {
      model: 'qwen2.5:3b',
      passType: 'primary_pass',
      durationMs: 1100,
      usedRoomFiles: [],
      repairUsed: false,
    }),
  ];

  const summary = summarizeAiOpsEntries(entries);

  assert.equal(summary.primary_pass, 2);
  assert.equal(summary.repair_pass, 1);
});
