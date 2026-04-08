# MIND Ticket-Ready Sprints

Updated: 2026-04-08

## Goal

เปลี่ยนผลสรุปจาก `health-check-vnext-readiness.md` ให้กลายเป็น execution backlog ที่พร้อมแตกงานต่อได้ทันที โดยยังยึด MIND doctrine เดิม:

- local-first
- text-first, files-optional
- one task at a time
- honest failure
- rescue + reentry เป็น differentiator

## Current Readiness Snapshot

- Overall progress: **70%**
- Product/UX readiness: **80%**
- Engineering/architecture readiness: **74%**
- AI behavior readiness: **60%**

สถานะใช้งาน:

- พร้อมสำหรับ `demo / closed beta` ขนาดเล็ก
- ยังไม่พร้อมสำหรับ launch กว้าง
- blocker ใหญ่สุดคือ `rescue` และความไม่สมดุลของ eval coverage ราย route

## Priority Order

1. Rescue Hardening
2. Eval Gates & Model Budgeting
3. Demo Hardening / Launch Polish

Execution checklists live in `specs/006-mind-vnext-prd/issue-pr-checklists.md`

Strategic follow-on for after this wave:

- `specs/006-mind-vnext-prd/multi-room-risk-spec.md`
- `specs/006-mind-vnext-prd/multi-room-phased-roadmap.md`

Multi-room เป็น post-Studio architecture decision ไม่ใช่งานที่ควรตัดคิว `rescue` และ `eval gates`

## Sprint 1 — Rescue Hardening

Execution checklists live in `specs/006-mind-vnext-prd/issue-pr-checklists.md`

### RH-01

- ID: `RH-01`
- Title: Rescue route benchmark and baseline
- Why now: `rescue` เป็นจุดที่ readiness ต่ำสุดและยังไม่มี benchmark ที่แข็งเท่า `action`
- Scope: เพิ่ม benchmark script สำหรับ `/api/ai/rescue`, ใช้ fixture เดิมแนว `too_big`, `missing_context`, `low_energy`, สรุป `first-pass`, `repair`, `validation-failure`, `latency`
- File targets: `scripts/benchmark-rescue-route.ts`, `package.json`, `src/app/api/ai/rescue/route.ts`
- Acceptance criteria:
  - มี script รัน benchmark `rescue` ได้จาก npm script
  - report ออกตัวเลข `first-pass`, `repair`, `validation-failure`, `median latency`
  - ใช้งานกับ `qwen2.5:3b` local route ได้จริง
- Dependencies: ใช้ pattern เดียวกับ `scripts/benchmark-action-route.ts`
- Out of scope: เปลี่ยน model หลัก, เปลี่ยน schema ของ rescue response

### RH-02

- ID: `RH-02`
- Title: Rescue 503 reduction pass
- Why now: ถ้า `503` ยังโผล่บ่อย ผู้ใช้จริงจะตีความว่า MIND ไม่นิ่ง แม้งานจะไม่หาย
- Scope: จูน `num_predict`, timeout, repair budget, และ retry/backoff เฉพาะ rescue โดยอิง benchmark จาก `RH-01`
- File targets: `src/app/api/ai/rescue/route.ts`, `src/lib/orchestrator/task-events.ts`, `src/lib/ai/operation-prompts.ts`
- Acceptance criteria:
  - rescue retry ยังเป็น silent retry เฉพาะ transient failure เท่านั้น
  - benchmark รอบใหม่แสดงว่า repair/503 แย่ลงไม่ได้
  - ไม่มี regression ใน `action`, `scaffold`, `reentry`
- Dependencies: `RH-01`
- Out of scope: generic retry framework, durable workflow migration

### RH-03

- ID: `RH-03`
- Title: Safe-failure rescue copy hardening
- Why now: honest failure เป็น product promise โดยตรงของ MIND
- Scope: audit และปรับข้อความ fallback/failure ของ `RESCUE` ให้ชัดว่า task/context ยังอยู่ครบ และลองใหม่ได้
- File targets: `src/components/Recovery/Rescue.tsx`, `src/lib/orchestrator/task-controller.ts`
- Acceptance criteria:
  - ทุก failure state ของ rescue มีข้อความสื่อว่า `งานยังอยู่`
  - ไม่มี state ไหนทำให้ user ตีความว่า dump หาย
  - copy ไม่ drift ไปเป็น generic chatbot apology
- Dependencies: none
- Out of scope: เพิ่ม recovery mode ใหม่

### RH-04

- ID: `RH-04`
- Title: Rescue failure smoke coverage
- Why now: ถ้าไม่มี smoke เฉพาะ failure path จะ regress ง่ายมาก
- Scope: เพิ่ม browser smoke สำหรับ rescue fail / retry / safe fallback copy
- File targets: `scripts/browser-smoke-task-flow.ts`, `src/components/Recovery/Rescue.tsx`
- Acceptance criteria:
  - smoke fail ถ้า rescue failure copy หาย
  - smoke fail ถ้า retry path ทำให้ blank state หรือ lost context
  - smoke ยังผ่านทั้ง desktop และ reentry flow เดิม
