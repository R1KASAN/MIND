# Bug Scan Playbook — MIND

> Use the Knowledge Graph as the first navigation layer. Do not grep broadly or open many files until the graph has narrowed the search area.

---

## Core Rule

**Graph first → targeted file read second → edit third.**

---

## RC Three-Track Triage Model

Classify every finding before proposing a fix:

- **Real bug:** Room acceptance flow is broken: reentry, evidence, Room memory, next action / save point, route state, or file ingestion into Room context. Use graph-first investigation, confirm with browser / test / source evidence, then make the smallest code fix.
- **Risk gap:** Graph or docs reveal a high-blast-radius file, stale risk list, or missing warning, but no acceptance flow is broken. Fix docs / tooling only.
- **Non-bug pattern:** Code looks unusual but is intentional, tested, or behaviorally stable. Document the design and do not refactor during RC unless retrieval behavior and tests are intentionally changed.

Do not add application source comments or refactors during RC unless the absence of that note has already caused a repeated real maintenance failure.

---

## What Counts As A Bug?

Before opening files or modifying code, ensure the symptom is an actual application defect, not just a strange code pattern or structural risk.

**✅ Patterns that ARE bugs:**
- Reentry opens the wrong Room or room identity mismatches after reopen.
- Context or artifacts disappear after returning to a room.
- Evidence chips display but source detail cannot be opened.
- `ใช้ก้าวนี้` / next action disappears after reentry despite an incomplete task.
- Save point / return labels make it read like starting new work instead of continuation.
- Route or state crashes between leave → reopen.
- File ingestion succeeds, but extracted text skips Room memory or evidence isn't tied to Room context.
- Any behaviour that explicitly fails the acceptance gate in `prototype-completion-plan.md`.

**❌ Patterns that are NOT bugs:**
- Duplicated code that is intentionally asserted in tests (e.g., TF-IDF weight boosting in query builders).
- The Knowledge Graph indicates a file has a massive degree, but no runtime behavior is broken.
- Smoke/E2E tests pass and no visible symptom exists in the browser.
- A risk or documentation gap that does not break the prototype acceptance path.

**⚠️ Patterns that are Risk/Tooling Gaps (NOT Bugs):**
- A critical orchestrator or hub file is omitted from high-risk lists.
- Risk documentation does not reflect the latest graph topology.
- Hub files lack warnings about their blast radius.
*(Fix these in documentation only. Do not modify application code until a true broken flow exists).*

---

## Bug Investigation Workflow

### Step 1 — Restate the bug in one sentence
Write a clear, precise bug statement. Include: what failed, where it failed, and what the expected behaviour was.

### Step 2 — Locate the likely subsystem
```bash
graphify query "What changed areas could explain [bug symptom]?"
graphify query "Where is [feature/component] implemented?"
```
Expected output: 10–30 nodes with file paths and community IDs. Identify the 1–2 most relevant communities.

### Step 3 — Inspect the main component
```bash
graphify explain "[component / function / module name]"
```
Expected output: degree count + all direct connections. This shows what the component imports from and what imports it — i.e., the full blast radius in both directions.

### Step 4 — Trace the relationship between symptom and suspected source
```bash
graphify path "[symptom file or component]" "[suspected root cause file]"
```
Expected output: shortest hop path with edge type (imports/calls/contains). If no path is found, the two components are likely in different communities — broaden the subsystem query.

### Step 5 — Read only the top 2–5 files identified by the graph
Open only the files the graph pointed to. Do not open adjacent files speculatively.

### Step 6 — Confirm the bug from actual source code
The graph is a map, not the source of truth. Verify every claim against the current file content before declaring a root cause.

### Step 7 — Identify root cause
State: _"The bug is caused by X in file Y at line Z because..."_

### Step 8 — Identify minimal fix
State: _"The minimal fix is to change X in file Y. No other file needs to change because..."_

### Step 9 — Identify affected tests
```bash
graphify query "What test files cover [feature/component]?"
```
List the tests that must pass after the fix.

### Step 10 — Edit only files inside the confirmed impact area
Do not touch files that the graph did not identify as part of the impact area unless the bug requires it.

