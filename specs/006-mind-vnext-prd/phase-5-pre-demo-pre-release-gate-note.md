# Phase 5 Pre-Demo / Pre-Release Gate Note

Updated: 2026-04-09

## Purpose

เอกสารนี้นิยาม gate เดียวก่อน demo หรือ deploy สำหรับ MIND ในช่วงที่ยังเป็น single-room / DUMP-first และ `rescue` ยังอยู่ในสถานะ caveat-managed

## Required command gate

command เดียวที่ใช้เป็น checklist จริง:

- `npm run gate:phase5`

คำสั่งที่ต้องผ่านทั้งหมด:

- `npm test`
- `npm run build`
- `npm run smoke:studio`
- `npm run smoke:studio-mobile`
- `npm run smoke:reentry-mobile`
- `npm run smoke:task-flow:repeat`
- `npm run benchmark:rescue`

## Stop-ship rules

ถ้าอันนี้แดง ให้ถือว่า `ห้ามปล่อย`:

- `npm test` แดง -> ห้าม deploy
- `npm run build` แดง -> ห้าม deploy
- `npm run smoke:studio` แดง -> ห้าม demo / release
- `npm run smoke:studio-mobile` แดง -> ห้าม demo / release
- `npm run smoke:reentry-mobile` แดง -> ห้าม demo / release
- `npm run smoke:task-flow:repeat` ไม่ถึง `5/5` -> ห้าม demo / release
- `npm run smoke:task-flow:repeat` มี `422` -> ห้าม demo / release
- `npm run smoke:task-flow:repeat` มี timeout มากกว่าค่า baseline ที่ยอมรับอยู่ -> ห้าม release
- `npm run benchmark:rescue` มี `routeValidationFailureRate > 0` ใน baseline ที่จะใช้ -> ห้าม release
- `npm run benchmark:rescue` มี `clientOkRate < 1` ใน baseline ที่จะใช้ -> ห้าม release
- `npm run benchmark:rescue` มี `retrySuccessRate` แย่ลงจาก baseline ที่ยอมรับอยู่ -> ห้าม release

## Current accepted baseline

baseline ที่ใช้เป็น reference ตอนนี้:

- `rescue-balanced-repair-160`

สถานะ:

- `interim`
- `keep=false`
- ใช้ได้สำหรับ Phase 5 gate
- ยังไม่ใช่ค่า promote/default ของ product

## What Counts As Good Enough For Phase 5

Phase 5 เริ่มได้เมื่อ:

- Studio / reentry smokes ผ่านครบทั้ง desktop และ mobile
- task-flow repeat ผ่านบน interim live baseline ปัจจุบัน
- rescue benchmark ไม่ regress จากค่าที่ยอมรับอยู่
- ไม่มี evidence ใหม่ว่าปัญหาอยู่ที่ loop integration

สิ่งนี้ไม่ได้แปลว่า rescue perfect แล้ว

สิ่งนี้แปลว่า:

- rescue caveat ถูก bound ไว้แล้ว
- gate ก่อน demo/release ชัดพอ
- ทีมไม่ต้อง tune ต่อแบบไม่มี stop rule

## Decision Modes After Each Gate Run

หลังรัน gate ให้ใช้คำตัดสินได้แค่ 3 แบบ:

- `ship for controlled demo`
- `hold release and fix regression`
- `keep caveat, but do not expand scope`

## Related Docs

- Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- Rescue timeout-budget round 3: `specs/006-mind-vnext-prd/rescue-timeout-budget-tuning-round-3-note.md`
- Phase 4 live baseline comparison: `specs/006-mind-vnext-prd/phase-4-live-baseline-comparison-note.md`
