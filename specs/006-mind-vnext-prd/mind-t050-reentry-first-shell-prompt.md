# MIND T050 Reentry-First Shell Prompt

Updated: 2026-04-15

เอกสารนี้เป็น implementation prompt artifact สำหรับใช้แปลง verdict จาก `Real Run #1` ไปสู่การลงมือแก้ `T050` แบบแคบและตรงจุด โดยยึด shell ปัจจุบันของ MIND เป็นหลัก

## When To Use

ใช้ prompt นี้เมื่อ:

- ทีมได้ข้อสรุปจาก `market-fit + friction-zero` แล้วว่า `first paint` ยังไม่คมพอ
- ต้องลงมือทำ `T050` ใน [tasks.md](./tasks.md)
- เป้าหมายคือ refactor `page.tsx` แบบ minimal patch เพื่อให้ room เปิดมาด้วย `reentry / dump` path ที่ชัดขึ้น

prompt นี้ไม่ใช่สำหรับ:

- rewrite app shell ทั้งหมด
- เปลี่ยน route/state model
- เพิ่ม dependency ใหม่
- แตะ server logic, AI contracts, หรือ persistence behavior

## Required Repo Facts

ก่อนใช้ prompt นี้ ให้ยึด facts ต่อไปนี้เป็น source of truth:

- stack ปัจจุบันคือ `Next 16.2.2` + `React 19`
- UI ปัจจุบันใช้ inline styles + `globals.css`
- repo นี้ไม่ได้ใช้ `Tailwind` หรือ `shadcn/ui` เป็นฐานของ shell ปัจจุบัน
- `src/app/page.tsx` มี `RoomSidebar`, `RoomCanvasHeader`, และ route-based rendering อยู่แล้ว
- `renderState()` แยก surface ตาม `DUMP_ENTRY`, `BOUNCE_BACK`, `MORNING_RITUAL`, `ONE_ACTION`, และ routes อื่นของ state machine
- `BrainDumpInput` รับ `studioPanel` เป็น prop
- `BounceBack` และ `MorningRitual` เป็น route surfaces ไม่ใช่ fixed overlay ที่แยกจาก shell

recommended source docs:

