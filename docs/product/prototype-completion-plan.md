# Prototype Completion Plan: Demo-Ready MIND

Captured: 2026-05-15 21:16 +07

This sprint treats MIND as a prototype-ready web app for a computer engineering demo. It does not require real-user validation. The goal is to make the paste-text workflow coherent, resilient, and easy to present end-to-end with browser and synthetic checks only.

## Prototype Goal

MIND should demonstrate one strong product story:

> Paste client/project chaos into one room, get one next move, see why MIND suggested it, recover if the step is wrong, and come back to the same room without feeling reset.

The prototype is done when these demo-critical flows work in the browser without a blocking defect:

- fresh paste-text intake -> `ONE_ACTION`
- `ONE_ACTION` -> confirmed scaffold step
- evidence chip -> visible source/provenance detail
- `ช่วยแก้ก้าวนี้` / `ขอก้าวอื่น` recovery
- room reopen / reentry continuation
- `/business` dashboard shows local usage signal

## Sprint Scope

In scope:

- tighten demo-critical UI and copy around paste-text intake, ONE_ACTION, evidence, rescue, and reentry
- fix visible defects that block the demo path
- run manual and synthetic browser checks
- package a short demo script and known limitations

Out of scope:

- real-user research or real-user KPI gates
- broad OCR/PDF/file-ingestion work
- prompt, retrieval, schema, analytics-contract, or smoke-harness changes unless a proven defect requires a tiny fix
- architecture refactors or moving orchestration layers
- product breadth beyond one client-facing task room

## Current Baseline

Source: browser check on `http://localhost:3000` and `/business`, same local profile, storage not cleared.

Fresh-room intake:

- `is-dump-first-view` class is applied on a newly created room.
- Textarea, `ไปต่อ`, and `แนบไฟล์เพิ่ม` are present.
- Sidebar opacity is `0.72`; `โหมดละเอียด` and `เครื่องมือ` opacity is `0.68`.
- Advanced controls remain clickable.

Current room / evidence:

- Existing action/scaffold view shows evidence chip `ใช้ข้อความที่คุณวางไว้ · 15 พ.ค.`.
- Clicking the evidence chip opens `เหตุผล / ประวัติ`.
- Selected source/provenance text is visible after click.
- Old reentry sidebar label `ใช้ brief ล่าสุด` is not visible; fallback rooms show `กลับมาทำต่อ`.

Dashboard snapshot after refresh:

| Metric | Value |
|---|---:|
| EVENTS | 779 |
| TASKS | 20 |
| AI mismatch | 2% |
| Evidence-backed | 65% |
| Evidence trust | 6% |
| Confirmed action | 29884ms |
| Time to next move median | 29884ms |
| Time to next move p75 | 44313ms |
| Reentry confirm | ไม่มีข้อมูล |
| Reentry time median | ไม่มีข้อมูล |
| Value pulse shown | 0 |
| Value pulse submitted | 0 |

Baseline interpretation:

- Paste-text and evidence-backed flow are demoable.
- Reentry is visible but still needs a clean demo path because dashboard reentry cards have no data.
- Value pulse is not part of the prototype demo story.
- Dashboard metrics are useful as local synthetic/demo signal, not human validation.

## Phase 1: Freeze Scope and Baseline

Status: done for this sprint.

Checklist:

- [x] Read product doctrine and active evidence docs.
- [x] Identify demo-critical flows.
- [x] Separate prototype sprint from real-user useful-beta validation.
- [x] Capture browser and dashboard baseline.
- [x] Record out-of-scope items.

Exit criteria:

- Prototype target is unambiguous.
- Baseline exists for browser behavior and dashboard state.

## Phase 2: Stabilize Core Demo Flows

Objective:

- Ensure the main happy path and recovery path work end-to-end without breaking the demo.

Checklist:

