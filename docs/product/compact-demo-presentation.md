# MIND Compact Demo Presentation

Use this as the short presenter sheet for the current prototype demo set. Keep inputs short because the Brain Dump field wraps poorly on long text.

## Case Matrix

| Case | Path | Status | Why |
|---|---|---:|---|
| Full Lifecycle | ABC Corp | SAFE | Best end-to-end story: clarification, ONE_ACTION, evidence, rescue, reentry |
| Evidence Honesty | No File | SAFE | Proves evidence does not invent a file |
| Reentry | Continue Saved Room | SAFE | Proves the room continues after refresh / reopen |
| Rescue | Pressure / Stuck | OPTIONAL | Good recovery proof, but wording can vary a bit |
| Fallback Safety | AI Timeout / Manual Rescue | OPTIONAL | Useful as a safety proof, but do not spend long on it live |
| Any deeper flow beyond these | - | DO NOT PRESENT | Out of scope for a compact live demo |

## 1) Demo Path: Full Lifecycle — ABC Corp

**Purpose**
- Show one messy room becoming one evidence-backed next action, then recovery and reentry.

**Brain Dump**
```text
ABC Corp ทวงงานค้าง 2 ตัวในแชต
โปรดักชันล่มตั้งแต่เช้า ยังไม่ปิด incident
ทีมถามสเปกปุ่มบ่ายนี้
สไลด์ลูกค้าบ่ายสองยังโล่ง
```

**Clarification answer**
```text
incident เริ่มจาก CPU spike บน app server
งานค้างคือ Dashboard กับ payment API
ยังไม่ตอบลูกค้า เพราะกลัว commit เกินข้อมูล
```

**Presenter clicks**
1. `สร้างห้องใหม่`
2. วาง Brain Dump
3. `ไปต่อ`
4. ถ้ามี clarification, วางคำตอบแล้วกด `สรุปต่อเลย`
5. ดู `ONE_ACTION`
6. เปิด `ดูที่มาและหลักฐานของก้าวนี้`
7. กด `ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่`
8. Refresh หรือ reopen ห้องเดิม

**Expected screen result**
- Clarification appears at most once.
- ONE_ACTION is small and specific, not generic.
- Evidence points back to the current room text.
- Rescue mentions ABC Corp / server pressure / customer pressure.
- Refresh keeps the same room state.

**Presenter script**
- “นี่คือเคสหลัก: ข้อความรก ๆ ถูกย่อเหลือก้าวแรกที่ใช้ได้จริง”
- “Evidence ชี้กลับไปยังข้อความในห้อง ไม่ได้เดาสุ่ม”
- “ถ้าติด MIND จะบอกว่าติดตรงไหน และให้ recovery ที่ใช้ต่อได้”

**Pass / fail checklist**
- [ ] Clarification appears once or not at all
- [ ] ONE_ACTION is one small move
- [ ] Evidence opens and shows room-based source
- [ ] Rescue explains real blockage
- [ ] Reentry survives refresh

**Risks / what not to claim**
- Do not claim the incident is solved.
- Do not claim the customer update is final.
- Do not claim the action is the only possible answer.

## 2) Demo Path: Evidence Honesty — No File

**Purpose**
- Show that MIND does not invent a file when there is only text.

**Brain Dump**
```text
พรีเซนต์ผู้บริหาร 16:00
ยังมีแค่หัวข้อคร่าว ๆ
หัวหน้าขอเน้น impact
ไม่มีไฟล์แนบ มีแต่ข้อความนี้
```

**Clarification answer**
```text
ยังไม่มีไฟล์
มีตัวเลขคร่าว ๆ คือ downtime ลด 20%
ticket ซ้ำลด 15%
```

**Presenter clicks**
1. `สร้างห้องใหม่`
2. วาง Brain Dump
3. `ไปต่อ`
4. ถ้ามี clarification, วางคำตอบแล้วกด `สรุปต่อเลย`
5. เปิด `ดูที่มาและหลักฐานของก้าวนี้`

**Expected screen result**
- Evidence says it is based on the current room text, not a file.
- ONE_ACTION points to slide structure or impact collection.

**Presenter script**
- “นี่คือ honesty check”
- “ไม่มีไฟล์ ก็ไม่ควรแต่งไฟล์ขึ้นมาเอง”
- “แต่ MIND ยังให้ก้าวแรกที่ใช้ได้จากข้อความที่มีจริง”

**Pass / fail checklist**
- [ ] No invented file
- [ ] Evidence is honest
- [ ] ONE_ACTION is about the first useful move

**Risks / what not to claim**
- Do not claim a document was analyzed.
- Do not claim the numbers came from a file.

## 3) Demo Path: Reentry — Continue Saved Room

**Purpose**
- Show that a room can be reopened and continued without resetting.

**Brain Dump**
```text
งานเดิมยังค้างอยู่
ขอเปิดห้องเดิมต่อ
อยากกลับไปจุดล่าสุด
ไม่อยากเริ่มใหม่
```

