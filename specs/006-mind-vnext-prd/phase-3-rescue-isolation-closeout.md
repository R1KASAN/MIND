# Phase 3 Closeout: Rescue Isolation

Updated: 2026-04-08

## Status

`Phase 3: Rescue Isolation` ถือว่าปิดได้แล้วในความหมายของ execution readiness:

- `rescue` ถูกแยกออกจาก `Studio` และ cross-device gate ชัดเจนแล้ว
- ทีมมี benchmark route/client ของ `rescue` แยกจาก Studio UX แล้ว
- ตอนนี้เรารู้แล้วว่า blocker หลักอยู่ที่ `model / prompt / timeout tuning` ไม่ใช่ที่ `Studio`

สิ่งนี้ **ไม่ได้** แปลว่า `rescue` แข็งแรงแล้วหรือพร้อมเป็น hero flow

## Benchmark Read

ผลจาก `npm run benchmark:rescue` รอบล่าสุด:

- `rescue-baseline-170`
  - control ปัจจุบัน
  - `routeOkRate: 0.333`
  - `route503Rate: 0.667`
  - `retrySuccessRate: 0`
  - อ่านได้ว่า rescue ยังเปราะทั้ง route และ retry path
- `rescue-faster-140`
  - latency ดีขึ้นจาก baseline
  - reliability ยังไม่ดีขึ้นพอ
  - `routeOkRate: 0.333`
  - `route503Rate: 0.667`
  - `retrySuccessRate: 0`
- `rescue-repair-heavy-170`
  - ดีที่สุดสำหรับการประเมินต่อในตอนนี้
  - `routeOkRate: 0.667`
  - `routeRepairRate: 0.333`
  - `route503Rate: 0.333`
  - `clientOkRate: 1`
  - `retrySuccessRate: 0`
  - ช่วยให้ repair path เริ่มมีความหมาย แต่ยังไม่ demo-safe

## Decision

- temporary evaluation baseline สำหรับ Phase 4 คือ `rescue-repair-heavy-170`
- baseline นี้ยังเป็น `keep=false`
- `rescue` ยังต้องถูกถือเป็น `experimental / secondary path`
- ยังไม่ควร promote `rescue` เป็น onboarding default, hero demo step, หรือ marketing claim

เหตุผลที่ยัง `keep=false`:

- `retrySuccessRate` ยังเป็น `0`
- `route503Rate` ยังสูงเกินเกณฑ์ที่ไว้ใจได้
- latency ของ route ดีขึ้นไม่พอจะชดเชยความเสี่ยงของ failure path

## What Phase 3 Actually Finished

Phase 3 จบเพราะตอนนี้ทีมตอบได้ชัดแล้วว่า:

- preset ไหนดีที่สุดตอนนี้
- ทำไมมันยังไม่ควรเป็น permanent default
- `Studio` ไม่ใช่ blocker หลักแล้ว
- ปัญหาที่เหลือคือ rescue track เอง ไม่ใช่ product shape

## Phase 4 Hand-off

Phase 4 จะเริ่มแบบแคบและวัดได้:

- ใช้ single-room loop เท่านั้น
- ใช้ `DUMP -> action -> scaffold -> rescue -> reentry -> mobile reentry`
- ใช้ `rescue-repair-heavy-170` เป็น evaluation baseline ชั่วคราว
- ยอมรับเป้าหมายแบบ `loop survives with caveats` ก่อน ไม่บังคับว่า `rescue reliable`
- เอกสารติดตาม Phase 4 อยู่ที่ `specs/006-mind-vnext-prd/phase-4-loop-survival-note.md`
- เอกสารปิด Phase 4 อยู่ที่ `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- เอกสาร tuning รอบถัดไปอยู่ที่ `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
- หมายเหตุ: baseline ตั้งต้นของ Phase 4 คือ `rescue-repair-heavy-170`; ถ้า tuning round 2 พบค่า interim baseline ที่ดีกว่า ให้ถือ note รอบใหม่เป็น source of truth

คำสั่งที่ Phase 4 ต้องเช็กอย่างน้อย:

- `npm run smoke:studio`
- `npm run smoke:studio-mobile`
- `npm run smoke:reentry-mobile`
- `npm run smoke:task-flow`

กติกาการตีความ:

- ถ้า Studio smokes ผ่าน แต่ `smoke:task-flow` fail ตอน `rescue` ให้ถือว่าเป็น `Phase 4 rescue-loop blocker`
- ถ้า `smoke:task-flow` fail ก่อนเข้า `rescue` ให้ถือว่าเป็น `Phase 4 loop integration problem`

## Not Promoted Yet

สิ่งที่ยังไม่ควรเกิดหลังปิด Phase 3:

- อย่าใช้ `rescue` เป็น hero intent ในหน้า onboarding
- อย่าเล่า demo เหมือน `rescue` ไว้ใจได้เท่ากับ `ONE_ACTION` หรือ `reentry`
- อย่าผูกปัญหา rescue ไปกับ Studio UX เพราะตอนนี้แยก track กันแล้ว
