# Rescue Timeout-Budget Tuning Round 3 Note

Updated: 2026-04-09

## Purpose

รอบนี้ตั้งใจทำ timeout-budget tuning แบบแคบ เพื่อเช็กว่ามี preset ไหนชนะ `rescue-balanced-repair-160` ชัดพอให้ย้าย interim live baseline ได้ไหม โดยไม่เปิด playground ใหม่

## Presets added in this round

- `repair-heavy-longer-repair`
  - based on `rescue-repair-heavy-170`
  - `numPredict: 170`
  - `repairNumPredict: 240`
  - `primaryTimeoutMs: 22000`
  - `repairTimeoutMs: 18000`
  - `overallBudgetMs: 47000`
- `balanced-higher-overall-budget`
  - based on `rescue-balanced-repair-160`
  - `numPredict: 160`
  - `repairNumPredict: 220`
  - `primaryTimeoutMs: 20000`
  - `repairTimeoutMs: 15000`
  - `overallBudgetMs: 43000`

## Hard filter for Phase 4 follow-through

preset ใหม่จะถูกพาไปสู่ repeated live loop ได้ก็ต่อเมื่อผ่านครบ:

- `routeValidationFailureRate = 0`
- `clientOkRate = 1`
- `route503Rate` ต้องไม่แย่กว่า `rescue-balanced-repair-160`
- `retrySuccessRate` ต้องดีกว่า `rescue-balanced-repair-160`

ถ้าไม่ผ่านข้อใดข้อหนึ่ง ให้หยุดรอบนี้ทันทีและไม่รัน `smoke:task-flow:repeat` ต่อ

## Benchmark result

คำสั่งที่ใช้:

- `npm run benchmark:rescue`

ผลเทียบเฉพาะ preset ที่เกี่ยวข้อง:

| Setting | routeValidationFailureRate | route503Rate | clientOkRate | retrySuccessRate | medianRouteLatencyMs | medianClientLatencyMs | Hard filter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rescue-balanced-repair-160` | `0` | `0` | `1` | `0.2` | `4797` | `4958` | baseline |
| `rescue-repair-heavy-170` | `0` | `0` | `1` | `0.2` | `4951` | `5116` | fail |
| `repair-heavy-longer-repair` | `0` | `0` | `1` | `0.2` | `5038` | `5059` | fail |
| `balanced-higher-overall-budget` | `0` | `0` | `1` | `0.2` | `4793` | `4964` | fail |

## Read

- preset ใหม่ทั้งสองตัวผ่านด้าน validation/route health
- แต่ไม่มีตัวไหนทำ `retrySuccessRate` ให้ดีขึ้นจาก baseline เดิม
- `balanced-higher-overall-budget` แทบจะเท่ากับ baseline เดิม จึงไม่ถือว่าชนะ
- `repair-heavy-longer-repair` ไม่ช่วยให้ recovery ดีขึ้นพอจะ justify budget ที่ใหญ่ขึ้น

## Decision

รอบนี้ถือว่า:

- `no preset wins clearly`

ดังนั้น:

- คง `rescue-balanced-repair-160` เป็น interim live baseline ต่อ
- ไม่ย้าย baseline
- ไม่ promote
- ไม่พา preset ใหม่เข้าสู่ `smoke:task-flow:repeat` เพราะไม่ผ่าน hard filter

## Why We Stop Here

stop rule ของรอบนี้คือ:

- benchmark 1 รอบ
- repeated live loop เฉพาะ preset ที่ผ่าน hard filter

เนื่องจากไม่มี preset ใหม่ตัวไหนผ่าน hard filter:

- ให้หยุด tuning round นี้ทันที
- ถือว่า `Phase 4` ยังคงปิดแบบ `close with caveat`
- เดินต่อไปที่ `Phase 5` ด้วย gate ที่ชัดเจน แทนการ tune ต่อไม่จบ

## Related Docs

- Phase 4 closeout: `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
- Phase 4 live baseline comparison: `specs/006-mind-vnext-prd/phase-4-live-baseline-comparison-note.md`
- Rescue tuning round 2: `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`
