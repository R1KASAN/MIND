# REPO Knowledge Graph — MIND

> **Graph-first rule:** Query graph → read only the files the graph identifies → make the smallest safe edit. Never broad-grep first.

---

## 1. Purpose

This document is the primary navigation reference for AI agents working in the MIND repository. It describes the Knowledge Graph tooling, main architecture, high-risk modules, and recommended query patterns so that every future coding task starts with a targeted graph query instead of broad file scanning.

---

## 2. Tooling: Graphify

**Available:** `graphify` (CLI — confirmed present)
**Package:** `graphifyy` (PyPI)
**Backend used for current graph:** AST-only (no LLM API key set). Semantic/conceptual edges are therefore limited; structural edges are authoritative.

### Regenerate the graph

```bash
# From repo root
graphify update .                   # AST re-extraction (no API key needed)
graphify export callflow-html       # Export sectional call-flow HTML
```

> ⚠️ **Limitation:** The graph has 24,568 nodes — too large for a single HTML visualisation (limit: 5,000). Only the sectional call-flow HTML (`MIND-callflow.html`) is exported. The full graph lives in `graphify-out/graph.json`.

To enable semantic (conceptual) extraction, set one of:
```
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
```
Then re-run `graphify update .` — it will add semantic edges on top of the AST graph.

---

## 3. Output Paths

| Artifact | Path | Committed? |
|---|---|---|
| Graph JSON | `graphify-out/graph.json` | ❌ No — too large |
| Report MD | `graphify-out/GRAPH_REPORT.md` | ❌ No — generated |
| Call-flow HTML | `graphify-out/MIND-callflow.html` | ❌ No — generated |
| **This doc** | `docs/engineering/REPO_KNOWLEDGE_GRAPH.md` | ✅ Yes |
| Bug playbook | `docs/engineering/BUG_SCAN_PLAYBOOK.md` | ✅ Yes |
| Ignore rules | `.graphifyignore` | ✅ Yes |

---

## 4. Graph-First Workflow

```
1. graphify query "<what you need to understand>"
2. graphify explain "<component / function / file>"
3. graphify path "<source>" "<target>"
4. Read only the 2–5 files the graph identifies
5. Verify claim against actual source
6. Make minimal edit
7. Run typecheck + targeted tests
8. Run broader smoke only if cross-cutting flow was touched
```

---

## 5. Main Architectural Components

Confirmed from graph + direct source inspection (EXTRACTED):

| Layer | Key Files | Role |
|---|---|---|
| **UI / Entry** | `src/app/page.tsx` | Root page: orchestrates all state, renders Room shell, sidebar, studio |
| **Room Sidebar** | `src/components/Rooms/RoomSidebar.tsx` | Renders room list; reads from `RoomSidebarItemView` (from `home-entry.ts`) |
| **Orchestrator — Home** | `src/lib/orchestrator/home-entry.ts` | Builds sidebar items, resolves reentry state, ranks rooms |
| **Orchestrator — Task Machine** | `src/lib/orchestrator/task-machine.ts` | Core task state machine: routes user input → action → scaffold |
| **Orchestrator — Task Controller** | `src/lib/orchestrator/task-controller.ts` | Executes task operations against the AI backend |
| **Orchestrator — Evidence** | `src/lib/orchestrator/evidence-context.ts` | Builds evidence/provenance context shown in UI chips |
| **Orchestrator — Studio** | `src/lib/orchestrator/studio.ts` | Controls studio/action-panel view state |
| **AI — Task Shape** | `src/lib/ai/task-shape.ts` | Signal-based routing: classifies input intent → task type |
| **AI — Operations** | `src/lib/ai/operations.ts` | AI operation definitions and routing |
| **AI — Prompts** | `src/lib/ai/prompts.ts` | Prompt construction for AI calls |
| **AI — Rescue Runtime** | `src/lib/ai/rescue-runtime.ts` | Handles rescue/recovery paths when primary action fails |
| **AI — Schema** | `src/lib/ai/schema.ts` | Zod schemas for AI request/response |
| **Persistence** | `src/lib/store/idb.ts` | IndexedDB store — 226 edges, **highest-degree non-framework file** |
| **Room Memory** | `src/lib/store/room-memory-db.ts` | Room memory event log, replay context, backfill — 93 edges |
| **Room Logic** | `src/lib/room.ts` | Room domain logic: file UX copy, source IDs, source context |
| **Room Extraction** | `src/lib/room-extraction.server.ts` | Server-side: extracts context from attached files (PDF/image/txt) |
| **Smoke Scripts** | `scripts/run-smoke-task-flow.ts` | Browser smoke: start server → run → stop |
| **Smoke Repeat** | `scripts/run-smoke-task-flow-repeat.ts` | Repeated smoke run with baseline comparison |

