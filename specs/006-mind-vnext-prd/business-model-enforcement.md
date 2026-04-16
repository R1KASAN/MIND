# MIND Business Model Enforcement

Updated: 2026-04-12

## Purpose

เอกสารนี้บังคับให้ MIND ไม่เป็นแค่ product ที่ outcome ดี แต่ต้องพิสูจน์ได้ว่า **จับ value กลับมาเป็นรายได้ / pilot / commitment ได้จริง**

Core rule:

> สำหรับ consultant / boutique agency lead ที่มีหลาย client threads, MIND ต้องทำให้เขากลับจาก context chaos ไปถึง next move ได้ในเวลาเร็วพอ และต้องพิสูจน์ได้ว่าความเร็วนี้แปลงเป็น willingness-to-pay ได้

## Monetization Hypothesis

- **Primary ICP**: consultant / boutique agency lead
- **Secondary ICP**: freelance dev/designer ที่มี retainer clients
- **Positioning**: overlay-first
- **Value capture rule**: target capture ประมาณ `10–20%` ของ value ที่สร้างจาก time-to-next-move / reentry time ที่ลดลง
- **Next-best alternative**: `Notion + AI`, `ChatGPT/Claude`, manual reread, Slack/email thread hopping
- **Pricing anchor**:
  - solo: `\$9–29`
  - small team pilot: `\$49–79`

## Commercial Milestones

### Gate 1 — Baseline proof

- เก็บ baseline จาก user จริงอย่างน้อย `5–10 คน`
- ต้องมีตัวเลขอย่างน้อย:
  - `time-to-first-meaningful-action`
  - `reentry time`
  - `source context count` proxy

### Gate 2 — Loop improvement

- median `time-to-next-move` ต้องดีขึ้นอย่างน้อย `30–40%` จาก baseline
- median `reentry time` ต้องดีขึ้นอย่างน้อย `25%`
- `rescue success rate` ต้องไม่ต่ำกว่า `70%`

### Gate 3 — WTP proof

- อย่างน้อย `8–12` interviews สำหรับ primary ICP
- อย่างน้อย `1` pilot commitment หรือ `1` paid pilot
- ต้องมี evidence ว่าราคาไม่ต่ำกว่ามูลค่าที่สร้าง

### Gate 4 — Packaging decision

- ถ้า WTP ดีแต่ adoption friction สูง → คง overlay-first
- ถ้า user ยอมย้าย workflow จริง → พิจารณา hub-first
- ถ้า primary ICP ชมแต่ไม่จ่าย → pivot ICP หรือ packaging ก่อนขยาย scope

## Team Rules

ทุก ticket / PR / feature spec ต้องมี:

- **Problem**
- **Outcome**
- **Metric**
- **Commercial value**
- **Pricing / WTP hypothesis**
- **UX / flow**
- **AI role**
- **Human role**
- **Failure mode**
- **Acceptance**

### Hard rules

- ห้าม merge ถ้ายังตอบไม่ได้ว่า feature นี้ขยับ metric ไหน
- ห้าม open landing copy ที่นำด้วย `AI`, `privacy`, หรือ `local-first` ถ้าไม่พูด outcome ต่อทันที
- ห้าม pilot โดยไม่มีแผนคุย WTP
- ห้ามคุยราคาโดยไม่มี value formula
- ห้ามเพิ่ม roadmap item ถ้าโยงไม่ได้กับ `core loop`, `monetization evidence`, หรือ `trust/adoption friction reduction`

## Spec Template

Use this in every spec:

```md
- Problem
- Outcome
- Metric
- Commercial value
- Pricing / WTP hypothesis
- UX / flow
- AI role
- Human role
- Failure mode
- Acceptance
```

## Notes for the Team

- local-first เป็น trust enabler ไม่ใช่ hero message
- AI และ state machine เป็น mechanism ไม่ใช่ headline
- feature ที่ไม่ดัน loop หลักให้เข้ากอง parking lot
- ถ้า WTP อ่อนต่อเนื่อง ให้ pivot ICP หรือ packaging ก่อนเพิ่ม scope

