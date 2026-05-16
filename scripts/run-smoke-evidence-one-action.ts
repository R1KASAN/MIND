import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { openSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { AiActionResponseSchema, type AiIntakeResponse } from '../src/lib/ai/operations';
import {
  buildBusinessLoopSummary,
  normalizeAnalyticsEvent,
} from '../src/lib/analytics/local-analytics';
import {
  buildActionEvidenceContext,
  type ActionEvidenceContext,
} from '../src/lib/orchestrator/evidence-context';
import { buildActionSuccessArtifacts } from '../src/lib/orchestrator/task-machine';
import type { RoomSourceFile } from '../src/lib/room';
import type { TaskContext } from '../src/lib/store/idb';

const BUILD_FIRST_MESSAGE =
  'Build the app first with npm run build, then rerun npm run smoke:evidence-one-action.';
const CANONICAL_FIXTURE = 'stale_reentry';
const TASK_ID = 'task-smoke-stale-reentry';
const ROOM_ID = 'room-smoke-stale-reentry';
const EXPECTED_RETRIEVED_SOURCE_ID = 'file:stale-handoff';
const DEFAULT_PORT = Number(process.env.MIND_SMOKE_EVIDENCE_PORT || 3205) || 3205;
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11437';
const TARGET_MODEL = process.env.AI_MODEL || 'gemma2:2b';

type SmokeSummary = {
  smoke: 'evidence-one-action';
  canonicalFixture: typeof CANONICAL_FIXTURE;
  passed: boolean;
  failureReason: string | null;
  selectionMethod: ActionEvidenceContext['selectionMethod'] | null;
  retrievedSourceIds: string[];
  expectedRetrievedSourceId: typeof EXPECTED_RETRIEVED_SOURCE_ID;
  provenanceSourceIds: string[];
  schemaValid: boolean;
  retrievalEnabled: boolean;
  fallbackCountedAsRetrieval: boolean;
};

function createInitialSummary(): SmokeSummary {
  return {
    smoke: 'evidence-one-action',
    canonicalFixture: CANONICAL_FIXTURE,
    passed: false,
    failureReason: null,
    selectionMethod: null,
    retrievedSourceIds: [],
    expectedRetrievedSourceId: EXPECTED_RETRIEVED_SOURCE_ID,
    provenanceSourceIds: [],
    schemaValid: false,
    retrievalEnabled: false,
    fallbackCountedAsRetrieval: false,
  };
}

async function ensureBuiltApp() {
  try {
    await access('.next/BUILD_ID');
  } catch {
    throw new Error(BUILD_FIRST_MESSAGE);
  }
}

async function waitForServer(baseUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/ai/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the built app is ready.
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for app server at ${baseUrl}`);
}

async function stopServer(process: ChildProcess | null) {
  if (!process || process.exitCode !== null) return;

  process.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (process.exitCode === null && Date.now() < deadline) {
    await delay(100);
  }

  if (process.exitCode === null) {
    process.kill('SIGKILL');
  }
}

function startServer(port: number) {
  const serverLogPath = process.env.MIND_SMOKE_EVIDENCE_SERVER_LOG_PATH;
  const serverLogFd = serverLogPath ? openSync(serverLogPath, 'a') : null;

  return spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OLLAMA_HOST: OLLAMA_BASE_URL,
      AI_MODEL: TARGET_MODEL,
      AI_FALLBACK_MODELS: TARGET_MODEL,
      AI_TIMEOUT_QWEN_MS: process.env.AI_TIMEOUT_QWEN_MS || '120000',
      AI_TIMEOUT_ACTION_QWEN_MS: process.env.AI_TIMEOUT_ACTION_QWEN_MS || '120000',
      AI_REPAIR_TIMEOUT_QWEN_MS: process.env.AI_REPAIR_TIMEOUT_QWEN_MS || '60000',
      AI_REPAIR_TIMEOUT_ACTION_QWEN_MS: process.env.AI_REPAIR_TIMEOUT_ACTION_QWEN_MS || '60000',
      AI_TIMEOUT_FALLBACK_MS: process.env.AI_TIMEOUT_FALLBACK_MS || '60000',
      AI_TIMEOUT_ACTION_FALLBACK_MS: process.env.AI_TIMEOUT_ACTION_FALLBACK_MS || '60000',
      AI_OVERALL_TIMEOUT_MS: process.env.AI_OVERALL_TIMEOUT_MS || '180000',
    },
    stdio: ['ignore', serverLogFd ?? 'inherit', serverLogFd ?? 'inherit'],
  });
}

function makeReadyFile(): RoomSourceFile {
  return {
    id: 'stale-handoff',
    name: 'stale-handoff.md',
    kind: 'text',
    mimeType: 'text/markdown',
    size: 150,
    status: 'ready',
    createdAt: 1,
    extractedText:
      'Last unfinished item was the pricing table. Next action is update estimate and send client follow-up.',
  };
}

function buildStaleReentryFixture() {
  const sourceFile = makeReadyFile();
  const taskFrame = {
    objective: 'กลับมาเริ่ม proposal ต่อจากจุดค้าง',
    stage: 'reentry',
    stakeholders: ['client'],
  };
  const taskShape = {
    deliverableType: 'proposal' as const,
    immediateNeed: 'resume_execution' as const,
    missingInputs: [],
    workContext: 'ต้องรู้จุดค้างล่าสุดก่อนเริ่มใหม่',
    confidence: 0.9,
  };
  const task: TaskContext = {
    id: TASK_ID,
    roomId: ROOM_ID,
    workflowType: 'client_resume',
    sourceText: 'กลับมางาน proposal เดิมหลังหายไปหลายวัน ต้องรู้จุดค้างล่าสุดก่อนเริ่มใหม่',
    sourceFiles: [sourceFile],
    extractedText: sourceFile.extractedText ?? '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: ['stale_context'],
    lifecycleState: 'has_one_action',
    currentStepIndex: 0,
    currentActionId: 'action-smoke-stale-reentry',
    rescueHistory: [],
    taskFrame,
    taskShape,
    currentPlan: {
      actionTitle: 'Resume from the stale handoff and update estimate',
      successSignal: 'เห็นจุดค้างและรู้ next move ที่ส่งผลกับลูกค้า',
      steps: [
        {
          id: 'step-1',
          text: 'อ่าน stale handoff เพื่อดูจุดค้างล่าสุด',
        },
      ],
    },
  };
  const preferredCandidate: AiIntakeResponse['candidateActions'][number] = {
    title: 'Resume from the stale handoff and update estimate',
    rationale: 'The handoff identifies the unfinished pricing table.',
    kind: 'resume_first',
  };
  const intake: AiIntakeResponse = {
    workflowType: 'client_resume',
    taskShape,
    roomDigest: 'งาน proposal ค้างที่ pricing table และต้องส่ง client follow-up',
    taskFrame,
    blockers: task.blockerSignals,
    requiresClarification: false,
    clarificationQuestion: undefined,
    candidateActions: [preferredCandidate],
    meta: {
      model: TARGET_MODEL,
      usedRoomFiles: [],
      repairUsed: false,
    },
  };

  return { task, preferredCandidate, intake };
}

async function postJson(baseUrl: string, route: string, body: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

function assertAnalyticsTruthCondition(summary: SmokeSummary) {
  const events = [
    normalizeAnalyticsEvent('step_confirmed', {
      task_id: TASK_ID,
      step_id: 'step-1',
      retrieval_enabled: summary.retrievalEnabled,
      retrieval_selection_method: 'retrieval',
      retrieved_source_count: summary.retrievedSourceIds.length,
    }, 1000),
    normalizeAnalyticsEvent('step_confirmed', {
      task_id: 'task-smoke-fallback',
      step_id: 'step-fallback',
      retrieval_enabled: false,
      retrieval_selection_method: 'none',
      retrieved_source_count: 0,
    }, 2000),
  ];
  const businessSummary = buildBusinessLoopSummary(events);
  summary.fallbackCountedAsRetrieval = businessSummary.evidenceBackedActionRate !== 50;

  assert.equal(summary.retrievalEnabled, true, 'retrieval_enabled was not true for real retrieved evidence');
  assert.equal(
    summary.fallbackCountedAsRetrieval,
    false,
    'fallback-backed action was counted as retrieval-backed',
  );
}

async function runSmoke(summary: SmokeSummary, baseUrl: string) {
  const { task, preferredCandidate, intake } = buildStaleReentryFixture();
  const evidenceContext = await buildActionEvidenceContext({ task, preferredCandidate });

  summary.selectionMethod = evidenceContext.selectionMethod;
  summary.retrievedSourceIds = evidenceContext.evidenceChips.map((chip) => chip.sourceId);
  summary.retrievalEnabled = evidenceContext.selectionMethod === 'retrieval' && evidenceContext.evidenceChips.length > 0;

  assert.equal(evidenceContext.selectionMethod, 'retrieval', 'stale_reentry returned only fallback evidence');
  assert.ok(evidenceContext.evidenceChips.length > 0, 'stale_reentry did not return evidence chips');
  assert.ok(
    summary.retrievedSourceIds.includes(EXPECTED_RETRIEVED_SOURCE_ID),
    `retrieved sourceIds did not include ${EXPECTED_RETRIEVED_SOURCE_ID}`,
  );

  const { response, json } = await postJson(baseUrl, '/api/ai/action', {
    task,
    preferredCandidate,
    evidenceContext,
  });
  assert.equal(response.status, 200, `action returned HTTP ${response.status}: ${JSON.stringify(json)}`);

  const parsed = AiActionResponseSchema.safeParse(json);
  summary.schemaValid = parsed.success;
  assert.equal(parsed.success, true, `action response failed schema validation: ${JSON.stringify(json)}`);

  const artifacts = buildActionSuccessArtifacts({
    task,
    intake,
    actionResponse: parsed.data,
    evidenceContext,
  });
  const firstStep = artifacts.nextTask.currentPlan?.steps[0];
  summary.provenanceSourceIds = firstStep?.provenance?.sourceIds ?? [];

  assert.ok(firstStep?.evidence?.length, 'retrieved evidence is missing from the first plan step');
  assert.ok(
    summary.provenanceSourceIds.includes(EXPECTED_RETRIEVED_SOURCE_ID),
    `provenance sourceIds did not include ${EXPECTED_RETRIEVED_SOURCE_ID}`,
  );

  assertAnalyticsTruthCondition(summary);
}

async function main() {
  const summary = createInitialSummary();
  const baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  let server: ChildProcess | null = null;

  try {
    await ensureBuiltApp();
    server = startServer(DEFAULT_PORT);
    await waitForServer(baseUrl);
    await runSmoke(summary, baseUrl);
    summary.passed = true;
  } catch (error) {
    summary.failureReason = error instanceof Error ? error.message : String(error);
  } finally {
    await stopServer(server);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const summary = createInitialSummary();
  summary.failureReason = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
});
