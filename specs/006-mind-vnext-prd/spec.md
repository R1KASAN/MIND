# MIND vNext — Product Requirements Document
# เอกสารกำหนดความต้องการผลิตภัณฑ์ MIND vNext

**Canonical Path**: `specs/006-mind-vnext-prd/`  
**Version**: vNext 1.1.0 — Normalized Draft  
**Created**: 2026-04-07  
**Status**: Draft — Ready for Technical Planning  
**Constitution Authority**: MIND Constitution v3.0.0 (ratified 2026-04-06)

**Related Addendum**:
- `specs/006-mind-vnext-prd/architecture-ai-operations-addendum.md`

> [!IMPORTANT]
> เอกสารฉบับนี้เป็น PRD หลักของ MIND vNext และเป็น source of truth เพียงชุดเดียวของรอบ vNext
> เอกสารนี้ไม่แก้ความหมายของ `specs/005-mind-full-prd` และไม่แก้ Constitution หรือ Speckit templates ส่วนกลาง

---

## 1. Objective — วัตถุประสงค์

MIND vNext คือเครื่องมือ AI แบบ local-only สำหรับ **ตอบ + รีสตาร์ทงานลูกค้า** ของ freelancer และ consultant ที่ต้องสลับบริบทระหว่างลูกค้าหลายราย และมักมีงานที่ค้างหรือต้องกลับมาตอบในสถานการณ์ที่ไม่ง่าย

วัตถุประสงค์หลักของผลิตภัณฑ์คือ:
1. ช่วยให้ผู้ใช้ **ตอบอีเมลหรือข้อความจากลูกค้าได้เร็วขึ้นและมั่นใจขึ้น** โดยไม่ต้องไล่อ่านบริบทเดิมทั้งหมดตั้งแต่ต้น
2. ช่วยให้ผู้ใช้ **กลับมาแตะโปรเจกต์ลูกค้าที่ค้างอยู่ได้ในไม่กี่นาที** แม้งานนั้นจะหยุดไปแล้ว 1–3 สัปดาห์หรือมากกว่า
3. ช่วยให้ผู้ใช้ได้ **one next action ที่เริ่มได้ทันที** โดยไม่พาโปรดักต์ drift ไปเป็น planner, task manager, หรือ generic AI chatbot

---

## 2. Product Direction — ทิศทางของผลิตภัณฑ์

MIND vNext ต้องคงอัตลักษณ์หลักของผลิตภัณฑ์ไว้ดังนี้:
- local-only
- Ollama-first
- one visible action
- speed-first
- honest Ollama recovery flow
- file upload เป็น context ingestion สำหรับ task room ไม่ใช่ file manager

MIND vNext ไม่ใช่:
- productivity app แบบกว้าง
- planner หรือ task manager
- generic AI chatbot
- ระบบจัดการ backlog
- เครื่องมือจัดการงานทุกประเภทในชีวิตของผู้ใช้

นิยามที่ต้องใช้สม่ำเสมอในทุกเอกสาร vNext คือ:

> **MIND vNext = ปุ่ม Reply + Resume สำหรับงานลูกค้าที่ค้าง**

---

## 3. Problem Statement — ปัญหาที่ผลิตภัณฑ์แก้ไข

freelancer และ consultant มักเสียเวลาและพลังงานจำนวนมากกับงาน 2 ประเภทที่เกิดซ้ำอยู่เสมอ

### 3.1 การตอบลูกค้าในสถานการณ์ที่ยาก
- ลูกค้าส่ง feedback ยาว
- ลูกค้าขอแก้งานหลายอย่างพร้อมกัน
- ลูกค้าหายไปนานแล้วเพิ่งตอบกลับ

ในสถานการณ์เหล่านี้ ผู้ใช้มัก:
- ต้องเสียเวลาอ่านอีเมลหรือแชตยาวเพื่อจับประเด็นใหม่ทั้งหมด
- ไม่แน่ใจว่าควรตอบอะไรกลับก่อน
- ไม่แน่ใจว่าควรขยับงานชิ้นใดก่อนเพื่อให้โปรเจกต์เดินต่อ

