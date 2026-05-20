# MIND Agent Guide

Source of truth:
- [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md)
- ถ้ามี conflict ระหว่าง guide นี้กับงานใหม่ ให้ยึด plan เป็นหลัก

## Goals
- ทำให้ prototype เดโมได้แบบ Room-based: create/select Room -> attach file -> evidence -> summary/next action -> save point -> reentry
- รักษา scope ให้แคบเป็น single-room prototype สำหรับ solo client-facing work
- ใช้ browser + synthetic checks เป็นหลัก ไม่ต้องพึ่ง real-user validation

## In Scope
- Paste-text / Room-based file ingestion
- `txt/md` direct read
- PDF text-layer extraction + OCR fallback
- Evidence visibility และ source/provenance detail
- Room memory, reentry, save point, next action, scaffold
- Demo-critical UI/copy cleanup ที่ไม่ขยาย scope

## Out of Scope
- Prompt redesign
- Retrieval schema redesign
- Analytics contract redesign
- OCR provider/setup redesign
- Smoke harness redesign
- Broad OCR/PDF/file-ingestion expansion
- Architecture refactor / orchestration movement
- Product breadth beyond one client-facing task room

## Do
- อ่าน `docs/product/prototype-completion-plan.md` ก่อนเริ่มงานทุกครั้ง
- รักษา Room flow ให้ไม่พัง
- แก้เฉพาะ defect ที่กระทบ demo path จริง
- เก็บ evidence ของ flow ที่ผ่านแล้วไว้เป็น baseline
- ใช้ existing verification habit: typecheck, smoke, browser checks, manual browser observation
- ให้ demo script สั้นและใช้งานจริงได้

## Do Not
- ไม่แตะ prompts / retrieval schema / analytics contract / OCR provider / smoke harness
- ไม่เอา `/business` เป็น acceptance gate
- ไม่ขยายไป feature ใหม่, dashboard-first workflow, หรือ team/product workspace
- ไม่ redesign ใหญ่ถ้า evidence มีแค่ friction เฉพาะจุด
- ไม่ทำงานนอก scope ของ single-room prototype story

## Verification Habit
- ตรวจว่า main room path ยังไปถึง ONE_ACTION, evidence, scaffold, reentry, save point ได้
- ตรวจว่า `txt/md`, PDF, image behavior ยังตรงกับ scope
- ถ้ามี failure ให้แยกว่าเป็น code regression, copy issue, or demo-only friction
- ถ้า browser/manual evidence ขัดกับ smoke result ให้ยึด plan และ re-check baseline

## Demo / Handoff Habit
- Demo minimum flow:
  `Room -> attach file -> ไปต่อ -> evidence -> summary / next action -> ใช้ก้าวนี้ -> กลับมาห้องเดิม`
- Rehearse recovery path อย่างน้อย 1 แบบ
- Rehearse reentry Room ที่มี context จริง 1 ห้อง
- อย่าเปิด dashboard เป็น requirement ของ acceptance
- หลัง demo ให้เก็บ friction เป็น evidence สำหรับ next pass เท่านั้น
