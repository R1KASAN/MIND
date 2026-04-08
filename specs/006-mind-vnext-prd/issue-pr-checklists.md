# MIND Issue / PR Checklists

Updated: 2026-04-08

## Purpose

เอกสารนี้แปลง `ticket-ready-sprints.md` ให้กลายเป็น execution checklist ที่ engineer หยิบไปเปิด issue หรือทำ PR ต่อได้ทันที โดยยังยึด MIND doctrine เดิม:

- local-first
- text-first, files-optional
- one task at a time
- honest failure
- rescue + reentry เป็น differentiator

## How To Use This Doc

- ใช้เอกสารนี้ตอนจะเปิด issue หรือเริ่ม PR
- ทำทีละ ticket ตามลำดับ priority
- ถ้า ticket ไหนมี dependency ให้ทำ ticket ต้นทางก่อน
- ระหว่างทำงาน ให้ยึด `Do not change` เป็น guardrail กัน scope drift

## Current Priority

1. `RH-*` Rescue Hardening
2. `EG-*` Eval Gates & Model Budgeting
3. `DP-*` Demo Hardening / Launch Polish

## Sprint 1 — Rescue Hardening

### RH-01 — Rescue route benchmark and baseline

- Issue Title: `RH-01 Rescue route benchmark and baseline`
- Problem: `rescue` readiness ต่ำสุดและยังไม่มี benchmark ที่แข็งเท่า `action`
- PR Goal: เพิ่ม benchmark route-level สำหรับ `/api/ai/rescue` พร้อมตัวเลข baseline ที่ใช้ตัดสินใจ tuning ต่อได้
- Implementation checklist:
  - [ ] สร้าง `scripts/benchmark-rescue-route.ts`
  - [ ] ใช้ pattern เดียวกับ `scripts/benchmark-action-route.ts`
  - [ ] เพิ่ม fixture อย่างน้อยสำหรับ `too_big`, `missing_context`, `low_energy`
  - [ ] ให้ script สรุป `first-pass`, `repair`, `validation-failure`, `median latency`
  - [ ] เพิ่ม npm script ใน `package.json`
- Verification checklist:
  - [ ] รัน benchmark `rescue` ได้จาก npm script
  - [ ] report แสดง `first-pass`, `repair`, `validation-failure`, `median latency`
  - [ ] ใช้งานกับ `qwen2.5:3b` local route ได้จริง
- Files in scope:
  - `scripts/benchmark-rescue-route.ts`
  - `package.json`
  - `src/app/api/ai/rescue/route.ts`
- Do not change:
  - อย่าเปลี่ยน schema ของ rescue response
  - อย่าเปลี่ยน model หลักใน ticket นี้
  - อย่าสร้าง benchmark framework ใหม่ทั้งระบบ
- Done when:
  - มี baseline ของ rescue ที่เทียบกับ action ได้ในรูปแบบเดียวกัน

### RH-02 — Rescue 503 reduction pass

- Issue Title: `RH-02 Rescue 503 reduction pass`
- Problem: ถ้า `503` ยังโผล่บ่อย ผู้ใช้จริงจะตีความว่า MIND ไม่นิ่ง แม้งานจะไม่หาย
- PR Goal: ลด transient rescue failure โดยใช้ route tuning และ retry/backoff แบบจำกัดขอบเขต
- Implementation checklist:
  - [ ] ใช้ผลจาก `RH-01` เลือกจูน `num_predict`, timeout, repair budget
  - [ ] ทบทวน silent retry ให้จำกัดเฉพาะ rescue และ transient failure
  - [ ] ปรับ prompt เฉพาะกรณีที่ benchmark บอกว่าจำเป็น
  - [ ] รักษา behavior เดิมของ `action`, `scaffold`, `reentry`
- Verification checklist:
  - [ ] benchmark รอบใหม่แสดงว่า repair/503 แย่ลงไม่ได้
  - [ ] retry ยังเป็น silent retry เฉพาะ transient failure
  - [ ] browser smoke หลักไม่ regress
- Files in scope:
  - `src/app/api/ai/rescue/route.ts`
  - `src/lib/orchestrator/task-events.ts`
  - `src/lib/ai/operation-prompts.ts`
- Do not change:
  - อย่าสร้าง generic retry framework
  - อย่าเปิด durable workflow migration
  - อย่า revert honest failure