- [ ] Fresh paste-text intake creates or updates a room and reaches `ONE_ACTION`.
- [ ] `ใช้ก้าวนี้` confirms the action and enters scaffold.
- [ ] `ขอก้าวอื่น` can produce an alternate path without a dead end.
- [ ] `ช่วยแก้ก้าวนี้` or rescue path gives the presenter a recoverable story.
- [ ] `ย่อยให้เล็กลงอีก` works or is clearly not used in the demo.
- [ ] Reopening an existing room preserves enough context to continue.
- [ ] Evidence chips remain visible and clickable after scaffold confirmation.

Fix-now defects:

- Broken button, route, state transition, or dashboard read.
- A demo-critical control hidden, disabled, or visually unreachable.
- Evidence source detail not opening after chip click.
- Reentry visible but selecting the room loses task context.

Exit criteria:

- The happy path can be demonstrated without technical caveats.
- No broken button, route, or state transition on the planned demo path.

## Phase 3: Reduce First-Touch Confusion

Objective:

- Make the first impression understandable quickly, without teaching a new mental model.

Checklist:

- [x] Fresh intake visually prioritizes the dump box.
- [x] Advanced controls remain visible but visually quieter.
- [x] Reentry fallback copy says `กลับมาทำต่อ`.
- [x] Evidence chip click reveals source/provenance detail.
- [ ] Review remaining visible labels in the demo path for product-builder language.
- [ ] Check mobile viewport for first-load, evidence, and reentry readability.

Exit criteria:

- A person unfamiliar with MIND can tell what to click next in the demo.
- The main path does not require explanation before the first action appears.

## Persona-Based Prototype Checks

These checks are synthetic proto-persona checks. They are useful for stress-testing the demo flow, not for claiming real-user readiness.

Rules:

- Treat personas as hypothesis-driven test lenses only.
- Do not conclude that real users will think the same way.
- If multiple personas get stuck at the same point, mark it as likely demo-risk / UX-risk.
- If only one persona fails, record it as a possible edge case.

Persona set:

| Persona | Scenario | Observe |
|---|---|---|
| First-time confused user | Opens fresh intake and must infer what to paste/click | textarea / `ไปต่อ` visibility, sidebar competition, reading load |
| Reluctant adapter | Pastes context, then clicks `ขอก้าวอื่น` or `ช่วยแก้ก้าวนี้` | rescue feels useful, labels feel human, flow feels helpful |
| In-a-hurry skimmer | Pastes context and moves fast | happy path completes without reading everything, CTA clarity |
| Evidence-seeking skeptic | Gets an action, then clicks evidence chip | evidence discoverability, source detail clarity, reading burden |
| Returning user | Leaves a room and comes back | `กลับมาทำต่อ` clarity, context retention, reentry path clarity |

Per-persona log template:

```md
### Persona:
- First hesitation point:
- First click path:
- Main task completed: yes / partial / no
- Strong:
- Confusing:
- Demo risk level: none / edge case / likely risk
```

End-of-round summary template:

```md
## Persona Summary
- Repeated strengths:
- Repeated confusion:
- Edge-case-only confusion:
- Improve before demo:
- Defer:
```

Synthetic pass: 2026-05-15

| Persona | Main task completed | First hesitation point | First click path | Strong | Confusing | Demo risk |
|---|---|---|---|---|---|---|
| First-time confused user | yes | Sidebar is still visually present beside the fresh intake | `ห้องใหม่` -> textarea -> `ไปต่อ` | Dump box and primary controls are present immediately | Many existing rooms can make the first screen feel busy | edge case |
| Reluctant adapter | partial | Needs to know that `ช่วยแก้ก้าวนี้` is an escape hatch, not a failure | existing action -> `ช่วยแก้ก้าวนี้` / `ขอก้าวอื่น` visible | Recovery controls are visible near the primary action | Some older labels still appear in scaffold, such as `ไม่ใช่แบบนี้` | likely risk |
| In-a-hurry skimmer | yes | None before first CTA on fresh room | textarea -> `ไปต่อ` | Happy path has a clear first input and button | Existing side panels may distract if presenter starts from a populated room | edge case |
| Evidence-seeking skeptic | yes | Needs evidence chip to reveal detail immediately | evidence chip -> `เหตุผล / ประวัติ` | Source excerpt opens and provenance is visible | Evidence trust depends on presenter pointing to the chip | none |
| Returning user | partial | Dashboard has no reentry-confirm data even though UI labels exist | room list -> `กลับมาทำต่อ` room | Sidebar copy now reads as continuation | Reentry path should be rehearsed with one known room before demo | likely risk |

