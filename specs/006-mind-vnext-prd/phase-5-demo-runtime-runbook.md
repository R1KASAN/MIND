# Phase 5 Demo Runtime Runbook

Updated: 2026-04-12

## Purpose

runbook นี้ใช้ล็อก local runtime และ verification ritual สำหรับ demo / gate รอบที่ยังต้องพึ่ง local Ollama บน Apple Silicon

เป้าคือให้ทีมแยกได้ชัดว่าอะไรคือ product regression และอะไรคือ runtime / smoke harness problem

## Demo Runtime Baseline

runtime baseline ที่ใช้สำหรับ demo รอบนี้:

- Ollama `0.17.0`
- port `11434`
- direct generate ต้องผ่านก่อนเริ่ม smoke หรือ gate

ไม่ใช้เป็น baseline รอบนี้:

- Ollama `0.20.x`
- Ollama `HEAD`

เหตุผล:

- บน Apple M5/macOS ตอนนี้มีหลักฐานว่า Metal backend ยังไม่เสถียรพอสำหรับ demo path

## Required Runtime Check

ก่อนรัน smoke หรือ gate ให้เช็ก runtime ด้วย:

```bash
npm run runtime:ollama:check
```

สิ่งที่ต้องผ่าน:

- version ตรงกับ `0.17.0`
- direct generate ตอบ `ok`

ถ้าคำสั่งนี้แดง:

- ยังไม่ต้องรัน `gate:phase5`
- ให้ถือว่า runtime ยังไม่พร้อมสำหรับ demo รอบนี้

## Fresh Verification Sequence

ใช้ลำดับนี้ก่อนทุก demo candidate run:

1. ปิด Ollama / Next / Playwright process เก่าที่ค้างอยู่
2. start Ollama `0.17.0`
3. รัน `npm run runtime:ollama:check`
4. รัน `npm run build`
5. รัน verification ต่อจาก clean production server เท่านั้น

คำสั่งที่ควรรัน:

```bash
npm run smoke:sales-inquiry
npm run smoke:task-flow:browser
npm run smoke:reentry-mobile
npm run smoke:task-flow:repeat
npm run gate:phase5
```

## Interpretation Rules

ถ้า `npm test`, `lint`, `build`, sales inquiry smoke, และ single task-flow smoke ผ่าน แต่ repeat หรือ reentry-mobile ยัง fail:

- อย่าพึ่งสรุปว่า product regress
- ให้ตรวจ runtime pin และ smoke harness ก่อน

ให้ใช้คำตัดสินแบบนี้:

- runtime check fail -> `hold release and fix runtime`
- browser smoke fail บน dev server เท่านั้น -> `rerun on fresh prod server`
- repeat smoke fail แบบ flaky แต่ API/UI หลักยังไปต่อได้ -> `hold release and harden verification`
- gate ผ่านครบ -> `ship for controlled demo`

## Notes

- `smoke:reentry-mobile` แบบ standalone จะบูต fresh production server เองถ้าไม่ได้ส่ง `MIND_BASE_URL`
- `gate:phase5` จะบูต prod server ใหม่แยกต่อ smoke step เพื่อหลีกเลี่ยง state leak จากรอบก่อน
- `smoke:task-flow:repeat` จะเก็บ artifact ต่อรอบไว้ใน output dir เดียวกันมากขึ้น เพื่อไล่ flaky run ได้ง่ายขึ้น
