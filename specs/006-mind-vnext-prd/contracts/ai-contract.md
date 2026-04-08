# MIND vNext — AI Contract
# สัญญาพฤติกรรม AI สำหรับ vNext

**Canonical Path**: `specs/006-mind-vnext-prd/contracts/ai-contract.md`  
**Version**: vNext 1.1.0  
**Constitution Authority**: MIND Constitution v3.0.0

---

## 1. Contract Purpose

เอกสารนี้นิยามพฤติกรรม AI ของ MIND vNext สำหรับ 2 workflows หลัก:
- `client_response`
- `client_resume`

กฎสำคัญ:
- one next action = primary output
- situation summary และ reply draft = supporting outputs
- ไม่มี synthetic success
- honest Ollama recovery flow ต้องคงอยู่

---

## 2. Workflow Classification

AI ต้อง classify input เป็นหนึ่งในสอง workflow นี้:

| Workflow | ลักษณะ input |
|---|---|
| `client_response` | มีข้อความจากลูกค้า, feedback, revision request, delayed reply, หรือข้อความที่สื่อว่าต้องตอบกลับ |
| `client_resume` | เป็นโน้ต, context เก่า, สรุปงาน, task fragment, หรือข้อความที่ใช้เพื่อกลับเข้าโปรเจกต์ลูกค้าที่ค้าง |

ถ้าจำแนกไม่ได้และการจำแนกมีผลต่อผลลัพธ์:
- AI ถาม clarification ได้สูงสุด **1 ข้อ**

เมื่อ input มาจาก File Room:
- AI ต้องตีความไฟล์ที่แนบว่าเป็น context ของ room เดียวกัน ไม่ใช่ document library แยกต่างหาก
- file context ต้องช่วยสรุป `client_response` หรือ `client_resume` ตาม room ปัจจุบัน
- one next action ยังเป็น primary output เสมอ

---

## 3. Success Output Contract

เมื่อ Ollama สังเคราะห์สำเร็จ ต้องคืน output ที่ผ่าน validation และอยู่ในโครงต่อไปนี้:

```json
{
  "workflow_type": "client_response | client_resume",
  "requires_clarification": false,
  "clarification_nudge": null,
  "situation_summary": "สรุปสถานการณ์แบบสั้น",
  "reply_draft": "ร่างข้อความตอบกลับลูกค้า",
  "recommended_action": {
    "title": "one next action",
    "rationale": "เหตุผลสั้น ๆ",
    "micro_steps": ["...", "...", "..."]
  },
  "alternative_actions": [
    { "title": "...", "rationale": "..." }
  ],
  "detected_blockers": ["..."]
}
```

### Field Rules

| Field | Rule |
|---|---|
| `workflow_type` | ต้องเป็น `client_response` หรือ `client_resume` |
| `situation_summary` | ต้องมีทั้งสอง workflow, กระชับ, เน้นข้อเท็จจริง และช่วยคืนบริบทเร็ว |
| `reply_draft` | มีเฉพาะ `client_response`; สำหรับ `client_resume` ต้องไม่มีหรือเป็นค่าว่างที่ชัดเจน |
| `recommended_action` | เป็น primary output เสมอ |
| `micro_steps` | 3 ขั้นตอนย่อยที่ช่วยให้เริ่มลงมือทำได้จริง |
| `alternative_actions` | ไม่เกิน 2 รายการ สำหรับ local rejection rotation |
| `detected_blockers` | เป็น supporting signal สำหรับตัดสินใจ next action |

---

## 4. Output Hierarchy Rule

สัญญานี้ต้องรองรับลำดับการแสดงผลดังนี้:

1. **Next Action**
2. Situation Summary
3. Reply Draft

ข้อห้าม:
- ห้ามให้ reply draft เด่นกว่า next action
- ห้ามให้ summary กลายเป็น hero content
- ห้ามให้ output ดูเหมือนระบบตอบกลับแบบ generic assistant

---

## 5. Blocker Detection Rules

AI ต้องตรวจจับ blocker แบบ auto-first จากบริบท เช่น:
- รอข้อมูลหรือไฟล์
- รอ feedback หรือการยืนยันจากลูกค้า
- scope ยังไม่ชัด
- ข้อมูลยังไม่พอสำหรับตอบหรือเริ่มงาน
- พลังงานต่ำหรือบริบทไม่พร้อม