Synthetic summary:

- Repeated strengths: paste-text entry, evidence reveal, and dashboard local signal are demoable.
- Repeated confusion: populated room list can still compete with first-load focus; recovery/reentry need a rehearsed demo path.
- Edge-case-only confusion: evidence can feel like extra reading if the presenter does not click the chip.
- Improve before demo: rehearse one fixed room for reentry and one fixed recovery branch.
- Defer: real-user preference, value pulse, and OCR/file-heavy proof.

## Phase 4: Demo Package and Handoff

Objective:

- Package the app so it can be presented cleanly as a prototype.

Demo script:

1. Start at fresh room intake.
2. Paste messy client context about a client reply or stale project.
3. Click `ไปต่อ`.
4. Show `ONE_ACTION` and explain that MIND chooses one next move.
5. Click evidence chip and show `เหตุผล / ประวัติ`.
6. Click `ใช้ก้าวนี้` to move into scaffold.
7. Show one recovery path: `ขอก้าวอื่น`, `ช่วยแก้ก้าวนี้`, or `ฉันติดอยู่`.
8. Reopen an older room and point to `กลับมาทำต่อ`.
9. Open `/business` to show local-only usage signals.

Known limitations:

- Real-user validation is not part of this prototype sprint.
- OCR/file-heavy workflows are deferred unless the demo explicitly needs them.
- Reentry dashboard metrics currently show `ไม่มีข้อมูล`; the UI reentry path can still be demonstrated.
- Value pulse has no current local data and should not be central to the demo.
- The dashboard is local instrumentation, not market proof.

Final verification checklist:

- [x] `npm run typecheck:app`
- [x] `git diff --check`
- [x] `npm run smoke:evidence-one-action`
- [x] `npm run smoke:demo-browser`
- [x] Browser: fresh intake first-load hierarchy
- [x] Browser: evidence chip opens source detail
- [ ] Browser: rescue / alternative path has no dead end
- [ ] Browser: reentry / room continuation is demoable
- [x] Browser: `/business` refresh shows non-zero events/tasks

Verification log:

| Check | Result | Note |
|---|---|---|
| `git diff --check` | pass | No whitespace errors. |
| `npm run typecheck:app` | pass | App TypeScript compile check passed. |
| `npm run smoke:evidence-one-action` | pass | `selectionMethod: retrieval`, schema valid, retrieved evidence present. |
| `npm run smoke:demo-browser` | pass | Shell, room switch, studio reflection, and health badge verified. |
| `npm run smoke:rooms` | blocked | Timed out waiting for initial page text in a fresh Playwright context; failure screenshot was a dark blank page. Treat as smoke environment/tooling gap until reproduced in the visible browser. |
| `npm run smoke:studio` | blocked | Same initial page text timeout plus HMR WebSocket console noise on `127.0.0.1:3000`; do not change smoke harness in this sprint. |
| Browser manual: fresh intake | pass | New room applied `is-dump-first-view`; textarea, `ไปต่อ`, and `แนบไฟล์เพิ่ม` were present. |
| Browser manual: evidence reveal | pass | Evidence chip opened `เหตุผล / ประวัติ` and showed selected source text. |
| Browser manual: dashboard | pass | `/business` refresh showed `EVENTS = 779`, `TASKS = 20`. |

## Verification — File Ingestion Pass

Date: 2026-05-16

Scope:

- File ingestion pipeline only: txt/md direct read, PDF/image OCR fallback isolation, ready file source recording into Room Memory.
- No prompt, retrieval schema, analytics contract, OCR provider, or smoke harness changes.