### 3.2 การรีสตาร์ทงานลูกค้าที่ค้างมานาน
- โปรเจกต์ถูกทิ้งไว้ 1–3 สัปดาห์หรือมากกว่า
- มีโน้ต, ไฟล์, ข้อความคุย และบริบทเก่าอยู่กระจัดกระจาย
- ผู้ใช้ไม่รู้ว่าตอนนี้งานอยู่จุดไหน และควรเริ่มตรงไหนก่อน

ปัญหาหลักจึงไม่ใช่การไม่มีเครื่องมือจัดการงาน แต่คือการเสียเวลาไปกับการ **กลับเข้าบริบทเดิม** และการ **เริ่มลงมือในงานลูกค้าที่ค้างหรือคุยยาก**

---

## 4. Target User / Persona — กลุ่มผู้ใช้เป้าหมาย

### Persona หลัก

freelancer หรือ consultant ที่:
- มีลูกค้าหลายรายพร้อมกัน
- มีงานลูกค้าที่ค้างอยู่บ่อย
- ต้องสลับไปมาระหว่างหลายโปรเจกต์
- รู้สึกเสียเวลาและพลังไปกับการกลับเข้า context ของงานเก่า
- รู้สึกเครียดหรือตันเมื่อต้องตอบลูกค้าในสถานการณ์ที่คลุมเครือหรือกดดัน

### สิ่งที่ persona กลุ่มนี้ให้ความสำคัญ
- ความเร็วในการเริ่มงาน
- ความเรียบง่ายของ flow
- ความเป็นส่วนตัวของข้อมูลลูกค้า
- ความซื่อสัตย์ของระบบเมื่อ AI ไม่พร้อม

### Jobs-to-be-Done หลัก
1. “ช่วยให้ตอบลูกค้าและขยับงานต่อได้ โดยไม่ต้องไล่อ่านทุกอย่างเองตั้งแต่ต้น”
2. “ช่วยให้เริ่มแตะงานลูกค้าได้ในไม่กี่นาที แม้จะค้างมานาน”

---

## 5. Core User Story / Key Use Cases — เรื่องราวหลักของผู้ใช้

### Workflow 1: Client Response

ผู้ใช้ paste อีเมลหรือข้อความจากลูกค้าเข้า MIND เมื่อ:
- ลูกค้าส่ง feedback ยาว
- ลูกค้าขอแก้งานหลายอย่าง
- ลูกค้าหายไปนานแล้วเพิ่งตอบกลับ

MIND ต้องให้ผลลัพธ์ 3 อย่างในรอบเดียว:
1. สรุปสถานการณ์และบริบทปัจจุบันแบบสั้น
2. draft ข้อความตอบกลับลูกค้า
3. one next action ที่ช่วยขยับงานต่อ

กฎสำคัญ:
- one next action ต้องเป็น **primary output**
- summary และ draft reply เป็น **supporting outputs**
- ผลลัพธ์ทั้งหมดต้องช่วยให้ผู้ใช้ “ตอบ + ขยับงาน” ต่อได้จริงในรอบเดียว

### Workflow 2: Client Project Resume

ผู้ใช้ dump โน้ต, ข้อความคุย, หรือสรุปเก่าเกี่ยวกับโปรเจกต์ลูกค้าที่ค้างไว้ เมื่อ:
- งานนั้นค้างมาแล้ว 1–3 สัปดาห์หรือมากกว่า
- มีบริบทเก่ากระจัดกระจาย
- ผู้ใช้ไม่แน่ใจว่าควรเริ่มตรงไหนก่อน

MIND ต้องให้ผลลัพธ์ 2 อย่าง:
1. สรุปว่าโปรเจกต์อยู่จุดไหนแล้ว และอะไรยังค้างอยู่
2. one next action ขนาดเล็กที่ใช้เริ่มงานต่อได้ทันที

### Workflow 3: File Room Context Ingestion

