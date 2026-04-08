# MIND Founder / Demo Brief

Updated: 2026-04-08

Quick spoken version: `specs/006-mind-vnext-prd/founder-pitch-60s.md`

## What MIND Is

MIND คือ `local-first AI task copilot` สำหรับงานลูกค้าที่รกอยู่ในหัว

มันรับข้อความ, แชต, โน้ต, PDF, screenshot หรือไฟล์ที่มี แล้วช่วยพาผู้ใช้จาก:

- context กระจัดกระจาย
- ไปสู่ next move ที่เริ่มได้จริง
- และอยู่ช่วยต่อจนงานขยับ

MIND ไม่ใช่:

- chatbot ทั่วไป
- note app
- task manager
- team workspace

## Who It Is For

MIND ออกแบบมาสำหรับ:

- freelancer
- consultant
- boutique agency lead
- coach / strategist
- designer / developer ที่มีหลายลูกค้า

คนกลุ่มนี้มักมี pain แบบเดียวกัน:

- งานลูกค้าค้าง
- feedback ยาวและกระจัดกระจาย
- context อยู่หลายที่
- พลังงานต่ำและเริ่มใหม่ยาก

## What Pain It Solves

MIND แก้ pain 3 ก้อนหลัก:

- `เริ่มไม่ออก` — สรุปให้ว่าตอนนี้ควรเริ่มตรงไหนก่อน
- `งานใหญ่เกิน` — แตกเป็น step เล็กที่เริ่มได้
- `กลับเข้าบริบทยาก` — ช่วย rescue และ reentry โดยไม่ต้องคิดใหม่จากศูนย์

ความต่างสำคัญคือ MIND ไม่ได้ช่วยแค่ “generate คำตอบ”
แต่มันช่วยทั้ง lifecycle:

- intake
- one action
- scaffold
- rescue
- reentry

## What Works Now

ตอนนี้ MIND ทำสิ่งที่สำคัญได้แล้ว:

- `text-first, files-optional`
- รับ context แบบ mixed room ได้
- เสนอ `ONE_ACTION` ที่อ่านง่ายและกดต่อได้
- แตก step ใน `SCAFFOLD`
- มี `RESCUE` พร้อม safe failure
- มี `BOUNCE_BACK / MORNING_RITUAL` สำหรับ reentry
- ล้าง active task หลังจบงานแบบไม่หลอกว่ามันยังค้าง

สรุปสั้น:

- MIND ตอนนี้เหมาะกับ `demo / closed beta` ขนาดเล็ก

## What Is Still Beta

ของที่ยังต้อง harden ต่อ:

- `rescue` ยังมีโอกาส `503` หรือ output drift บางรอบ
- eval coverage ยังไม่สมดุลทุก route
- rare-state UX ยังต้องเก็บให้เนียนขึ้น

ดังนั้น MIND ตอนนี้ยังไม่ใช่ product ที่ควร launch กว้าง
แต่เป็น beta ที่มี narrative ชัดและทดลองกับผู้ใช้จริงชุดเล็กได้แล้ว

## How To Demo In 3-5 Minutes

1. เริ่มที่หน้าแรกแล้วพูดว่า `ไม่มีไฟล์ก็เริ่มได้`
2. วางข้อความลูกค้าหรือ braindump จริง 1 ก้อน
3. ให้ดูว่า MIND สรุปสถานการณ์และเสนอ `ก้าวแรกเดียว`
4. กดเข้า `SCAFFOLD` แล้วโชว์ว่า `ย่อยให้เล็กลงอีก` ได้
5. ถ้าต้องการโชว์ differentiator ให้กด `ฉันติดอยู่` แล้วอธิบาย `RESCUE`
6. ปิดท้ายด้วย `กลับมาแล้วงานนี้ยังไปต่อได้` เพื่อโชว์ reentry

คำที่ควรย้ำตอนเดโม:

- text-first
- files are optional context
- one task at a time
- honest failure
- rescue + reentry

## What To Say When AI Fails

เวลาระบบช่วยไม่สำเร็จในรอบนั้น อย่าพูดเหมือนมันเป็นแค่ bug เล็ก
ให้เล่าตาม product truth:

`MIND ไม่แกล้งสำเร็จ ถ้ารอบนี้ AI ยังวินิจฉัยไม่สำเร็จ ระบบจะบอกตรง ๆ ว่างานยังอยู่ครบ แล้วให้คุณลองใหม่หรือไปต่อด้วยทางสำรอง`

ประโยคนี้สำคัญ เพราะมันสะท้อน doctrine ของ MIND:

- honest failure
- local-first trust
- task continuity

## What Success Looks Like For A 5-10 User Cohort

ถือว่ารอบทดลองสำเร็จ ถ้าผู้ใช้ชุดแรก:

- เข้าใจเองว่าไม่มีไฟล์ก็เริ่มได้
- เห็นคุณค่าของ `ONE_ACTION` โดยไม่ต้องสอนมาก
- ไม่ panic เวลาระบบเข้า safe failure
- รู้สึกว่า `rescue` และ `reentry` ต่างจาก AI ทั่วไป

คำถามที่เราควรตอบได้หลัง demo:

- ผู้ใช้เริ่มพิมพ์เลยไหม
- ผู้ใช้กดรับข้อเสนอแรกไหม
- ผู้ใช้รู้สึกว่างานยังอยู่ไหมเวลา AI fail
- ผู้ใช้เห็นไหมว่า MIND ช่วย “พางานไปต่อ” ไม่ใช่แค่ตอบเก่ง

## Straight Answer

MIND ตอนนี้ไม่ใช่ generic AI assistant

มันกำลังกลายเป็นผู้ช่วยสำหรับ `งานลูกค้าชิ้นเดียวที่รกอยู่ตรงหน้า`
และตอนนี้พร้อมพอสำหรับการเดโมหรือ closed beta เล็กเพื่อเก็บ signal จริงแล้ว