- Done when:
  - rescue transient failure ลดลงหรืออย่างน้อยอธิบายได้จาก benchmark ว่าทำไมยังคงเดิม

### RH-03 — Safe-failure rescue copy hardening

- Issue Title: `RH-03 Safe-failure rescue copy hardening`
- Problem: honest failure เป็น product promise ถ้าข้อความไม่ชัด ผู้ใช้จะคิดว่าข้อมูลหาย
- PR Goal: ทำให้ failure copy ของ rescue บอกชัดว่าบริบทยังอยู่และลองใหม่ได้
- Implementation checklist:
  - [ ] audit ข้อความ fallback ของ `RESCUE`
  - [ ] ปรับ copy ให้สื่อว่า `งานยังอยู่`
  - [ ] ปรับ copy ให้ยังคงโทน MIND ไม่เป็น chatbot apology
  - [ ] ตรวจว่าหน้า rescue loading/failure ไม่ขัดกับ doctrine
- Verification checklist:
  - [ ] ทุก failure state ของ rescue มีข้อความสื่อว่า task/context ยังอยู่
  - [ ] ไม่มี state ไหนทำให้ user ตีความว่า dump หาย
  - [ ] copy ยังเข้ากับ rescue/reentry narrative เดิม
- Files in scope:
  - `src/components/Recovery/Rescue.tsx`
  - `src/lib/orchestrator/task-controller.ts`
- Do not change:
  - อย่าเพิ่ม rescue mode ใหม่
  - อย่าเปลี่ยน route contract
- Done when:
  - rescue fail แล้วผู้ใช้ควรตีความว่า “งานยังอยู่” ไม่ใช่ “ระบบพัง”

### RH-04 — Rescue failure smoke coverage

- Issue Title: `RH-04 Rescue failure smoke coverage`
- Problem: ถ้าไม่มี smoke เฉพาะ failure path rescue จะ regress ง่ายมาก
- PR Goal: เพิ่ม smoke ที่ล็อก failure copy และ retry path ของ rescue
- Implementation checklist:
  - [ ] เพิ่ม assertion สำหรับ rescue fail / retry / safe fallback
  - [ ] ทำให้ smoke fail เมื่อ failure copy หาย
  - [ ] ทำให้ smoke fail เมื่อ retry path กลายเป็น blank หรือ lost context
  - [ ] รักษา flow desktop + reentry เดิม
- Verification checklist:
  - [ ] `scripts/browser-smoke-task-flow.ts` ครอบคลุม rescue fail ชัดขึ้น
  - [ ] smoke เดิมยังผ่าน
  - [ ] ไม่มี false positive จาก state ที่ยัง loading อยู่
- Files in scope:
  - `scripts/browser-smoke-task-flow.ts`
  - `src/components/Recovery/Rescue.tsx`
- Do not change:
  - อย่าเพิ่ม visual regression suite เต็มรูปแบบ
  - อย่าขยายไปแตะ unrelated flows
- Done when:
  - regression ของ rescue failure path ถูกจับได้จาก smoke โดยตรง

### RH-05 — Rescue telemetry separation

- Issue Title: `RH-05 Rescue telemetry separation`
- Problem: ตอนนี้อ่าน health ของ rescue ยากเกินไปเมื่อเทียบกับ action
- PR Goal: ทำให้ rescue-specific success/failure อ่านได้ชัดขึ้นจาก telemetry เดิม
- Implementation checklist:
  - [ ] แยก field/log ที่ช่วยดู `first-pass`, `repair`, `fallback`, `endpoint_failed`
  - [ ] รักษา logging แบบ local-first ไม่เพิ่ม analytics service ใหม่
  - [ ] ทำให้เทียบก่อน-หลัง tuning ได้ง่าย
- Verification checklist:
  - [ ] log แยก rescue health ได้ชัดขึ้น
  - [ ] ไม่มี external analytics dependency เพิ่ม
  - [ ] ใช้งานร่วมกับ benchmark/smoke ได้
- Files in scope:
  - `src/lib/instrumentation.ts`
  - `src/lib/ai/operation-telemetry.ts`
  - `src/lib/orchestrator/task-events.ts`
- Do not change:
  - อย่าสร้าง dashboard ใหม่ทั้งชุด
  - อย่าส่งข้อมูลออกนอกเครื่อง
