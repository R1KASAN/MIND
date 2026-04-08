# MIND Multi-Room Risk Spec

Updated: 2026-04-08

## Purpose

เอกสารนี้มีไว้เพื่อช่วยทีมตัดสินใจว่า `ยังไม่ควรรีบเปิด + New WorkRoom` ตอนไหน  
เป้าหมายไม่ใช่การออกแบบ implementation ของ multi-room แต่คือการทำให้ทีมเห็นชัดว่าอะไรจะพัง ถ้า UI ดูเหมือนมีหลายห้องก่อนที่ data boundary, state boundary, และ AI boundary จะรองรับจริง

Related docs:

- Decision memo: `specs/006-mind-vnext-prd/multi-room-decision-memo.md`
- Sequencing: `specs/006-mind-vnext-prd/multi-room-phased-roadmap.md`

คำถามหลักของเอกสารนี้คือ:

- อะไรคือความจริงของระบบตอนนี้
- อะไรคือความเสี่ยงถ้ารีบทำ multi-room
- อะไรคือสิ่งที่ห้าม fake ใน UI
- อะไรคือสมมติฐานที่ต้องพิสูจน์ก่อน

## Current Truth

ตอนนี้ MIND ยังเป็นระบบแบบ `single-session / single-active-task`

- app shell ปัจจุบันคิดในกรอบว่าในเวลาหนึ่งมีงาน active ก้อนเดียว
- `AppSession` ยังอิง `task` เดียวและ `currentActionId` เดียว
- persistence หลักยังมีแค่ session ปัจจุบันกับ action list ไม่ใช่ room collection เต็มรูปแบบ
- reentry, rescue, overview, และ archive ยังถูกออกแบบบน mental model ของ “งานนี้” มากกว่า “หลายห้องที่สลับไปมา”
- คำว่า `room` ในระบบตอนนี้ยังใกล้กับภาษาของ product มากกว่าขอบเขตข้อมูลที่แยกจริง

สรุปคือ multi-room ยังไม่ใช่สิ่งที่ระบบ “มีอยู่แล้วแต่ยังไม่โชว์”  
ถ้าจะทำ มันคือการเปลี่ยน product boundary และ state boundary จริง

## Risk Categories

### Product Risk

- multi-room อาจดัน MIND จาก `one task copilot` ไปเป็น `workspace/menu app` โดยไม่ตั้งใจ
- ถ้าผู้ใช้ต้องเริ่มจาก “เลือกห้อง” ก่อน “เริ่มคิด” จะขัดกับ DUMP-first doctrine
- ถ้า Studio และ WorkRoom โตพร้อมกันเร็วเกินไป หน้าแรกจะเริ่มตอบหลาย job พร้อมกันจน identity ของ MIND เบลอ
- ผู้ใช้ใหม่อาจตีความว่า MIND เป็น note app หรือ project workspace มากกว่า task copilot

### Trust Risk

- AI อาจใช้บริบทผิดห้องโดยที่ผู้ใช้ไม่รู้
- ผู้ใช้อาจไม่แน่ใจว่าอะไรถูกเก็บไว้ระดับ app และอะไรถูกเก็บไว้ระดับ room
- ถ้า overview, archive, search, หรือ reentry ไม่บอก ownership ของห้องให้ชัด ความเชื่อใจจะพังเร็วมาก
- local-first promise จะเสียหายถ้าผู้ใช้รู้สึกว่า system “จำปน” แม้ข้อมูลจะยังอยู่ในเครื่องทั้งหมด

### State Risk

- app-level state กับ room-level state จะซ้อนกันทันที
- route เดิมทุกตัวจะเริ่มมีคำถามใหม่ว่าเป็น state ของ room ไหน
- reentry จะไม่ใช่แค่ “กลับเข้าบริบทเดิม” แต่กลายเป็น “กลับเข้าห้องไหนก่อน”
- current action, current payload, failure state, และ walkthrough flags อาจปนกันถ้า boundary ไม่ชัด
- สิ่งที่เคยง่ายใน single-session เช่น reset, retry, complete, reload จะซับซ้อนขึ้นทันทีเมื่อมีหลายห้อง

### Adoption Risk

- ผู้ใช้ที่ยังไม่เข้าใจ DUMP-first อาจงงหนักขึ้นเพราะต้องทำความเข้าใจ room model เพิ่ม
- ถ้าห้องใหม่เปิดได้ แต่ยังไม่มีบริบทพอให้ Studio ใช้งาน ผู้ใช้อาจรู้สึกว่าห้อง “ว่างและไม่มีประโยชน์”
- ถ้า user ต้องตัดสินใจเรื่อง room ก่อนเห็น value ของ Studio/reentry ในห้องเดียว friction จะสูงขึ้นโดยไม่จำเป็น
- ทีมอาจเข้าใจผิดว่า multi-room เป็น quick win UI ทั้งที่จริงมันเปลี่ยน mental model ของทั้งแอป

