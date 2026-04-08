# Phase 4 Incident Note: Rescue 422 on Live Loop

Updated: 2026-04-09

## Purpose

เอกสารนี้ใช้ classify caveat หลักของ `Phase 4` ให้ชัดว่า `422 / validation_failed` ที่เห็นใน live loop คืออะไร และพังตรงไหนจริง

## Incident Read

หลักฐานล่าสุดหลังแก้ normalization path และ rerun `npm run smoke:task-flow:repeat` บน `rescue-balanced-repair-160`:

- loop ผ่าน `5/5`
- ทุก run ไปถึง `action`
- ทุก run ไปถึง `scaffold`
- ทุก run เข้า `rescue`
- ทุก run กลับเข้า `reentry`
- ทุก run reset กลับ `DUMP_ENTRY`
- `rescueStatus: 422` เหลือ `0/5`
- `rescuePassType` กลายเป็น `repair_pass` ใน `3/5`
- caveat ใหม่ที่เหลือคือ `rescueStatus: 503` แบบ `timeout` ใน `2/5`

## Classification

สถานะที่ถูกต้องที่สุดตอนนี้คือ:

- incident เดิมถูกปิดแล้ว
- root cause ของ 422 เดิมคือ `systemic normalization gap`
- หลังแก้แล้ว benchmark กับ live loop ไม่เห็น `diagnosis.primaryReason` fail ซ้ำอีก
- blocker ที่เหลือไม่ใช่ schema validation แล้ว แต่เป็น `runtime timeout` ใน rescue repair path

## Why This Happens

เส้นทางที่เคยพังอยู่ก่อนแก้คือ:

- route `rescue` รับ output ที่ parse ได้แล้ว แต่ `diagnosis.primaryReason` ยังเป็นค่า enum ที่ไม่ถูกต้อง
- normalizer ใน `operation-contract.ts` จะ fallback เฉพาะตอน field นี้หายไป
- ถ้า field นี้ “มีอยู่แล้วแต่ผิดค่า” มันยังถูก preserve ต่อ
- จากนั้น schema validation จึง reject ที่ชั้น contract และ route ตอบ `422`

หลังแก้:

- invalid-but-present `primaryReason` ถูก canonicalize ก่อน schema validation
- `422` เดิมหายจาก repeated live loop
- rescue path ยังมีโอกาสตกไปที่ `503 timeout` ถ้า repair pass ใช้เวลาเกิน budget

จุดอ้างอิงหลัก:

- `src/lib/ai/operation-contract.ts`
- `src/lib/ai/operation-route-helpers.ts`
- `src/lib/ai/operation-prompts.ts`

## What This Means

- ปัญหานี้ไม่ใช่ `loop integration problem`
- ปัญหานี้ก็ไม่ใช่ `Studio` หรือ `reentry` problem
- ปัญหาหลักยังอยู่ที่ `rescue` quality ภายใน loop ที่ otherwise survive ได้
- incident `422` ถือว่าปิดแล้ว
- loop usable แล้ว แต่ rescue ยังไม่ clean enough สำหรับการ promote baseline เพราะ timeout caveat ยังเหลือ

## Decision Impact

ผลของ incident นี้ต่อการตัดสินใจ:

- `rescue-balanced-repair-160` ยังใช้เป็น interim loop baseline ได้
- incident `422` ไม่ควรเป็นเหตุผลของ `keep=false` อีกต่อไป
- `keep=false` ตอนนี้ผูกกับ timeout/retry confidence แทน
- `rescue` ยังต้องถูกเล่าเป็น `experimental / secondary path`