- Done when:
  - ทีมดู log แล้วบอกได้ว่าปัญหาของ rescue อยู่ที่ pass ไหน

## Sprint 2 — Eval Gates & Model Budgeting

### EG-01 — Benchmark coverage for all AI operations

- Issue Title: `EG-01 Benchmark coverage for all AI operations`
- Problem: benchmark ชัดจริงแค่ `action` ทำให้ตัดสินใจจากข้อมูลไม่ครบ
- PR Goal: ทำ route-level benchmark ครบทุก operation หลัก
- Implementation checklist:
  - [ ] เพิ่ม benchmark สำหรับ `intake`
  - [ ] เพิ่ม benchmark สำหรับ `scaffold`
  - [ ] เพิ่ม benchmark สำหรับ `reentry`
  - [ ] ใช้ format summary เดียวกันทุก script
  - [ ] เพิ่ม npm scripts ที่เรียกใช้งานได้ตรง
- Verification checklist:
  - [ ] ทุก operation มี benchmark script ของตัวเอง
  - [ ] fixture set representative กับ use case ของ MIND
  - [ ] output เทียบกันได้ข้าม route
- Files in scope:
  - `scripts/benchmark-action-route.ts`
  - `scripts/benchmark-*.ts`
  - `package.json`
- Do not change:
  - อย่าสร้าง benchmark service ภายนอก
  - อย่าเปลี่ยน contract ของ operation เพื่อความสะดวกในการวัด
- Done when:
  - ทีมมี benchmark baseline ครบทั้ง lifecycle หลัก

### EG-02 — Operation scorecard and thresholds

- Issue Title: `EG-02 Operation scorecard and thresholds`
- Problem: ถ้าไม่มี gate ตัวเลข จะไม่รู้ว่าอะไร “พอสำหรับ demo”
- PR Goal: นิยาม threshold ราย route และบันทึกไว้ในเอกสารชุดเดียวกัน
- Implementation checklist:
  - [ ] กำหนด threshold ขั้นต่ำของ `latency`, `repair`, `validation-failure` ต่อ route
  - [ ] ระบุชัดว่าอะไรถือว่า `pass for demo`
  - [ ] ผูก threshold เข้ากับ benchmark outputs จริง
  - [ ] สะท้อน threshold ลงในเอกสาร readiness/checklist
- Verification checklist:
  - [ ] ทุก operation มี threshold ขั้นต่ำ
  - [ ] เอกสารตอบได้ชัดว่า route ไหนยังไม่ผ่าน
  - [ ] threshold ใช้ซ้ำได้ตอน rerun benchmark
- Files in scope:
  - `specs/006-mind-vnext-prd/health-check-vnext-readiness.md`
  - `specs/006-mind-vnext-prd/ticket-ready-sprints.md`
  - `specs/006-mind-vnext-prd/checklists/requirements.md`
- Do not change:
  - อย่า auto-block CI ในรอบนี้
  - อย่าแต่ง threshold จาก intuition ล้วนโดยไม่อิง benchmark
- Done when:
  - readiness ของแต่ละ route ถูกอธิบายด้วยตัวเลขที่ใช้ซ้ำได้

### EG-03 — Model budget tuning pass

- Issue Title: `EG-03 Model budget tuning pass`
- Problem: `qwen2.5:3b` ยังต้อง prove ให้ชัดว่าเหมาะกับแต่ละ phase แค่ไหน
- PR Goal: ให้แต่ละ route มี budget ที่อธิบายได้จาก benchmark ไม่ใช่ใช้ค่าเหมารวม
- Implementation checklist:
  - [ ] อ่าน benchmark ทุก route ก่อนเลือกค่าใหม่
  - [ ] ปรับ `num_predict` / timeout ราย route โดยเฉพาะ `rescue` และ `reentry`
  - [ ] รักษา env-driven tuning pattern ที่ใช้กับ `action`
  - [ ] เช็กว่า smoke หลักยังผ่าน
- Verification checklist:
  - [ ] แต่ละ route มี default budget ที่อธิบายได้จาก benchmark
  - [ ] route เสี่ยงสูงไม่ใช้ budget เดียวกับ route ที่นิ่งอยู่แล้ว
  - [ ] smoke หลักไม่ regress