| AC | File used | Result | Notes |
|----|-----------|--------|-------|
| AC-1 txt/md ingestion | `mind-file-ingestion-ac1.md` | pass | Browser drop on fresh room showed `mind-file-ingestion-ac1.md` as read, with extracted text visible in room context. Unit path also verified `.txt`/`.md` direct extraction without OCR. |
| AC-2 next action from txt/md | `scope-brief.txt` / `client-note.md` | pass | `requestAction` test sent retrieved `evidenceContext` with `file:scope-brief`; `recordTaskSourcesInRoomMemory` appended `file:client-note` as `source_added`. Existing evidence smoke still retrieved file evidence. |
| AC-3 OCR fallback | `scanned.pdf`, `scan.png`, `receipt.png` | pass | PDF OCR fallback remains automatic; OCR runtime failure marks only the failed PDF and keeps txt evidence usable. Image OCR success stores text; image OCR failure records `image_ocr_failed` without crashing mixed-file ingestion. |
| AC-4 no regression | app checks + browser checks | pass | `npm run typecheck:app`, `npm run smoke:evidence-one-action`, `npm run smoke:demo-browser`, and browser checks passed. `/business` refresh showed `EVENTS = 798`, `TASKS = 20`. |

Check results:

| Check | Result | Note |
|---|---|---|
| `node --import tsx --test src/lib/room-extraction.server.test.ts` | pass | 10 tests passed, including txt/md isolation and image OCR cases. |
| `node --import tsx --test src/lib/orchestrator/task-events.test.ts` | pass | 10 tests passed, including ready file source memory append and action evidence context. |
| `npm run typecheck:app` | pass | App TypeScript compile check passed. |
| `npm run smoke:evidence-one-action` | pass | `selectionMethod: retrieval`, schema valid, retrieved `file:stale-handoff`. |
| `npm run smoke:demo-browser` | pass | Shell, room switch, studio reflection, and health badge verified. |
| Browser manual: fresh room hierarchy | pass | Fresh room still shows textarea, `ไปต่อ`, and `แนบไฟล์เพิ่ม` as the primary surface. |
| Browser manual: evidence reveal | pass | Clicking evidence chip opens `เหตุผล / ประวัติ` and shows selected source text. |
| Browser manual: txt/md attachment | pass | Dropping `mind-file-ingestion-ac1.md` into a fresh room surfaced file name and extracted text in room context. |
| Browser manual: dashboard | pass | `/business` refresh showed `EVENTS = 798`, `TASKS = 20`; reentry time remains `ไม่มีข้อมูล`. |

Known limitations:

- `smoke:rooms` and `smoke:studio` remain documented as blocked by initial-page timeout in fresh Playwright context; this pass did not touch smoke harness files.
- OCR quality still depends on local Tesseract/pdf rendering availability. When OCR fails, MIND records a clear file-level failure and continues with other readable files.

## Verification — File Ingestion and OCR Scope Pass

Date: 2026-05-16

Scope:

- Room-based file ingestion only: txt/md direct read, PDF text-layer extraction, OCR fallback for PDF/image, file-scoped failure isolation, ready file source append into Room Memory, and summary / next action / save point reuse.
- No prompts, retrieval schema, analytics contract, or smoke harness changes.

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 Room evidence | pass | Browser upload of `mind-brief.txt` and `mind-brief.md` surfaced the files in room context and showed the extracted content in the room evidence/source panel. |
| AC-2 txt/md reliability | pass | `node --import tsx --test src/lib/room-extraction.server.test.ts` verified direct `.txt`/`.md` reads without OCR, and browser room submit showed txt/md content landing in context. |
| AC-3 PDF extraction | pass | `tsx .playwright-mcp/verify-extract.ts` showed `mind-demo-brief-clean.pdf` resolving to `status: "ready"` with extracted text in `sourceText`; the room flow also keeps PDF-backed context visible in the room. |
| AC-4 OCR fallback | pass | `tsx .playwright-mcp/verify-extract.ts` showed `ocr-success.png` resolving to `status: "ready"` with OCR text in room source text. `src/lib/room-extraction.server.test.ts` also covers scanned PDF OCR fallback. |
| AC-5 OCR failure isolation | pass | `tsx .playwright-mcp/verify-extract.ts` showed `mind-brief.txt` stayed `ready` while `ocr-fail.png` became `failed_extraction` with `image_ocr_failed`; `npm run smoke:file-retry` passed and recovered a failed OCR room without blocking the session. |
| AC-6 Summary / next action / save point | pass | `src/lib/orchestrator/task-machine.test.ts` now covers `buildReentryTaskArtifacts` save point creation, `src/lib/orchestrator/studio.test.ts` covers reentry/save-point snapshot behavior, and the browser prototype still shows the next-action buttons after supported file context is present. |
| AC-7 Scope guard | pass | `git diff --check`, `npm run typecheck:app`, `npm run smoke:evidence-one-action`, and `npm run smoke:demo-browser` all passed; no prompt, retrieval schema, analytics contract, or smoke harness changes were made. |