เมื่อผู้ใช้มีบริบทกระจายอยู่ใน PDF brief, screenshot feedback, note เก่า, หรือข้อความคุยที่เกี่ยวกับงานเดียวกัน MIND ต้องรับสิ่งเหล่านี้เข้ามาเป็น **room-scoped context** สำหรับ workflow ปัจจุบัน

กฎของ workflow นี้:
- 1 room = 1 task / 1 client context
- room เดิมต้อง resume ต่อได้จาก checkpoint เดิม
- context จาก room หนึ่งห้ามไหลไปอีก room
- file upload ต้องช่วยให้ `client_response` และ `client_resume` สรุปได้เร็วขึ้น ไม่ใช่สร้าง file browser หรือ workspace ใหม่

การจับคู่ที่ต้องใช้ในผลิตภัณฑ์:
- `client_response`: PDF brief + screenshot feedback + text แชต → สรุปสถานการณ์ + draft reply + one next action
- `client_resume`: PDF scope/requirements + note เก่า → สรุปว่าโปรเจกต์อยู่ตรงไหนแล้ว + one next step

### Workflow สนับสนุน: Honest Recovery

หาก Ollama ไม่พร้อมใช้งาน:
- ระบบต้องบอกสถานะจริงอย่างตรงไปตรงมา
- ผู้ใช้ต้อง retry ได้ทันทีจากบริบทเดิม
- ผู้ใช้ยังสามารถ bypass ไปแบบ manual ได้สำหรับรอบนั้น
- ระบบต้องไม่สร้างผลลัพธ์ AI ปลอมเพื่อทำเหมือนว่าประสบความสำเร็จ

---

## 6. Core Market Problem & Business Value — ปัญหาตลาดและคุณค่าทางธุรกิจ

### ปัญหาหลักในตลาด (สำหรับ freelancer/consultant)
- ผู้ใช้งานใช้เวลาอย่างมีนัยสำคัญไปกับการ “เริ่มแตะงานลูกค้า” โดยเฉพาะงานที่ค้างไว้หลายวันหรือหลายสัปดาห์ ทำให้เกิดเวลาตายระหว่างเปิดไฟล์หรืออีเมลกับการลงมือทำจริง
- งานลูกค้ามักค้างเพราะ blocker ด้านข้อมูลหรือการตัดสินใจ เช่น ลูกค้ายังไม่ตอบ, brief ไม่ชัด, scope ยังลอย ทำให้ผู้ใช้ไม่แน่ใจว่าควรขยับตรงไหนก่อน
- การสลับไปมาระหว่างหลายโปรเจกต์และหลาย client ทำให้ผู้ใช้สูญเสียเวลาไปกับการ “ตามให้ทันบริบทเดิม” แทนที่จะได้ใช้เวลาไปกับงานที่สร้างมูลค่า

### ตัวอย่างสถานการณ์ใช้งานจริง (Concrete Scenarios)
- ผู้ใช้กลับมาเปิดโปรเจกต์ลูกค้าที่ค้างมาสองสัปดาห์ มีทั้งโน้ต, ไฟล์, และอีเมลกระจัดกระจาย แต่ไม่แน่ใจว่าควรทำอะไรเป็นอย่างแรก → MIND ช่วยสังเคราะห์ dump แล้วเสนอหนึ่ง action ที่ลงมือทำได้ทันที เช่น “สรุปสถานะปัจจุบันและลิสต์สิ่งที่ยังค้างให้ลูกค้า”
- ผู้ใช้ได้รับอีเมลจากลูกค้าที่เต็มไปด้วย feedback และคำขอแก้ไขหลายข้อ ทำให้งงว่าจะตอบอย่างไรและควรจัดลำดับการแก้อย่างไร → MIND รับข้อความ dump แล้วเสนอหนึ่ง action ที่ช่วย “ปลดล็อกการตอบ” เช่น “ร่างอีเมลตอบกลับพร้อมถามจุดที่ยังไม่ชัดเจน”
- โปรเจกต์ติดเพราะรอไฟล์, ข้อมูล, หรือการอนุมัติจากลูกค้า ผู้ใช้ไม่แน่ใจว่าควรปล่อยทิ้งไว้หรือ follow up อย่างไร → MIND วิเคราะห์ว่าเป็น dependency blocker และแนะนำ action ที่ช่วยขยับ blocker เช่น “ส่งข้อความ follow up พร้อมสรุปสิ่งที่รออยู่”

