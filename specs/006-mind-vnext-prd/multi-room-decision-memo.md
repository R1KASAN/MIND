# MIND Multi-Room Decision Memo

Updated: 2026-04-08

## Decision

ตอนนี้ **ยังไม่ควรรีบเปิด `+ New WorkRoom`** เป็น feature ที่ผู้ใช้เห็นและใช้งานได้จริง

เหตุผลไม่ใช่เพราะ multi-room ไม่มีคุณค่า  
แต่เพราะตอนนี้ MIND ยังอยู่ในสภาพ `single-session / single-active-task` และความเสี่ยงใหญ่สุดของ multi-room คือการทำลาย `boundary trust` ถ้า UI ดูเหมือนแยกห้อง แต่ state และ AI context ยังไม่แยกจริง

## Why Now

ทีมเริ่มมีภาพของ Studio, reentry, และ `+ New WorkRoom` ชัดขึ้นแล้ว  
จึงเป็นเวลาที่ดีที่จะล็อก decision นี้ให้ตรงกันก่อนที่ UI จะวิ่งนำ data boundary

สิ่งที่ต้องป้องกันคือการทำ multi-room แบบ “ดูเหมือนพร้อม” ทั้งที่ข้างในยังไม่พร้อม เพราะถ้า boundary พัง ความเสียหายจะเกิดกับ product meaning และความน่าเชื่อใจพร้อมกัน

## Why Not Yet

- ปัจจุบัน MIND ยังคิดแบบมีงาน active ก้อนเดียวในเวลาหนึ่ง
- reentry, rescue, overview, และ archive ยังถูกออกแบบบน mental model ของ “งานนี้” ไม่ใช่ “หลายห้อง”
- ถ้าเปิดห้องใหม่เร็วเกินไป ผู้ใช้อาจไม่รู้ว่าอะไรอยู่ระดับ app และอะไรอยู่ระดับ room
- ถ้า UI แยกห้องก่อน data boundary จริง ผู้ใช้จะเริ่มสงสัยทันทีว่า AI ใช้บริบทจากห้องไหนกันแน่

สรุปคือ multi-room ตอนนี้ยังไม่ใช่ feature expansion ธรรมดา  
แต่มันคือ boundary change ของทั้ง product

## What Could Go Wrong

- ห้องใหม่เปิดได้ แต่จริง ๆ ยังชี้ state เดิม
- `current action`, `reentry brief`, หรือ `last failure` ของห้องเก่ายังไหลตามมา
- AI สรุปหรือแนะนำ next move จากบริบทคนละห้อง
- overview, archive, หรือ search ไม่บอก ownership ของห้องจนผู้ใช้ไม่แน่ใจว่าข้อมูลอยู่ที่ไหน
- MIND drift จาก `one task copilot` ไปเป็น workspace/menu app โดยที่แกนเดิมยังไม่นิ่ง

failure ที่แย่ที่สุดไม่ใช่แค่ user งง  
แต่คือ user เริ่มไม่เชื่อว่าระบบแยกบริบทของงานได้จริง

## What Must Be True First

- Studio และ reentry ในห้องเดียวต้องพิสูจน์ value ได้จริงก่อน
- ทีมต้องเห็นตรงกันว่าอะไรคือ `app-level state` และอะไรคือ `room-level state`
- ทีมต้องยอมรับร่วมกันว่า fake multi-room UI เป็น red flag
- MIND ต้องยังคง DUMP-first แม้จะคุยเรื่องหลายห้องในอนาคต

## Current Recommendation

คำแนะนำตอนนี้คือ:

- ใช้ room เดียวให้มีความหมายที่สุดก่อน
- ใช้ Studio เพื่อช่วยเริ่มและช่วยกลับมา โดยไม่รีบเพิ่ม room UI
- treat multi-room เป็น `post-Studio architecture decision`
- ไม่ให้ multi-room แซงคิว `rescue` และ `eval gates`

พูดแบบตรงที่สุด:

> ถ้าห้องเดียวของ MIND ยังไม่ไว้ใจได้พอ การเพิ่มหลายห้องจะไม่ได้คูณ value  
> แต่มันจะคูณความสับสนแทน