### Key Control Flow

```
User paste → page.tsx
  → task-machine.ts (classifies task shape via task-shape.ts)
  → operations.ts → prompts.ts (AI call)
  → task-events.ts (event log)
  → idb.ts (persisted to IndexedDB)
  → room-memory-db.ts (memory replay context updated)
  → evidence-context.ts (evidence chips built)
  → home-entry.ts (sidebar + reentry state rebuilt)
  → RoomSidebar.tsx / page.tsx re-renders
```

---

## 6. High-Risk / High-Connectivity Modules

> These are nodes with the most edges in the graph — changing them has the widest blast radius.
> High degree is a risk signal, not an app defect. Treat missing or stale entries here as docs/tooling gaps unless a browser symptom, failing test, or broken Room acceptance flow is confirmed.

| Rank | Module | Degree | Why Risky |
|---|---|---|---|
| 1 | `src/lib/store/idb.ts` | **226** | Every feature reads/writes through it. Schema changes break all consumers. |
| 2 | `src/lib/store/room-memory-db.ts` | **93** | Room memory replay, backfill, and reentry all depend on this. |
| 3 | `src/lib/orchestrator/task-controller.ts` | **79** | Central hub connecting UI, evidence, memory, and persistence. If a risk list omits it, that is a docs/tooling gap, not an app defect. |
| 4 | `src/lib/orchestrator/task-machine.ts` | **53** | Core state machine connecting UI ↔ AI ↔ persistence. |
| 5 | `src/lib/orchestrator/home-entry.ts` | **48** | Controls which room appears "recommended" on reentry. |
| 6 | `src/lib/ai/task-shape.ts` | **43** | Signal-based routing — wrong signal → wrong task type → wrong AI output. |

> **PDF.js God Nodes** (from GRAPH_REPORT.md): `AnnotationEditor` (164 edges), `warn()` (155), `ConfigNamespace` (141), `AnnotationEditorUIManager` (135) — these are inside `node_modules` / PDF.js internals. Do not edit them.

---

## 7. Important Tests

| Test File | Covers |
|---|---|
| `src/lib/ai/task-shape.test.ts` | Signal-based input routing (critical — recently patched in RC) |
| `src/lib/orchestrator/task-machine.test.ts` | Core task state transitions |
| `src/lib/orchestrator/task-controller.test.ts` | AI operation execution |
| `src/lib/orchestrator/task-events.test.ts` | Event log integrity |
| `src/lib/orchestrator/home-entry.test.ts` | Room sidebar ranking and reentry recommendation |
| `src/lib/orchestrator/evidence-context.test.ts` | Evidence chip correctness |
| `src/lib/store/idb.test.ts` | IndexedDB persistence layer |
| `src/lib/store/room-memory-db.test.ts` | Room memory replay |
| `src/lib/ai/rescue-runtime.test.ts` | Recovery path |
| `src/lib/orchestrator/use-room-actions.test.ts` | Room action hooks |
| `src/lib/room.test.ts` | Room domain logic, file states |
| `src/lib/room-extraction.server.test.ts` | Server-side file extraction |
| `scripts/run-smoke-task-flow.ts` | Full browser smoke (E2E baseline) |
| `scripts/run-smoke-task-flow-repeat.ts` | Repeated smoke with baseline |

