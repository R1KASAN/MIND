/**
 * smoke:fallback-matrix
 *
 * Phase 3 — QA Smoke Matrix
 * Tests 7 Room fallback scenarios at the unit level (no server required).
 * Uses buildStudioSnapshot for contextStatus/fileIssues/readyFiles,
 * and buildActionEvidenceContext (+fake-indexeddb) for retrieval assertions.
 *
 * Run: npm run smoke:fallback-matrix
 */

import 'fake-indexeddb/auto';

import { composeRoomSourceText, type RoomSourceFile } from '../src/lib/room';
import type { TaskContext } from '../src/lib/store/idb';
import { buildStudioSnapshot } from '../src/lib/orchestrator/studio';
import { buildActionEvidenceContext } from '../src/lib/orchestrator/evidence-context';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeReadyTxt(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
  return {
    id: 'file-ready-txt',
    name: 'notes.txt',
    kind: 'text',
    mimeType: 'text/plain',
    size: 400,
    status: 'ready',
    extractedText: 'Project requirements: build a login page and a dashboard. Use modern UI.',
    createdAt: 1001,
    ...overrides,
  };
}

function makeReadyMd(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
  return {
    id: 'file-ready-md',
    name: 'brief.md',
    kind: 'text',
    mimeType: 'text/markdown',
    size: 600,
    status: 'ready',
    extractedText: '# Brief\n\nClient wants a sales dashboard with charts and export.',
    createdAt: 1002,
    ...overrides,
  };
}

function makeReadyPdf(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
  return {
    id: 'file-ready-pdf',
    name: 'spec.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 8000,
    status: 'ready',
    extractedText: 'Specification: implement user authentication and role management.',
    createdAt: 1003,
    ...overrides,
  };
}

function makeFailedPdf(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
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
    ...overrides,
  };
}

function makeFailedImg(overrides: Partial<RoomSourceFile> = {}): RoomSourceFile {
  return {
    id: 'file-failed-img',
    name: 'whiteboard.png',
    kind: 'image',
    mimeType: 'image/png',
    size: 5000,
    status: 'failed_extraction',
    extractedText: '',
    failureReason: 'ocr_low_confidence',
    createdAt: 1004,
    ...overrides,
  };
}

