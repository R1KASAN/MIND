# Refine Layer — Behavior Intent Dev Notes

## Scope Check

เป้าหมายของการแก้ครั้งนี้คือให้ระบบจำแนกข้อความที่มี **emotional friction + client context** ได้ตรงเจตนามากขึ้น โดยเฉพาะเคสที่มีทั้งคำอารมณ์ (กลัว, รู้สึกผิด, ไม่กล้า) และคำที่บอกว่ามีลูกค้า/ผู้ว่าจ้างเข้ามาเกี่ยวข้อง แต่ก่อนหน้านี้ถูกลากไปเป็น `admin_task` แล้วทำให้ Refine Layer ทำงานต่อบน intent ที่ผิด ซึ่งขัดกับหลัก “behavior-first” ที่เราต้องการ.

***

## Minimal Intended Change

1. **ขยาย emotional / friction vocabulary ใน `hasPersonalFrictionSignal`**
   - เพิ่มคำในกลุ่ม: `กลัว`, `รู้สึกผิด`, `ไม่กล้า`, `กังวล`, `แพนิค`, `ลน`, `ท้อ`, `ทะเลาะ` ฯลฯ
   - เป้าหมาย: ถ้าข้อความมีคำเหล่านี้ ให้ **personal friction ชนะก่อน** แม้จะมีคำที่ฟังเหมือน task/admin ปนอยู่

2. **ปรับน้ำหนัก client vocabulary ใน `detectBehaviorIntentFromText`**
   - ให้คำว่า `ลูกค้า`, `client`, `ผู้ว่าจ้าง` ดัน intent ไปทาง `client_delivery` ในกรณีที่ไม่มีสัญญาณ personal friction
   - ถ้ามีทั้ง emotional signal และ client signal พร้อมกัน: จัดเป็น `personal_friction` ก่อน (เพราะโจทย์หลักคือ emotional stuck, ไม่ใช่ pure delivery)

สิ่งนี้สอดคล้องกับแนวทางใน PMF guide ที่เน้นอ่าน “pain context + current workaround” ให้ชัดก่อน แล้วค่อยเลือก solution fit ไม่ให้หลุดกรอบ.

***

## Work Performed

- แก้ไขไฟล์ **`src/lib/ai/task-shape.ts`**
  - อัปเดตฟังก์ชัน `hasPersonalFrictionSignal` ด้วย emotional lexicon ชุดใหม่
  - ปรับตรรกะใน `detectBehaviorIntentFromText` ให้:
    - เช็ก personal friction ก่อน
    - ถ้าไม่ติด personal friction และมี client keywords → เทไป `client_delivery`
- อัปเดตไฟล์ยูนิตเทส **`src/lib/ai/task-shape.test.ts`**
  - เพิ่มเคสทดสอบภาษาไทยจริงแบบ mixed-intent (`ทะเลาะกับลูกค้า + กลัว/รู้สึกผิด + ไม่กล้าส่งงาน` => `personal_friction`)
  - เพิ่มเคสทดสอบลูกค้าสัมพันธ์แบบปกติ (`ลูกค้าด่า` => `client_delivery`) เพื่อป้องกันการถดถอย (Regression)
- รันการทดสอบความถูกต้อง:
  - `npm run test`

***

## What Actually Changed (Behavior)

- **Mixed‐intent fix:**
  - ก่อนหน้า: ข้อความอย่าง “ทะเลาะกับลูกค้าเลยไม่กล้าส่งงานต่อ รู้สึกผิดทั้งกลัวโดนดุ...” ถูกจัดเข้า `admin_task` เพราะระบบเกาะกับ pattern แบบ “ไม่รู้จะเริ่มจากตรงไหนดี”
  - หลังแก้: Emotional signals (`ทะเลาะ`, `กลัว`, `รู้สึกผิด`, `ไม่กล้า`) ทำให้ข้อความถูกจัดเข้า `personal_friction` ก่อน ส่งผลให้ Refine Layer ทำงานด้วยภาษาที่ตรงเจตนาภายใน (self-state) มากขึ้น แทนที่จะโยนเทมเพลต admin 15 นาทีมาให้
- **Client relational fallback:**
  - ถ้ามีคำว่า `ลูกค้า`/`client`/`ผู้ว่าจ้าง` แต่ไม่มีคำอารมณ์ → ระบบจะตีความเป็น `client_delivery` มากขึ้น แทนการหลุดไป `admin_task`
  - เหมาะกับเคสเช่น “ลูกค้าขอแก้ใบเสนอราคา / ยังไม่แน่ใจจะตอบยังไงให้เคลียร์” ที่หลัก ๆ คือการเตรียมตอบลูกค้า ไม่ใช่สภาพอารมณ์ล้วน ๆ

ผลลัพธ์: Intent detection ตอนนี้สอดกับ behavior-first refine ที่เราทดสอบไปก่อนหน้า โดยไม่บังคับให้ refine layer “เดาเจตนาใหม่” จาก intent ที่ผิดตั้งแต่ต้น.

***

## Verification Results

1. **Spot test ด้วยเคสปัญหาเดิม**
   - เคส: “ทะเลาะกับลูกค้า + กลัว/รู้สึกผิด + ไม่กล้าส่งงาน”
   - ผลก่อนหน้า: `admin_task`
   - ผลหลังแก้: `personal_friction` (ตรงตามเป้าที่ตั้งไว้)
2. **Full test suite**
   - คำสั่ง: `npm run test`
   - ผล: ผ่านครบ **268/268 tests** (รวม 2 ยูนิตเทสเคสภาษาไทยจริงที่เพิ่งเพิ่มเข้าไปใหม่)
   - ยืนยันว่าการจำแนกคำศัพท์ไม่ทำให้ behavior ของเจตนาอื่น ๆ เสียหาย
3. **Workspace hygiene**
   - การรวบรวมไฟล์ทดสอบทำผ่านตัวทดสอบจริงในระบบแล้ว ไม่มีขยะตกค้างใน Workspace

***

## Suggested Next Step

พฤติกรรมของ intent detection ตอนนี้สอดคล้องอย่างสมบูรณ์กับแนวทางใน PMF pack โดยชุดเทสได้ทำหน้าที่เป็น **evidence of pain patterns** ด้วยกรณีศึกษาภาษาไทยจริงแล้ว
ในรอบถัดไป หากเก็บข้อมูล Log หรือเจอปัญหาจำเพาะเพิ่มเติมจาก User Session สามารถทยอยนำสัญญาณเหล่านั้นเข้ามาขยายใน Test Cases ได้โดยไม่กระทบความมั่นคงของโมเดลเดิมครับ