### คุณค่าทางธุรกิจที่ MIND มอบให้
- ลดเวลาที่สูญเสียไปกับการ “เอาตัวเองกลับเข้าสู่บริบทงานลูกค้า” และช่วยให้ผู้ใช้เริ่มลงมือทำได้เร็วขึ้นอย่างสม่ำเสมอ
- ลดความเสี่ยงที่งานลูกค้าค้างนานจนกระทบความสัมพันธ์และรายได้ เนื่องจากผู้ใช้มีเครื่องมือที่ช่วยขยับงานแม้ในสภาวะที่ข้อมูลยังไม่ครบ
- เสริมความมั่นใจด้านความเป็นส่วนตัวสำหรับงานที่มีข้อมูลลูกค้าสำคัญ ผ่านการทำงานแบบ local-only และ Ollama-first โดยไม่ต้องพึ่งพา cloud AI ภายนอก

---

## 7. Value Proposition — คุณค่าที่นำเสนอ

MIND vNext ต้องสื่อสารคุณค่าหลักด้วยภาษาที่ชัดและขายออกได้ดังนี้:

- **ช่วยให้เริ่มแตะงานลูกค้าได้ในไม่กี่นาที แม้จะค้างมานาน**
- **ช่วยให้ตอบลูกค้าและขยับงานต่อได้ โดยไม่ต้องไล่อ่านทุกอย่างเองตั้งแต่ต้น**

ในเชิง positioning:
- MIND ไม่ได้พยายามเป็นเครื่องมือจัดการงานทุกประเภท
- MIND ชนะในงานที่ “ตอบยาก” และ “กลับมาเริ่มยาก”
- MIND เป็น Resume และ Reply layer ที่อยู่ก่อนการลงมือทำจริง

---

## 8. Product Principles — หลักการออกแบบผลิตภัณฑ์

1. **One visible action first**  
   ผลลัพธ์หลักที่ผู้ใช้ต้องเห็นก่อนเสมอคือก้าวถัดไปหนึ่งอย่าง

2. **Reply and resume, not everything**  
   ระบบถูกออกแบบมาเพื่อช่วยตอบลูกค้าและรีสตาร์ทงานค้าง ไม่ใช่จัดการงานทุกมิติของชีวิต

3. **Auto-first intelligence**  
   blocker detection และการตีความบริบทต้องพยายามทำเองก่อน เพื่อรักษาความเร็ว

4. **Truthful recovery**  
   ถ้า Ollama ไม่พร้อม ระบบต้องไม่แกล้งสำเร็จ

5. **Privacy is part of the value**  
   local-only และ Ollama-first ไม่ใช่แค่ technical choice แต่เป็นส่วนหนึ่งของ product promise

---

## 9. Functional Requirements — ข้อกำหนดเชิงพฤติกรรม

