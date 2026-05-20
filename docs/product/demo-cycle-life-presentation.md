# Demo Cycle Life

สคริปต์พรีเซนต์แบบ 1 หน้า สำหรับโชว์ full lifecycle ของ MIND ในรอบเดียว

## Scenario

ABC Corp / prod server down / Dashboard + payment API / user overloaded

## Copy-Paste Inputs

### Brain Dump
```text
ABC Corp ทวงงานค้าง 2 ตัวในแชต
prod ล่ม 9 โมงจาก CPU spike ยังไม่มี RCA
งานค้างคือ Dashboard mockup กับ payment API
ทีมถามสเปกปุ่ม และสไลด์บ่ายสองยังโล่ง
ผมหิว สมองตื้อ ไม่รู้ควรเริ่มจากอะไร
```

### Clarification
```text
prod restart แล้วกลับมาบางส่วน แต่ยังไม่ปิด incident
Dashboard เหลือ layout KPI/table
payment API ยังไม่ deploy ต้องเช็ก response กับ backend
ยังไม่ตอบลูกค้า เพราะกลัว commit เวลาเกินจริง
```

## Presenter Script

### 0:00 - 0:20 Open
- “ผมจะโชว์รอบเดียวให้เห็นทั้งวงจร: Brain Dump -> Clarify -> ONE_ACTION -> Evidence -> Rescue -> Reentry”
- “เคสนี้คือ ABC Corp งานค้างสองตัว มี incident ตอนเช้า และทีมกำลังกดเรื่องสเปกกับสไลด์พร้อมกัน”

### 0:20 - 0:50 Brain Dump
**Click**
- `สร้างห้องใหม่`
- วาง Brain Dump
- กด `ไปต่อ`

**พูด**
- “ผมเริ่มจากข้อความรก ๆ ที่รวมลูกค้า แชต incident และความล้าไว้ในห้องเดียว”
- “เป้าคือให้ MIND ย่อยออกมาเป็นก้าวแรกที่ชัด ไม่ใช่สรุปกว้าง ๆ”

**จุดที่ต้องชี้**
- Brain Dump field
- loading / clarification state

**คาดหวังบนหน้าจอ**
- clarification อาจขึ้นหนึ่งครั้ง
- ไม่ควรเด้งกลับไปถามซ้ำ

### 0:50 - 1:20 Clarify
**Click**
- ถ้า clarification ขึ้นมา ให้วางคำตอบ
- กด `สรุปต่อเลย`

**พูด**
- “ผมตอบแค่ข้อมูลที่จำเป็น: incident status, Dashboard, payment API, และข้อจำกัดเรื่องยังไม่ตอบลูกค้า”
- “ถ้าขั้นนี้ผ่าน แปลว่า MIND รับบริบทพอจะไปต่อได้”

**จุดที่ต้องชี้**
- clarification box
- `สรุปต่อเลย`

**คาดหวังบนหน้าจอ**
- clarification ไม่วนซ้ำ
- ไปสู่ ONE_ACTION

### 1:20 - 2:10 ONE_ACTION
**พูด**
- “ตรงนี้คือหัวใจของ demo: one clear next action”
- “มันควรเล็ก พอเริ่มได้ และอิงกับ ABC Corp, server incident, Dashboard, หรือ payment API”

**จุดที่ต้องชี้**
- action title
- action rationale
- primary CTA

**คาดหวังบนหน้าจอ**
- action สั้น ชัด ไม่เป็น generic productivity advice

### 2:10 - 2:45 Evidence
**Click**
- เปิด `ดูที่มาและหลักฐานของก้าวนี้`

**พูด**
- “นี่คือหลักฐานว่าคำแนะนำมาจาก room context จริง”
- “ถ้า evidence ชี้กลับมาที่ข้อความในห้อง แปลว่าระบบไม่ได้แต่งเรื่องขึ้นมาเอง”

**จุดที่ต้องชี้**
- evidence chips
- source / excerpt panel

**คาดหวังบนหน้าจอ**
- evidence เปิดได้
- source อิง room text หรือ manual summary ที่ตรงกับบริบท

### 2:45 - 3:20 Rescue
**Click**
- กด `ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่`

**พูด**
- “ถ้าผมติด ผมอยากให้ Rescue บอกว่าติดเพราะอะไรจริง ๆ”
- “ในเคสนี้มันควรเข้าใจคนทำงานที่โดนทั้งลูกค้า แชต incident และงานค้างพร้อมกัน แล้วให้ recovery ที่ใช้ต่อได้ทันที”

**จุดที่ต้องชี้**
- diagnosis text
- recovery steps
- suggested message ถ้ามี

**คาดหวังบนหน้าจอ**
- Rescue พูดถึง pressure / overload / uncertainty / server incident
- มี step หรือข้อความที่เอาไปใช้ต่อได้

### 3:20 - 4:00 Reentry
**Click**
- Refresh หน้า หรือ reopen ห้องเดิม
- กด `ต่อจากจุดนี้`

**พูด**
- “นี่คือ save point ของห้อง”
- “ผมกลับมาแล้ว ยังต่อจากจุดเดิมได้ ไม่รีเซ็ตกลับไปเริ่มใหม่”

**จุดที่ต้องชี้**
- reentry card / room header
- `ต่อจากจุดนี้`
- last-known-good / saved state

**คาดหวังบนหน้าจอ**
- room state เดิมยังอยู่
- ไม่กลับไป DUMP_ENTRY

## Fallback Talking Points

- “ถ้าคำพูดของ AI เปลี่ยนเล็กน้อย ให้ดูโครง: clarification ครั้งเดียว, ONE_ACTION, Evidence, Rescue, Reentry”
- “ถ้า wording ต่างจากสคริปต์นิดหน่อย แต่ยังยึด ABC Corp / server / Dashboard / payment API ถือว่าผ่าน”
- “ถ้า Rescue เขียนคนละประโยค แต่ยังระบุ blockage จริงและ recovery ใช้ได้ ก็ใช้ได้”

## Do-Not-Claim

- อย่าบอกว่า incident ถูกแก้จบแล้ว
- อย่าบอกว่า RCA เสร็จแล้ว
- อย่าบอกว่า customer reply สุดท้ายเป็นคำตอบที่ยืนยันแล้ว
- อย่าบอกว่า evidence เป็น full document parse ถ้ามาจาก room context
- อย่าบอกว่า Rescue เป็นคำตอบเดียวที่ถูกต้อง

## Closing Line

- “MIND เปลี่ยน brain dump ที่รกให้เหลือ next action ที่อ้างหลักฐานได้ และถ้าติดก็ยังให้ recovery ที่ใช้ต่อได้โดยไม่รีเซ็ตงาน”

## Demo Risks

- Rescue wording อาจเปลี่ยนเล็กน้อยตามรอบ AI
- Reentry ควรโชว์บนห้องที่มี save point จริง
- browser extension หรือ translation tool อาจทำ noise ที่ไม่เกี่ยวกับ product
- อย่าอ่าน Brain Dump ยาวกว่านี้ เพราะช่อง input จะแคบและมองไม่ดี

