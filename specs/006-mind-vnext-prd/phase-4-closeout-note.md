# Phase 4 Closeout: End-to-End User Loop

Updated: 2026-04-09

## Decision

`Phase 4` ปิดได้แบบ:

- `keep interim baseline but close Phase 4 with caveat`

สิ่งนี้หมายถึง:

- single-room loop ของ MIND ใช้งานได้จริงตั้งแต่ `DUMP -> action -> scaffold -> rescue -> reentry`
- แต่ baseline ปัจจุบันยังไม่พร้อมถูก promote เป็น permanent default
- caveat หลักยังอยู่ที่ `rescue`, ไม่ใช่ที่ loop integration หรือ Studio

## Current Baseline

baseline ที่ใช้ต่อสำหรับ live loop evaluation ยังเป็น:

- `rescue-balanced-repair-160`

เหตุผลที่ยังคงตัวนี้:

- `smoke:task-flow:repeat` รอบล่าสุดผ่าน `5/5`
- repeated live-loop comparison รอบเดียวกันยืนยันว่า `rescue-balanced-repair-160` สะอาดกว่า `rescue-repair-heavy-170`
- ทุก run ไปถึง `reentry` และ `completion reset`
- ในรอบ compare ล่าสุด `balanced-repair-160` ไม่มี `503 timeout` เลย (`0/5`) ขณะที่ `repair-heavy-170` ยังมี `1/5`
- แม้ benchmark รอบล่าสุดจะให้ `rescue-repair-heavy-170` ชนะเชิง synthetic score แต่ยังไม่แรงพอจะ override หลักฐานจาก live loop

สถานะของ baseline นี้ยังเป็น:

- `interim`
- `keep=false`

## Why It Is Still Keep=false

ถึง loop จะรอด `5/5`, baseline นี้ยังไม่ผ่านเกณฑ์ promotion เพราะ:

- incident `422` เดิมถูกปิดแล้ว และ repeated live loop รอบล่าสุดไม่เห็น `503` ใน `balanced-repair-160`
- แต่ benchmark/readiness story โดยรวมยังไม่ชัดพอให้ promote ทันที เพราะ synthetic winner ยังเป็น `repair-heavy-170`
- benchmark รอบล่าสุดยังให้ `retrySuccessRate` แค่ `0.2`
- ยังไม่มีหลักฐานว่า rescue path สะอาดพอจะเป็น hero/default flow
- การตัดสินรอบนี้ตั้งใจเป็น baseline comparison ไม่ใช่ promotion pass จึงยังคง `keep=false` จนกว่าจะทำ timeout-budget tuning แบบแคบหรือเก็บหลักฐานเพิ่มอีกชุด
- timeout-budget tuning round 3 ล่าสุดก็ยังไม่มี preset ใหม่ตัวไหนชนะ `rescue-balanced-repair-160` แบบครบ hard criteria

## What Phase 4 Finished

Phase 4 ถือว่าจบแล้วในความหมายของ product execution เพราะตอนนี้ทีมตอบได้ชัดว่า:

- loop รอดจริงหรือไม่: รอด
- พังตรงไหนถ้าจะพัง: ฝั่ง `rescue`
- incident 422 เดิมคืออะไร: rescue contract validation issue ที่ `diagnosis.primaryReason` และตอนนี้ปิดแล้ว
- ปัญหานี้อยู่ที่ product loop หรือ rescue quality: อยู่ที่ rescue quality

## What Still Needs To Be True Before Promotion

ก่อนจะ promote baseline จาก interim ไปเป็น keep/default ต้องมีอย่างน้อย:

- `route503Rate = 0`
- `routeValidationFailureRate = 0`
- `clientOkRate = 1`
- `retrySuccessRate > 0`
- repeated live loop runs ที่ไม่มี `422`
- repeated live loop runs ที่ไม่มี rescue timeout/503 ในเส้นทางหลัก

ตอนนี้ยังไม่ถึงเงื่อนไขเหล่านี้

## Related Docs

- Phase 4 loop survival: `specs/006-mind-vnext-prd/phase-4-loop-survival-note.md`
- Phase 4 live baseline comparison: `specs/006-mind-vnext-prd/phase-4-live-baseline-comparison-note.md`
- Phase 4 rescue incident: `specs/006-mind-vnext-prd/phase-4-rescue-422-incident-note.md`
- Rescue tuning round 2: `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
- Rescue timeout-budget round 3: `specs/006-mind-vnext-prd/rescue-timeout-budget-tuning-round-3-note.md`
