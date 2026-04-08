# Phase 4 Live Baseline Comparison Note

Updated: 2026-04-09

## Purpose

เอกสารนี้ใช้ตัดสินคำถามเดียว:

ควรย้าย interim live-loop baseline จาก `rescue-balanced-repair-160` ไป `rescue-repair-heavy-170` หรือไม่

กติกาที่ใช้ตัดสินรอบนี้:

- ให้ความสำคัญกับ repeated live-loop evidence มากกว่า synthetic benchmark score
- เทียบเฉพาะ 2 preset แบบ apples-to-apples
- ยังไม่ promote baseline แม้ตัวใดตัวหนึ่งชนะ ถ้า retry / timeout risk ยังไม่นิ่งพอ

## Live-loop comparison

คำสั่งที่ใช้:

- `npm run smoke:task-flow:repeat`
- `npm run smoke:task-flow:repeat:repair-heavy`

ผลรอบล่าสุด:

| Baseline | Loop survival | `rescueStatus` | `rescuePassType` | `422` | `503 timeout` |
| --- | --- | --- | --- | --- | --- |
| `rescue-balanced-repair-160` | `5/5` | `200` x `5` | `repair_pass` x `5` | `0/5` | `0/5` |
| `rescue-repair-heavy-170` | `5/5` | `200` x `4`, `503` x `1` | `repair_pass` x `4`, `timeout` x `1` | `0/5` | `1/5` |

## Benchmark context

rough latency จาก `npm run benchmark:rescue` รอบล่าสุด:

| Baseline | synthetic winner? | median route latency | median client latency |
| --- | --- | --- | --- |
| `rescue-balanced-repair-160` | no | `10353ms` | `8926ms` |
| `rescue-repair-heavy-170` | yes | `8566ms` | `7114ms` |

สิ่งที่ benchmark บอก:

- `rescue-repair-heavy-170` ยังชนะเชิง route health + latency แบบ synthetic
- แต่ความชนะนั้นยังไม่แรงพอจะ override หลักฐาน live loop

## Decision

รอบนี้ **ยังไม่ย้าย** interim live-loop baseline

ให้คง:

- `rescue-balanced-repair-160`

เหตุผล:

- `balanced-repair-160` ผ่าน live loop `5/5` แบบสะอาดกว่า
- `repair-heavy-170` ยังมี `503 timeout` โผล่ `1/5`
- ไม่มี regression ก่อนเข้า `rescue` ในทั้งสอง baseline
- เมื่อ weighted ตาม product truth ของ MIND, live-loop cleanliness สำคัญกว่า synthetic speed win

## What This Means

- `rescue-repair-heavy-170` ยังเป็น candidate ที่น่าสนใจสำหรับ tuning รอบถัดไป
- แต่ในรอบนี้มันยัง **ไม่ชนะชัดพอ** ที่จะยึดตำแหน่ง interim live baseline
- ถ้าจะทำงานต่อจากจุดนี้ ควรเป็น timeout-budget tuning แบบแคบ ไม่ใช่การสลับ baseline ทันที

## Related Docs

- Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- Phase 4 loop survival: `specs/006-mind-vnext-prd/phase-4-loop-survival-note.md`
- Rescue tuning round 2: `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
