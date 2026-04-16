# MIND Health Check: vNext Readiness

Updated: 2026-04-08

> Operational source of truth: [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5`

## Summary

สมมติจากข้อมูลที่มีใน repo, smoke, benchmark, และสภาพ flow ปัจจุบันของ MIND:

- Overall progress: **70%**
- Product/UX readiness: **80%**
- Engineering/architecture readiness: **74%**
- AI behavior readiness: **60%**

ข้อสรุปเชิงใช้งาน:

- MIND พร้อมสำหรับ **demo / closed beta ขนาดเล็ก 5–10 คน**
- MIND ยังไม่พร้อมสำหรับ launch กว้าง
- blocker ใหญ่สุดยังอยู่ที่ `rescue` และความสมดุลของ eval / benchmark ราย operation
- operational default ตอนนี้คือใช้ `npm run gate:phase5` ก่อนทุก demo / release และใช้ canonical local path (`npm run ollama:serve:cpu-safe` + `npm run dev` / `npm run start`) ตลอด
- `gate:phase5` ผ่าน = `ship for controlled demo`, ไม่ใช่ broad launch และไม่ใช่ rescue promotion

Related docs:

- For execution: `specs/006-mind-vnext-prd/ticket-ready-sprints.md`
- For storytelling: `specs/006-mind-vnext-prd/founder-demo-brief.md`
- For multi-room risk/readiness: `specs/006-mind-vnext-prd/multi-room-risk-spec.md`
- For multi-room sequencing: `specs/006-mind-vnext-prd/multi-room-phased-roadmap.md`
- For multi-room decision/discovery follow-on: `specs/006-mind-vnext-prd/multi-room-decision-memo.md`, `specs/006-mind-vnext-prd/multi-room-discovery-checklists.md`
- For Phase 3 rescue closeout: `specs/006-mind-vnext-prd/phase-3-rescue-isolation-closeout.md`
- For Phase 4 loop survival: `specs/006-mind-vnext-prd/phase-4-loop-survival-note.md`
- For Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- For Phase 4 rescue incident: `specs/006-mind-vnext-prd/phase-4-rescue-422-incident-note.md`
- For rescue tuning round 2: `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
- For rescue timeout-budget tuning round 3: `specs/006-mind-vnext-prd/rescue-timeout-budget-tuning-round-3-note.md`
- For Phase 5 pre-demo / pre-release gate: `specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md`

## Current Readiness by Area

- Intake / Dump — text-first และ files-optional ชัด, ingest/extract ใช้งานได้, first-run smoke มีแล้ว — **82%**
- ONE_ACTION (รวม negotiation + DecisionBoard) — เส้นทางหลักชัด, CTA ดีขึ้น, decision path และ telemetry มีแล้ว — **84%**
- Scaffold (รวมย่อยให้เล็กลง + rescue integration) — ใช้งานได้จริงและมี honest failure แต่ยังผูกกับความนิ่งของ AI สูง — **72%**
- Rescue (รวม safe failure + retry) — มี safe fallback และ retry แล้ว แต่ primary/repair path ยังมี `503` / format drift โผล่จริง — **60%**
- Bounce_back / Morning_ritual (reentry) — สื่อการกลับมาทำต่อได้ดี และมี smoke ครอบคลุม — **74%**
- Local-first / data boundary — state หลักอยู่ local, OCR/PDF extraction local, Ollama local; ยังมี dependency ภายนอกเล็กน้อย เช่น fonts — **86%**
- Telemetry & benchmark (action & rescue) — `action` มี benchmark และ event signals ดีขึ้นแล้ว แต่ `rescue` ยังไม่มี benchmark/gate ที่เท่ากัน — **66%**
- First-run / onboarding & text-first story — copy และ walkthrough สื่อถูกทางมากขึ้นแล้ว, smoke ครอบคลุม story หลัก — **82%**

## What This Means

ตอนนี้ MIND ชนะในเรื่องต่อไปนี้ได้ค่อนข้างชัดแล้ว:

- เล่า pain ชัดว่าเป็น local-first AI task copilot
- first-run เข้าใจง่ายขึ้นว่าไม่มีไฟล์ก็เริ่มได้
- ONE_ACTION เริ่มทำหน้าที่เป็น “ก้าวแรกที่เริ่มได้” จริง
- scaffold / rescue / reentry เริ่มเป็น lifecycle จริง ไม่ใช่แค่หน้าแยกกัน

แต่ MIND ยังไม่ชนะเต็มที่ในเรื่องต่อไปนี้:

- rescue ยังไม่นิ่งพอจะเป็นจุดขายหลักโดยไม่คุม demo ใกล้ชิด
- eval coverage ยังไม่สมดุลทุก route
- rare-state UX ยังต้องเก็บให้เนียนกว่านี้ก่อนปล่อยวงกว้าง

## Biggest Gaps Before a Small Launch

- Rescue ยังเป็น blocker ใหญ่สุด: ถ้าผู้ใช้จริงเจอ `503` หรือ output หลุดบ่อย จะรู้สึกว่า AI ไว้ใจไม่ได้ แม้ระบบจะไม่ทำข้อมูลหาย
- Eval coverage ยังไม่สมดุล: `action` มี benchmark แล้ว แต่ `rescue` และ `reentry` ยังไม่มี gate ที่แข็งพอ
- Rare-state UX ยังต้องเก็บ: clean reset, bounce back, manual fallback, และ failure copy ต้องนิ่งทุกหน้า
- Local-first boundary ยังควรเก็บงาน: ถ้าจะยืนคำว่า local-first แบบเข้มจริง ควร audit dependency ภายนอกให้ครบ
- Demo readiness ดีกว่า launch readiness: ตอนนี้เหมาะกับ small cohort มากกว่า public launch
- สำหรับ Phase 4 ตอนนี้ปิดได้แบบ `close with caveat`: ใช้ `rescue-balanced-repair-160` เป็น interim live loop baseline ต่อไป แต่ยังเป็น `keep=false`; incident `422` ที่ `diagnosis.primaryReason` ถูกปิดแล้ว และ timeout-budget tuning round 3 ก็ยังไม่มี preset ใหม่ตัวไหนชนะ baseline นี้แบบครบ hard criteria
- สำหรับ Phase 5 ตอนนี้สิ่งที่ควรล็อกคือ discipline มากกว่าการขยาย scope: ใช้ `gate:phase5` เป็น mandatory ritual และเปิด follow-on แคบ ๆ ที่ `RH-06 Rescue retry/timeout quality pass` เท่านั้น
- ผล RH-06 รอบล่าสุด: default rescue route ถูก align กับ `rescue-balanced-repair-160` แล้ว, repeated live loop ล่าสุดผ่าน `5/5` ทั้ง baseline เดิมและ `balanced-higher-overall-budget`, benchmark clean run กลับมาได้ `routeValidationFailureRate=0`, `clientOkRate=1`, `route503Rate=0`, `retryRecoveryRate=1`, แต่ `retrySuccessRate` ยังเท่าเดิมที่ `0.2` จึงคง baseline เดิมและคง `keep=false`

## Recommended Next Sprints

### Sprint 1: Rescue Hardening

Goal:
ทำให้เส้นทาง “ติดแล้วกู้” ไว้ใจได้สำหรับผู้ใช้จริง

Key work:

- ทำ benchmark `rescue` แบบเฉพาะ route
- ลด `503` ด้วย prompt / `num_predict` / retry-backoff tuning
- ปรับ safe-failure copy ให้ชัดว่า context ยังอยู่
- เพิ่ม smoke สำหรับ rescue failure / retry
- แยก telemetry ของ rescue ให้อ่านง่ายกว่าปัจจุบัน

### Sprint 2: Eval Gates & Model Budgeting

Goal:
ให้ทุก operation มีตัวเลขพอใช้ตัดสินใจได้

Key work:

- ทำ benchmark ครบ `intake / action / scaffold / rescue / reentry`
- เก็บ `first-pass`, `repair`, `validation-failure`, `latency`
- ตั้ง acceptance threshold ราย route
- ใช้ผล benchmark ตัดสินว่าจะจูน prompt หรือเปลี่ยน model ตรงไหน
- สรุปผลไว้หน้าเดียวให้ทีมใช้ตัดสินใจเร็ว

### Sprint 3: Demo Hardening / Launch Polish

Goal:
ทำให้ 5–10 คนใช้แล้วไม่งง และไม่หลุดบริบท

Key work:

- audit copy ของ `DUMP_ENTRY / BOUNCE_BACK / MANUAL_FALLBACK / error states`
- เก็บ clean reset หลังเสร็จงานและ reload
- ลด visual noise ใน `ONE_ACTION` / `DecisionBoard` ถ้ายังดึงสายตาเกินไป
- ทำ demo checklist / first-run script สำหรับทดสอบกับคนจริง
- ปิดช่องว่าง rare-state ที่ผู้ใช้เริ่มแล้วไม่แน่ใจว่าต้องทำอะไรต่อ

## Priority Call

ทำก่อน:

- Rescue Hardening
- Eval Gates & Model Budgeting

ทำทีหลังได้:

- polish หน้าจอที่เหลือ
- copy refinement รอบสุดท้าย
- feature expansion ที่ไม่เกี่ยวกับ confidence ของ lifecycle
- multi-room discussion หลัง Studio/reentry ในห้องเดียวมี meaning พอ

## Straight Answer

- MIND ตอนนี้ **ใช้งานจริงแบบเล็กได้แล้ว**
- แต่ยังเป็น **beta ที่ต้องดูแล failure path**
- จุดตัดสินความพร้อมรอบถัดไปไม่ใช่หน้าแรก แต่คือ **rescue + eval coverage + reentry confidence**
