# Golden Test Set for MIND

This golden test set defines mock user input dumps, expected classifications, ideal next actions (grounded in user anchors), and expected rescue/reentry modes. Use this dataset to validate prompt changes and model upgrades offline without breaking the live demo branch.

---

## Scenario 1: ABC Corp CPU Spike RCA (Client Delivery & Incident)

### User Input Dump
```text
ระบบล่มตอนตีสองเพราะ CPU spike ที่ server webhook ลูกค้าโกรธมาก โดยเฉพาะทีม ABC Corp ที่กำลังดีเลย์เฟสสองอยู่ ตอนนี้ยังหาสาเหตุไม่ได้เลย แชตไลน์เด้งตลอด คุยกันในทีมก็ยังไม่เคลียร์ว่าจะแก้ยังไงดี
```

### Grounding Anchors (Real Work Nouns)
- `ABC Corp` (Customer/Stakeholder)
- `CPU spike` / `server webhook` (Technical context)
- `RCA` / `ระบบล่ม` (Incident signal)

### Expected Target Classification
- **Workflow Type**: `client_response` (Immediate pressure from client/delivery concern)
- **Task Shape Deliverable**: `execution`
- **Immediate Need**: `resume_execution` / `define_scope`
- **Behavior Intent**: `client_delivery`

### Target Recommended Action
- **Title**: สรุปสาเหตุเบื้องต้นและจดสิ่งที่ยังไม่แน่ชัดเรื่อง CPU spike เพื่อรายงาน ABC Corp
- **Rationale**: เพื่อลดแรงกดดันจากแชตที่ไล่จี้ โดยการแสดงความคืบหน้าแบบตรงจุดและโปร่งใส
- **Micro-steps**:
  1. ลิสต์ 3 สาเหตุที่เป็นไปได้ของ CPU spike ที่ Server Webhook
  2. จดข้อมูลเพิ่มเติมที่ต้องใช้วิเคราะห์ RCA ในแชนเนลทีม
  3. ร่าง Status Update ส่งให้ ABC Corp โดยไม่เพิ่งคอมมิตเวลาแก้ไขที่ชัดเจน

### Expected Rescue Mode (if blocked)
- **Rescue Mode**: `shrink` (Break down the analysis into one small diagnostic step) or `clarify` (Identify the single missing piece of information)

---

## Scenario 2: Proposal Request with Fragmented Info (Client Response & Unclear Scope)

### User Input Dump
```text
ช่วยทำ proposal ตัวใหม่ให้ลูกค้าหน่อย อยากได้เรื่องระบบ AI ในร้านค้าส่ง แต่ข้อมูลยังกระจัดกระจายมาก มีพวกโน้ตขอบเขตงานในกระดาษนิดหน่อย แถมยังไม่ได้ประเมินราคาหรือตารางเวลาเลย จะทันส่งวีคหน้าไหมนะ
```

### Grounding Anchors (Real Work Nouns)
- `proposal`
- `ระบบ AI ในร้านค้าส่ง`
- `โน้ตขอบเขตงาน`
- `ประเมินราคา` / `ตารางเวลา`

### Expected Target Classification
- **Workflow Type**: `client_response`
- **Task Shape Deliverable**: `proposal`
- **Immediate Need**: `define_scope` (Note signals: "ข้อมูลยังกระจัดกระจาย", "โน้ตขอบเขตงานในกระดาษ")
- **Behavior Intent**: `client_delivery`

### Target Recommended Action
- **Title**: รวบรวมขอบเขตงานระบบ AI ในร้านค้าส่ง จากโน้ตกระจัดกระจาย
- **Rationale**: ก่อนจะตีราคาหรือจัดตารางเวลาได้ ขอบเขตงานขั้นต่ำต้องชัดเจนก่อนเพื่อเลี่ยงความเสี่ยง
- **Micro-steps**:
  1. พิมพ์โน้ตขอบเขตงานในกระดาษลงใน Room Memory
  2. แยก 3 ฟีเจอร์หลักของระบบ AI ที่แน่ใจแล้วออกมาเป็นลิสต์
  3. ร่างคำถามสำคัญ 2 ข้อเพื่อเคลียร์ขอบเขตส่วนที่ยังคลุมเครือ

### Expected Rescue Mode (if blocked)
- **Rescue Mode**: `clarify` (Target missing inputs like pricing metrics or milestone dates)

---

## Scenario 3: Task Overload & Energy Stall (Personal Friction)

### User Input Dump
```text
หิวข้าวมาก เหนื่อยด้วย งานวันนี้เยอะจนเลือกไม่ถูกว่าจะเริ่มอะไรดี ค้างเต็มไปหมด ทั้งเอกสารรายงานสรุปรายสัปดาห์ ทั้งตรวจสเปกเว็บใหม่ หัวสมองตื้อไปหมดแล้วตอนนี้
```

### Grounding Anchors (Real Work Nouns)
- `หิวข้าว` / `เหนื่อย` / `ตื้อ` (Friction indicators)
- `รายงานสรุปรายสัปดาห์` (Task context)
- `ตรวจสเปกเว็บใหม่` (Task context)

### Expected Target Classification
- **Workflow Type**: `client_resume`
- **Task Shape Deliverable**: `unknown`
- **Immediate Need**: `resume_execution`
- **Behavior Intent**: `personal_friction`

### Target Recommended Action
- **Title**: พักกินข้าวและหยุดทำงานสั้น ๆ 15 นาทีเพื่อคืนพลังงาน
- **Rationale**: ร่างกายและพลังงานสมองที่ไม่พร้อมทำให้อัตราตัดสินใจผิดพลาดสูงขึ้น ควรเคลียร์พลังงานก่อน
- **Micro-steps**:
  1. ล็อกหน้ารายงานสรุปรายสัปดาห์และสเปกเว็บใหม่ไว้ชั่วคราว
  2. ไปทานอาหารหรือดื่มน้ำโดยไม่เปิดหน้าจอทำงาน
  3. กลับมาเลือกเพียงหนึ่งรายการงานที่ใช้เวลาทำไม่เกิน 10 นาที

### Expected Rescue Mode (if blocked)
- **Rescue Mode**: `pause_cleanly` (Provides structural permission to park the task cleanly and return later)
