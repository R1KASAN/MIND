# Demo Handoff Package (Limited Demo)

**Status:** Phase 3.9 Demo RC — best current candidate for Limited Demo under the Happy Messy Path, not final product validation.
**Date:** 2026-05-17
**Objective:** ใช้เอกสารนี้เป็นแกนหลักในการทำ Limited Real-User Demos (หรือ Persona-based Demo) เพื่อประเมินความพร้อมก่อนนำเสนอจริง

---

## Demo Boundary / Do Not Claim

This demo validates ONLY the “Happy Messy Path”:
- messy pasted text
- simulated failed/unreadable attachment
- skeleton/loading experience
- evidence/reentry brief generation
- first actionable next move
- exit and reentry recovery

This demo does NOT validate:
- full PDF reliability
- full OCR readiness
- full persona matrix completion
- production-grade latency
- readiness for all workflows
- complete product-market fit

**Safe claim to include during demo:**
“The prototype can turn messy notes and degraded file context into an actionable reentry brief without catastrophic failure.”

**Safer wording for file failure:**
“If some files cannot be read, the system does not collapse. It continues using the available notes/context and still helps the user move forward.”

---

## 1. ขอบเขตและสถานะของระบบปัจจุบัน (RC Lock)

ระบบถูกล็อกเวอร์ชันในสถานะ **Phase 3.9 Demo RC**
*   **สิ่งที่ทำได้และเสถียรแล้ว:** 
    *   รับข้อความ (Text) แบบไร้โครงสร้าง
    *   ระบบ Fallback ข้ามไฟล์ที่พัง (เช่น PDF สแกนเบี้ยว) แต่ยังเดินหน้างานต่อได้จาก Text
    *   สรุปก้าวแรก (Next Move) พร้อมแสดงหลักฐานว่าอิงจากแหล่งข้อมูลไหน (Evidence)
    *   หน้าตา Loading แบบ Skeleton Shimmer (เพื่อลดความรำคาญจาก Latency)
    *   ระบบจดจำสถานะห้อง (Room Memory / Save Point) ออกแล้วเข้ามาทำงานต่อได้ทันที
*   **สิ่งที่ตัดสินใจข้าม (Deferred):**
    *   Phase 4 (OCR Accuracy) จะไม่นำมาทำในตอนนี้ ยกเว้นว่าผู้ใช้ใน Demo ชุดนี้บ่นว่า "รับไม่ได้เลยที่ระบบข้ามไฟล์พัง งานเดินต่อไม่ได้จริง ๆ"

---

## 2. กลุ่มเป้าหมายในการ Demo (Personas)

หากหาผู้ใช้จริง (Real User) ไม่ได้ ให้ใช้ Persona เหล่านี้ในการเล่นสมมติแทน:
1.  **Freelance Consultant:** ดูแลหลายลูกค้าพร้อมกัน ต้องการเข้าแอพปุ๊บรู้ปั๊บว่าลูกค้าเจ้านี้คุยค้างถึงไหน
2.  **Agency Lead / Account Manager:** มีเวลาจำกัด หงุดหงิดง่ายถ้ารอโหลดนาน ต้องการ Next Move ที่เอาไปสั่งงานต่อได้ทันที
3.  **In-house PM / Product:** อยากรู้ที่มาที่ไปของคำแนะนำ (ดู Evidence) ว่า AI ไม่ได้มั่วขึ้นมาเอง
4.  **Solo Coach / Creator:** ไม่เก่งเทคฯ ถ้าระบบขึ้น Error ว่าไฟล์อ่านไม่ออก จะตกใจไหม หรือเข้าใจว่าให้ไปต่อได้

---

## Persona 2 Latency Mitigation — Agency Lead / Account Manager

- Persona 2 has the lowest latency tolerance.
- Skeleton/loading state helps, but may not be enough by itself.
- Presenter must not stay silent during the 1–2 minute generation window.
- The demo must actively frame the wait as context compression, not app slowness.
- The payoff must be tied to delegation: “Can this next move be sent to a teammate or used to unblock work immediately?”

**Presenter Talk Track (During Loading):**
“ตรงนี้ตั้งใจให้เห็นว่าเราไม่ได้ขายความเร็วของ OCR หรือไฟล์ แต่ขายการกู้บริบทจาก chaos ให้กลายเป็น next move ที่เอาไปสั่งงานต่อได้ พอดีเคส Agency จะมีหลายชิ้นพร้อมกัน—ลูกค้า, กราฟิก, วิดีโอ, ทีมที่รอคำสั่ง—ระบบกำลังพยายามย่อทั้งหมดให้เหลือ action เดียวที่ delegate ได้ทันที”

**Instruct the presenter to point attention to:**
- skeleton/loading state
- sidebar processing status
- evidence badge after generation
- whether the generated Next Move can be copied into team chat

### Persona 2 Pass / Fail Addendum

**Pass if:**
- Viewer waits through generation without asking whether the app is stuck
- Viewer understands that the output is meant to become a delegatable next move
- Viewer says the result could be sent to a teammate or used to unblock the team
- Viewer sees the product as operational context recovery, not just another AI writer

**Fail if:**
- Viewer clicks away during loading
- Viewer says “too slow” before seeing the output
- Viewer treats the product as another AI writer rather than a reentry/delegation tool
- Next Move is too vague to assign to a designer, editor, account teammate, or client-facing workflow
- Viewer focuses only on latency and misses the delegation value

---