- Dependencies: `RH-03`
- Out of scope: visual regression suite เต็มรูปแบบ

### RH-05

- ID: `RH-05`
- Title: Rescue telemetry separation
- Why now: ตอนนี้อ่าน success/failure ของ rescue ยากเกินไปเมื่อเทียบกับ action
- Scope: แยก event/telemetry ที่พอดู rescue-specific health ได้ชัดขึ้นโดยไม่เพิ่ม analytics system ใหม่
- File targets: `src/lib/instrumentation.ts`, `src/lib/ai/operation-telemetry.ts`, `src/lib/orchestrator/task-events.ts`
- Acceptance criteria:
  - ดูได้ว่า rescue `first-pass`, `repair`, `fallback`, `endpoint_failed` เกิดเมื่อไร
  - log มี field พอให้เทียบก่อน-หลัง tuning
  - ไม่เพิ่ม external analytics dependency
- Dependencies: none
- Out of scope: dashboard ใหม่เต็มรูปแบบ

## Sprint 2 — Eval Gates & Model Budgeting

Execution checklists live in `specs/006-mind-vnext-prd/issue-pr-checklists.md`

### EG-01

- ID: `EG-01`
- Title: Benchmark coverage for all AI operations
- Why now: MIND ยังตัดสินใจจากข้อมูลไม่ครบ เพราะ benchmark ชัดจริงแค่ `action`
- Scope: ทำ benchmark route-level ให้ครบ `intake`, `action`, `scaffold`, `rescue`, `reentry`
- File targets: `scripts/benchmark-action-route.ts`, `scripts/benchmark-*.ts`, `package.json`
- Acceptance criteria:
  - ทุก operation มี benchmark script ของตัวเอง
  - ใช้ fixture set ที่ representative กับ use case ของ MIND
  - summary ออกในรูปแบบที่เทียบกันได้
- Dependencies: pattern จาก `RH-01`
- Out of scope: unified benchmark service ภายนอก

### EG-02

- ID: `EG-02`
- Title: Operation scorecard and thresholds
- Why now: ถ้าไม่มี gate ตัวเลข จะรู้แค่ว่า “เหมือนดีขึ้น” แต่ไม่รู้ว่าพอหรือยัง
- Scope: นิยาม threshold ต่อ route เช่น latency ceiling, repair ceiling, validation-failure ceiling และบันทึกไว้ใน spec
- File targets: `specs/006-mind-vnext-prd/health-check-vnext-readiness.md`, `specs/006-mind-vnext-prd/ticket-ready-sprints.md`, `specs/006-mind-vnext-prd/checklists/requirements.md`
- Acceptance criteria:
  - ทุก operation มี threshold ขั้นต่ำ
  - เอกสารระบุชัดว่าอะไรถือว่า “ผ่านสำหรับ demo”
  - ใช้ threshold เดียวกันเวลา rerun benchmark
- Dependencies: `EG-01`
- Out of scope: auto-block CI

### EG-03

- ID: `EG-03`
- Title: Model budget tuning pass
- Why now: `qwen2.5:3b` ยังต้อง prove ให้ชัดว่าเหมาะกับแต่ละ phase แค่ไหน
- Scope: ใช้ benchmark results ตัดสิน `num_predict` / timeout ต่อ route โดยเฉพาะ `rescue` และ `reentry`
- File targets: `src/app/api/ai/action/route.ts`, `src/app/api/ai/scaffold/route.ts`, `src/app/api/ai/rescue/route.ts`, `src/app/api/ai/reentry/route.ts`
- Acceptance criteria:
  - แต่ละ route มี default budget ที่อธิบายได้จาก benchmark
  - route ที่เสี่ยงสูงไม่ใช้ budget เดียวกันแบบเหมารวม
  - ไม่มี regression ต่อ smoke หลัก
- Dependencies: `EG-01`
- Out of scope: เปลี่ยนไปใช้ model orchestration หลายตัวในรอบนี้

### EG-04

- ID: `EG-04`
- Title: Evaluation summary page for the team
- Why now: คนในทีมต้องเห็นภาพเดียวกันเร็ว ไม่ต้องไล่ดูหลาย script
- Scope: สรุปผล benchmark ล่าสุด, recommendation, และ risk list ไว้หน้าเดียว
- File targets: `specs/006-mind-vnext-prd/health-check-vnext-readiness.md`, `specs/006-mind-vnext-prd/founder-demo-brief.md`
- Acceptance criteria:
  - มีหน้าเดียวที่ตอบได้ว่า route ไหนนิ่งแล้ว route ไหนยังเสี่ยง
  - ระบุ recommendation ชัดเจนว่า phase ไหนควร tune prompt vs model
  - ใช้ภาษาที่ founder และ engineer อ่านเข้าใจทั้งคู่