## Worst-Case Failure Modes

- ผู้ใช้กด `+ New WorkRoom` แล้วได้หน้าห้องใหม่ที่ดูสะอาด แต่ state จริงยังผูกกับห้องเดิม
- ห้องใหม่เปิดได้ แต่ `current action`, `reentry brief`, หรือ `last failure` จากห้องเก่ายังตามมา
- AI สรุปหรือแนะนำ next move จาก context คนละห้อง
- reentry พาผู้ใช้กลับผิดห้อง หรือเสนอ “งานที่คุ้มสุด” จากบริบทที่ไม่ได้ตั้งใจกลับไปทำ
- overview, archive, หรือ search แสดงรายการถูกต้องในเชิงข้อมูล แต่ไม่บอกว่ามาจากห้องไหน
- ผู้ใช้สร้างห้องใหม่เพราะอยากแยกงาน แต่กลับรู้สึกว่าระบบแค่ reset หน้าจอ ไม่ได้แยกบริบทจริง
- ทีมเพิ่ม `+ New WorkRoom` ก่อน แล้วถูกดึงไปแก้ room bugs ต่อเนื่องจน rescue/eval coverage ถูกเลื่อนออกไป

## Do-Not-Happen List

- cross-room AI context leakage
- fake multi-room UI on top of single-room data
- ambiguity ว่าอะไรเป็น app-level state และอะไรเป็น room-level state
- room creation ที่ลดความสำคัญของ DUMP-first
- reentry ที่พาผิดห้องหรือใช้บริบทผิดห้อง
- overview/search/archive ที่ไม่มี ownership ของห้อง
- การ drift ไปเป็น workspace, planner, หรือ file manager

## Conceptual Boundaries

สิ่งที่เอกสารชุดนี้ถือว่าเป็น boundary เชิงแนวคิด ไม่ใช่ implementation decision:

### App-level state

- สิ่งที่เป็น shell ของแอป เช่น global navigation, walkthrough visibility, room list presence, และ preference บางอย่าง
- สิ่งที่ควรมีตัวเดียวในระดับแอป ไม่ควร copy ไปทุกห้อง

### Room-level state

- task context
- current action / current payload
- lifecycle state ของงานนั้น
- reentry / rescue / scaffold history ที่ผูกกับงานนั้น

### Not decided yet

- room naming rules
- room list density
- room archival behavior
- whether a room equals exactly one task or one client thread

### Unsafe to fake in UI

- ปุ่ม `+ New WorkRoom` ที่สร้างความรู้สึกว่ามีหลายห้อง ทั้งที่ state ยังไม่แยกจริง
- room switcher ที่สลับได้แค่ชื่อ แต่ไม่สลับ context จริง
- Studio intents ที่ดูเหมือน room-aware แต่ยังใช้ shared current state

## Hidden Assumptions To Validate

- room = task เสมอ
- ผู้ใช้ต้องการหลายห้องก่อนที่ห้องเดียวจะนิ่ง
- legacy data map เข้า room ได้ง่าย
- เพิ่ม UI ก่อนแล้วค่อยแยก data boundary ทีหลังได้
- overview / archive / search ของเดิมจะยืดไปหลายห้องได้โดยไม่เปลี่ยน mental model
- ผู้ใช้จะเข้าใจความต่างระหว่าง “ห้องใหม่” กับ “เริ่มงานใหม่ในห้องเดิม” โดยไม่ต้องสอนมาก
- ถ้า UI ดูเหมือนแยกห้อง ผู้ใช้จะให้อภัยได้ช่วงหนึ่งแม้ data model ยังไม่แยกจริง

## Bottom Line

multi-room ไม่ใช่ feature ที่น่ากลัวเพราะมันใหญ่  
มันน่ากลัวเพราะถ้าทำเร็วเกินไป มันจะทำลาย `boundary trust` ซึ่งเป็นหัวใจของ MIND

สิ่งที่ต้องยึดไว้คือ:

- MIND ต้องยังรู้สึกเหมือน AI ที่อยู่กับงานหนึ่งชิ้นจนมันขยับ
- ผู้ใช้ต้องไม่สงสัยว่า context ไหนเป็นของห้องไหน
- ถ้าระบบยังแยก boundary ไม่ได้จริง UI ก็ไม่ควรแกล้งทำเหมือนแยกได้แล้ว