- **FR-001** ระบบต้องรองรับ 2 workflow หลักคือ `client response` และ `client project resume`
- **FR-002** ใน workflow ตอบลูกค้า ระบบต้องให้ 3 outputs คือ situation summary, draft reply, และ one next action ในรอบเดียว
- **FR-003** ใน workflow รีสตาร์ทโปรเจกต์ค้าง ระบบต้องให้ 2 outputs คือ situation summary และ one next action
- **FR-004** one next action ต้องเป็น primary output เสมอ และต้องเริ่มได้ทันทีในเชิงปฏิบัติ
- **FR-005** ระบบต้องตรวจจับ blocker แบบ auto-first และถาม clarification ได้สูงสุด 1 ครั้งเมื่อจำเป็น
- **FR-006** เมื่อ blocker ชัดเจน next action ต้องช่วยจัดการ blocker ก่อน ไม่ใช่ข้ามไปทำงานอื่น
- **FR-007** ระบบต้องทำงานแบบ local-only และไม่ส่งข้อมูลลูกค้าออกนอกเครื่อง
- **FR-008** เมื่อ Ollama ใช้งานไม่ได้ ระบบต้องเข้าสู่ honest recovery flow โดยไม่มี synthetic success
- **FR-009** ผู้ใช้ต้อง retry ได้จากบริบทเดิมโดยไม่ต้องพิมพ์ dump ใหม่
- **FR-010** manual fallback ต้องเป็น explicit bypass สำหรับรอบนั้น ไม่ใช่ผลลัพธ์ที่อ้างว่า AI สร้างให้
- **FR-011** completion loop ต้องกลับไปจุดเริ่มต้นอย่างเงียบและไม่สร้างแรงกดดัน
- **FR-012** lightweight pattern memory และ low-energy comeback ต้องเป็น internal behavior เท่านั้น

---

## 10. Non-Functional Requirements — ข้อกำหนดที่ไม่ใช่ฟังก์ชัน

- ระบบต้องรักษาความเร็วของ flow เป็น priority หลัก
- ระบบต้องให้ความสำคัญกับความซื่อสัตย์ของสถานะ AI มากกว่าการทำให้ดูราบรื่นแบบปลอม
- ระบบต้องหลีกเลี่ยง planner drift, backlog drift, และ generic chat drift
- ระบบต้องคงประสบการณ์ที่เรียบง่าย ไม่บังคับให้ผู้ใช้เลือก mode ก่อน submit
- ระบบต้องใช้ภาษาไทยที่ชัดเจน สุภาพ และตรงประเด็นสำหรับผู้ใช้ฝั่ง MVP

---

## 11. AI Runtime & Failure Handling — หลักการทำงานของ AI และการกู้คืน

MIND vNext ยังคง:
- local-only
- Ollama-first
- honest recovery flow

หลักการสำคัญ:
- ถ้า Ollama สังเคราะห์ผลลัพธ์ได้จริง จึงค่อยถือว่า success
- ถ้า Ollama ใช้งานไม่ได้ ต้องคืน failure ที่มีโครงสร้างชัดเจน
- recovery surface ต้องมี retry เป็น primary action
- manual path ต้องยังมีเพื่อรักษา momentum แต่ต้องสื่อว่าเป็นการข้าม AI สำหรับรอบนั้น

รายละเอียดเชิงสัญญาและพฤติกรรมทางเทคนิคให้ยึดตาม:
- `contracts/ai-contract.md`
- `data-model.md`

---

## 12. API / Interface Requirements — ข้อกำหนดของอินเทอร์เฟซ

ในระดับผลิตภัณฑ์ MIND vNext ต้องมีอินเทอร์เฟซสำคัญ 2 กลุ่ม:

### 12.1 Health / Diagnosis Interface
ใช้บอกว่า Ollama พร้อมหรือไม่ พร้อมเหตุผลที่ผู้ใช้และระบบสามารถนำไปใช้ตัดสินใจได้

### 12.2 Synthesis Interface
ใช้สร้างผลลัพธ์สำหรับ 2 workflows หลัก โดยต้องคืนได้เพียง:
- success จาก Ollama จริง
- failure แบบมีโครงสร้างชัดเจน

ข้อกำหนดเชิง wire format, schema, และ reason enum ให้ไปอยู่ใน support docs ไม่ใช่ใน PRD หลัก

---

## 13. Telemetry & Success Metrics — ตัวชี้วัดความสำเร็จ

### Primary Value Metric
**Time-to-First-Action**

นิยาม:
- เวลา “จากเปิด MIND หลังเห็นอีเมลหรือแชตลูกค้า → จนผู้ใช้ลงมือทำ action แรก” เช่น ส่งเมล, เก็บโน้ต, หรือเริ่มทำ task แรกที่เกี่ยวข้อง
- เวลา “จากเปิด MIND เพื่อกลับมาแตะโปรเจกต์ค้าง → จนผู้ใช้ลงมือทำ action แรกกับงานนั้น” เช่น เช็กไฟล์ล่าสุด, สรุปสถานะ, หรือร่างสิ่งที่จะส่งลูกค้า

