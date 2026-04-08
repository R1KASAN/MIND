# MIND Multi-Room Phased Roadmap

Updated: 2026-04-08

## Purpose

เอกสารนี้ไม่ได้ตอบว่า “จะ implement multi-room ยังไง”  
แต่ตอบว่า “จะยังไม่รีบเปิด `+ New WorkRoom` จนกว่าจะผ่านเงื่อนไขอะไร”

หลักคิดของ roadmap นี้คือ:

- multi-room ไม่ใช่ immediate launch blocker
- multi-room ไม่ใช่ quick win UI
- Studio และ reentry ในห้องเดียวต้องมี meaning ก่อน
- ถ้า data boundary ยังไม่จริง UI ไม่ควร fake ว่าพร้อมแล้ว

Related docs:

- Risk framing: `specs/006-mind-vnext-prd/multi-room-risk-spec.md`
- Discovery checklists: `specs/006-mind-vnext-prd/multi-room-discovery-checklists.md`

## Phase 0 — Hold The Boundary

### Goal

ทำให้ทีมเห็นตรงกันว่าทำไม `+ New WorkRoom` ยังไม่ควรถูกเปิดเป็น feature ตอนนี้

### Why This Phase Exists

- เพื่อหยุดความเสี่ยงแบบ “UI ไปก่อน model”
- เพื่อให้ทีมใช้ภาษาเดียวกันเรื่อง `boundary trust`
- เพื่อกันไม่ให้ multi-room แย่งคิว `rescue` และ `eval gates`

### What Must Be True Before Moving On

- ทีมยอมรับ risk spec ร่วมกัน
- ทุกคนเห็นตรงกันว่า single-session คือความจริงของระบบตอนนี้
- มีฉันทามติว่า fake multi-room UI เป็นสิ่งที่ไม่ควรทำ

### What We Still Refuse To Do

- เปิด `+ New WorkRoom` ใน UI หลัก
- ทำ room switcher แบบผิวหน้า
- ใช้ชื่อ `room` ในแบบที่ผู้ใช้ตีความว่าแยก state จริงแล้ว ทั้งที่ยังไม่แยก

## Phase 1 — Studio First In One Room

### Goal

พิสูจน์ว่า Studio, context snapshot, และ reentry ในห้องเดียวมี value จริงก่อน

### Why This Phase Exists

- เพื่อแก้ปัญหาหลักของผู้ใช้ตอนนี้: ไม่รู้จะเริ่มยังไง และกลับมาแล้วไม่รู้จะต่อจากตรงไหน
- เพื่อให้ MIND ชนะใน room เดียวก่อนขยายเป็นหลาย room
- เพื่อให้ทีมรู้ว่า intent ไหนมี value จริง ไม่ใช่เดาจาก UI idea

### What Must Be True Before Moving On

- Studio ทำให้การกลับมาใช้ห้องเดิมง่ายขึ้นจริง
- context snapshot ช่วยเพิ่ม trust ไม่ใช่เพิ่ม noise
- ผู้ใช้เข้าใจ room เดียวของ MIND ดีขึ้น ไม่ได้สับสนมากขึ้น

### What We Still Refuse To Do

- ขาย Phase นี้ว่าเป็น multi-room groundwork ต่อผู้ใช้
- เอา `+ New WorkRoom` มาเป็น deliverable หลัก
- เพิ่ม room terminology ทับของเดิมโดยยังไม่แยก boundary

## Phase 2 — Room Model Decision

### Goal

ตัดสินใจในระดับ product + architecture ว่าระบบพร้อมหรือยังที่จะมี `app-shell state` และ `room-scoped state` แยกกันจริง

### Why This Phase Exists

- เพราะ multi-room เป็น boundary decision ไม่ใช่แค่ screen addition
- เพราะ reentry, rescue, overview, archive, และ search จะเปลี่ยนความหมายทันทีเมื่อมีหลายห้อง
- เพราะทีมต้องรู้ก่อนว่ากำลังขยาย product อย่างมีวินัย หรือกำลัง drift ไปเป็น workspace

### What Must Be True Before Moving On

- ทีมตอบได้ชัดว่าอะไรคือ app-level state
- ทีมตอบได้ชัดว่าอะไรคือ room-level state
- มีความเชื่อมั่นว่า legacy current state จะไม่ทำให้ boundary ปนเมื่อถูกย้ายไป room model
- ทีมเห็นตรงกันว่าห้องใหม่จะยังคง DUMP-first และ Studio จะยังเป็นรองจากบริบทของห้อง

### What We Still Refuse To Do

- เปิด UI หลายห้องเพราะ “น่าจะค่อยแก้ทีหลังได้”
- อธิบาย multi-room ในเชิง implementation backlog ก่อนผ่าน decision นี้
- ใช้ room model เป็นข้ออ้างในการเพิ่ม workspace breadth

## Phase 3 — New WorkRoom Readiness

### Goal

คุยเรื่อง placement และ affordance ของ `+ New WorkRoom` ได้อย่างปลอดภัย เพราะ boundary ระดับ product ถูกตัดสินแล้ว

### Why This Phase Exists

- เพื่อให้ `+ New WorkRoom` เป็นผลลัพธ์ของ model ที่พร้อม ไม่ใช่ตัวเร่งให้ model พัง
- เพื่อวาง UX ของ room creation ให้เบาและไม่แทรก flow เดิม

### What Must Be True Before Moving On

- ทีมมั่นใจว่า multi-room จะไม่ทำให้ผู้ใช้สงสัยว่าอะไรอยู่ที่ไหน
- ทีมมั่นใจว่า room ใหม่ยังคง DUMP-first
- ทีมมั่นใจว่า Studio ในห้องใหม่จะ inactive จนมีบริบทแรกจริง

### What We Still Refuse To Do

- wizard ยาวตอนสร้างห้องใหม่
- ให้ปุ่ม `+ New WorkRoom` เด่นกว่า textarea หรือ DUMP flow
- เปลี่ยน MIND ให้ดูเหมือน workspace, notebook, หรือ file manager

## Decision Gates

- อย่าเริ่มคุย `+ New WorkRoom` เป็น quick win ถ้า Phase 1 ยังไม่พิสูจน์ว่า Studio ในห้องเดียวมี value
- อย่าเริ่มเปิด multi-room UI ถ้า Phase 2 ยังไม่ตัดสิน boundary ของ state ชัด
- อย่าให้ roadmap นี้ตัดคิว `rescue hardening` และ `eval gates`

## What This Roadmap Is Really Saying

สิ่งที่ roadmap นี้พยายามปกป้องไม่ใช่แค่ความง่ายของ implementation  
แต่คือความหมายของ MIND เอง

ถ้าเรายังทำให้ห้องเดียวไว้ใจได้ไม่พอ  
การเพิ่มหลายห้องจะไม่ได้คูณ value  
แต่มันจะคูณความสับสนแทน