กฎเชิงพฤติกรรม:
- ถ้า blocker ชัดเจน → next action ต้องจัดการ blocker นั้นก่อน
- ถ้า blocker ไม่ชัดและมีผลต่อผลลัพธ์ → ถาม clarification ได้สูงสุด 1 ข้อ
- ห้ามถามคำถามหลายข้อหรือเปลี่ยน flow ไปเป็นแชตยาว

---

## 6. Quality Bar

### 6.1 Next Action
next action ต้อง:
- เป็นก้าวที่เริ่มได้ทันที
- เป็นการกระทำที่ช่วย “ตอบ” หรือ “รีสตาร์ท” งานลูกค้า
- ชัดพอที่จะลงมือทำได้ภายในไม่กี่นาที
- ไม่เป็น planning statement แบบกว้าง

ตัวอย่างที่ใช้ได้:
- “ร่างข้อความหาลูกค้าเพื่อถามจุดที่ยังไม่ชัด”
- “เปิดไฟล์ล่าสุดแล้วลิสต์สิ่งที่ยังค้าง 3 ข้อ”
- “ตอบรับ feedback แล้วกำหนดว่าจะแก้ส่วนใดก่อน”

ตัวอย่างที่ใช้ไม่ได้:
- “ทบทวนโปรเจกต์”
- “จัดการงานลูกค้า”
- “วางแผนว่าจะตอบอย่างไร”

### 6.2 Situation Summary
summary ต้อง:
- ช่วยคืนบริบทอย่างรวดเร็ว
- ไม่ยาวเกินจำเป็น
- ไม่แทนที่ next action

### 6.3 Reply Draft
reply draft ต้อง:
- ใช้ได้จริงในบริบทการตอบลูกค้า
- ปรับแก้ต่อได้ง่าย
- ไม่ยาวหรือ corporate เกินไป
- สนับสนุนการลงมือทำ ไม่ใช่กลายเป็น output หลักแทน next action

---

## 7. Honest Ollama Recovery Contract

ถ้า Ollama ใช้งานไม่ได้:
- ต้องไม่คืน success payload ปลอม
- ต้องคืน failure ที่มีโครงสร้าง
- ต้องรักษา active dump context ไว้เพื่อ retry
- manual fallback ต้องถูกเรียกใช้แบบ explicit เมื่อผู้ใช้เลือก bypass

### Health Contract

health response ต้องมีอย่างน้อย:
- `status`
- `reason`
- `model`
- `detail`
- `actions`
- `retryable`

### Failure Contract

AI synthesis failure ต้องคืนข้อมูลที่พอสำหรับ:
- แสดง recovery panel
- บอกสาเหตุอย่างซื่อสัตย์
- ชี้ว่าควร retry ได้หรือไม่
- เสนอ next troubleshooting action ที่เหมาะสม

โครง failure response ขั้นต่ำ:

```json
{
  "ok": false,
  "error": {
    "type": "ollama_unavailable",
    "reason": "service_down | model_missing | runtime_boot_failed | metal_init_failed | request_timeout | unknown",
    "message": "ข้อความสรุปสั้น",
    "detail": "รายละเอียดสำหรับ recovery UI",
    "retryable": true,
    "actions": ["ollama serve", "ollama pull qwen2.5:3b"]
  }
}
```

---

## 8. Runtime Rules

- Ollama-first remains the only AI runtime for this phase
- local-only remains mandatory
- timeout และ retry policy สามารถกำหนดใน implementation plan ได้ แต่ต้องไม่ขัดกับ honest recovery principle
- model hierarchy และ diagnosis reasons ต้องช่วยเพิ่มความชัดเจนของ recovery ไม่ใช่ซ่อนความล้มเหลว

---

## 9. Privacy and Logging Rules

- ห้าม log dump content หรือข้อความลูกค้าออกนอกเครื่อง
- telemetry เก็บได้เฉพาะ metadata ที่ไม่เปิดเผยเนื้อหา
- ข้อมูลลูกค้าต้องอยู่ใน local device boundary เสมอ

---

## 10. Compatibility Note

เอกสารนี้ขยายจาก narrative และ state machine เดิมของ `005-mind-full-prd` แต่ตีความใหม่ให้รองรับ:
- client response
- client project resume

โดยไม่เปลี่ยน constitutional stance ของ MIND