### Step 11 — Run typecheck and targeted tests first
```bash
npm run typecheck:app
npm test -- --testPathPattern="[relevant test file]"
```

### Step 12 — Run broader smoke only if the change touches cross-cutting flow
```bash
npm run smoke:evidence-one-action
npm run smoke:demo-browser
```
Only run broad smoke if the edited file has high degree (≥ 50 edges in the graph) or touches a cross-cutting path (idb.ts, task-machine.ts, task-shape.ts, home-entry.ts).

### Step 13 — Report back
Report:
- Confidence level (high / medium / low)
- Root cause (file, function, line)
- Minimal fix applied
- Tests that passed
- Risks or residual uncertainty
- Whether broader smoke is needed

---

## Example Graph Commands

### Locate a feature
```bash
graphify query "Where is evidence chip implemented?"
graphify query "Where is room reentry handled?"
graphify query "Where is rescue/recovery path defined?"
graphify query "Where is save point / Room continuation stored?"
```

### Inspect a component
```bash
graphify explain "evidence-context.ts"
graphify explain "task-machine.ts"
graphify explain "idb.ts"
graphify explain "home-entry.ts"
graphify explain "task-shape.ts"
graphify explain "rescue-runtime.ts"
graphify explain "RoomSidebar.tsx"
```

### Trace a relationship
```bash
graphify path "task-machine.ts" "task-shape.ts"
graphify path "home-entry.ts" "room-memory-db.ts"
graphify path "task-controller.ts" "prompts.ts"
graphify path "evidence-context.ts" "idb.ts"
```

### Find test coverage
```bash
graphify query "What tests cover task-shape.ts?"
graphify query "What tests cover evidence-context.ts?"
graphify query "What tests cover idb.ts?"
graphify query "What tests cover room-memory-db.ts?"
```

### Find dependents (blast radius)
```bash
graphify query "What modules depend on idb.ts?"
graphify query "What modules depend on task-shape.ts?"
graphify query "What modules depend on room-memory-db.ts?"
```

### Investigate a symptom
```bash
graphify query "What changed areas could explain wrong action type returned?"
graphify query "What changed areas could explain room context lost on reentry?"
graphify query "What changed areas could explain evidence chip not showing?"
graphify query "What changed areas could explain rescue path returning empty?"
```

---

## High-Risk Module Quick Reference

Before editing any of these modules, always run the corresponding graph query first.

| Module | Degree | Risk | Query Before Editing |
|---|---|---|---|
| `src/lib/store/idb.ts` | 226 | Schema changes break all consumers | `graphify explain "idb.ts"` |
| `src/lib/store/room-memory-db.ts` | 93 | Memory replay and reentry depend on this | `graphify explain "room-memory-db.ts"` |
| `src/lib/orchestrator/task-controller.ts` | 79 | Central hub connecting UI, evidence, memory, and persistence; if omitted from a risk list, treat that as a docs-only blast-radius gap, not an app bug | `graphify explain "task-controller.ts"` |
| `src/lib/orchestrator/task-machine.ts` | 53 | Core state machine — wrong transition breaks entire flow | `graphify explain "task-machine.ts"` |
| `src/lib/orchestrator/home-entry.ts` | 48 | Controls room recommendation and reentry state | `graphify explain "home-entry.ts"` |
| `src/lib/ai/task-shape.ts` | 43 | Wrong signal routing → wrong task type → wrong AI output | `graphify explain "task-shape.ts"` |

---

## Bug Risk Scan — Top 6 Risky Modules (First-Pass)

> **Note:** This is a structural risk scan using graph connectivity only. No LLM semantic extraction was used. All findings are INFERRED from degree and dependency topology.

---

### Risk #1 — `src/lib/store/idb.ts` (degree 226)

**Why risky:**
Every feature layer (UI, orchestrator, AI, analytics, tests) imports from `idb.ts`. It is the single persistence boundary. A schema change or breaking export rename propagates to 200+ graph connections. It is the most connected non-framework file in the entire repo.

**Bugs it could cause:**
- Room data lost or not restored after reload (if schema migration is missing)
- Wrong room selected on reentry (if `activeRoomId` derivation changes)
- Evidence chips disappear (if `AppSession` shape changes)
- Any consumer crashes due to undefined fields from an old schema version

