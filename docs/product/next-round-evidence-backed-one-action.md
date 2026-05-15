This is the current active plan for the next MIND round.
Codex should read AGENTS.md first, then this file.

# Next Round Plan: Prove Evidence-Backed ONE_ACTION

## Summary
ล็อก Next Round ให้เป็นงานพิสูจน์ `ONE_ACTION` แบบ evidence-backed ก่อนแตะ OCR/PDF เพิ่ม โดยยึด doctrine ใน `AGENTS.md` และเก็บแผนเต็มไว้ใน product spec แยกไฟล์ ไม่ฝัง backlog ยาวใน `AGENTS.md`.

Current release gate: `npm run smoke:evidence-one-action` must stay green before evidence-loop work expands into UI smoke, regression expansion, OCR/PDF, URL ingest, JSONL ingest, vector DB, or schema changes.

Current validation extension: if the smoke gate is green but live dashboard data is empty or too sparse, follow `docs/product/ux-data-collection-one-action.md` before tuning UX, OCR, prompts, retrieval, schema, or analytics contracts. After manual KPI data is non-zero, use `docs/product/useful-beta-readiness.md` to decide whether MIND is actually ready for a paste-text-first useful beta.

## What to Lock
- เพิ่มเอกสารเต็มใน `docs/product/next-round-evidence-backed-one-action.md`
- ใส่เพียง pointer สั้น ๆ ใน `AGENTS.md`:

```md
## Active Plan

Next active plan: `docs/product/next-round-evidence-backed-one-action.md`.
Read this after the product doctrine before making evidence-loop changes.
```

- ลำดับการอ่านคือ `AGENTS.md` -> active plan pointer -> `docs/product/next-round-evidence-backed-one-action.md` -> implement เฉพาะ `Internal first evidence loop` ก่อน OCR/PDF
- evidence gate ถาวรของ round นี้คือ `npm run smoke:evidence-one-action`; ถ้า gate ล้ม ให้แก้เฉพาะ failure point ใน `retrieval`, `schema stability`, `provenance/sourceIds`, หรือ `analytics truth condition`
- จำกัด implementation ให้เฉพาะ evidence loop ที่มีอยู่แล้ว: `evidence-context`, `requestAction`, `/api/ai/action`, `buildActionUserPrompt`, `buildActionSuccessArtifacts`, analytics events, และ tests ที่เกี่ยวข้อง
- ไม่เพิ่ม package, vector DB, JSONL/URL ingest, หรือ schema ใหม่
- ถ้าต้องการ external facts เกี่ยวกับ `AI grounding`, `provenance`, หรือ `evaluation metrics`, ใช้ Perplexity ครั้งเดียวตอนต้น session เพื่อดึง reference ล่าสุด แล้วทำงานต่อจาก plan นี้และ repo เท่านั้น; ห้าม re-architect จาก research นั้น ใช้แค่ refine tests, metrics, หรือ wording

## 3 Steps
### 1. Do Now: Verify Evidence Loop End-to-End
- ใช้ internal evidence เท่านั้น: `manual text`, `ready files`, `clarification answers`, `room memory`, `existing retrieval`
- ทดสอบ 4-5 fixtures จริง: `client reply`, `proposal scope`, `stale task reentry`, `missing context`, `low energy restart`
- ยืนยัน flow ครบ: `buildRoomDataSources` -> `buildActionEvidenceContext` -> `/api/ai/action` -> `currentPlan.steps[].evidence` -> `provenance.sourceIds` -> source chips UI -> analytics

### 2. Do Next: Tune Only If Evidence Says So
- ถ้า dashboard ยังมี `EVENTS = 0`, `TASKS = 0`, หรือ KPI หลักยังเป็น `ไม่มีข้อมูล`, ให้หยุดที่ validation และทำ data collection ตาม `docs/product/ux-data-collection-one-action.md` ก่อน
- ถ้า dashboard ไม่ว่างแล้ว แต่ยังไม่มี real-user proof ว่า paste-text action, evidence reuse, room reentry, rescue/alternative, และ first-load clarity ผ่าน ให้ใช้ `docs/product/useful-beta-readiness.md` ก่อน declare useful beta หรือเริ่ม UX/OCR work
- ถ้า fixture fail เพราะ retrieval เลือก source ผิด ให้ปรับ query composition และ ranking
- ถ้า fail เพราะ prompt ใช้ evidence ไม่ดี ให้ปรับ `buildActionUserPrompt()` เท่านั้น
- ถ้า fail เพราะ provenance/analytics ไม่ตรง ให้แก้เฉพาะ handoff ระหว่าง plan/provenance/trackEvent
- วัด KPI รอบแรก: `evidenceBackedActionRate`, `evidenceClickThroughRate`, `oneActionAcceptedFirstTry`, `notLikeThisRate`, `timeToNextAction`

### 3. Do Later: OCR/PDF Only If It Proves to Be the Blocker
- ยังไม่เปิด OCR/PDF round จนกว่าจะพิสูจน์ได้ว่า evidence หายเพราะ extraction
- เปิด OCR/PDF only when:
  - `sourceFiles.status !== ready` เป็นเหตุหลักใน test rooms
  - `extractedText` ว่าง/garbled แล้วทำให้ `buildActionEvidenceContext` ได้ `selectionMethod: none`
  - source chip ที่ควรมีหายเพราะ file extraction ไม่พร้อม
- ถ้า fail เพราะ ranking/prompt/provenance ให้แก้ evidence loop ต่อ ไม่เลื่อนไป OCR/PDF

## Test Plan
- Unit: `buildActionEvidenceContext` เลือก ready evidence และตัด noisy/unreadable source ออก
- Integration: `requestAction` ส่ง `evidenceContext` เข้า `/api/ai/action`
- Plan/provenance: `buildActionSuccessArtifacts` แนบ retrieved evidence ไปทุก bootstrap step
- Analytics: `step_confirmed` บันทึก `retrieval_enabled`, `retrieval_selection_method`, `retrieved_source_count` ถูกต้อง
- Smoke: local Gemma route ยังตอบ schema เดิมและมี `Retrieved evidence:` block

## Assumptions
- Round นี้ยังเป็น `Internal first`
- `PlanEvidenceChip` เดิมพอแล้ว ไม่เพิ่ม schema
- OCR/PDF เป็น follow-up round เท่านั้น เว้นแต่ fixture พิสูจน์ว่าเป็น blocker จริง
- โฟกัส product คือ solo client-facing task continuity ไม่ใช่ document manager หรือ second brain
