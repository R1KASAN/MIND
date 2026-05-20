import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { openSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { AiActionResponseSchema, AiIntakeResponseSchema } from '../src/lib/ai/operations';
import { composeRoomSourceText, type RoomSourceFile } from '../src/lib/room';
import type { TaskContext } from '../src/lib/store/idb';
import { buildActionEvidenceContext } from '../src/lib/orchestrator/evidence-context';

const BUILD_FIRST_MESSAGE =
  'Build the app first with npm run build, then rerun npm run smoke:fallback-e2e.';
const TASK_ID = 'task-smoke-fallback-e2e';
const ROOM_ID = 'room-smoke-fallback-e2e';
const DEFAULT_PORT = Number(process.env.MIND_SMOKE_EVIDENCE_PORT || 3207) || 3207;
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11437';
const TARGET_MODEL = process.env.AI_MODEL || 'gemma2:2b';

type SmokeSummary = {
  smoke: 'fallback-e2e';
  passed: boolean;
  failureReason: string | null;
  intakeSuccess: boolean;
  actionSuccess: boolean;
  retrievedSourceIds: string[];
};

function createInitialSummary(): SmokeSummary {
  return {
    smoke: 'fallback-e2e',
    passed: false,
    failureReason: null,
    intakeSuccess: false,
    actionSuccess: false,
    retrievedSourceIds: [],
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
    },
    stdio: ['ignore', serverLogFd ?? 'inherit', serverLogFd ?? 'inherit'],
  });
}

function makeFailedPdf(): RoomSourceFile {
  return {
    id: 'file-failed-pdf',
    name: 'scan.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 8000,
    status: 'unreadable',
    extractedText: '',
    failureReason: 'pdf_text_garbled_after_ocr',
    createdAt: 1000,
  };
}

function makeReadyTxt(): RoomSourceFile {
  return {
    id: 'file-ready-txt',
    name: 'notes.txt',
    kind: 'text',
    mimeType: 'text/plain',
    size: 400,
    status: 'ready',
    extractedText: 'Project requirements: build a login page and a dashboard. Use modern UI.',
    createdAt: 1001,
  };
}

function buildFallbackFixture() {
  const failedPdf = makeFailedPdf();
  const readyTxt = makeReadyTxt();
  
  const task: TaskContext = {
    id: TASK_ID,
    roomId: ROOM_ID,
    workflowType: 'client_resume',
    taskFrame: {
      objective: 'build a login page and a dashboard',
      stage: 'discovery',
      stakeholders: [],
    },
    sourceText: composeRoomSourceText('', readyTxt.extractedText ?? '', [failedPdf, readyTxt]),
    sourceFiles: [failedPdf, readyTxt],
    extractedText: readyTxt.extractedText ?? '',
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'dumped',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
  };

  return { task };
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

async function runSmoke(summary: SmokeSummary, baseUrl: string) {
  const { task } = buildFallbackFixture();

  // 1. Test Intake
  const intakeReqTask = {
    sourceText: task.sourceText,
    extractedText: task.extractedText,
    sourceFiles: task.sourceFiles,
  };
  const { response: intakeRes, json: intakeJson } = await postJson(baseUrl, '/api/ai/intake', {
    task: intakeReqTask,
  });
  
  assert.equal(intakeRes.status, 200, `intake returned HTTP ${intakeRes.status}: ${JSON.stringify(intakeJson)}`);
  
  const intakeParsed = AiIntakeResponseSchema.safeParse(intakeJson);
  assert.equal(intakeParsed.success, true, `intake response failed schema validation`);
  
  summary.intakeSuccess = true;
  const intakeData = intakeParsed.success ? intakeParsed.data : null;
  assert.ok(intakeData, 'intake data is missing');
  assert.ok(intakeData.candidateActions.length > 0, 'intake returned no candidate actions');
  
  // 2. Test Action (with first candidate)
  const preferredCandidate = intakeData.candidateActions[0];
  const evidenceContext = await buildActionEvidenceContext({ task, preferredCandidate });
  
  summary.retrievedSourceIds = evidenceContext.evidenceChips.map(c => c.sourceId);
  // The ready txt file must be retrieved/used.
  assert.ok(
    summary.retrievedSourceIds.includes('file:file-ready-txt'),
    `retrieved sourceIds did not include the ready txt file: ${JSON.stringify(summary.retrievedSourceIds)}. Candidate: ${JSON.stringify(preferredCandidate)}`
  );
  // The failed PDF must NOT be in evidence.
  assert.ok(
    !summary.retrievedSourceIds.includes('file:file-failed-pdf'),
    'failed PDF should not be in retrieved sourceIds'
  );

  const { response: actionRes, json: actionJson } = await postJson(baseUrl, '/api/ai/action', {
    task,
    preferredCandidate,
    evidenceContext,
  });
  
  assert.equal(actionRes.status, 200, `action returned HTTP ${actionRes.status}: ${JSON.stringify(actionJson)}`);
  
  const actionParsed = AiActionResponseSchema.safeParse(actionJson);
  assert.equal(actionParsed.success, true, `action response failed schema validation: ${JSON.stringify(actionJson)}`);
  
  summary.actionSuccess = true;
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