**Tests likely covering it:**
- `src/lib/store/idb.test.ts` (direct)
- `src/lib/store/room-memory-db.test.ts` (indirect)
- `src/lib/orchestrator/home-entry.test.ts` (indirect)
- `src/lib/orchestrator/task-machine.test.ts` (indirect)

**Graph query before editing:**
```bash
graphify explain "idb.ts"
graphify query "What modules depend on idb.ts?"
```

---

### Risk #2 — `src/lib/store/room-memory-db.ts` (degree 93)

**Why risky:**
Room memory is the continuity layer — it stores and replays context so that returning users feel like they never left. It is imported by both the orchestrator layer and the UI layer. A broken `buildRoomMemoryReplayContext()` silently drops context, which breaks the reentry demo story.

**Bugs it could cause:**
- Room reentry reads as "starting over" instead of continuing
- Save point loses context after room switch
- Evidence chips show wrong source because replay context is stale
- Backfill runs repeatedly, causing duplicate memory events

**Tests likely covering it:**
- `src/lib/store/room-memory-db.test.ts` (direct)
- `src/lib/orchestrator/home-entry.test.ts` (indirect — uses replay context)
- `src/lib/orchestrator/task-events.test.ts` (indirect)
- `src/lib/orchestrator/evidence-context.test.ts` (indirect)

**Graph query before editing:**
```bash
graphify explain "room-memory-db.ts"
graphify path "home-entry.ts" "room-memory-db.ts"
```

---

### Risk #3 — `src/lib/orchestrator/task-controller.ts` (degree 79)

**Why risky:**
It is the central orchestrator hub connecting `page.tsx`, `evidence-context.ts`, `task-events.ts`, `scaffold-refine.ts`, and `plan-provenance.ts`. Changing it has a massive blast radius across UI rendering, action execution, and memory events. If a scan list forgets to mention it, treat that as a docs/tooling gap only until a real broken flow is confirmed.

**Bugs it could cause:**
- Actions fail to execute or produce wrong side-effects
- Evidence chips don't update after an action
- Scaffold refine flow breaks
- Race conditions during concurrent operations

**Tests likely covering it:**
- `src/lib/orchestrator/task-controller.test.ts` (direct)
- `src/lib/orchestrator/task-machine.test.ts` (indirect)

**Graph query before editing:**
```bash
graphify explain "task-controller.ts"
graphify query "What modules depend on task-controller.ts?"
```

---

### Risk #4 — `src/lib/orchestrator/task-machine.ts` (degree 53)

**Why risky:**
The task state machine is the central orchestrator. It connects: user input → task shape classification → AI operation → persistence → event log → evidence. It imports from `idb.ts`, `task-shape.ts`, `operations.ts`, `evidence-context.ts`, and `plan-provenance.ts`. A wrong state transition silently routes to the wrong AI operation.

**Bugs it could cause:**
- Wrong action type produced from valid input (regression risk after task-shape patch)
- Rescue path never triggered even when primary action fails
- Evidence not attached to the correct action step
- Save point stored at wrong state

**Tests likely covering it:**
- `src/lib/orchestrator/task-machine.test.ts` (direct)
- `src/lib/orchestrator/task-controller.test.ts` (indirect)
- `src/lib/ai/task-shape.test.ts` (indirect — routing preconditions)

**Graph query before editing:**
```bash
graphify explain "task-machine.ts"
graphify path "task-machine.ts" "task-shape.ts"
```

---

### Risk #5 — `src/lib/orchestrator/home-entry.ts` (degree 48)

**Why risky:**
`home-entry.ts` decides which room appears recommended on the sidebar and what the reentry state is. It directly drives the demo reentry story. A ranking bug makes the wrong room appear "recommended" or causes `กลับมาทำต่อ` to point at the wrong task. This is the most demo-critical orchestration function.

**Bugs it could cause:**
- Wrong room highlighted as recommended on sidebar
- Reentry state shows stale or incorrect task context
- `resolveActiveRoomReentryState()` returns a reset instead of a continuation
- Sidebar ranking changes break the "drift reentry" recommendation logic

**Tests likely covering it:**
- `src/lib/orchestrator/home-entry.test.ts` (direct — 4 test cases covering ranking, reentry, recommended state)