เป้าหมายในระยะแรก:
- ลด median time-to-first-action อย่างน้อย **30–50% จาก baseline ส่วนตัวของผู้ใช้** ในงานประเภท client work

### Supporting Metrics
- **Retry AI Success Rate**  
  อัตราส่วนของ session ที่ผู้ใช้กด Retry AI แล้วได้ผลลัพธ์ที่ถูกนำไปใช้จริงใน workflow ตอบลูกค้าหรือรีสตาร์ทงาน
- **Manual Bypass Rate หลัง AI ล้มเหลว**  
  สัดส่วนของกรณีที่ผู้ใช้เลือก continue manually after AI failure ในสอง workflow หลัก โดยใช้เป็นสัญญาณเตือนหากผู้ใช้ต้อง bypass บ่อยเกินไป
- **Comeback Success หลัง session ค้างหรือล้มเหลว**  
  สัดส่วนของ session ที่ผู้ใช้กลับเข้ามาในงานเดิมและสามารถเริ่ม one next action ได้ภายในเวลาที่กำหนด
- **One-Action Acceptance Rate**  
  สัดส่วนของ one next action ที่ผู้ใช้นำไปใช้จริงกับงานลูกค้า แทนที่จะปล่อยผ่านหรือเขียนใหม่ทั้งหมด

### หลักการตีความ metric
- metric ทุกตัวต้องผูกกับ **client response** และ **client project resume**
- ห้ามใช้ usage metric ที่ไม่สะท้อนผลลัพธ์จริงของงานลูกค้าเป็นตัวชี้วัดหลัก

---

## 14. Delivery Phasing — การแบ่งระยะการพัฒนา

### Phase 1 — Honest Ollama Recovery Flow
- ทำให้ระบบซื่อสัตย์ต่อสถานะ Ollama
- เอา synthetic success ออก
- เก็บ dump context ให้ retry ได้
- จัด recovery panel ให้ retry-first, manual-second

### Phase 2 — Smarter Client Response & Resume Intelligence
- เพิ่ม blocker detection แบบ auto-first
- ปรับ one-action ให้แม่นขึ้นกับงานลูกค้า
- เพิ่ม lightweight pattern memory
- เพิ่ม low-energy comeback behavior ภายใน flow เดิม

---

## 15. Validation Plan — แผนการทดสอบเชิงตลาดและพฤติกรรม

### Persona สำหรับการทดสอบ
- freelancer/consultant ที่มีโปรเจกต์ลูกค้าพร้อมกันหลายชิ้น และมีประสบการณ์กับงานค้างหรืองานที่เริ่มต้นยาก

### Objective ของการ validation
- พิสูจน์ว่าแนวทาง “Honest Ollama + one-action ที่ฉลาดขึ้นสำหรับงานลูกค้า” สามารถ
  - ลดเวลาเริ่มหรือกลับมาแตะงานลูกค้า
  - เพิ่มโอกาสที่งานลูกค้าที่ค้างอยู่จะถูกขยับให้เดินหน้าต่อได้

### Method
- ใช้ prototype, Wizard-of-Oz หรือ manual assist เพื่อจำลอง behavior ของ MIND vNext โดยไม่จำเป็นต้อง build ระบบสมบูรณ์
- ให้ผู้ใช้ทดลองใช้ MIND กับงานจริงประเภท “unblock client work” ต่อเนื่อง 1–2 สัปดาห์
- กำหนดเคสทดลองจริงอย่างน้อย 2 แบบ:
  - เคสตอบลูกค้า (feedback ยาว, ขอแก้งาน, หายไปนาน)
  - เคสรีสตาร์ทโปรเจกต์ค้าง (1–3 สัปดาห์หรือมากกว่า)

### Sample
- ผู้ใช้จริงกลุ่มเล็ก: freelancer/consultant จำนวนประมาณ 5–10 คน