Check results:

| Check | Result | Note |
|---|---|---|
| `node --import tsx --test src/lib/room-extraction.server.test.ts` | pass | txt/md direct reads, PDF OCR fallback, and image OCR handling all passed. |
| `node --import tsx --test src/lib/orchestrator/task-events.test.ts` | pass | Ready file source append into Room Memory and retrieved evidence context passed. |
| `node --import tsx --test src/lib/orchestrator/task-machine.test.ts` | pass | Save point / reentry brief artifact coverage passed. |
| `tsx .playwright-mcp/verify-extract.ts` | pass | Confirmed ready PDF text-layer extraction, ready image OCR extraction, and mixed-file failure isolation in direct extraction. |
| `npm run smoke:file-retry` | pass | Failed OCR room recovered to `ready` without blocking the room flow. |
| `npm run typecheck:app` | pass | App TypeScript compile check passed. |
| `npm run smoke:evidence-one-action` | pass | Evidence retrieval smoke passed and retrieved the expected file evidence. |
| `npm run smoke:demo-browser` | pass | Demo-browser smoke passed with no console errors. |
| `git diff --check` | pass | No whitespace errors. |
| Browser manual: txt/md room attach | pass | `mind-brief.txt` and `mind-brief.md` both surfaced in room context with evidence/source content visible. |
| Browser manual: image/PDF attach | partial | Browser upload surfaced `mind-demo-brief-clean.pdf` and `ocr-success.png` in the room, but the visual room view can lag behind the extraction job; direct extraction tests above confirm the ready path. |
| Browser manual: OCR failure isolation | pass | Mixed attach of `mind-brief.txt` + `ocr-fail.png` kept txt ready while the image stayed failed, and the room continued. |

Notes:

- Browser file ingestion uses the same live room path and keeps the room usable while extraction completes.
- PDF/image readiness can take longer than txt/md in the browser because extraction is asynchronous; direct extraction verification above confirms the ready state for both supported media types.
- No prompt, retrieval schema, analytics contract, or smoke harness changes were introduced in this scope pass.

## Verification — Prototype Usability Cleanup

Date: 2026-05-16

Current prototype primary path:

1. Open MIND at `/`.
2. Create or select a Room.
3. Paste messy client/project context.
4. Attach `txt/md`, PDF, or image file if useful.
5. Click `ไปต่อ`.
6. Confirm that file text/evidence appears in room context and evidence chips.
7. Use the summary / ONE_ACTION / scaffold path to show the next action.

Route and component classification:

| Surface | Status | Decision | Rationale |
|---|---|---|---|
| `/` room shell | required | kept as primary | Owns the prototype proof loop: Room → attach file → evidence → summary/next action. |
| `BrainDumpInput` | required | kept primary | Main intake surface for paste-text and file attachments. |
| `RoomSidebar` | required | kept, visually secondary | Needed to demonstrate Room continuity, but should not compete with intake. |
| `OneAction` / `Scaffold` / `StepEvidencePanel` | required | kept primary after intake | Shows next action and evidence/provenance. |
| `DataReviewPanel` | internal-reference | kept behind `เครื่องมือ` when task exists | Useful for showing source/evidence state during demo, but not the first-click workflow. |
| `TrustOverlay` | internal-reference | kept behind `เครื่องมือ` | Supports “why this” explanation without becoming a primary screen. |
| `ArchiveSearch` / `OverviewOverlay` | internal-reference | hidden from focus-mode utility menu | Not needed for paste-text/file-ingestion proof; still available in power mode. |
| `/business` | internal-reference only | removed from normal main utility menu, available through `?debug=ai` and direct URL | Dashboard is instrumentation, not the user workflow. Page now labels itself as internal/reference only. |
| `/pmf-guide` | internal-reference only | removed from normal main utility menu, available through `?debug=ai` and direct URL | PMF artifact is not part of the prototype use path. Page now labels itself as internal/reference only. |
| AI Ops / Observation | internal-only | remains gated behind explicit debug flags | Useful for development, not a demo workflow. |

Hidden/deferred routes and entry points:

- `/business`: keep for internal dashboard review only; do not present as a workflow step unless the demo explicitly needs local instrumentation.
- `/pmf-guide`: keep as product/reference artifact only; not part of prototype user path.
- Archive / Overview overlays: defer in focus-mode demo because they add navigation choices that do not prove file ingestion or evidence-backed next action.

Rationale:

- The prototype proof should be narrow: Room → attach file → evidence appears → summary/next action.
- Extra dashboards, PMF tools, archive, and overview screens make the app look broader than the prototype promise and create avoidable first-load cognitive load.
- Internal/reference surfaces are preserved for engineering review but hidden from the normal focus-mode path.

Verification log:

| Check | Result | Note |
|---|---|---|
| Prototype entry path audit | pass | Required/internal/deferred surfaces classified above. |
| Main nav cleanup | pass | `/business` and `/pmf-guide` no longer appear in normal focus-mode `เครื่องมือ`; they are gated behind `?debug=ai` as internal references. |
| Internal page labeling | pass | `/business` and `/pmf-guide` now state that they are internal/reference only and not the prototype workflow. |
| Product contract guardrail | pass | No prompts, retrieval schema, analytics contract, OCR setup, or smoke harness changes. |
| `git diff --check` | pass | No whitespace errors. |
| `npm run typecheck:app` | pass | App TypeScript compile check passed. |
| `npm run smoke:evidence-one-action` | pass | `selectionMethod: retrieval`, schema valid, retrieved `file:stale-handoff`. |
| `npm run smoke:demo-browser` | pass | Shell, room switch, studio reflection, and health badge verified. |
| Browser manual: normal utility menu | pass | Focus-mode `เครื่องมือ` shows task context/evidence controls and `วิธีใช้`; it does not show `/business` or `/pmf-guide`. |

Exit criteria:

- The app can be presented end-to-end to a computer engineering audience.
- The boundary between prototype-ready and deferred work is clear.

## Prototype Walkthrough Findings

Date: 2026-05-16

Scope:

- Observation-only synthetic walkthroughs in the live prototype.
- Not real-user validation.
- Primary loop tested: `Room -> attach file -> evidence appears -> summary / next action`.

Walkthrough set:

| Persona | Main task completed | First hesitation point | First click path | Strong | Confusing | Demo risk |
|---|---|---|---|---|---|---|
| First-time confused user | yes | Fresh room still shows room list, `โหมดละเอียด`, `เครื่องมือ`, and an optional value-pulse prompt competing with the intake surface | `ห้องใหม่` -> paste context -> attach file -> `ไปต่อ` | The primary textarea and file attach path are visible and usable quickly | The first screen still feels busier than the proof loop needs | likely risk |
| Reluctant adapter | partial | Action/rescue labels are spread across stages and still feel a bit like product-builder language | paste context -> inspect `ใช้ก้าวนี้` / `ขอก้าวอื่น` / `ช่วยแก้ก้าวนี้` -> try recovery | Escape hatches exist and are visible near the action | The recovery story is not yet one plain "help me continue" path | likely risk |
| Evidence-seeking + returning-user mix | partial | `ดูเหตุผล` is not obviously a "show the source" action; reentry still needs a rehearsed room to feel obvious | attach file -> click evidence/trust area -> inspect source detail -> revisit room | Evidence and extracted file text are present in the room context | Source detail is reachable, but the click-to-meaning path is not obvious enough without explanation | likely risk |

