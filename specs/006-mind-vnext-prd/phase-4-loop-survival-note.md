# Phase 4 Loop Survival Note

Updated: 2026-04-09

## Purpose

เอกสารนี้ใช้ตอบคำถามเดียวสำหรับต้น `Phase 4`:

single-room loop ของ MIND ยังไปต่อได้ถึงตรงไหนจริง เมื่อใช้ rescue baseline ชั่วคราวตัวปัจจุบัน

baseline ที่ใช้รอบนี้:

- `rescue-balanced-repair-160`
- สถานะยังเป็น `temporary evaluation baseline`
- ยังไม่ใช่ production-safe default

## Loop check

คำสั่งหลัก:

- `npm run smoke:task-flow`

กติกาการตีความ:

- ถ้า fail ก่อนเข้า `rescue` ให้ถือว่าเป็น `loop integration problem`
- ถ้า fail ตอน `rescue` หรือหลัง rescue state ไม่ recover ให้ถือว่าเป็น `rescue-loop blocker`
- ถ้า loop ผ่าน ให้ถือว่า `loop survives with caveats` จนกว่าจะมี evidence ว่า rescue นิ่งขึ้นกว่านี้

## Current read

ผลจาก `npm run smoke:task-flow:repeat` จำนวน `5` รอบบน `rescue-balanced-repair-160` รอบล่าสุด:

- ผ่านถึง `action`: `5/5`
- ผ่านถึง `scaffold`: `5/5`
- ผ่านถึง `rescue`: `5/5`
- กลับเข้า `reentry`: `5/5`
- reset กลับ `DUMP_ENTRY`: `5/5`
- `rescueStatus: 422` เกิด `0/5`
- `rescueStatus: 503` เกิด `0/5`
- loop ยังรอดผ่าน safe fallback และไปต่อถึง `reentry` ได้ทุกครั้ง

caveat ที่ยังยอมรับได้ใน Phase 4:

- loop รอดจริง แต่ฝั่ง `rescue` ยังพึ่ง repair path อยู่
- caveat เดิมแบบ `validation_failed` ถูกปิดแล้ว
- repeated live-loop รอบล่าสุดของ baseline นี้ไม่เห็น `timeout`
- baseline ที่รันผ่านรอบนี้ยังไม่ใช่ค่าที่พร้อม promote เป็น default
- ผล loop นี้บอกว่า product loop ไปต่อได้ ไม่ได้บอกว่า rescue นิ่งพอสำหรับ hero demo

blocker หลักหลังรอบนี้:

- ตอนนี้ไม่ใช่ `loop integration blocker` แล้ว
- blocker หลักเปลี่ยนจาก live-loop timeout ตรง ๆ ไปเป็นการ reconcile ระหว่าง live baseline กับ synthetic benchmark winner
- จุดเสี่ยงที่ยังเหลือไม่ใช่ contract field แล้ว แต่คือ timeout-budget confidence ถ้าจะขยับจาก interim ไป promotion

## Decision read

จากหลักฐานตอนนี้:

- loop ถือว่า `survives with caveats`
- caveat นี้ถูก classify ได้แล้วว่าเป็น rescue-only issue
- จึงถือว่า `Phase 4` ปิดได้แบบ `keep interim baseline but close with caveat`
- baseline ที่ใช้ต่อสำหรับ loop evaluation ยังเป็น `rescue-balanced-repair-160`
- baseline นี้ยังไม่ผ่านเกณฑ์ promotion และยังเป็น `keep=false`
- เหตุผลหลักที่ยังไม่ promote คือรอบนี้ยังเป็น baseline comparison pass ไม่ใช่ promotion pass และ synthetic/live evidence ยังไม่ collapse เป็นคำตอบเดียว

## Related docs

- Phase 3 hand-off: `specs/006-mind-vnext-prd/phase-3-rescue-isolation-closeout.md`
- Rescue benchmark baseline: `specs/006-mind-vnext-prd/rescue-benchmark-note.md`
- Rescue tuning round 2: `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
- Live baseline comparison: `specs/006-mind-vnext-prd/phase-4-live-baseline-comparison-note.md`
- Rescue 422 incident: `specs/006-mind-vnext-prd/phase-4-rescue-422-incident-note.md`