## 3. สคริปต์หลักที่ใช้สำหรับรัน Demo (Happy Messy Path)

นี่คือ "Path เดียว" ที่ต้องซ้อมให้คล่องที่สุด และใช้เป็นมาตรฐานในทุก Demo/Pitch

### ขั้นตอนการรัน (Step-by-Step):
1.  **เข้าใช้งาน (Fresh Intake):** เปิด `http://localhost:3000` สร้างห้องใหม่ 
2.  **โยนขยะ (The Mess):** วาง Text/Notes ที่จดมาแบบลวก ๆ ปนกับไฟล์ภาพ หรือ PDF (จงใจใช้ไฟล์ที่อาจจะอ่านยากหรือพัง)
3.  **สังเกต Skeleton (The Wait):** กด `ไปต่อ` -> ให้ผู้ใช้รอดูหน้า Skeleton Shimmer (ใช้ Talk Track ของ Persona 2 เพื่อชวนคุยระหว่างรอ)
4.  **ดูจุดเชื่อมโยง (Evidence Reveal):** หน้า Action ปรากฏขึ้น -> ชี้ให้ดู Evidence Badge
5.  **ยืนยันก้าวถัดไป (Next Move):** 
    **Presenter Script (After output appears):** 
    “สำหรับ Agency Lead จุดขายไม่ใช่แค่สรุปให้สวย แต่คือทำให้คนที่กำลังโดนหลายฝั่งดึงพร้อมกันรู้ว่า ‘ต้องสั่งใครก่อน ด้วยประโยคแบบไหน’ ถ้าอันนี้ copy ไปโยนในทีมได้ทันที แปลว่า brief นี้ผ่าน”
    จากนั้นกดปุ่ม `ใช้ก้าวนี้` 
6.  **ออกจากห้อง (Client Chaos Out):** กดกลับหน้า Home (หรือปิดแท็บ) เพื่อจำลองสถานการณ์ที่โดนดึงตัวไปทำเรื่องอื่น
7.  **กลับเข้ามาใหม่ (Reentry):** กลับเข้าห้องเดิม -> สังเกต "Reentry Brief (Working Snapshot)" ว่าผู้ใช้เข้าใจ Context ภายใน 60 วินาทีหรือไม่

---

## Pass / Fail Criteria (Global)

**Pass if:**
- Viewer understands the product value within the first 90 seconds
- Skeleton/loading state makes the wait feel explainable, not broken
- Reentry Brief helps recover context in under 60 seconds
- Viewer accepts degraded PDF/file handling as acceptable for the prototype stage
- Viewer can explain the core value in their own words after the demo

**Fail if:**
- Viewer asks “is it stuck?” during generation
- Viewer cannot explain what the product does after the demo
- Viewer focuses mainly on failed PDF/OCR instead of reentry value
- Viewer says the wait time breaks trust
- Viewer interprets the demo as a file-processing/OCR product rather than a reentry/context-recovery product

---

## Rehearsal Recommendation & Status

**Persona 2 Rehearsal Result: Needs Mitigation**
*   **Finding:** The simulated Agency Lead showed low latency tolerance and clicked away during the 1–2 minute generation window.
*   **Interpretation:** This validates the expected Persona 2 risk: Agency Leads need fast perceived payoff and clear delegation value.
*   **Decision:** Do not add product scope. Update the demo script to actively bridge the loading period and emphasize delegatable Next Move once output appears.
*   **Safe Claim:** Persona 2 revealed a known demo risk: latency can break attention before value is visible. This can be mitigated in Limited Demo through presenter framing and by emphasizing delegation payoff.

The team should run at least two rehearsals before final presentation:

- **Round 1:** Internal team roleplays the four personas
- **Round 2:** One person unfamiliar with the product watches the demo and answers:
  1. What does this product help with?
  2. What felt most credible?
  3. What made you hesitate?

**Decision rule:**
If the viewer cannot explain the product’s value within 1 minute after the demo, revise the script before presenting again.

### RC Patch Result — Task Shape Grounding (Verified)
**Browser smoke PASS (fresh room, confirmed).** Previous smoke was invalid — it read output from a stale/different room.

**Root cause found and fixed:**
- `detectDeliverableTypeFromText()` was patched first (classified as `execution`) ✅
- But `buildIntakeFallbackCandidates()` and `buildActionFallbackCopy()` had no `execution` branch — both fell through to the generic `'สรุปสถานะล่าสุดของโปรเจกต์จากบริบทที่มี'` default ← **real bug**
- Fix: added `execution` branches to both functions with delegation/unblock copy

**Verified output for input `"Client rejected font. Video is delayed. Need urgent plan to split work."`:**
- Action title: `"แบ่งงานและมอบหมายให้ทีมก่อนเพื่อปลดล็อกงานที่ค้าง"` ✅
- Generic strings `"สรุปสถานะล่าสุดของโปรเจกต์"` / `"project status"` / `"Client will provide updated information"`: **GONE** ✅
- Evidence badge: present ✅
- Persona 2 demo path: **safe for RC**

---

## 5. แผนหลัง Demo (Post-Demo Decision)

*   **ถ้า Pass:** นำแพ็กเกจนี้และสคริปต์ Happy Messy Path ไปใช้เป็น Limited Demo นำเสนองานได้ทันที
*   **ถ้า Fail (โดยเฉพาะเรื่อง Fallback):** พิจารณายก Phase 4 (OCR) กลับมาทำ (เป็นกรณี Worst Case)
