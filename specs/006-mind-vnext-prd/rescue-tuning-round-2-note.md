# Rescue Tuning Round 2 Note

Updated: 2026-04-09

## Purpose

รอบนี้ใช้เพื่อเช็กว่ามี preset ไหนที่ดีกว่า `rescue-repair-heavy-170` สำหรับการประเมิน `Phase 4` หรือไม่ โดยยังไม่ promote เป็น permanent default

## Presets in this round

- `rescue-baseline-170`
- `rescue-faster-140`
- `rescue-repair-heavy-170`
- `rescue-longer-primary-170`
- `rescue-balanced-repair-160`

## Decision rule

preset ใหม่จะถือว่าชนะ `rescue-repair-heavy-170` ได้ก็ต่อเมื่อ:

- `route503Rate` ไม่แย่ลง
- `routeRepairRate` ยังมีความหมาย (`> 0`)
- `retrySuccessRate` ขยับดีขึ้นจริง หรืออย่างน้อยไม่กด recovery ลง
- latency ไม่พุ่งจนทำให้ loop โดยรวมช้าจนน่ารำคาญ

## Current read

ผลจาก `npm run benchmark:rescue` รอบล่าสุดหลังเพิ่ม `live-loop-shaped fixture` และ `forced-retry stress fixture` และหลังแก้ rescue normalization:

- synthetic winner: `rescue-repair-heavy-170`
- live loop baseline ที่ยังใช้ต่อ: `rescue-balanced-repair-160`
- keep status: `keep=false`

เหตุผลที่ `rescue-repair-heavy-170` ชนะเชิง benchmark รอบนี้:

- `routeOkRate: 1`
- `route503Rate: 0`
- `routeRepairRate: 0.4`
- `clientOkRate: 1`
- `retrySuccessRate: 0.2`
- latency route/client ดีกว่า `rescue-balanced-repair-160` เล็กน้อย

เหตุผลที่ยัง `keep=false`:

- benchmark รอบนี้ยังไม่มี preset ไหนผ่านเกณฑ์ promotion ครบ
- ถึง `retrySuccessRate` จะขยับเป็น `0.2` แต่ยังต่ำเกินไปสำหรับการ promote
- live baseline comparison รอบล่าสุดไม่เห็น `422` แล้วทั้งสอง preset แต่ `repair-heavy-170` ยังมี `503 timeout` `1/5` ขณะที่ `balanced-repair-160` สะอาด `5/5`
- ยังไม่ควร promote เป็น permanent default หรือ hero demo setting

ทำไม `rescue-balanced-repair-160` ยังไม่ถูกถอดจากตำแหน่ง live loop baseline:

- baseline comparison รอบล่าสุดชี้ว่า `balanced-repair-160` สะอาดกว่าใน live loop จริง
- synthetic benchmark รอบนี้ไม่ได้ชนะขาดจนพอให้ override หลักฐานจาก live loop
- ความต่างของคะแนน benchmark ระหว่าง `repair-heavy-170`, `baseline-170`, และ `balanced-repair-160` ยังแคบมาก
- รอบนี้มันพิสูจน์ได้แล้วว่า normalization fix ปิด incident `422` เดิมใน live loop

ทำไมค่าอื่นยังไม่ถูก promote:

- `rescue-faster-140` ยังแย่ทั้ง validation และ 503
- `rescue-longer-primary-170` ยังมี validation/503 โผล่
- `rescue-baseline-170`, `rescue-repair-heavy-170`, และ `rescue-balanced-repair-160` อยู่ในกลุ่มที่ใกล้กัน แต่ยังไม่มีตัวไหนผ่านเกณฑ์ promotion ของ Phase 4
- benchmark fixture ที่เพิ่มแล้วก็ยังไม่ reproduce 422 แบบเดียวกับ live loop จึงยังไม่ควรสรุปว่า synthetic winner พร้อมแทน live baseline
- synthetic winner `rescue-repair-heavy-170` ดีสุดเชิง route/latency ใน benchmark รอบนี้ แต่ repeated live-loop evidence รอบล่าสุดยังไม่ชนะ `balanced-repair-160`

## Related docs

- Rescue benchmark baseline: `specs/006-mind-vnext-prd/rescue-benchmark-note.md`
- Phase 3 closeout: `specs/006-mind-vnext-prd/phase-3-rescue-isolation-closeout.md`
- Phase 4 loop survival: `specs/006-mind-vnext-prd/phase-4-loop-survival-note.md`
- Live baseline comparison: `specs/006-mind-vnext-prd/phase-4-live-baseline-comparison-note.md`
- Phase 4 rescue incident: `specs/006-mind-vnext-prd/phase-4-rescue-422-incident-note.md`