- Files in scope:
  - `src/app/api/ai/action/route.ts`
  - `src/app/api/ai/scaffold/route.ts`
  - `src/app/api/ai/rescue/route.ts`
  - `src/app/api/ai/reentry/route.ts`
- Do not change:
  - อย่าเปิด model orchestration หลายตัวในรอบนี้
  - อย่าเปลี่ยน AI schema
- Done when:
  - default budgets สะท้อนข้อมูลจริง ไม่ใช่ค่ากลางแบบเดา

### EG-04 — Evaluation summary page for the team

- Issue Title: `EG-04 Evaluation summary page for the team`
- Problem: คนในทีมยังต้องไล่หลาย script เองกว่าจะเห็นภาพรวม
- PR Goal: ทำหน้า summary เดียวที่ตอบได้ว่า route ไหนนิ่งแล้ว route ไหนยังเสี่ยง
- Implementation checklist:
  - [ ] สรุป benchmark ล่าสุดของทุก route
  - [ ] เขียน recommendation ว่า route ไหนควร tune prompt vs model
  - [ ] เขียน risk list แบบ founder/engineer อ่านเข้าใจตรงกัน
- Verification checklist:
  - [ ] มีหน้าเดียวที่อ่านแล้วเห็นภาพรวมของ lifecycle
  - [ ] recommendation ไม่ขัดกับ health check เดิม
  - [ ] ใช้ภาษาที่ non-technical ก็อ่านได้
- Files in scope:
  - `specs/006-mind-vnext-prd/health-check-vnext-readiness.md`
  - `specs/006-mind-vnext-prd/founder-demo-brief.md`
- Do not change:
  - อย่าสร้าง observability dashboard cloud
  - อย่าเขียน summary ที่ขัดกับ benchmark ล่าสุด
- Done when:
  - ทีมใช้หน้าเดียวนี้ประกอบการตัดสินใจ sprint ถัดไปได้

## Sprint 3 — Demo Hardening / Launch Polish

### DP-01 — Rare-state UX audit

- Issue Title: `DP-01 Rare-state UX audit`
- Problem: small cohort demo จะเสียความเชื่อใจทันทีถ้า rare-state ยังดูงง
- PR Goal: ให้ rare-state หลักทุกหน้าตอบได้ว่าคืออะไรและต้องทำอะไรต่อ
- Implementation checklist:
  - [ ] audit `DUMP_ENTRY`
  - [ ] audit `BOUNCE_BACK`
  - [ ] audit `MANUAL_FALLBACK`
  - [ ] audit `RESCUE fail`
- [ ] audit `post-complete reset`

### Phase 5 gate before demo / release

- ใช้ `npm run gate:phase5` เป็น command เดียวก่อน demo / release
- ถ้า command นี้ fail ที่ step ไหน ให้ถือว่า `ห้ามปล่อย` จนกว่าจะรู้สาเหตุและแก้ regression
- ใช้ `specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md` เป็นคำอธิบาย canonical ของ stop-ship rule
- Verification checklist:
  - [ ] ทุก state ตอบได้ว่า “ตอนนี้คืออะไร”
  - [ ] ทุก state ตอบได้ว่า “ต้องทำอะไรต่อ”
  - [ ] ไม่มี state ไหน revive งานเก่าโดยไม่ตั้งใจ
- Files in scope:
  - `src/app/page.tsx`
  - `src/components/BrainDump/Fallback.tsx`
  - `src/components/Recovery/BounceBack.tsx`
- Do not change:
  - อย่า redesign visual language ใหม่ทั้งระบบ
  - อย่า drift ไปเป็น planner UX
- Done when:
  - rare-state ที่เจอบ่อยในการ demo ไม่ทำให้คนถามว่า “แล้วต้องทำอะไรต่อ”

### DP-02 — Clean reset and completion confidence pass

- Issue Title: `DP-02 Clean reset and completion confidence pass`
- Problem: ถ้าจบงานแล้ว state ยังหลอน จะทำลาย task continuity ของ MIND โดยตรง
- PR Goal: ล็อกให้ `complete -> DUMP_ENTRY -> reload` สะอาดและไม่ revive task done
- Implementation checklist:
  - [ ] ทบทวน completion reset path
  - [ ] ทบทวน normalize/hydrate ของ session หลัง done
  - [ ] เพิ่ม smoke/assertion ที่ครอบคลุม flow นี้ตรง ๆ