Repeated strengths:

- Paste-text intake plus file attach is understandable enough to demo.
- Evidence appears in the room context and can be traced back to the attached file.
- The prototype can move from intake into a next-action story without a blocking defect.

Repeated confusion:

- First-load clutter still competes with the main intake path.
- Rescue labels are visible, but the escape hatch story is not yet one clean mental model.
- Evidence reveal is present, but the "click -> understand source" behavior is still too indirect.
- Reentry is visible in the sidebar copy, but it still benefits from a rehearsed demo room.

What felt ready for demo:

- Room -> paste context -> attach file -> continue.
- Evidence chips / file-backed context appearing in the room.
- A next-action story that can be explained live.

What still needs prototype polish:

- Reduce first-load competition from sidebar and optional tools.
- Make evidence/source detail feel more obvious at the moment of click.
- Clarify reentry as "continue this task" rather than just a freshness label.

Safe to defer for the demo:

- Value pulse and other post-submission interruptions.
- Broader dashboard exploration beyond the local proof signal.
- OCR/file-heavy edge-case coverage that is not part of the demo story.

Prototype demo note:

- No prompts, retrieval schema, analytics contracts, OCR provider setup, or smoke harness were changed in this walkthrough pass.
- If any of the confusion points above are addressed next, it should be a small usability cleanup pass, not an architecture or contract change.

## Prototype User Walkthrough Runbook

Use this runbook when demoing the current prototype to a person in the room. Keep it short, verbal, and observation-first.

ฉบับใช้งานหน้างานแบบ 1 หน้าอยู่ที่ [prototype-demo-script-th.md](/Users/ark1/Public/MIND/docs/product/prototype-demo-script-th.md)

### Goal

Show one clean story:

`Room -> attach file -> evidence appears -> summary / next action`

### Setup

- Open the prototype at `/`.
- Stay in focus mode.
- Use one prepared sample file plus one messy text prompt.
- Keep `/business` and `/pmf-guide` out of the demo path unless you explicitly need internal reference.

### Demo script

1. Create or select a room.
2. Paste a messy client/project update.
3. Attach one file if it helps the story.
4. Click `ไปต่อ`.
5. Point out the evidence chip and click it.
6. Show the source detail / reason panel.
7. Click `ใช้ก้าวนี้`.
8. If the action feels off, show one recovery path:
   - `ช่วยแก้ก้าวนี้`
   - `ขอก้าวอื่น`
   - `ฉันติดอยู่` or `ไม่ใช่แบบนี้` in scaffold
9. If time allows, reopen the same room and point to `กลับมาทำต่อ`.

### What to watch

- Where the person hesitates first.
- Whether they ask what to click next without prompting.
- Whether evidence makes the suggested next move feel more trustworthy.
- Whether recovery feels like an escape hatch or a detour.
- Whether reentry reads as "continue this task" without explanation.

### Notes to capture

- first hesitation point
- first click path
- main task completed: yes / partial / no
- what felt strong
- what felt confusing
- whether explanation was needed

### Demo success criteria

- The main loop can be shown without a technical caveat.
- Evidence feels real and connected to the room.
- At least one recovery path is believable.
- Reentry can be explained as task continuation, not a new start.

### If the demo gets stuck

- Do not redesign live.
- Do not change prompts, retrieval, OCR, analytics, or smoke harness.
- Rehearse a narrower story:
  - intake
  - evidence click
  - next action

## Synthetic Validation — Demo-Stable Pass

Date: 2026-05-16

Scope:

- Synthetic role-based walkthrough only, not real-user validation.
- Prototype path tested: `Room -> attach file -> evidence appears -> summary / next action / save point`.
- Changes kept to prototype polish: file lifecycle copy, evidence/source wording, and demo notes.
- No prompt, retrieval schema, analytics contract, OCR provider, or smoke harness changes.

Implementation notes:

- File lifecycle copy now separates `กำลังสกัดข้อความ`, `อ่านไฟล์ได้แล้ว`, and `อ่านไม่สำเร็จ`.
- Pending PDF/image extraction is described as expected background work while the Room continues with available context.
- Evidence detail heading now reads `ดูที่มาของก้าวนี้`.
- File-backed evidence continues to use `ใช้ไฟล์ที่แนบไว้`; manual context continues to use `ใช้ข้อความที่คุณวางไว้`.

Synthetic walkthrough results:

| Role | Scenario | What confused them | What still worked | Change made or deferred |
|---|---|---|---|---|
| First-time confused user | Opens a fresh Room, attaches one text file, clicks `ไปต่อ` | Needs the first screen to say which surface matters before internal/reference pages | Textarea, `แนบไฟล์เพิ่ม`, and `ไปต่อ` stay visible as the primary path | Kept internal pages out of the demo path; no new navigation added |
| Reluctant adapter | Pastes context, attaches a file, then checks whether they can recover if the action feels off | Rescue labels still need a live presenter to frame them as escape hatches | `ช่วยแก้ก้าวนี้` / `ขอก้าวอื่น` remain reachable without changing product behavior | Deferred deeper rescue copy work |
| Evidence-seeking user | Clicks an evidence chip before accepting the action | `เหตุผล / ประวัติ` did not directly say that source text is behind the chip | Chip click already opened the details panel and selected the source | Changed reveal heading to `ดูที่มาของก้าวนี้` |
| Returning user | Reopens an existing Room and looks for task continuation | Reentry still depends on having a rehearsed Room with context | Sidebar and reentry surfaces already use `กลับมาทำต่อ` | Kept existing reentry behavior; no route or memory change |
| Impatient operator | Attaches PDF/image and moves quickly while extraction is pending | Pending state could read like the file failed or the app stalled | Room can continue using available text/ready files while extraction finishes | Clarified pending as `กำลังสกัดข้อความ` background work |
| Messy-client-context user | Attaches mixed files where one file fails but text/md context is ready | Needs clear assurance that one failed OCR file does not poison the whole Room | File-scoped failure isolation already works and txt/md evidence remains usable | Failure copy now says the Room continues with other available context |

Operator checklist for demo readiness:

- [ ] Start from `/` in focus mode.
- [ ] Keep `/business` and `/pmf-guide` out of the user-facing path.
- [ ] Attach one txt/md file first to show immediate `อ่านไฟล์ได้แล้ว`.
- [ ] If showing PDF/image, call out `กำลังสกัดข้อความ` as background work.
- [ ] Click an evidence chip and show `ดูที่มาของก้าวนี้`.
- [ ] Confirm `ใช้ก้าวนี้` remains reachable after evidence reveal.
- [ ] Show one recovery path only if the action feels off.
- [ ] Reopen a rehearsed Room and point to `กลับมาทำต่อ`.

Acceptance check:

| AC | Result | Note |
|---|---|---|
| AC-1 first-time path | pass | Primary Room path remains `/` with internal/reference pages out of the main demo story. |
| AC-2 txt/md immediate | pass | Direct text ingestion is unchanged; copy now reinforces ready state as `อ่านไฟล์ได้แล้ว`. |
| AC-3 PDF/image lifecycle | pass | Pending state now reads as background extraction, with ready/failed states distinct. |
| AC-4 OCR failure isolation | pass | Failure copy is file-scoped and states that the Room continues with available context. |
| AC-5 summary / next action / save point | pass | No task-memory or route behavior changed; existing save-point verification still applies. |
| AC-6 scope guard | pass | No prompt, retrieval schema, analytics contract, OCR provider, or smoke harness changes in this pass. |
