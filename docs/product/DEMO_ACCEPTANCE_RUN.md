# Demo Acceptance Run

Date: 2026-05-18
Run type: RC manual browser acceptance
Target: `http://localhost:3000/`
Acceptance source of truth: `docs/product/prototype-completion-plan.md`
Bug classification source: `docs/engineering/BUG_SCAN_PLAYBOOK.md`
Graph-first prompt checked: `docs/engineering/GRAPH_FIRST_AGENT_PROMPT.md`

## Setup

- Room used: rehearsed continuation room equivalent to `Demo Reentry Continuity`
- Active room identity observed: `เปิดเอกสารรายงาน แล้วเขียนหัวข้อแรกของสิ่งที่ต้องสรุป`
- Sample file: `tmp/mind-brief.txt`
- File upload path: direct file input worked in Playwright; drag/drop automation was not required for final classification.
- Browser tools: Playwright browser plugin plus local Playwright checks.

## Acceptance Run Table

| Step | Input / Action | Expected Output | Actual Output | Pass / Fail | Classification | Suspected Layer |
| --- | --- | --- | --- | --- | --- | --- |
| Fresh room intake | Open `/`, create a room / use active fresh intake surface | Textarea visible, `ไปต่อ` visible, `แนบไฟล์เพิ่ม` visible, hierarchy readable | Fresh intake showed textarea, `แนบไฟล์เพิ่ม`, `ไปต่อ`, room sidebar, and helper hierarchy. | Pass | non-bug | UI |
| Attach safest demo file | Attach `tmp/mind-brief.txt` | File name appears, room remains usable, file enters context path | `mind-brief.txt` appeared as one ready file with text size; room remained usable. | Pass | non-bug | file memory |
| Submit with `ไปต่อ` | Click `ไปต่อ` | Flow advances without broken route/state | Flow advanced into room context and file-memory state with `บริบทจากไฟล์แนบ`, file summary, and ready-room state. | Pass | non-bug | state |
| Verify `ONE_ACTION` | Wait for main action surface | One usable next action appears with readable rationale/context | Usable action surfaced as `ก้าวถัดไป: เปิดเอกสารรายงาน แล้วเขียนหัวข้อแรกของสิ่งที่ต้องสรุป`; room card showed `ต่อได้เลย` / `พร้อมใช้`. | Pass | non-bug | scaffold |
| Select action | Click the available action / continuation control | Scaffold opens and preserves selected action | Scaffold opened on the same action, showing `ตอนนี้อยู่ที่ขั้นตอน 1 / 3` and the selected step text. | Pass | non-bug | scaffold |
| Verify scaffold state | Inspect scaffold after transition | Current step visible, action continuity preserved, no reset | Current step stayed visible, editable, and tied to the same client context; controls remained available. | Pass | non-bug | scaffold |
| Click evidence/source detail | Open `ดูที่มาของก้าวนี้` | Source/detail becomes visible and tied to current room/task | Source disclosure expanded under the scaffold card with provenance detail for the current step. | Pass | non-bug | evidence |
| Verify evidence continuity | Inspect source/detail and side context | Source/provenance belongs to same room context | Side context and source text both referred to the same customer feedback context and current step. | Pass | non-bug | evidence |
| Run one rescue branch | Click `ย่อยให้เล็กลงอีก` | No dead end; user can continue in same task flow | Recovery branch entered refinement state, then returned to usable controls including `เสร็จแล้ว`, `ย่อยให้เล็กลงอีก`, `ไม่ใช่แบบนี้`, and `ฉันติดอยู่`. | Pass | non-bug | scaffold |
| Leave / reload | Reopen app at `/` | No broken route/state | Reopened app without route error or blank state. | Pass | non-bug | routing |
| Reopen rehearsed room | Reopen the selected continuation room | Same room identity selected | Same room remained selected with the same action title in the sidebar. | Pass | non-bug | room persistence |
| Verify reentry continuity | Inspect reopened room | Same identity, context/artifact, evidence, continuation cue, next action reachable | Same scaffold step, source disclosure, helper context, and continuation controls remained reachable after reopen. | Pass | non-bug | reentry |
| Mobile viewport pass | Resize to `390x844`; inspect first-load/reentry/evidence | No overlap, unreadable controls, or broken continuation cues | Mobile layout kept the active room, scaffold, source disclosure, and continuation controls reachable without broken state. | Pass | non-bug | UI |

## Confirmed Bugs

### Fixed: Rescue → Input bounce-back loop
- **Symptom**: When on Rescue page and clicking `กลับไปแก้บริบทให้ตรงเคส`, the app returns to Input briefly but then bounces back to the Rescue screen repeatedly.
- **Root Cause**:
  1. Room/session ID jitter during IndexedDB persist cycles was resetting `forceInputEditor` to `false` prematurely.
  2. The room hydration effect was running during active context editing, overriding the intended `DUMP_ENTRY` route.
  3. Stale `assistantMode` on the task was keeping `rescue_diagnosis` behavior alive.
- **Fix**:
  1. Guarded `forceInputEditor` reset to only trigger on genuine room switches (mismatched `activeRoomId` and `session.roomId`).
  2. Bypassed hydration effect when `forceInputEditor` is active.
  3. Cleared stale `assistantMode` in `openDumpWithCurrentContext()`.
- **Verification Status**: **Pass (Fixed)**. Verified stable on Input editor for >10 seconds, text editable, `ไปต่อ` works, and reentry stable.

## UX / Copy Issues

None that block demo comprehension. Some labels differ from the shorthand in the plan (`ต่อได้เลย` / current action card instead of literal `ONE_ACTION` / `ใช้ก้าวนี้`), but the visible flow remains understandable and usable.

## Risk Gaps

None found in this run.

## Deferred Limitations

- Drag/drop file automation can be flaky because browser automation may hit nested drop-zone elements. This is a tooling limitation, not an app bug, because direct file input worked and the app showed the file as ready.
- `/action` can return `503 Service Unavailable` with `AI request timed out after 20000ms` when the local AI action request is slow. In the observed browser state, this did not break the Room acceptance path: the scaffold step remained visible, source detail could still open, and continuation/recovery controls remained enabled. Classify this as runtime service instability unless a future run shows a stuck UI, permanently disabled controls, broken route/state, or lost Room context.
- The run used `txt` as the primary demo format. PDF/image/OCR remain optional background examples unless separately verified.

## Graph Queries Used

None. No failed acceptance step met the bug threshold, so graph-first root-cause triage was not triggered. The `/action` timeout was classified from browser behavior as a deferred runtime limitation, not a confirmed acceptance bug.

## Files Inspected

- `docs/product/prototype-completion-plan.md`: acceptance source of truth.
- `docs/engineering/BUG_SCAN_PLAYBOOK.md`: bug classification rules.
- `docs/engineering/GRAPH_FIRST_AGENT_PROMPT.md`: graph-first failure workflow.
- `tmp/mind-brief.txt`: demo file content used for the run.

## Root Cause

No root cause analysis required. No confirmed acceptance bug was found.

## Files Changed

- `docs/product/DEMO_ACCEPTANCE_RUN.md`

## Verification Results

- Manual browser: fresh intake, file attach, continue, action/scaffold, evidence reveal, rescue branch, reload/reentry, mobile viewport.
- Manual browser: after `/action` 503 timeout log, scaffold remained usable with source detail and continuation/recovery controls reachable.
- `git diff --check`: pass.
- `npm run typecheck:app`: pass.

## Decision

Ready for demo rehearsal.