- Verification checklist:
  - [ ] complete แล้วกลับ dump entry สะอาดจริง
  - [ ] reload แล้วไม่ revive task ที่ done
  - [ ] smoke ครอบคลุม path นี้ชัดเจน
- Files in scope:
  - `src/lib/orchestrator/task-controller.ts`
  - `src/lib/store/idb.ts`
  - `scripts/browser-smoke-task-flow.ts`
- Do not change:
  - อย่าเพิ่ม undo complete flow
  - อย่าเก็บ task ที่ done ไว้เป็น active state
- Done when:
  - ผู้ใช้จบงานแล้วมั่นใจได้ว่าเคสนี้ปิดจริง

### DP-03 — ONE_ACTION and DecisionBoard polish pass

- Issue Title: `DP-03 ONE_ACTION and DecisionBoard polish pass`
- Problem: เส้นทางนี้คือหัวใจ narrative ถ้ายังรกจะกด adoption
- PR Goal: ลด noise เพิ่มเติมโดยไม่เปลี่ยน flow หลัก
- Implementation checklist:
  - [ ] ตรวจจาก user test/feedback ว่าคนยังจมกับส่วนรองไหม
  - [ ] ลด visual noise ของส่วนรองเท่าที่จำเป็น
  - [ ] รักษา `reply draft` ให้เป็น secondary surface
  - [ ] รักษา `DecisionBoard` ให้เป็น alternate first move ไม่ใช่ settings
- Verification checklist:
  - [ ] ผู้ใช้ใหม่บอก CTA หลักได้ภายในไม่กี่วินาที
  - [ ] reply draft ยังเป็น secondary surface
  - [ ] decision board ยังอ่านเป็น “อีกทาง” ไม่ใช่ “หน้าตั้งค่า”
- Files in scope:
  - `src/components/ActionScaffold/OneAction.tsx`
  - `src/components/ActionScaffold/DecisionBoard.tsx`
- Do not change:
  - อย่าเพิ่ม route ใหม่
  - อย่าเพิ่ม feature ใหม่ที่ไม่เกี่ยวกับ hierarchy
- Done when:
  - ONE_ACTION พา user ไปข้างหน้าได้เร็วโดยไม่ต้องอธิบาย

### DP-04 — Demo script and founder handoff

- Issue Title: `DP-04 Demo script and founder handoff`
- Problem: ถ้าจะ demo ให้ advisor หรือผู้ใช้กลุ่มเล็ก ต้องมี narrative ที่คงที่และส่งต่อได้
- PR Goal: ทำ demo script, checklist, และ founder handoff ให้ใช้เป็นชุดเดียวกัน
- Implementation checklist:
  - [ ] อัปเดต demo script ให้เล่า pain -> next move -> scaffold -> rescue -> reentry
  - [ ] เชื่อม founder brief กับ checklist ที่ใช้เก็บ feedback
  - [ ] ทำให้เอกสารชุดนี้หยิบใช้ได้โดยไม่ต้องเปิด spec ใหญ่
- Verification checklist:
  - [ ] มี flow เดโมสั้นที่เล่า core lifecycle ได้
  - [ ] founder ใช้ brief นี้เล่าได้โดยไม่ต้องเปิด spec ใหญ่
  - [ ] checklist ใช้เก็บ feedback คนจริงได้
- Files in scope:
  - `specs/006-mind-vnext-prd/first-run-demo-checklist.md`
  - `specs/006-mind-vnext-prd/founder-demo-brief.md`
- Do not change:
  - อย่าขยายเป็น sales deck หรือ public marketing page
  - อย่าเปลี่ยน doctrine เพื่อให้ pitch ดูกว้างขึ้น
- Done when:
  - founder และ engineer ใช้ชุดเอกสารเดียวกันในการ demo และเก็บ signal ได้

## Guardrails For Every Ticket

- ห้าม drift ไปเป็น planner/task-manager breadth
- ห้าม drift ไปเป็น team workspace
- ห้ามทำ file-manager เป็น primary UX
- ห้ามเปิด durable workflow migration ใน wave นี้
- `page.tsx` ต้องไม่ดูด orchestration complexity เพิ่ม
- งาน benchmark/smoke ต้อง reuse pattern เดิมก่อนสร้าง framework ใหม่