---

## 8. Important Docs / Product Specs

| File | Purpose |
|---|---|
| `docs/product/prototype-completion-plan.md` | **Source of truth** — acceptance gate, phase checklist, demo scope |
| `docs/product/demo-handoff-package.md` | Demo script and known limitations |
| `docs/product/prototype-rc-summary.md` | RC freeze summary |
| `docs/product/pof-testing-report.md` | Proof-of-function test results |
| `AGENTS.md` | Agent operating rules (scope, do-not-touch list) |
| `specs/006-mind-vnext-prd/first-run-demo-checklist.md` | First-run demo checklist |
| `specs/006-mind-vnext-prd/rescue-benchmark-note.md` | Rescue path benchmark notes |

---

## 9. Known Graph Limitations

1. **AST-only extraction** — No LLM API key was set during graph build. Semantic/intent-level edges (e.g., "this function implements the rescue flow") are absent. Structural import/call edges are authoritative.
2. **Graph too large for HTML viz** — 24,568 nodes exceeds the 5,000-node HTML limit. Only the call-flow sectional HTML is exported.
3. **`.next-mockup/` included in current graph** — Build artefacts from the mockup app inflate node count. This is expected; they are in `.graphifyignore` for future runs.
4. **`graphify path` requires exact node names** — Fuzzy matching sometimes returns ambiguous warnings. Use the node name as it appears in `graphify explain` output.
5. **PDF/diagram extraction not supported** — Graphify does not perform OCR on PDFs or image diagrams. Architecture intent from those files is not in the graph.
6. **No multimodal extraction** — Product diagrams and wireframes in `docs/` are not indexed semantically.

---

## 10. Recommended Graph Queries for Future Tasks

### Architecture
```bash
graphify explain "idb.ts"                           # Persistence layer blast radius
graphify explain "task-machine.ts"                  # Core state machine
graphify explain "task-shape.ts"                    # AI routing logic
graphify explain "home-entry.ts"                    # Room sidebar / reentry orchestration
graphify explain "evidence-context.ts"              # Evidence chip construction
```

### Dependency tracing
```bash
graphify path "task-machine.ts" "task-shape.ts"     # AI routing path
graphify path "home-entry.ts" "room-memory-db.ts"   # Memory replay path
graphify path "task-controller.ts" "prompts.ts"     # Prompt construction path
```

### Impact analysis before editing
```bash
graphify query "What modules depend on idb.ts?"
graphify query "What modules depend on task-shape.ts?"
graphify query "What test files cover evidence-context.ts?"
```

### Bug investigation
```bash
graphify query "What changed areas could explain [bug symptom]?"
graphify query "Where is [feature/component] implemented?"
graphify query "What tests cover [feature/component]?"
```

### Demo / RC readiness
```bash
graphify query "What files define Room reentry and save point?"
graphify query "What test files cover the main user flows?"
graphify query "What scripts run the demo smoke tests?"
```

---

## 11. Bug Investigation Workflow

See [`BUG_SCAN_PLAYBOOK.md`](./BUG_SCAN_PLAYBOOK.md) for the full step-by-step workflow.

Short version:
1. Restate the bug
2. `graphify query` → locate subsystem
3. `graphify explain` → inspect main component
4. `graphify path` → trace symptom → source
5. Read only 2–5 files
6. Confirm from source, identify root cause, minimal fix, affected tests
7. Edit → typecheck → targeted tests → smoke if cross-cutting

---

## 12. What to Commit

| Item | Commit? |
|---|---|
| `.graphifyignore` | ✅ Yes |
| `docs/engineering/REPO_KNOWLEDGE_GRAPH.md` | ✅ Yes |
| `docs/engineering/BUG_SCAN_PLAYBOOK.md` | ✅ Yes |
| `graphify-out/graph.json` | ❌ No — too large, generated |
| `graphify-out/GRAPH_REPORT.md` | ❌ No — generated |
| `graphify-out/MIND-callflow.html` | ❌ No — generated |