**Presenter clicks**
1. Open a room that already has a saved state
2. Show the reentry card or room header
3. Click `ต่อจากจุดนี้`
4. Refresh or reopen the room

**Expected screen result**
- The room shows a reentry brief / last known good state.
- The same room context remains after refresh.
- It does not return to DUMP_ENTRY.

**Presenter script**
- “นี่คือ save point ของห้อง”
- “ผมกลับเข้ามาแล้ว ยังต่อจากจุดเดิมได้”

**Pass / fail checklist**
- [ ] Reentry card is visible
- [ ] Primary CTA says `ต่อจากจุดนี้` or equivalent reentry CTA
- [ ] Refresh preserves room continuity

**Risks / what not to claim**
- Do not claim all rooms have deep history.
- Do not claim reentry is a universal recovery system.

## 4) Demo Path: Rescue — Pressure / Stuck

**Purpose**
- Show Rescue diagnosing the real blockage and giving a usable recovery step/message.

**Brain Dump**
```text
ผู้จัดการรอแผนลด bug วันนี้
มี alert payment webhook fail 3 ครั้ง
QA รอคำตอบเรื่อง release เย็นนี้
ผมยังไม่กล้าเปิด Jira
```

**Clarification answer**
```text
webhook fail เพราะ timeout จาก provider
release ยังไม่ควรยืนยัน
ต้องเช็ก bug critical ก่อน
```

**Presenter clicks**
1. `สร้างห้องใหม่`
2. วาง Brain Dump
3. `ไปต่อ`
4. ถ้ามี clarification, วางคำตอบแล้วกด `สรุปต่อเลย`
5. กด `ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่`

**Expected screen result**
- Rescue mentions pressure, uncertainty, QA waiting, or webhook issue.
- Recovery is practical, not generic productivity advice.

**Presenter script**
- “นี่ไม่ใช่การแก้ทั้ง incident”
- “นี่คือการบอกว่าติดเพราะอะไร และให้ข้อความหรือก้าวแรกที่ใช้ตอบคนอื่นได้”

**Pass / fail checklist**
- [ ] Rescue names a real blockage
- [ ] Recovery is usable
- [ ] No generic pep talk

**Risks / what not to claim**
- Do not claim root cause is solved.
- Do not claim release decision is final.

## 5) Demo Path: Fallback Safety — AI Timeout / Manual Rescue

**Purpose**
- Show that the demo does not collapse when AI is slow or fails.

**Brain Dump**
```text
งานด่วนค้างอยู่
AI อาจช้า
อยากเห็นทางออกสำรอง
ขอให้ระบบยังไปต่อได้
```

**Presenter clicks**
1. `สร้างห้องใหม่`
2. วาง Brain Dump
3. `ไปต่อ`
4. ถ้า AI ช้าหรือ fail, รอ fallback
5. เข้า Rescue หรือ manual recovery

**Expected screen result**
- The app stays within the existing JSON / 200 response path.
- The room still gives a usable next step or recovery message.

**Presenter script**
- “ถ้า AI ช้า ระบบยังต้องพาไปต่อได้”
- “จุดสำคัญคือผู้ใช้ยังได้ก้าวที่ใช้ได้ ไม่ใช่หน้า error”

**Pass / fail checklist**
- [ ] No 5xx is shown to the user
- [ ] Recovery stays usable
- [ ] Demo path does not freeze the room

**Risks / what not to claim**
- Do not present this as the normal happy path.
- Do not spend long on this case live.

## 5-Minute Main Demo Path

1. **Case 1: ABC Corp**
   - Open room, paste dump, answer one clarification, show ONE_ACTION, open evidence, open Rescue, refresh to show reentry.
2. **Case 2: No File**
   - Open room, paste dump, show that evidence does not invent a file.
3. **Case 3 only if time remains: Reentry or Rescue**
   - Use Reentry if you want continuity proof.
   - Use Rescue if you want pressure / stuck recovery proof.

## Backup Demo Path

If AI wording is slow or noisy:
1. Use **Evidence Honesty — No File** first. It is the cleanest low-risk proof.
2. Then use **Reentry — Continue Saved Room**.
3. Keep **Rescue — Pressure / Stuck** as optional.
4. Keep **Fallback Safety** as the last resort only.

## Final Presenter Script

- “This demo is about one messy room becoming one evidence-backed next action.”
- “If I have only text, MIND should not invent a file.”
- “If I get stuck, Rescue should tell me why and give me something usable.”
- “If I come back later, the room should still feel like the same task.”

## Demo Risks

Product risks:
- Rescue wording can vary slightly.
- Reentry is strongest when you reuse a saved room, not a brand-new room.
- Fallback safety is useful, but it is not the main story.

Tooling / browser risks:
- Personal browser extensions or translation tools can mutate root attributes or add noise.
- Slow model responses can make the wait feel longer than the actual value.
- A stale browser session can reopen the wrong room if the presenter is not careful.

