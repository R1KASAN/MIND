# Week 3 Quality Rubric: Core Room Loop

Use this rubric to manually replay MIND's core room loop:

```text
Brain Dump -> Clarification -> ONE_ACTION -> Evidence -> Rescue -> Reentry
```

Week 3 focuses on output quality, not AI provider infrastructure, schemas, routes, timeouts, Studio, dashboards, or broad UI redesign.

## ONE_ACTION Rubric

A passing `ONE_ACTION` must:

- name one action only, not a list of parallel work
- fit a 5-15 minute first move
- use real anchors from the current room, such as customer, incident, file, task, deadline, or work artifact names
- produce or prepare a visible work artifact, such as a status note, draft reply, checklist, summary, decision note, or scoped next edit
- avoid generic advice that could apply to any room
- avoid disguising a todo list as one action

Fail examples:

- "จัดการงานนี้ต่อ"
- "เปิดบริบทแล้วเริ่มทำ"
- "พักก่อน แล้วค่อยดูงาน"
- three separate tasks with no single first move

Pass examples:

- "ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลา"
- "สรุปสถานะ prod/CPU spike เป็น 3 บรรทัด"
- "แยก Dashboard กับ payment API ว่าค้างตรงไหน"

## Rescue Rubric

A passing Rescue must:

- name the real blocker in the current room
- explain the cause or risk, not just say the user is stuck
- give one smaller grounded recovery step or one ready-to-use unblock message
- use room anchors from the brain dump, clarification, evidence, or current action
- avoid sounding like an internal error, fallback, or generic productivity template

Fail examples:

- "AI ยังตอบไม่ทัน"
- "ลดแรงเริ่ม"
- "พลังงานต่ำ"
- "ทำแค่ 5 นาทีแรก"

Pass examples:

- "ติดเพราะยังไม่มีสถานะ prod ล่าสุดพอจะตอบ ABC Corp โดยไม่ commit เวลา"
- "ส่งข้อความสั้น ๆ ขอข้อมูล payment API response จาก backend ก่อนยืนยัน timeline"
- "จด Dashboard กับ payment API เป็นสอง bullet แล้วตอบลูกค้าว่าจะอัปเดต RCA หลังปิด incident"

## Room Evaluation / Replay Template

Copy this block for each manual replay:

```md
## Room Replay: <case name>

### Room Context
- Brain Dump:
- Attached/source evidence:
- Existing room memory:

### User Tension
- Pressure:
- Missing or unsafe information:
- Human friction:

### Clarification
- Asked: yes / no
- Question:
- User answer:
- Pass: yes / no

### ONE_ACTION
- Title:
- Why this now:
- One-action check: pass / fail
- 5-15 minute check: pass / fail
- Room anchors used:
- Visible artifact:
- Generic/todo-list smell: none / minor / fail

### Evidence
- Evidence anchors shown:
- Source matches current room: yes / no
- Missing or invented source: yes / no

### Starter Steps
1.
2.
3.
- At least two grounded steps when anchors exist: yes / no
- Step 3 creates artifact/message/summary/checklist/draft: yes / no

### Rescue
- Blocker named:
- Cause/risk explained:
- Recovery step/message:
- Room anchors used:
- Error/fallback tone: none / minor / fail

### Reentry
- Refresh/reopen result:
- Preserves same room and current task: yes / no

### Quality Score
- ONE_ACTION: 0-3
- Evidence: 0-3
- Rescue: 0-3
- Reentry: 0-3
- Overall: PASS / WARN / FAIL

### Fix Needed
- None / docs / copy / guard / test / runtime
- Note:
```

## Scoring Guide

- `3`: grounded, usable, and demo-ready
- `2`: usable with minor wording risk
- `1`: technically works but feels generic or weak
- `0`: blocks the core room loop

Overall status:

- `PASS`: no category below 2 and no blocker
- `WARN`: one weak category, but the flow remains demoable
- `FAIL`: any blocker, invented evidence, broken reentry, or generic Rescue that cannot help the user
