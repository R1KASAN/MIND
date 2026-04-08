# MIND Multi-Room Discovery Checklists

Updated: 2026-04-08

## Purpose

เอกสารนี้ใช้สำหรับเก็บหลักฐานและตัดสินใจว่า MIND พร้อมจะขยับจาก `single-room confidence` ไปสู่ `multi-room discussion` หรือยัง

นี่คือ discovery checklist ไม่ใช่ coding backlog  
หน้าที่ของมันคือช่วยทีมตอบว่า:

- ตอนนี้เรารู้อะไรแล้ว
- อะไรยังเป็น assumption
- อะไรคือหลักฐานที่ต้องมี
- เมื่อไรควร `pass`
- เมื่อไรควร `hold`

## Phase 0 — Hold The Boundary

### Goal

ทำให้ทีมเข้าใจตรงกันว่า fake multi-room UI คือ red flag และยังไม่ควรเปิด `+ New WorkRoom`

### Questions To Answer

- ทุกคนเข้าใจตรงกันไหมว่าระบบตอนนี้ยังเป็น `single-session / single-active-task`
- ทีมเห็นตรงกันไหมว่าความเสี่ยงใหญ่สุดคือ `boundary trust`
- ทีมใช้คำว่า `room` ในความหมายเดียวกันหรือยัง

### Evidence To Collect

- สรุป current truth ของระบบจากเอกสารและการตรวจ code
- สรุป risk language ที่ทีมยอมรับร่วมกัน
- ตัวอย่าง failure mode ที่ทุกคนเห็นว่า unacceptable

### Pass / Hold Criteria

- `Pass` เมื่อทีมยอมรับ risk framing เดียวกันและไม่มอง `+ New WorkRoom` เป็น quick win
- `Hold` ถ้ายังมีความเข้าใจไม่ตรงกันว่า room คืออะไร หรือยังมีคนเสนอให้เปิด UI ก่อน model

### Do Not Assume

- อย่าคิดว่าทุกคนเข้าใจคำว่า room ตรงกันเอง
- อย่าคิดว่า UI หลายห้องเป็นเรื่องเล็กเพราะยังไม่แตะ backend
- อย่าคิดว่าผู้ใช้จะแยก boundary เองได้ถ้าระบบยังไม่ชัด

### Decision Output

- ข้อสรุปร่วมกันว่า `ยังไม่เปิด multi-room UI`
- ภาษากลางของทีมสำหรับคุยเรื่อง boundary risk

## Phase 1 — Studio First In One Room

### Goal

พิสูจน์ว่า Studio, context snapshot, และ reentry ในห้องเดียวช่วยผู้ใช้จริง

### Questions To Answer

- Studio ลดการเดาว่าต้องพิมพ์อะไรได้จริงไหม
- context snapshot เพิ่ม trust หรือเพิ่ม noise
- reentry ในห้องเดียวช่วยให้ผู้ใช้กลับมาเริ่มต่อเร็วขึ้นไหม
- ผู้ใช้เข้าใจ room เดียวของ MIND ดีขึ้นหรือสับสนมากขึ้น

### Evidence To Collect

- user feedback จากการใช้ Studio/reentry ในห้องเดียว
- ตัวอย่าง session ที่ผู้ใช้กลับมาแล้ว “ต่อได้ทันที”
- สัญญาณว่าผู้ใช้ยังสับสนเรื่อง context อยู่หรือไม่
- หลักฐานว่า Studio ไม่กลบ DUMP-first

### Pass / Hold Criteria

- `Pass` เมื่อ Studio/reentry ในห้องเดียวช่วยให้เริ่มหรือกลับมาต่อได้ดีขึ้นอย่างสม่ำเสมอ
- `Hold` ถ้าผู้ใช้ยังงงในห้องเดียว หรือยังไม่ไว้ใจว่า MIND ใช้อะไรมาคิด

### Do Not Assume

- อย่าคิดว่า Studio ที่ดูดีแปลว่ามี product value จริง
- อย่าคิดว่าถ้าคนอยากได้หลายห้อง แปลว่าห้องเดียวตอนนี้ดีพอแล้ว
- อย่าคิดว่า reentry success ในห้องเดียวจะ translate ไปหลายห้องอัตโนมัติ