function makeTask(overrides: {
  sourceText?: string;
  sourceFiles: RoomSourceFile[];
  extractedText?: string;
}): TaskContext {
  const { sourceFiles, sourceText, extractedText = '' } = overrides;
  const composed = sourceText ?? composeRoomSourceText('', extractedText, sourceFiles);
  return {
    id: `task-matrix-${Date.now()}`,
    roomId: `room-matrix-${Date.now()}`,
    workflowType: 'client_resume',
    taskFrame: {
      objective: 'build a login page and a dashboard',
      stage: 'discovery',
      stakeholders: [],
    },
    sourceText: composed,
    sourceFiles,
    extractedText,
    createdAt: 1,
    pendingInputs: [],
    blockerSignals: [],
    lifecycleState: 'dumped',
    currentStepIndex: 0,
    currentActionId: null,
    rescueHistory: [],
  };
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

interface ScenarioResult {
  id: number;
  name: string;
  passed: boolean;
  failureReason: string | null;
}

interface ScenarioExpectation {
  contextStatus: 'ready' | 'partial' | 'blocked' | 'empty';
  /** True = at least one ready file must appear in readyFiles */
  hasReadyFiles: boolean;
  /** True = fileIssues must be non-empty */
  hasFileIssues: boolean;
  /** IDs expected in retrieved evidence. Empty means no retrieval expected. */
  expectedRetrievedIds?: string[];
  /** IDs that must NOT appear in retrieved evidence */
  forbiddenRetrievedIds?: string[];
}

async function runScenario(
  id: number,
  name: string,
  task: TaskContext,
  expected: ScenarioExpectation,
): Promise<ScenarioResult> {
  try {
    // Snapshot assertions (contextStatus, fileIssues, readyFiles)
    const snapshot = buildStudioSnapshot(task);
    if (!snapshot) throw new Error('buildStudioSnapshot returned null');

    if (snapshot.contextStatus !== expected.contextStatus) {
      throw new Error(
        `contextStatus: expected "${expected.contextStatus}", got "${snapshot.contextStatus}"`,
      );
    }

    if (expected.hasReadyFiles && snapshot.readyFiles.length === 0) {
      throw new Error(`expected readyFiles to be non-empty, got 0`);
    }
    if (!expected.hasReadyFiles && snapshot.readyFiles.length > 0) {
      throw new Error(
        `expected readyFiles to be empty, got ${snapshot.readyFiles.length}: ${snapshot.readyFiles.map((f) => f.name).join(', ')}`,
      );
    }

    if (expected.hasFileIssues && snapshot.fileIssues.length === 0) {
      throw new Error(`expected fileIssues to be non-empty, got 0`);
    }
    if (!expected.hasFileIssues && snapshot.fileIssues.length > 0) {
      throw new Error(
        `expected fileIssues to be empty, got ${snapshot.fileIssues.length}: ${snapshot.fileIssues.map((f) => f.name).join(', ')}`,
      );
    }

    // Retrieval assertions (uses real retrieval engine with fake-indexeddb)
    if (
      expected.expectedRetrievedIds !== undefined ||
      expected.forbiddenRetrievedIds !== undefined
    ) {
      const evidenceContext = await buildActionEvidenceContext({
        task,
        preferredCandidate: {
          title: task.taskFrame?.objective ?? 'build feature',
          rationale: 'continue from existing context',
        },
      });
      const retrievedIds = evidenceContext.evidenceChips.map((c) => c.sourceId);

      for (const id of expected.expectedRetrievedIds ?? []) {
        if (!retrievedIds.includes(id)) {
          throw new Error(
            `expected "${id}" in retrievedSourceIds, got: ${JSON.stringify(retrievedIds)}`,
          );
        }
      }
      for (const id of expected.forbiddenRetrievedIds ?? []) {
        if (retrievedIds.includes(id)) {
          throw new Error(
            `forbidden "${id}" found in retrievedSourceIds: ${JSON.stringify(retrievedIds)}`,
          );
        }
      }
    }

    return { id, name, passed: true, failureReason: null };
  } catch (err) {
    return {
      id,
      name,
      passed: false,
      failureReason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results: ScenarioResult[] = [];

  // Scenario 1: txt only
  results.push(
    await runScenario(
      1,
      'txt only → ready, retrieves txt, fileIssues=0',
      makeTask({ sourceFiles: [makeReadyTxt()] }),
      {
        contextStatus: 'ready',
        hasReadyFiles: true,
        hasFileIssues: false,
        expectedRetrievedIds: ['file:file-ready-txt'],
        forbiddenRetrievedIds: [],
      },
    ),
  );

  // Scenario 2: md only
  results.push(
    await runScenario(
      2,
      'md only → ready, retrieves md, fileIssues=0',
      makeTask({ sourceFiles: [makeReadyMd()] }),
      {
        contextStatus: 'ready',
        hasReadyFiles: true,
        hasFileIssues: false,
        expectedRetrievedIds: ['file:file-ready-md'],
        forbiddenRetrievedIds: [],
      },
    ),
  );

  // Scenario 3: readable PDF (text-layer)
  results.push(
    await runScenario(
      3,
      'readable PDF → ready, retrieves PDF, fileIssues=0',
      makeTask({ sourceFiles: [makeReadyPdf()] }),
      {
        contextStatus: 'ready',
        hasReadyFiles: true,
        hasFileIssues: false,
        expectedRetrievedIds: ['file:file-ready-pdf'],
        forbiddenRetrievedIds: [],
      },
    ),
  );

  // Scenario 4: scanned/bad PDF + ready txt
  results.push(
    await runScenario(
      4,
      'scanned PDF fail + txt ready → partial, retrieves txt, fileIssues>0',
      makeTask({ sourceFiles: [makeFailedPdf(), makeReadyTxt()] }),
      {
        contextStatus: 'partial',
        hasReadyFiles: true,
        hasFileIssues: true,
        expectedRetrievedIds: ['file:file-ready-txt'],
        forbiddenRetrievedIds: ['file:file-failed-pdf'],
      },
    ),
  );

  // Scenario 5: all files fail + no manual text
  // IMPORTANT: Must have no taskFrame.objective and empty sourceText to get 'blocked'.
  // getRoomContextStatus returns 'blocked' only when hasUsableContext is false
  // (no usable text, no ready files, no synthesis summary, no taskFrame objective).
  results.push(
    await runScenario(
      5,
      'all files fail + no text → blocked, retrieves none, fileIssues>0',
      {
        id: `task-matrix-${Date.now()}-5`,
        roomId: `room-matrix-${Date.now()}-5`,
        workflowType: 'client_resume',
        // No taskFrame — prevents objective from counting as usable context
        sourceText: composeRoomSourceText('', '', [makeFailedPdf(), makeFailedImg()]),
        sourceFiles: [makeFailedPdf(), makeFailedImg()],
        extractedText: '',
        createdAt: 1,
        pendingInputs: [],
        blockerSignals: [],
        lifecycleState: 'dumped',
        currentStepIndex: 0,
        currentActionId: null,
        rescueHistory: [],
      },
      {
        contextStatus: 'blocked',
        hasReadyFiles: false,
        hasFileIssues: true,
        // No retrieval expected — query will be empty or sources empty
        forbiddenRetrievedIds: ['file:file-failed-pdf', 'file:file-failed-img'],
      },
    ),
  );

  // Scenario 6: all files fail + manual text
  results.push(
    await runScenario(
      6,
      'all files fail + manual text → partial, fileIssues>0, no file retrieved',
      makeTask({
        sourceFiles: [makeFailedPdf()],
        extractedText: '',
        // Simulate user-pasted manual text by injecting it into sourceText directly
        sourceText:
          composeRoomSourceText(
            'ลูกค้าต้องการระบบ login สำหรับ 50 users',
            '',
            [makeFailedPdf()],
          ),
      }),
      {
        contextStatus: 'partial',
        hasReadyFiles: false,
        hasFileIssues: true,
        // Failed file must NOT be retrieved
        forbiddenRetrievedIds: ['file:file-failed-pdf'],
      },
    ),
  );

  // Scenario 7: mixed ready/failed
  results.push(
    await runScenario(
      7,
      'mixed ready/failed → partial, retrieves ready only, failed excluded',
      makeTask({
        sourceFiles: [makeFailedPdf(), makeReadyTxt(), makeFailedImg()],
      }),
      {
        contextStatus: 'partial',
        hasReadyFiles: true,
        hasFileIssues: true,
        expectedRetrievedIds: ['file:file-ready-txt'],
        forbiddenRetrievedIds: ['file:file-failed-pdf', 'file:file-failed-img'],
      },
    ),
  );

  // ─── Print results ──────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n[smoke:fallback-matrix] ${passed}/${total} scenarios passed\n`);

  for (const result of results) {
    const icon = result.passed ? '✔' : '✘';
    console.log(`  ${icon} [${result.id}] ${result.name}`);
    if (!result.passed) {
      console.log(`       FAIL: ${result.failureReason}`);
    }
  }

  console.log('');

  if (passed < total) {
    console.error(`[smoke:fallback-matrix] ${total - passed} scenario(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('[smoke:fallback-matrix] All scenarios passed ✔');
  }
}

main().catch((err) => {
  console.error('[smoke:fallback-matrix] Fatal error:', err);
  process.exitCode = 1;
});
