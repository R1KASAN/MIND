# Rescue Benchmark Note

## Current read

`rescue` ยังเป็น AI track ที่อ่อนที่สุดของ MIND ใน wave นี้ แม้ว่า `Studio` และ cross-device gate จะนิ่งขึ้นแล้วก็ตาม

สิ่งที่ benchmark ต้องตอบให้ชัดทุกครั้งคือ:

- `route503Rate` ลดลงหรือยัง
- `routeRepairRate` ขยับเหนือ `0` หรือยัง
- `retrySuccessRate` ดีขึ้นจริงหรือยัง
- latency เพิ่มขึ้นจนเริ่มทำให้ flow ช้าจนน่ารำคาญหรือไม่

## How to use `benchmark:rescue`

`npm run benchmark:rescue` ควรทำงานเป็น side-by-side comparison ของ rescue presets อย่างน้อย 3 แบบ:

- control: ค่า baseline ปัจจุบัน
- faster: ลด `num_predict` และ budget ลงเพื่อดูว่า 503 ลดลงไหม
- repair-heavy: ให้ repair pass มี budget มากขึ้นเพื่อดูว่า contract repair เริ่มช่วยจริงหรือไม่

ผลลัพธ์ที่ทีมควรใช้คุยกันคือ `comparison` และ `recommendation` ตอนท้าย ไม่ใช่ดูแค่รอบเดียวของ preset เดียว

## Decision rule

ยังไม่ควรถือ `rescue` เป็น hero intent ใน onboarding, marketing, หรือ demo path หลัก ถ้าอย่างน้อยหนึ่งข้อด้านล่างยังไม่จริง:

- `route503Rate <= 0.25`
- `retrySuccessRate >= 0.5`
- `routeRepairRate > 0`
- median latency ยังอยู่ในระดับที่ไม่ทำให้ flow ช้าจนน่าหงุดหงิด

ถ้ายังไม่มี preset ไหนผ่านเกณฑ์นี้ ให้ถือว่าปัญหาหลักอยู่ที่ `model / prompt / timeout tuning` ไม่ใช่ที่ `Studio UX`

## Latest closeout read

จากผล benchmark ล่าสุด:

- `rescue-repair-heavy-170` เป็น baseline ตั้งต้นที่พา loop Phase 4 ผ่านรอบแรกได้
- tuning round 2 ชี้ว่า `rescue-balanced-repair-160` เป็น `interim evaluation baseline` ที่ดีกว่าในเชิง latency/route health
- live loop ล่าสุดบน `rescue-balanced-repair-160` ยังมี caveat ที่ `rescueStatus: 422` แม้ flow จะรอดต่อถึง reentry
- ทั้งสองค่ายังเป็น `keep=false`

สรุป closeout และ hand-off ไป Phase 4 อยู่ที่ `specs/006-mind-vnext-prd/phase-3-rescue-isolation-closeout.md`  
สรุป tuning round 2 อยู่ที่ `specs/006-mind-vnext-prd/rescue-tuning-round-2-note.md`  
สรุป incident 422 และการปิด Phase 4 อยู่ที่ `specs/006-mind-vnext-prd/phase-4-rescue-422-incident-note.md` และ `specs/006-mind-vnext-prd/phase-4-closeout-note.md`
