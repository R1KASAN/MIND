# Golden Test Set for MIND

This golden test set defines mock user input dumps, expected classifications, ideal next actions (grounded in user anchors), and expected rescue/reentry modes. Use this dataset to validate prompt changes and model upgrades offline without breaking the live demo branch.

For Week 3 manual replay, score each scenario with [Week 3 Quality Rubric: Core Room Loop](week3-quality-rubric.md). A passing replay must show one grounded next action, visible evidence anchors, useful Rescue, and preserved Reentry.

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

### Week 3 Replay Expectations
- **User tension**: customer pressure, unresolved incident, unclear RCA, noisy chat.
- **Evidence anchors**: `ABC Corp`, `CPU spike`, `server webhook`, `ระบบล่ม`.
- **Visible work artifact**: short incident/status note or customer update draft.
- **Rescue blocker**: cannot safely answer ABC Corp because latest incident status/RCA is incomplete.
- **Recovery step/message**: ask for or summarize the missing status without committing a fix time.
- **Reentry result**: same room should reopen with the ABC Corp incident/action still visible.

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

### Week 3 Replay Expectations
- **User tension**: client proposal pressure with scattered scope, no price, and no timeline.
- **Evidence anchors**: `proposal`, `ระบบ AI ในร้านค้าส่ง`, `ขอบเขตงาน`, `ประเมินราคา`, `ตารางเวลา`.
- **Visible work artifact**: scoped feature list, missing-input checklist, or client clarification questions.
- **Rescue blocker**: pricing/timeline cannot be estimated because scope is not concrete enough.
- **Recovery step/message**: write 2-3 scope questions or a short note asking for missing constraints.
- **Reentry result**: same room should preserve the proposal scope state and next action.

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

### Week 3 Replay Expectations
- **User tension**: overload, hunger, fatigue, and competing work items.
- **Evidence anchors**: `หิวข้าว`, `เหนื่อย`, `รายงานสรุปรายสัปดาห์`, `ตรวจสเปกเว็บใหม่`.
- **Visible work artifact**: tiny restart checklist or one selected 10-minute task.
- **Rescue blocker**: decision quality is low because physical state and task overload are both blocking selection.
- **Recovery step/message**: park one task cleanly or choose a single smallest restart step after a short reset.
- **Reentry result**: same room should preserve the chosen restart point, not return to generic intake.

---

## Scenario 4: Release Decision with External Dependency (Rescue Pressure)

### User Input Dump
```text
QA รอคำตอบว่าจะเลื่อน release เย็นนี้ไหม payment webhook fail ไป 3 ครั้ง เพราะ provider timeout ผู้จัดการขอ update ภายใน 30 นาที แต่ผมยังไม่กล้าเปิด Jira เพราะกลัวเจอบั๊กเพิ่ม
```

### Grounding Anchors (Real Work Nouns)
- `QA` / `release เย็นนี้`
- `payment webhook`
- `provider timeout`
- `Jira`
- `ผู้จัดการ` / `30 นาที`

### Expected Target Classification
- **Workflow Type**: `client_response`
- **Task Shape Deliverable**: `reply`
- **Immediate Need**: `send_reply_now` / `define_scope`
- **Behavior Intent**: `client_delivery`

### Target Recommended Action
- **Title**: ร่าง update สั้นให้ผู้จัดการว่า release ยังไม่ควรยืนยันจนเช็ก webhook/Jira
- **Rationale**: ลดความเสี่ยงจากการยืนยัน release ก่อนรู้ผลกระทบของ provider timeout และบั๊ก critical
- **Micro-steps**:
  1. จด payment webhook fail/provider timeout เป็น bullet เดียว
  2. เปิด Jira เฉพาะ filter bug critical ของ release นี้
  3. ร่างข้อความตอบผู้จัดการว่าเช็กความเสี่ยงก่อนยืนยัน release

### Expected Rescue Mode (if blocked)
- **Rescue Mode**: `clarify` or `shrink`

### Week 3 Replay Expectations
- **User tension**: external dependency, deadline pressure, fear of Jira overload.
- **Evidence anchors**: `QA`, `release`, `payment webhook`, `provider timeout`, `Jira`, `30 นาที`.
- **Visible work artifact**: manager update draft or critical-risk checklist.
- **Rescue blocker**: user cannot decide release status because provider timeout and Jira risk are unresolved.
- **Recovery step/message**: ready-to-use manager update that avoids premature release commitment.
- **Reentry result**: same room should preserve release decision context and current blocker.

---

## Scenario 5: Reentry After Long Pause (Continue Saved Room)

### User Input Dump
```text
กลับมาทำงานห้อง ABC Corp หลังหยุดไปหลายวัน จำได้ว่ามี incident prod กับงาน Dashboard/payment API ค้าง แต่ไม่แน่ใจว่าควรต่อจากจุดไหนก่อน
```

### Grounding Anchors (Real Work Nouns)
- `ABC Corp`
- `incident prod`
- `Dashboard`
- `payment API`
- `กลับมาทำงาน`

### Expected Target Classification
- **Workflow Type**: `client_resume`
- **Task Shape Deliverable**: `execution`
- **Immediate Need**: `resume_execution`
- **Behavior Intent**: `client_delivery`

### Target Recommended Action
- **Title**: ตรวจจุดค้างล่าสุดของ ABC Corp แล้วเลือกหนึ่ง update ที่ต้องส่งต่อ
- **Rationale**: การกลับมาหลังหยุดไปหลายวันต้องเริ่มจากจุดค้างที่มีหลักฐาน ไม่ใช่เริ่มห้องใหม่
- **Micro-steps**:
  1. อ่าน evidence ล่าสุดของ incident prod
  2. เช็ก Dashboard/payment API ว่าค้างตรงไหน
  3. เขียน save point ว่าตอนนี้ต้องตอบหรือทำอะไรต่อ

### Expected Rescue Mode (if blocked)
- **Rescue Mode**: `clarify` or `shrink`

### Week 3 Replay Expectations
- **User tension**: returning after a pause and not knowing the latest save point.
- **Evidence anchors**: `ABC Corp`, `incident prod`, `Dashboard`, `payment API`.
- **Visible work artifact**: save point or next-update note.
- **Rescue blocker**: room state is unclear enough that user risks restarting instead of continuing.
- **Recovery step/message**: one grounded save point or short note that identifies the next continuation step.
- **Reentry result**: refresh/reopen should read as continuation, not a fresh dump.