### Success Criteria
- ผู้ใช้ส่วนใหญ่รายงานว่า “ใช้เวลาในการเริ่มหรือกลับมาแตะงานลูกค้า” ลดลงอย่างรู้สึกได้
- Median time-to-first-action ใน session ที่เกี่ยวกับ client work ลดลงอย่างน้อย **30–50%** เมื่อเทียบกับ baseline ส่วนตัวของผู้ใช้
- ผู้ใช้ส่วนใหญ่ระบุว่าต้องการใช้เครื่องมือนี้ซ้ำอย่างน้อยสัปดาห์ละหลายครั้ง เมื่อมีงานลูกค้าที่เริ่มหรือขยับยาก
- มีตัวอย่างกรณีจริงที่ผู้ใช้ยกขึ้นมาเองว่า “งานลูกค้าชิ้นนี้น่าจะค้างต่อไป หากไม่มี MIND มาช่วยปลดล็อกให้เริ่มหรือขยับได้”

### Qualitative Questions
- “MIND ทำให้คุณตอบลูกค้าได้เร็วขึ้นหรือมั่นใจขึ้นหรือไม่?”
- “MIND ทำให้คุณกลับมาเริ่มโปรเจกต์ค้างได้ง่ายขึ้นหรือไม่?”

### Process Requirement
- ต้องมีการรัน validation ชุดนี้อย่างน้อยในระดับ prototype ก่อน rollout vNext เต็ม เพื่อยืนยันว่า product direction ปัจจุบันสร้างผลลัพธ์ที่มีความหมายต่อ freelancer/consultant ในงาน client work จริง ๆ

---

## 16. Monetization Hint — สมมติฐานด้านรายได้เบื้องต้น

ผู้จ่ายหลักในระยะแรกควรเป็น:
- **individual freelancer/consultant**

เหตุผลที่น่าจะยอมจ่าย:
- ลดเวลาเริ่มงานลูกค้า
- ลดแรงต้านในการตอบหรือรีสตาร์ทงานค้าง
- ได้ privacy-first workflow สำหรับข้อมูลลูกค้า
- ได้ one next action ที่ช่วยขยับงานต่อโดยไม่ต้องไล่อ่านทุกอย่างเอง

section นี้มีไว้เพื่อยืนยัน business value เท่านั้น ไม่ใช่แผน pricing เต็มรูปแบบ และยังไม่ขยายไปทาง team suite หรือ agency platform

---

## 17. Acceptance Criteria — เกณฑ์ยอมรับของ PRD นี้

เมื่ออ่าน PRD ฉบับนี้แล้ว ต้องเข้าใจทันทีว่า:
- MIND vNext คือเครื่องมือสำหรับ **ตอบ + รีสตาร์ทงานลูกค้า**
- persona หลักคือ freelancer/consultant หลาย client
- workflows หลักมี 2 กรณี:
  - client response
  - client project resume
- one visible action ยังเป็น primary output
- summary และ draft reply เป็น supporting outputs
- ทุก metric และ validation ผูกกับงานลูกค้าจริง

---

## 18. Out of Scope — ขอบเขตที่ไม่ทำในรอบนี้

- generic productivity workflows ที่ไม่เกี่ยวกับงานลูกค้า
- planner, calendar, deadline tracker, หรือ dashboard
- generic AI chat interaction
- multi-mode UI
- cloud sync
- team collaboration suite
- CRM หรือ email automation platform

---

## 19. Assumptions — ข้อสมมติฐาน

- codebase ที่จะใช้ต่อคือแอป Next.js เดิมใน `src/`
- `specs/005-mind-full-prd` ยังคงเป็น baseline implementation reference
- vNext ยังคง local-only และ Ollama-first ในเฟสนี้
- output ที่ผู้ใช้เห็นยังคงมี one visible action เป็นแกนหลัก
- support docs ในโฟลเดอร์ `006-mind-vnext-prd/` จะรับรายละเอียดเชิงเทคนิคแทน PRD หลัก