- Dependencies: `EG-01`, `EG-02`, `EG-03`
- Out of scope: observability dashboard บน cloud

## Sprint 3 — Demo Hardening / Launch Polish

Execution checklists live in `specs/006-mind-vnext-prd/issue-pr-checklists.md`

### DP-01

- ID: `DP-01`
- Title: Rare-state UX audit
- Why now: small cohort demo จะพังความเชื่อใจได้ง่ายมากถ้า rare-state ดูงง
- Scope: audit `DUMP_ENTRY`, `BOUNCE_BACK`, `MANUAL_FALLBACK`, `RESCUE fail`, `post-complete reset`
- File targets: `src/app/page.tsx`, `src/components/BrainDump/Fallback.tsx`, `src/components/Recovery/BounceBack.tsx`
- Acceptance criteria:
  - ทุก state ตอบคำถามได้ว่า “ตอนนี้คืออะไร” และ “ต้องทำอะไรต่อ”
  - ไม่มี state ไหน revive งานเก่าโดยไม่ตั้งใจ
  - copy ยังคง text-first และ honest failure
- Dependencies: none
- Out of scope: redesign visual language ใหม่ทั้งระบบ

### DP-02

- ID: `DP-02`
- Title: Clean reset and completion confidence pass
- Why now: ถ้าจบงานแล้ว state ยังหลอน จะทำลาย task continuity ของ MIND โดยตรง
- Scope: ทบทวน flow `SCAFFOLD -> เสร็จแล้ว -> DUMP_ENTRY -> reload`
- File targets: `src/lib/orchestrator/task-controller.ts`, `src/lib/store/idb.ts`, `scripts/browser-smoke-task-flow.ts`
- Acceptance criteria:
  - complete แล้วกลับ dump entry สะอาดจริง
  - reload แล้วไม่ revive task ที่ done
  - smoke ครอบคลุม path นี้โดยตรง
- Dependencies: none
- Out of scope: undo complete flow

### DP-03

- ID: `DP-03`
- Title: ONE_ACTION and DecisionBoard polish pass
- Why now: เส้นทางนี้คือ heart of product narrative ถ้ายังรกจะกด adoption
- Scope: ลด visual noise เพิ่มเติมเฉพาะจุด ถ้าการทดสอบยังบอกว่าคนจมกับส่วนรองมากเกินไป
- File targets: `src/components/ActionScaffold/OneAction.tsx`, `src/components/ActionScaffold/DecisionBoard.tsx`
- Acceptance criteria:
  - ผู้ใช้ใหม่ตอบได้ว่า CTA หลักคืออะไรภายในไม่กี่วินาที
  - reply draft ยังเป็น secondary surface
  - decision board ยังรู้สึกเหมือน alternate first move ไม่ใช่ settings
- Dependencies: ข้อมูลจาก user test / demo รอบก่อน
- Out of scope: route ใหม่, feature ใหม่

### DP-04

- ID: `DP-04`
- Title: Demo script and founder handoff
- Why now: ถ้าจะ demo ให้ advisor หรือผู้ใช้กลุ่มเล็ก ต้องมี narrative ที่คงที่
- Scope: ทำ demo script 3-5 นาที, pass/fail checklist, และ founder brief ให้ใช้คู่กัน
- File targets: `specs/006-mind-vnext-prd/first-run-demo-checklist.md`, `specs/006-mind-vnext-prd/founder-demo-brief.md`
- Acceptance criteria:
  - มี flow เดโมสั้นที่เล่า pain -> next move -> scaffold -> rescue -> reentry ได้
  - founder ใช้ brief นี้เล่าได้โดยไม่ต้องเปิด spec ใหญ่
  - checklist ใช้เก็บ feedback คนจริงได้
- Dependencies: none
- Out of scope: sales deck หรือ public marketing page

## Guardrails

- `page.tsx` ต้องไม่โตไปกว่านี้เพราะงานรอบถัดไปควรย้าย complexity ไป orchestration layer
- route-level tuning ต้องไม่ย้อนกลับไปใช้ synthetic success
- อย่า drift ไปเป็น planner, team workspace, หรือ file manager
- ใช้ `local-llm-ops` เป็นแนวทาง benchmark/tuning
- ใช้ `playwright-e2e-testing` เป็นแนวทาง smoke และ user-flow verification
- ใช้ `vercel:nextjs` และ `build-web-apps:react-best-practices` เป็น guardrail เวลาปรับ shell/TSX
- `vercel:workflow` เป็น **not in scope for this wave** — ยังไม่เปิด durable workflow migration

## Definition of Done for This Wave

- Rescue มี benchmark และ smoke ของตัวเอง
- ทุก operation มีอย่างน้อย baseline metric ที่เทียบกันได้
- founder อธิบายสถานะของ MIND ได้ทั้งแบบ technical และ non-technical
- small cohort demo ทำได้โดยไม่ต้องคอยอธิบายแก้ confusion ทุกจุด