### Decision Output

- คำตอบว่า `room เดียวของ MIND มี meaning พอหรือยัง`
- รายการ assumption ที่ยังค้างก่อนคุยเรื่องหลายห้อง

## Phase 2 — Room Model Decision

### Goal

ตัดสินใจว่าทีมพร้อมหรือยังที่จะคุยเรื่อง app-level state กับ room-level state อย่างจริงจัง

### Questions To Answer

- อะไรคือ app-level state ที่ควรมีหนึ่งเดียว
- อะไรคือ room-level state ที่ห้ามปนกัน
- reentry, rescue, overview, archive, และ search จะเปลี่ยนความหมายอย่างไรถ้ามีหลายห้อง
- legacy current state จะกลายเป็นต้นตอของ boundary confusion หรือไม่

### Evidence To Collect

- รายการ state ที่มีอยู่ในระบบปัจจุบันพร้อมคำอธิบายระดับแนวคิด
- mapping ว่า state ไหนควรอยู่ระดับ app และ state ไหนควรอยู่ระดับ room
- รายการ ambiguity ที่ทีมยังตอบไม่ได้
- risk review จาก product + design + engineering

### Pass / Hold Criteria

- `Pass` เมื่อทีมตอบได้ชัดว่าอะไรต้องแยก และอะไรยังเป็น shell-level concern
- `Hold` ถ้ายังมี state สำคัญที่ไม่มี owner ชัด หรือยังตอบไม่ได้ว่า reentry/search/overview จะอิง room ไหน

### Do Not Assume

- อย่าคิดว่า room boundary จะชัดขึ้นเองระหว่าง implementation
- อย่าคิดว่า legacy state จะ migrate เข้า room model แบบ painless
- อย่าคิดว่าคำว่า room-level state เป็นแค่เรื่อง data structure

### Decision Output

- คำตัดสินว่า `พร้อมคุย multi-room อย่างจริงจังหรือยัง`
- รายการ boundaries ที่ต้องถือเป็น non-negotiable

## Phase 3 — New WorkRoom Readiness

### Goal

ตัดสินใจว่าปลอดภัยพอหรือยังที่จะเริ่มคุยเรื่อง `+ New WorkRoom` ในฐานะ feature ที่ผู้ใช้จะเห็น

### Questions To Answer

- ถ้าเปิดห้องใหม่ ผู้ใช้จะเข้าใจไหมว่ามันต่างจากเริ่มงานใหม่ในห้องเดิมอย่างไร
- room creation ยังรักษา DUMP-first ได้ไหม
- Studio ในห้องใหม่จะ inactive อย่างซื่อสัตย์จนกว่าจะมีบริบทแรกได้หรือไม่
- ผู้ใช้จะรู้ไหมว่าอะไรถูกบันทึกไว้ที่ไหน

### Evidence To Collect

- product narrative ว่าทำไมต้องมีห้องใหม่
- criteria ว่าเมื่อไร `+ New WorkRoom` จะไม่ทำให้ boundary trust พัง
- ตัวอย่าง confusion ที่อาจเกิดขึ้นเมื่อมีหลายห้อง
- หลักฐานว่า multi-room จะไม่แซงคิวงาน core confidence ของ wave ปัจจุบัน

### Pass / Hold Criteria

- `Pass` เมื่อทีมมั่นใจว่า `+ New WorkRoom` จะไม่หลอกผู้ใช้เรื่อง boundary และไม่กลบ DUMP-first
- `Hold` ถ้ายังมีความเสี่ยงว่า UI จะดูแยกห้องได้ก่อนที่ระบบจะแยกจริง

### Do Not Assume

- อย่าคิดว่าการวางปุ่มไว้ที่ header ทำให้ปัญหา boundary หายไป
- อย่าคิดว่าห้องใหม่ที่ดูว่างคือประสบการณ์ที่ดีโดยอัตโนมัติ
- อย่าคิดว่า user ต้องการหลายห้องมากกว่าต้องการกลับเข้าห้องเดิมให้ดีขึ้น

### Decision Output

- คำตอบว่า `พร้อมคุย + New WorkRoom แล้วหรือยัง`
- ถ้ายังไม่พร้อม ต้องรู้ชัดว่าขาดหลักฐานอะไร
