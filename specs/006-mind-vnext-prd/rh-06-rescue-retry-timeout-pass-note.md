# RH-06 Rescue Retry/Timeout Quality Pass

Updated: 2026-04-09

## Purpose

รอบนี้เป็น follow-on หลังปิด incident `422` แล้ว โดยโฟกัสแคบ ๆ ที่ `rescue` retry/timeout quality และไม่ขยาย scope ไป schema, Studio, หรือ multi-room

## What Changed

- align default rescue route ให้ตรงกับ accepted live baseline ปัจจุบัน:
  - `numPredict: 160`
  - `repairNumPredict: 220`
  - `primaryTimeoutMs: 20000`
  - `repairTimeoutMs: 14000`
  - `overallBudgetMs: 40000`
- เพิ่ม retry/backoff ของ `requestRescue` ให้กู้ transient `503/request_timeout` ได้มากสุด `3` attempts แบบ bounded
- เพิ่ม telemetry `attempt_stage` เพื่อแยก `primary` กับ `repair` ใน log ให้ชัด
- กระชับ rescue prompt และระบุ JSON shape ให้ตรงขึ้นเพื่อลด drift ก่อนเข้า repair
- เพิ่ม benchmark output `retryRecoveryRate` เพื่ออ่าน retry path แบบไม่หลอกตัวเองจาก aggregate rate อย่างเดียว

## Baseline Capture

benchmark side-by-side:

| Setting | routeOkRate | routeRepairRate | routeValidationFailureRate | route503Rate | clientOkRate | retrySuccessRate | retryRecoveryRate | medianRouteLatencyMs | medianClientLatencyMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rescue-balanced-repair-160` | `1` | `0.8` | `0` | `0` | `1` | `0.2` | `1` | `15111` | `15150` |
| `balanced-higher-overall-budget` | `1` | `0.8` | `0` | `0` | `1` | `0.2` | `1` | `15085` | `15280` |

live loop repeat:

- `npm run smoke:task-flow:repeat` บน `rescue-balanced-repair-160` -> `5/5` pass
- `MIND_SMOKE_TASK_FLOW_PORT=3213 npm run smoke:task-flow:repeat:balanced-higher-overall-budget` -> `5/5` pass
- ทั้งสอง baseline:
  - `rescueStatus = 200` ทุก run
  - `rescuePassType = repair_pass` ทุก run
  - ไม่มี `422`
  - ไม่มี timeout ใน repeated live loop รอบนี้

## Read

- RH-06 รอบนี้ช่วยให้ live-loop rescue กลับมานิ่งทั้งบน baseline เดิมและ candidate แคบที่เพิ่ม budget เล็กน้อย
- telemetry ชัดขึ้นแล้วว่าจุดเสี่ยงหลักของ rescue ยังอยู่ที่ `repair` stage ไม่ใช่ `primary` stage
- แต่ benchmark ยังไม่ถึง acceptance:
  - `retrySuccessRate` ยังไม่ดีขึ้นจาก baseline เดิม
- ดังนั้น caveat ของ rescue แคบลง แต่ยังไม่หาย

## Decision

รอบนี้ตัดสินว่า:

- `rescue-balanced-repair-160` ยังเป็น accepted interim live baseline
- `balanced-higher-overall-budget` ไม่ชนะชัดพอให้ย้าย baseline
- `keep=false` ยังเหมือนเดิม
- RH-06 ถือว่า useful เพราะ:
  - default route ตรงกับ accepted baseline แล้ว
  - retry path และ telemetry อ่านง่ายขึ้น
  - live loop นิ่งขึ้นพอสำหรับ controlled demo

## What `gate:phase5` Means

เมื่อ `npm run gate:phase5` ผ่าน:

- แปลว่า `ship for controlled demo`
- แปลว่า demo / closed beta เล็กได้
- ไม่ได้แปลว่า rescue ถูก promote
- ไม่ได้แปลว่าพร้อม launch กว้าง

## Related Docs

- Phase 5 gate: `specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md`
- Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- Rescue timeout-budget round 3: `specs/006-mind-vnext-prd/rescue-timeout-budget-tuning-round-3-note.md`
