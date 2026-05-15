# Codex Implementation Prompt — Evidence-Backed ONE_ACTION (C → A → B)

## Read order (mandatory)
1. `AGENTS.md` — product doctrine
2. `docs/product/next-round-evidence-backed-one-action.md` — active plan
3. This file — locked implementation decisions

Do not implement anything not listed here.
Do not add packages, schema fields, or new routes.
Release gate: `npm run smoke:evidence-one-action` must stay green after every scope.

---

## Scope C — Evidence chip display (implement first)

### What to change
File: `src/components/ActionScaffold/StepEvidencePanel.tsx`

The chip row already exists. Apply these locked rules to it — nothing else.

### Locked rules

**Rule C-1: Hide chips with empty excerpt**
A chip must NOT render if `item.excerpt` is `''` (empty string after trim).
Do not render a "no excerpt" placeholder. Just skip the chip entirely.

**Rule C-2: Cap at 3 chips**
The constant `MAX_EVIDENCE_ITEMS = 3` in `src/lib/orchestrator/evidence-context.ts` is already the source of truth.
`StepEvidencePanel` must never render more than 3 chips regardless of what arrives in `evidence[]`.
Add a `.slice(0, 3)` guard on the render loop — defensive, not logic-changing.

**Rule C-3: Hide chip row when evidence is empty**
If `evidence.length === 0` (after the excerpt filter), do not render the chip container div at all.
No "ยังไม่มีหลักฐาน" fallback label.

**Rule C-4: Truncate chip label at 32 chars**
If `item.label.length > 32`, display `item.label.slice(0, 32) + '…'` as the button text.
Keep the full label in the `title` attribute (tooltip) — that already contains `item.excerpt`.

**Rule C-5: Layout pruning order**
If the details panel becomes visually cluttered, the safe pruning order is:
1. Remove `confirmedLabel` chip first
2. Then `generatedLabel` chip
3. Then `generatedByLabel` chip
4. Never remove `safety.manualOnly` — it is safety-critical

**Do not change:**
- Component file location
- `buildStepEvidenceDisplay` logic in `step-evidence-display.ts`
- `MAX_EVIDENCE_ITEMS` value
- `chooseExcerpt` logic in `evidence-context.ts`

### Tests to update
- `src/lib/orchestrator/step-evidence-display.test.ts` — add cases:
  - step with all-empty excerpts → `evidenceCount` still reflects raw count but render guard catches it
  - step with 5 evidence items → only first 3 render
- Visual check: open SCAFFOLD view in browser, confirm chip row is absent when no retrieved evidence

---

## Scope A — Reentry concern injection (implement second)

### What to change
File: `src/lib/ai/operation-prompts.ts`
Function: `buildOperationTaskContext(task: TaskContext)`

Add a new `reentryContext:` block at the **end** of the returned string (after `lastFailureReason`).
Do not move or rename any existing block.

### What goes in reentryContext

Source data is `task.cognitiveState` (from `TaskContext`) and `task.rescueHistory`.

Build the block with this logic:

```ts
function buildReentryContextBlock(task: TaskContext): string {
  // 1. Read stuck signal from cognitiveState first, then blockerSignals
  const cognitiveSignal = task.cognitiveState?.lastStuckSignal;
  const taskSignal = task.blockerSignals
    .map(mapBlockerToStuckSignal)   // reuse the same mapper in home-entry.ts
    .find((s) => s !== 'unknown');
  const activeSignal = cognitiveSignal ?? taskSignal ?? 'unknown';

  // 2. Filter out waiting_client — it is a client-side blocker, not a user action item
  if (activeSignal === 'waiting_client') return '';

  // 3. Filter out resolved concerns
  // A concern is resolved when a pendingInput.answer exists for a matching missingInput
  const resolvedKeywords = (task.pendingInputs ?? [])
    .filter((p) => Boolean(p.answer))
    .map((p) => p.kind);

  const driftWarnings = (task.cognitiveState?.driftWarnings ?? [])
    .filter((w) => !resolvedKeywords.some((k) => w.toLowerCase().includes(k)));

  // 4. Snapshot age guard — treat snapshot older than 7 days as null
  const snapshotAge = task.cognitiveState?.lastEventAt
    ? Date.now() - task.cognitiveState.lastEventAt
    : Infinity;
  const snapshotStale = snapshotAge > 7 * 24 * 60 * 60 * 1000;

  if (snapshotStale && driftWarnings.length === 0 && activeSignal === 'unknown') return '';

  const lines: string[] = [];
  if (activeSignal !== 'unknown') lines.push(`lastStuckSignal: ${activeSignal}`);
  if (!snapshotStale && driftWarnings.length > 0) {
    lines.push(`driftWarnings: ${driftWarnings.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '';
}
```

Then in `buildOperationTaskContext`, append:

```ts
const reentryContextBlock = buildReentryContextBlock(task);
// add after lastFailureReason line:
'',
'reentryContext:',
reentryContextBlock || 'ไม่มี',
```

### Signal priority (when signals conflict)
Priority order (highest first): `too_big` > `missing_context` > `scope_unclear` > `energy_low` > `unknown`
`waiting_client` is excluded from reentryContext entirely.
If `cognitiveState.lastStuckSignal` is present, it takes priority over `blockerSignals` regardless of priority order.

### Fallback
If `cognitiveState` is absent or stale AND no active blocker signal exists → `reentryContext: ไม่มี`
The prompt must still work with an empty reentryContext block.

### Mapper reuse
`mapBlockerToStuckSignal` already exists in `src/lib/orchestrator/home-entry.ts`.
Move it to a shared location (e.g., `src/lib/orchestrator/stuck-signals.ts`) and import it in both files.
Do not duplicate the function body.

**Do not change:**
- `ACTION_SYSTEM_PROMPT` — no wording changes to the system prompt
- Any existing block in `buildOperationTaskContext` (only append)
- Schema / IDB types — `cognitiveState` must already exist on `TaskContext` or this scope is blocked

### Pre-condition check
Before implementing: confirm `task.cognitiveState` exists on `TaskContext` in `src/lib/store/idb.ts`.
If it does not exist, stop and report — do not add the field, do not proceed with Scope A.

### Tests to update
- `src/lib/ai/operation-prompts.test.ts` (or equivalent) — add cases:
  - task with `waiting_client` signal → `reentryContext: ไม่มี`
  - task with `cognitiveState.lastEventAt` older than 7 days → `reentryContext: ไม่มี`
  - task with resolved `pendingInputs` → drift warning for that keyword filtered out
  - task with `too_big` + `energy_low` signals → `too_big` wins
- Smoke gate must stay green: `npm run smoke:evidence-one-action`

---

## Scope B — ONE_ACTION concrete heuristic (implement last)

### What to change
File: `src/lib/ai/operation-prompts.ts`
Function: `buildActionUserPrompt(...)`

File: `src/lib/ai/operation-prompts.ts`
Constant: `ACTION_SYSTEM_PROMPT`

### Rule B-1: propose vs ask threshold
Add a `actionMode` line to the user prompt **before** `preferredCandidate`:

```ts
function resolveActionMode(task: TaskContext, negotiation?: { mode: string } | null): 'propose' | 'ask' {
  // In negotiation mode, always propose — never ask
  if (negotiation && negotiation.mode !== 'default') return 'propose';

  const missingCount = task.taskShape?.missingInputs?.length ?? 0;
  const confidence = task.taskShape?.confidence ?? 0.5;

  if (missingCount >= 2 || confidence < 0.4) return 'ask';
  return 'propose';
}
```

Add to `buildActionUserPrompt` output:
```
actionMode: propose | ask
```

### Rule B-2: notThisCount source
`notThisCount` already exists as `task.notThisCount` (field confirmed in `src/lib/store/idb.ts` line 303).
Add it to the user prompt:
```
notThisCount: {task.notThisCount}
```

### Rule B-3: notThisCount prompt behavior
Add to `ACTION_SYSTEM_PROMPT` rules section:
```
- ถ้า actionMode = ask ให้ถามคำถามเดียวที่ unlock ก้าวต่อไปได้ แทนที่จะ propose action ยาว
- ถ้า notThisCount >= 3 ให้ถามว่า user ต้องการเปลี่ยน scope หรือแค่ต้องการ action ที่เล็กลง
- ห้าม propose action ที่มี title ซ้ำกับ alternatives ที่ user reject ไปแล้วใน rescueHistory
```

### Rule B-4: micro step granularity guard
Add to `ACTION_SYSTEM_PROMPT` rules section:
```
- step ที่ดีใช้เวลาทำ 5-30 นาที ถ้า step เล็กกว่า single atomic action (เช่น "เปิดไฟล์" หรือ "ส่งอีเมล 1 ฉบับ") ให้รวมกับ step ถัดไปแทนการ split เพิ่ม
```

### Rejected action guard
The `rescueHistory` array already contains prior rescue reasons.
When `notThisCount > 0`, also pass rejected titles from `task.currentPlan?.steps` into the prompt:
```
rejectedActionHints: {rescueHistory.map(r => r.reason).join(', ') || 'ไม่มี'}
```
This tells the AI which directions to avoid without requiring a schema change.

**Do not change:**
- `notThisCount` field definition in IDB — it is already there
- `rescueHistory` schema
- `buildActionEvidenceContext` — evidence retrieval is not touched in Scope B
- Smoke gate fixture files

### Tests to update
- `src/lib/orchestrator/task-controller.test.ts` — add:
  - `notThisCount >= 3` path → confirm user prompt contains `actionMode: ask` when missingCount also >= 2
  - negotiation mode present → `actionMode: propose` regardless of missingCount
- Smoke gate: `npm run smoke:evidence-one-action` must stay green

---

## Implementation order summary

```
C first  → visual-only, zero risk to prompt/schema/retrieval
A second → prompt text only, no schema change, smoke gate validates
B last   → prompt + heuristic, highest risk, isolated by C+A passing first
```

Stop after each scope and run `npm run smoke:evidence-one-action`.
If gate fails, fix only the failure point described in the active plan.
Do not proceed to the next scope if the current gate is red.

## What is explicitly out of scope
- New packages
- New IDB schema fields
- OCR / PDF extraction
- Vector DB
- JSONL / URL ingest
- New API routes
- Changes to `buildActionEvidenceContext` retrieval logic
- Changes to `MAX_EVIDENCE_ITEMS` value
