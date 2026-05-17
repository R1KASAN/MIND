# Graph-First Agent Prompt — MIND

> **Copy-paste this prompt** into Antigravity, Codex, Claude Code, Cursor Agent, or any AI coding agent before starting any bug investigation, impact analysis, or code editing task in this repository.

---

## Purpose

This prompt establishes the **graph-first operating mode** for AI coding agents working in the MIND repository.

The repository has a Graphify-based Knowledge Graph (`graphify-out/graph.json`) with approximately **24,568 nodes, 45,232 edges, and 1,060 communities** built from AST extraction. This graph is the primary navigation layer for understanding architecture, tracing dependencies, identifying high-risk modules, and locating the minimal set of files to read before making any change.

**This prompt is for:** Antigravity, Codex, Claude Code, Cursor Agent, or any AI coding agent.

---

## Core Operating Rule

> **Graph first → targeted source read second → minimal edit third → targeted verification fourth.**

Before using grep, before opening many files, before editing any code:
1. Run `graphify query` to locate the relevant subsystem.
2. Run `graphify explain` to understand the component and its blast radius.
3. Run `graphify path` to trace the relationship between the symptom and the suspected cause.
4. Read only the 2–5 source files the graph identifies.
5. Verify against actual source code.
6. Only then edit.

**The graph is a map, not proof.** Never claim a root cause or make an edit based only on graph output. Always confirm in the actual source file first.

---

## Standard Bug Investigation Workflow

### Step 1 — Restate the bug in one sentence
Write: _"The bug is: [observed behaviour] when [trigger condition], but [expected behaviour]."_

### Step 2 — Query the graph using the bug symptom
```bash
graphify query "What files could explain [bug symptom]?"
graphify query "What changed areas could explain [bug symptom]?"
```
Identify the 1–3 most relevant communities and file paths from the output.

### Step 3 — Explain the likely module / component
```bash
graphify explain "[component or filename]"
```
Note: degree count (number of edges) tells you the blast radius. Higher degree = more files affected if this module is wrong.

### Step 4 — Trace the graph path between symptom layer and likely cause layer
```bash
graphify path "[symptom file or component]" "[suspected root cause file]"
```
If no path is found, the components are in different communities — broaden the query or try an intermediate node.

### Step 5 — Read only the top 2–5 source files suggested by graph results
Do not open adjacent files speculatively. Explain in one sentence why each file is being opened.

### Step 6 — Confirm the bug from actual source code
Read the relevant section. Quote the exact line or function that contains the defect. Do not assume.

### Step 7 — Identify root cause
State: _"Root cause: [function name] in [file] at approximately line [N] because [reason]."_

### Step 8 — Propose minimal fix
State: _"Minimal fix: change [X] in [file]. No other file requires change because [reason]."_

### Step 9 — Identify targeted tests
```bash
graphify query "What tests cover [feature/component]?"
```
List only the test files that are directly relevant to the fix.

### Step 10 — Edit only the confirmed impact area
Do not touch files outside the impact area. Do not refactor unrelated code. Do not change prompts, OCR, analytics, or persistence unless the bug is confirmed in that subsystem.

### Step 11 — Run typecheck and targeted tests
```bash
npm run typecheck:app
npm test -- --testPathPattern="[relevant test file pattern]"
```

### Step 12 — Report verification, risk, and confidence
Use the report format at the end of this document.

---

## Required Graphify Commands

```bash
# Locate where a feature or component is implemented
graphify query "Where is [feature/component] implemented?"

# Find files related to a bug symptom
graphify query "What files could explain [bug symptom]?"

# Find test coverage for a component
graphify query "What tests cover [feature/component]?"

# Find all modules that depend on a file (blast radius)
graphify query "What modules depend on [file/component]?"

# Inspect a component and all its direct connections
graphify explain "[component/function/module]"

# Trace the shortest path between two nodes
graphify path "[source file or component]" "[target file or component]"
```

---

## Bug Symptom Query Templates — MIND Specific

Copy and run these when the bug symptom matches:

```bash
# Room persistence / missing rooms
graphify query "What files could explain rooms disappearing or not persisting?"

# Wrong room opened on reentry
graphify query "What files could explain returning users opening the wrong room?"

# Evidence chips not showing or replaying incorrectly
graphify query "What files could explain evidence chips not replaying?"

# AI returning the wrong task type
graphify query "What files could explain AI selecting the wrong task type?"

# Sidebar showing stale room state
graphify query "What files could explain sidebar room state being stale?"

# Full data flow inspection
graphify query "What files connect user input, parsing, persistence, and UI rendering?"
graphify query "How do UI, state, AI routing, persistence, and tests connect?"
```

---

## Known Non-Bug Patterns