- [MIND Product Doctrine](../../AGENTS.md)
- [Tasks](./tasks.md)
- [Real Run #1 / Example Run](./mind-market-fit-friction-zero-example-run.md)
- [Research-Backed Workflow Review](./research-backed-workflow-review-2026-04-15.md)

## Canonical Prompt

```md
คุณคือ React/Next Architect + MIND Doctrine Enforcer ที่กำลัง refactor shell ปัจจุบันของ MIND แบบ minimal patch

หน้าที่ของคุณคืออ่าน repo facts และ T050 spec ด้านล่าง แล้วออกแบบ implementation plan + targeted code changes สำหรับ `src/app/page.tsx` เพื่อทำให้ room shell ของ MIND เป็น `reentry-first / dump-first` มากขึ้น โดยไม่ rewrite app shell ทั้งหมด

## T050 Spec

- file target หลัก: `src/app/page.tsx`
- เป้าหมาย: first paint ของ main canvas ต้องชี้ผู้ใช้ไปที่ `reentry brief -> ONE_ACTION -> dump if needed`
- ต้องคง `RoomSidebar` และ `RoomCanvasHeader`
- ต้องลด `StudioPanel` และ secondary tools ให้เป็น secondary affordance
- ต้องไม่แตะ server routes, AI contracts, IDB types, orchestration semantics, หรือ room persistence behavior

## Repo Facts ที่ต้องยึด

- stack ปัจจุบันคือ `Next 16.2.2` + `React 19`
- shell ใช้ inline styles + `globals.css`
- อย่าสมมติว่า repo นี้ใช้ `Tailwind`, `shadcn/ui`, หรือ `Next.js 15`
- `page.tsx` มี `RoomSidebar`, `RoomCanvasHeader`, และ `renderState()` อยู่แล้ว
- `renderState()` แยกอย่างน้อยตาม:
  - `DUMP_ENTRY`
  - `BOUNCE_BACK`
  - `MORNING_RITUAL`
  - `ONE_ACTION`
- `BrainDumpInput` รับ `studioPanel`
- `BounceBack` และ `MorningRitual` เป็น route surfaces ใน shell เดิม ไม่ใช่ floating overlay

## Design Intent

ใช้แนวคิด minimal patch:

- คง shell ปัจจุบันไว้
- refactor แค่ hierarchy ของ main canvas
- fresh room / `DUMP_ENTRY`: dump input ต้องเป็น primary content ทันที
- stale room / `BOUNCE_BACK` และ `MORNING_RITUAL`: reentry brief + continue path ต้องอยู่บนสุดของ first viewport
- `ONE_ACTION`: hero action + primary CTA ต้องอยู่เหนือ fold
- secondary surfaces เช่น `StudioPanel`, extra tools, debug/trust/archive affordances ต้องไม่แย่ง first attention

## Required Tasks

1. วิเคราะห์ current hierarchy ของ `page.tsx` โดยเฉพาะ:
   - `mind-room-main`
   - `renderState()` path ของ `DUMP_ENTRY`, `BOUNCE_BACK`, `MORNING_RITUAL`, `ONE_ACTION`
2. เสนอ main-canvas hierarchy ใหม่ที่ทำให้ first paint ชัดขึ้น โดยไม่ซ่อน `RoomSidebar` หรือ `RoomCanvasHeader` แบบถาวร
3. ให้ targeted code changes สำหรับ `page.tsx` เท่านั้นเป็นหลัก
4. ระบุ exact blockers ที่ T050 ช่วยเคลียร์ให้:
   - `T051`: reentry surface consistency
   - `T052`: one-action above-fold cleanup
   - `T053`: dump-entry simplification

## Output Format

### 1) Current Hierarchy Diagnosis
- ชี้ว่าตอนนี้ first paint ถูกแย่งโดยอะไรบ้าง
- แยกตาม `DUMP_ENTRY`, `BOUNCE_BACK`, `MORNING_RITUAL`, `ONE_ACTION`

### 2) New Hierarchy Mermaid
- ใช้ mermaid diagram แบบสั้น
- แสดงเฉพาะ shell/main-canvas hierarchy ใหม่

### 3) Targeted Code Changes
- ห้าม rewrite ทั้งไฟล์
- ให้เป็น patch plan + snippets เฉพาะ section ที่ต้องแก้
- ต้องระบุว่าตรงไหนใน `page.tsx` ควรถูกย้าย, ซ่อน, หรือ reorder

### 4) Acceptance Checklist
- fresh room / `DUMP_ENTRY`: dump field visible immediately
- stale room / `BOUNCE_BACK`: one dominant continue path in first viewport
- `MORNING_RITUAL`: hierarchy เดียวกับ bounce-back ไม่ใช่เล่าเรื่องซ้ำ
- `ONE_ACTION`: hero action + primary CTA above fold
- regression guard:
  - `RoomSidebar` still renders
  - `RoomCanvasHeader` still renders
  - no route/state changes
  - no new deps

### 5) Blockers Cleared / Not Cleared
- ชี้ให้ชัดว่า T050 เคลียร์อะไรให้ `T051`, `T052`, `T053`
- ถ้าอะไรยังไม่เคลียร์ ให้บอกว่าเหลือต้องทำใน ticket ถัดไป

## Anti-Drift Rules

- reject answers that rewrite the whole app shell
- reject answers that assume `Tailwind`, `shadcn/ui`, or `React Testing Library`
- reject answers that introduce fixed global overlays detached from the room shell
- reject answers that change route names, handler contracts, or persistence logic
- reject answers that put `Studio`, `DecisionBoard`, or secondary tooling above the main `reentry / ONE_ACTION / dump` path on first paint
```

## Expected Output Shape

ผลลัพธ์ที่ดีควรทำให้ implementer รู้ได้ทันทีว่า:

- `page.tsx` ต้อง reorder อะไรบ้าง
- shell ส่วนไหนต้องคงไว้
- first paint ใหม่หน้าตาเป็นอย่างไร
- T050 เคลียร์ blocker ไหนให้ T051-T053 แล้ว

ตัวอย่าง headline ที่ถือว่าใช้ได้:

- `Minimal patch นี้ทำให้ DUMP_ENTRY และ reentry routes มีเส้นทางหลักเพียงเส้นเดียวใน main canvas โดยไม่แตะ state machine`
- `T050 เคลียร์ shell hierarchy สำหรับ T051 และ T053 แต่ยังไม่แก้ supporting surfaces ใน OneAction เอง`

## Constraints

- อย่าใช้ prompt นี้เพื่อสร้าง greenfield layout ใหม่
- อย่าใช้ prompt นี้เพื่อสั่ง model rewrite `page.tsx` ทั้งไฟล์
- อย่าใช้ prompt นี้เพื่อแก้ runtime AI routes
- ถ้าต้องอ้าง tests ให้ยึด acceptance checklist + smoke/manual checks ที่มีอยู่ใน repo ก่อน