**Graph query before editing:**
```bash
graphify explain "home-entry.ts"
graphify query "What tests cover home-entry.ts?"
```

---

### Risk #6 — `src/lib/ai/task-shape.ts` (degree 43)

**Why risky:**
`task-shape.ts` is the signal-based input classifier. It determines which task type a user input maps to — and therefore which AI operation runs. A wrong classification is a silent correctness bug: the app runs, produces output, but the output is for the wrong task type. This was the subject of the recent RC patch (Signal Router v2).

**Bugs it could cause:**
- Proposal/planning input falls through to generic project-status handler
- Estimate/budget input routes incorrectly and produces unhelpful output
- Recovery from rescue produces wrong action type
- Thai-language inputs match English signal patterns incorrectly due to normalisation edge case

**Tests likely covering it:**
- `src/lib/ai/task-shape.test.ts` (direct — extensive signal routing cases)

**Graph query before editing:**
```bash
graphify explain "task-shape.ts"
graphify query "What tests cover task-shape.ts?"
```

---

## Common Infrastructure/Environment Pitfalls

### Pitfall #1 — Dev server points to wrong/unresponsive Ollama port

**Symptom:**
* `make-smaller` (หรือการย่อย step) ไม่เคยสำเร็จเลย, เจอ 503 Service Unavailable / 500 Internal Server Error บ่อย
* หน้า Scaffold เกิด Error หรือ UI ต้องวิ่งเข้าสู่ Deterministic Fallback เสมอโดยไม่มีขั้นตอนย่อยใหม่ถูกสร้างขึ้น

**Root Cause:**
* Dev server ถูกสั่งรันด้วยคำสั่งดีฟอลต์ (เช่น `npm run dev:raw` หรือ `next dev` เปล่าๆ) ซึ่งไม่ได้มีการตั้งค่าตัวแปรสภาพแวดล้อม `OLLAMA_HOST`
* ทำให้ตัวแปร `OLLAMA_HOST` ดีฟอลต์ไปหาพอร์ตมาตรฐาน `11434` ซึ่งเป็นอินสแตนซ์ของ Ollama ที่อาจจะติดขัด/ค้าง หรือไม่ใช่รุ่น CPU-safe (สำหรับเครื่อง Mac ที่มีข้อจำกัดด้านทรัพยากร)
* อินสแตนซ์ของ CPU-safe Ollama ที่เปิดทำงานและเตรียมความพร้อมโมเดลหลัก (`gemma2:2b` / `qwen2.5:3b`) เอาไว้ จริงๆ แล้วเปิดอยู่บนพอร์ต **`11437`**

**Remediation:**
1. หยุดการทำงานของ dev server ปัจจุบัน
2. สั่งรันแอปพลิเคชันด้วยคำสั่งเฉพาะ:
   ```bash
   npm run dev:local-ai
   ```
   *(คำสั่งนี้จะรันสคริปต์ล้างพอร์ต 3000, ตั้งค่า `OLLAMA_HOST=http://127.0.0.1:11437`, ตรวจเช็คความพร้อมของโมเดลผ่าน `ensure-canonical-ollama-runtime.ts` แล้วจึงเริ่ม Next.js dev server เสมอ)*
3. หรือเซ็ต environment variable ด้วยตนเองก่อนรัน:
   ```bash
   export OLLAMA_HOST=http://127.0.0.1:11437
   npm run dev
   ```

---

## Updating the Graph

After any significant code change, refresh the graph:

```bash
graphify update .
```

This is AST-only and does not require an API key. Run it after:
- Adding or removing files
- Renaming exports
- Moving modules between directories
- After any refactor that touches 3+ files

---

## Notes for Future Agents

- The graph is built from AST edges. Trust EXTRACTED edges. Treat INFERRED edges as leads to verify, not facts.
- `graphify path` uses exact node names — use `graphify explain` first to find the correct node name.
- If a query returns too many nodes from `.next-mockup/` or `node_modules`, add `--context call` to filter to call edges only.
- The god nodes from GRAPH_REPORT.md (`AnnotationEditor`, `warn()`, `ConfigNamespace`) are inside PDF.js internals — they are not application code and should not be edited.