Do not escalate these patterns into code changes unless a browser symptom, failing test, or source-confirmed broken flow is also present:

- Intentional duplication in `src/lib/orchestrator/evidence-context.ts` that is asserted by `evidence-context.test.ts` and used for retrieval / TF-IDF weighting.
- High graph degree alone. A large blast radius is a risk signal, not proof of an app defect.
- Passing targeted tests plus no visible browser symptom. That is a risk or docs gap, not a bug.

When a scan finds one of these patterns, document it as a risk / tooling note and move on unless the acceptance path is actually broken.

---

## RC Three-Track Decision Rule

Before editing anything, classify the finding:

- **Real bug:** A browser/demo symptom, failing acceptance path, failing test, or source-confirmed broken flow affects Room reentry, evidence, Room memory, next action / save point, route state, or file ingestion into Room context. Investigate graph-first, then apply a minimal fix.
- **Risk gap:** A high-degree hub, stale risk list, or graph finding changes future investigation priority but does not prove broken behavior. Update docs / tooling only.
- **Non-bug pattern:** Odd-looking code is intentional, asserted by tests, or stable in the browser. Do not clean it up during RC unless the behavior and tests are intentionally changed.

Do not add source comments or refactors during RC just to explain a non-bug pattern unless repeated maintenance mistakes prove that the missing note is itself a real risk.

---

## High-Risk Module Starting Points

Always inspect these modules first when a bug falls into their subsystem. Run the corresponding `graphify explain` before opening the file.

### `src/lib/store/idb.ts` — degree 226 (highest in repo)
**When to use:** Bug involves persistence, room records, schema, save/load, missing data, or stale room state.
```bash
graphify explain "idb.ts"
graphify query "What modules depend on idb.ts?"
```

### `src/lib/store/room-memory-db.ts` — degree 93
**When to use:** Bug involves memory replay, reentry context, or rooms appearing to start over after navigation.
```bash
graphify explain "room-memory-db.ts"
graphify path "home-entry.ts" "room-memory-db.ts"
```

### `src/lib/orchestrator/task-controller.ts` — degree 79
**When to use:** Bug involves task orchestration, evidence context, room memory, scaffold/refine, provenance/debug, or OneAction UI flows.
```bash
graphify explain "task-controller.ts"
graphify path "task-controller.ts" "evidence-context.ts"
```

### `src/lib/orchestrator/task-machine.ts` — degree 53
**When to use:** Bug involves task lifecycle, wrong state transition, wrong action produced, or inconsistent task state.
```bash
graphify explain "task-machine.ts"
graphify path "task-machine.ts" "task-shape.ts"
```

### `src/lib/ai/task-shape.ts` — degree 43
**When to use:** Bug involves wrong AI task type, intent routing failure, or misclassified user input (especially Thai-language inputs).
```bash
graphify explain "task-shape.ts"
graphify query "What tests cover task-shape.ts?"
```

### `src/lib/orchestrator/home-entry.ts` — degree 48
**When to use:** Bug involves returning-user state, recommended room on sidebar, reentry flow, or wrong room selected on load.
```bash
graphify explain "home-entry.ts"
graphify query "What tests cover home-entry.ts?"
```

---

## Query Fallback Guidance

If `graphify query` returns generic keyword nodes like `files` or otherwise stays too broad, switch to component-targeted queries immediately:

```bash
graphify explain "home-entry.ts"
graphify explain "idb.ts"
graphify explain "task-controller.ts"
graphify explain "evidence-context.ts"
graphify path "page.tsx" "idb.ts"
graphify path "task-controller.ts" "evidence-context.ts"
```

Use those results to narrow the subsystem before reading any source files.

---

## Source Verification Rule

> **Do not edit code until the suspected root cause is confirmed by reading the actual source file.**

Graph output is derived from AST edges. It shows structure — what imports what, what calls what, what contains what. It does not show runtime behaviour, conditional logic, or semantic intent. Always read the actual file and confirm the defect exists at the source level before proposing or applying any fix.

A real bug requires at least one of:
- a browser or demo symptom
- a failing acceptance path
- a failing test
- a source-confirmed broken flow

Do not promote suspicious code, high-degree nodes, or intentional duplication into code work without one of those signals.

---

## Token-Saving Rules

Agents must follow these rules to avoid unnecessary token usage:

- **Do not run broad grep** unless the graph query returns insufficient results and you document why.
- **Do not open more than 5 files** before forming a specific hypothesis.
- **Do not open unrelated files** — explain in one sentence why each file is relevant before opening it.
- **Do not read generated output** in `.next/`, `.next-mockup/`, `dist/`, or `graphify-out/` unless the bug is confirmed to be in a build artefact.
- **Summarize graph findings** before opening any source file.
- **Do not perform unrelated refactors** while investigating a bug.

---

