# MIND Target Scenarios And Product Proof

Updated: 2026-04-11

เอกสารนี้เป็น canonical artifact สำหรับล็อก target scenarios ของ MIND ใน phase ปัจจุบัน ก่อนนำไปใช้กับ system design, competitive brief, KPI, presentation, หรือ reviewer answer

เป้าหมายคือทำให้ MIND พิสูจน์ว่า “ชนะงานลูกค้าจริง” ไม่ใช่แค่ผลิตเอกสารหรือคำอธิบายที่ดูดี

## Scenario 1: Client Project Restart

### User Archetype

solo client-facing knowledge worker เช่น freelancer, consultant, boutique agency lead, designer, developer, coach, หรือ strategist ที่ต้องกลับมาทำงานลูกค้าเดิมหลัง context ค้างอยู่หลายวันหรือหลายสัปดาห์

### Current Workflow Without MIND

- เปิด chat/email/note หลายแหล่ง
- พยายามไล่อ่านว่าเกิดอะไรล่าสุด
- หา requirement, blocker, และ decision ล่าสุดด้วยตัวเอง
- เปิด task manager หรือ note app เพื่อเดาว่าควรเริ่มตรงไหน
- มักเสียแรงก่อนเริ่มทำงานจริง

### Failure Mode Without MIND

- ใช้เวลานานกับการ reread context
- เริ่มจากงานผิดจุด
- ลืม blocker หรือ assumption สำคัญ
- รู้ว่างานต้องทำ แต่ไม่มี first action ที่เล็กพอ
- กลับมาใหม่รอบหน้าแล้วหลุด context อีก

### With-MIND Happy Path

1. ผู้ใช้ paste client chaos ลง MIND
2. MIND intake สรุปสถานการณ์และ blockers
3. MIND เสนอ `ONE_ACTION` เดียวที่เริ่มได้ทันที
4. ผู้ใช้กดเข้า `SCAFFOLD`
5. MIND แตก step 3-5 ข้อและ refine ผ่าน `make smaller`
6. ถ้าผู้ใช้ติด MIND เข้า `RESCUE`
7. ถ้าผู้ใช้กลับมาใหม่ MIND สร้าง `REENTRY` brief

### Success Criteria

- ผู้ใช้เข้าใจสถานะงานโดยไม่ reread ทั้งหมด
- ระบบพาไปถึง one concrete next move
- scaffold ช่วยให้เริ่มงานได้ภายในไม่กี่นาที
- rescue ไม่ทำ context หายแม้ AI fail
- reentry ทำให้ผู้ใช้กลับเข้าบริบทเดิมได้

### What MIND Is NOT For This Scenario

- ไม่ใช่ note app เพราะเป้าหมายไม่ใช่เก็บข้อมูล แต่คือพางานไปต่อ
- ไม่ใช่ generic chatbot เพราะมี task lifecycle, state, scaffold, rescue, และ reentry
- ไม่ใช่ team workspace เพราะ focus อยู่ที่เจ้าของงานคนเดียวที่ต้อง restart งานลูกค้า

### Proof Signals

- `task-flow repeat = 5/5`
- `scaffold completion` เดิน step ต่อโดยไม่ reset ทันที
- `make smaller` refine แผนที่ละเอียดขึ้นจริง
- `reentry` smoke ผ่าน
- `422 = 0`

## Scenario 2: Sales Inquiry / Demo Request

### User Archetype

solo founder, consultant, agency lead, หรือ product builder ที่ได้รับข้อความยาวจากลูกค้าหรือ prospect ซึ่งขอ pilot/demo และต้องตอบกลับแบบเร็วแต่ยังตรงบริบท

### Current Workflow Without MIND

- อ่านข้อความลูกค้าทั้งก้อน
- แยก pain point, constraints, และ desired workflow เอง
- เดาว่าควรตอบเป็น proposal, demo invite, หรือ requirement clarification
- ร่าง reply เองใน chat/email
- เสี่ยงตอบกว้างเกินไปหรือพลาดรายละเอียดสำคัญ

### Failure Mode Without MIND

- ตีความผิดว่าเป็น project resume ทั้งที่จริงคือ demo request
- ตอบ generic ไม่สะท้อน pain ของลูกค้า
- ไม่จับ pilot constraints เช่น team size, tools, timeline, หรือ low-adoption risk
- ไม่มี reply draft ที่พร้อมใช้
- follow-up ช้าเพราะต้อง reread หลายรอบ

### With-MIND Happy Path

1. ผู้ใช้ paste sales inquiry ยาวลง MIND
2. MIND intake อ่านว่าเป็น `client_response`
3. MIND สรุป pain point และ requested demo/pilot
4. MIND เสนอ action เช่น `สรุป pain point ของลูกค้าและร่างข้อความตอบนัด demo ก่อน`
5. UI แสดง reply panel ที่ตรงบริบท
6. ไม่มี generic project resume title
7. ไม่มี structured fragment เช่น `{` หลุดขึ้น summary

### Success Criteria

- workflow ถูกจัดเป็น `client_response`
- hero action เป็น reply/demo oriented
- reply panel แสดงจริง
- summary ไม่มี structured fragment
- sales inquiry smoke ผ่าน
- gate fail ถ้าเคสนี้ถอยกลับไป generic title

### What MIND Is NOT For This Scenario

- ไม่ใช่ generic chatbot เพราะไม่ได้แค่ร่างข้อความ แต่ต้องอ่าน intent, pain point, และ next response action
- ไม่ใช่ CRM เพราะไม่ได้จัดการ pipeline ทั้งทีม
- ไม่ใช่ email client เพราะ focus คือ decision support สำหรับ response รอบนี้
- ไม่ใช่ project management workspace เพราะยังอยู่ใน single-room / one-task context

### Proof Signals

- `npm run gate:phase5` ผ่าน
- `npm run smoke:ai-routes:gemma` ผ่านทั้ง `/api/ai/intake`, `/api/ai/action`, และ `/api/ai/reentry`
- `npm run smoke:demo-browser` ผ่านพร้อม restart-room และ urgent-reply proof
- hero action ไม่ใช่ generic resume title
- reply panel มีอยู่จริง
- summary ไม่มี `{` หรือ structured fragment
- gate ตอนนี้เป็น controlled demo gate ไม่ใช่ broad-launch signal

## Cross-Scenario Product Proof

ทั้งสอง scenario พิสูจน์ product direction เดียวกัน:

- MIND อ่าน messy client context
- MIND ไม่หยุดที่ summary
- MIND พาไปสู่ next move
- MIND อยู่กับงานผ่าน scaffold, rescue, และ reentry
- MIND ไม่ขยายไปเป็น team workspace หรือ generic productivity suite

## Required Use In Future Docs

ทุก report, deck, PRD, หรือ reviewer answer ที่ใช้ skill stack ต้องอ้าง scenario นี้ก่อน แล้วค่อยเข้าสู่:

1. system design
2. problem solving
3. scenario-based benchmark
4. metrics / instrumentation
5. KPI summary
6. limits / caveats

## Current Phase Caveat

MIND พร้อมใช้ scenario เหล่านี้สำหรับ controlled demo / closed beta ขนาดเล็กเมื่อ `gate:phase5` ผ่านจากสภาพแวดล้อมที่ local LLM ใช้งานได้ แต่ยังไม่ควร claim ว่าพร้อม broad launch เพราะ `rescue` ยัง caveat-managed และต้องอยู่หลัง `gate:phase5`
