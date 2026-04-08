# MIND vNext — Specification Quality Checklist

**Purpose**: ตรวจความสมบูรณ์และความสอดคล้องของชุดเอกสาร vNext ก่อนเข้าสู่ `/speckit.plan`  
**Feature**: [spec.md](../spec.md)  
**Canonical Source**: `specs/006-mind-vnext-prd/`

---

## 1. Canonical Source Checks

- [x] `specs/006-mind-vnext-prd/` ถูกใช้เป็น source of truth เพียงชุดเดียวของ vNext
- [x] `specs/006-mind-vnext-client-resume/` ถูกลดบทบาทเป็นเพียง alias/deprecated path และไม่ใช่ canonical source อีกต่อไป
- [x] ชุด support docs ของ vNext อยู่ใต้ `specs/006-mind-vnext-prd/`
- [x] `005-mind-full-prd` ไม่ถูก rewrite ให้กลายเป็น vNext
- [x] Constitution และ Speckit templates ระดับ global ไม่ถูกแก้เพื่อบังคับ narrative vNext

## 2. PRD Quality Checks

- [x] `spec.md` ทำหน้าที่เป็น PRD จริง ไม่ใช่ implementation spec ปะปน
- [x] PRD เน้น product direction, persona, workflows, business value, behavioral requirements, metrics, validation, scope, assumptions
- [x] รายละเอียดเชิง implementation-heavy ถูกแยกไป support docs แล้ว
- [x] PRD ไม่มี wire-format, schema field-by-field, model hierarchy, หรือ internal storage detail ที่เกินจำเป็น

## 3. Narrative Alignment Checks

- [x] Product identity ถูกอธิบายว่าเป็นเครื่องมือ “ตอบ + รีสตาร์ทงานลูกค้า”
- [x] ไม่มี generic productivity framing เหลืออยู่ใน PRD หลัก
- [x] persona หลักคือ freelancer/consultant หลาย client
- [x] workflows หลักมีเพียง `client response` และ `client project resume`
- [x] one visible action ยังเป็น primary output
- [x] summary และ reply draft เป็น supporting outputs เท่านั้น

## 4. Requirement Completeness Checks

- [x] Functional requirements รองรับทั้ง 2 workflows อย่างชัดเจน
- [x] honest Ollama recovery flow ถูกระบุชัด
- [x] blocker detection เป็น auto-first และ clarification ได้สูงสุด 1 ครั้ง
- [x] local-only และ Ollama-first ยังคงเป็น core stance
- [x] ไม่มี planner drift, backlog drift, หรือ generic chat drift

## 5. Metrics and Validation Checks

- [x] Primary Value Metric = Time-to-First-Action
- [x] Time-to-First-Action ถูกนิยามกับ 2 client-work scenarios โดยตรง
- [x] เป้าหมายผูกกับ baseline-relative improvement 30–50%
- [x] Supporting metrics ยกตัวอย่างในบริบท client response / client resume
- [x] Validation plan ทดสอบ 2 เคสจริง: ตอบลูกค้า + รีสตาร์ทโปรเจกต์ค้าง
- [x] มี qualitative questions ที่ถามตรงเรื่องความเร็วและความมั่นใจในการตอบลูกค้า/กลับมาเริ่มงานค้าง
- [x] มี process rule ว่าต้อง validation ก่อน rollout เต็ม

## 6. Business Layer Checks

- [x] Core Market Problem & Business Value เน้น pain ของการตอบและรีสตาร์ทงานลูกค้า
- [x] Value proposition ใช้ถ้อยคำทางการที่ชัดและขายออก
- [x] Monetization hint ผูกกับ individual freelancer/consultant
- [x] ไม่มีการขยาย framing ไปทาง team suite หรือ broad productivity platform โดยไม่จำเป็น

## 7. Support Doc Alignment Checks

- [x] `contracts/ai-contract.md` ใช้ narrative เดียวกับ PRD
- [x] `contracts/ai-contract.md` รองรับ 2 workflows โดยตรง และคง output hierarchy ว่า next action คือ primary
- [x] `data-model.md` รองรับ 2 workflows และ honest recovery flow
- [x] `data-model.md` จำกัดเฉพาะ workflow type, situation summary, reply draft, blocker signals, active dump context, และ compatibility note
- [x] support docs ไม่ผลักระบบไปเป็น planner, CRM, หรือ memory UI

## Notes

- ชุดเอกสารนี้พร้อมสำหรับ `/speckit.plan`
- implementation plan ที่ตามมาต้องยึด codebase Next.js เดิมใน `src/`
- phase 1 ของ plan ควรเป็น honest Ollama recovery flow
- phase 2 ของ plan ควรเป็น client response & resume intelligence
- implementation status on 2026-04-07: code changes, typecheck, lint, build, route-level recovery validation, browser UI hierarchy gut-check, and silent completion loop ผ่านแล้ว
- runtime recovery note: เปลี่ยนไปใช้ official `Ollama.app` runtime บนเครื่อง Apple M5 นี้แล้ว และยืนยันได้ว่า `llama3.2:1b` กับ `qwen2.5:3b` generate ผ่าน Ollama API/CLI โดยไม่ล้มที่ Metal init เหมือน Homebrew runtime เดิม
- browser validation note: `client_response` และ `client_resume` hierarchy ถูกยืนยันผ่าน Chrome DevTools Protocol โดยใช้ seeded local session state ตอนที่ Ollama ยังไม่พร้อม และ route-level health ตอนนี้กลับมา `ready` ได้แล้ว
- live validation note: full quickstart smoke suite (`T044`) ปิดแล้ว หลังจาก harden AI contract เพิ่ม repair layer ให้ `qwen2.5:3b`; canonical `client_resume` ผ่านบน qwen primary และ canonical `client_response` ผ่านบน qwen repair layer โดยไม่ต้องไหลไป fallback `llama3.2:1b`