## Multimodal / Document Limitation

> The current graph is **AST-first only.** No LLM API key was set during graph generation.

This means:
- Semantic/intent-level edges are absent from the graph.
- PDFs, diagrams, wireframes, and screenshots in `docs/` are **not indexed semantically.**
- Product docs and specs (`docs/product/`) provide context and intent, but they are **not proof of implementation.**
- Always verify implementation claims in actual source code, not in docs.

When using product docs as context:
- Use them to understand the intended behaviour.
- Use the graph and source to confirm the actual behaviour.
- Never quote a doc as the reason for an edit — quote the source file.

---

## Safety Rules

- **Do not print, store, or expose secrets, API keys, or tokens.**
- **Do not run `cat .env`, `env | grep -i key`, or equivalent commands.**
- **Do not inspect `.env` files or credential files.**
- **Do not commit `graphify-out/`** unless explicitly requested.
- **Do not commit large generated artefacts** (`graph.json`, `GRAPH_REPORT.md`, `*.html` from graphify-out) unless reviewed and explicitly approved.
- **Do not include `.env`, private keys, or local cache** in any committed file.

---

## Editing Rules

- Edit **only** files inside the confirmed impact area identified by the graph and source verification.
- **No broad architecture changes** unless the user explicitly requests a refactor.
- **Do not touch prompts, OCR, analytics, or the retrieval schema** unless the bug is directly confirmed in that subsystem. These are classified as do-not-touch areas in `AGENTS.md`.
- **No smoke harness repairs** unless the harness failure is reproduced in the visible browser and blocks the prototype acceptance path.
- Keep changes **minimal and targeted.**

---

## Verification Rules

Run in this order and stop at the first failure:

```bash
# 1. Always run first
npm run typecheck:app

# 2. Run targeted unit test for the changed file
npm test -- --testPathPattern="[relevant test file pattern]"

# 3. Run targeted smoke script if the change affects a demo-critical flow
npm run smoke:evidence-one-action

# 4. Run broader smoke ONLY if the change touches a cross-cutting flow
#    (idb.ts, task-machine.ts, task-shape.ts, home-entry.ts, or room-memory-db.ts)
npm run smoke:demo-browser
```

**Do not run the full test suite** unless the change touches a file with degree ≥ 50 or affects more than 3 modules.

---

## Report Format

After completing any investigation or fix, report using this format:

```
**Bug:**
[One-sentence restatement of the bug]

**Graph queries used:**
- graphify query "..."
- graphify explain "..."
- graphify path "..." "..."

**Graph findings:**
[What the graph returned — relevant nodes, communities, paths. 3–5 bullet points max.]

**Files inspected and why:**
- [file path] — [one sentence: why this file was relevant]
- [file path] — [one sentence: why this file was relevant]

**Confirmed root cause:**
[Function name, file, approximate line, and explanation]

**Minimal fix:**
[What was changed and why no other file needed to change]

**Files changed:**
- [file path]

**Tests run:**
- [test file or script] — [result: PASS / FAIL]

**Verification result:**
[typecheck: PASS/FAIL] [targeted test: PASS/FAIL] [smoke: PASS/FAIL / skipped]

**Remaining risk:**
[Any residual uncertainty, edge cases not covered, or follow-up needed]

**Confidence:**
[high / medium / low] — [one sentence explaining why]
```

---

## Graphify Quick Reference

```bash
# Regenerate the graph after code changes (no API key needed)
graphify update .

# Inspect a module and all its connections
graphify explain "idb.ts"
graphify explain "task-machine.ts"
graphify explain "task-shape.ts"
graphify explain "home-entry.ts"
graphify explain "room-memory-db.ts"
graphify explain "evidence-context.ts"
graphify explain "rescue-runtime.ts"
graphify explain "RoomSidebar.tsx"

# Trace dependency paths
graphify path "task-machine.ts" "task-shape.ts"
graphify path "home-entry.ts" "room-memory-db.ts"
graphify path "task-controller.ts" "prompts.ts"
graphify path "evidence-context.ts" "idb.ts"

# Query for subsystem location
graphify query "Where is evidence chip implemented?"
graphify query "Where is room reentry handled?"
graphify query "Where is the rescue path defined?"
graphify query "What tests cover the main user flows?"
```

---

## Related Documents

| Document | Purpose |
|---|---|
| `docs/engineering/REPO_KNOWLEDGE_GRAPH.md` | Full architecture map, output paths, and graph limitations |
| `docs/engineering/BUG_SCAN_PLAYBOOK.md` | Detailed bug scan workflow with top-5 risky module analysis |
| `docs/product/prototype-completion-plan.md` | Source of truth for prototype scope and acceptance gate |
| `AGENTS.md` | Agent operating rules, do-not-touch list, and scope guardrails |
