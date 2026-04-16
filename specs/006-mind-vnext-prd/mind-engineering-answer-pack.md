# MIND Engineering Answer Pack

Updated: 2026-04-11

เอกสารนี้เป็น reviewer-ready engineering report สำหรับ MIND โดยยึด product doctrine, target scenarios, readiness docs, และ Phase 5 gate truth ใน repo ปัจจุบันเป็นหลัก

chain ของคำตอบคือ:

`target scenario -> painpoint -> system design -> KPI / metrics -> scenario benchmark -> limits / caveats`

## 1. Project Framing

### What MIND Is

MIND คือ `local-first AI task copilot` สำหรับ `solo client-facing knowledge workers`

มันช่วยผู้ใช้พา “งานลูกค้าหนึ่งชิ้น” จาก:

- context กระจัดกระจาย
- ไปสู่ next move ที่เริ่มได้จริง
- และช่วยต่อจนงานขยับผ่าน intake, action, scaffold, rescue, และ reentry

### Current Phase Truth

- MIND พร้อมสำหรับ `controlled demo / closed beta ขนาดเล็ก`
- MIND ยัง `ไม่พร้อมสำหรับ broad launch`
- `rescue` ยังเป็น `caveat-managed subsystem`
- `npm run gate:phase5` เป็น mandatory pre-demo / pre-release gate
- รอบ evidence ล่าสุด: code-level verification เขียว แต่ browser/gate evidence ถูก block โดย local Ollama runtime; ดู [Phase 5 Demo Readiness Evidence Note](./phase-5-demo-readiness-evidence-note.md)

### What MIND Is Not

MIND ไม่ใช่:

- note app
- generic chatbot
- team workspace
- broad planner / task manager

## 2. Target Scenarios

engineering report ของ MIND ต้องเริ่มจาก scenario จริง ไม่ใช่เริ่มจาก skill หรือ architecture

canonical artifact:

- [MIND Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)

### Scenario A: Client Project Restart

ผู้ใช้เป็น freelancer / consultant / agency lead ที่กลับมาทำงานลูกค้าเดิมหลังหยุดไปหลายวันหรือหลายสัปดาห์ context อยู่หลายที่และจำไม่ได้ว่าควรเริ่มตรงไหน

MIND ต้องชนะโดย:

- อ่าน messy context
- สรุปสถานะงานปัจจุบัน
- เสนอ one next move
- แตก scaffold ให้เริ่มได้
- rescue เมื่อผู้ใช้ติด
- reentry เมื่อกลับมาใหม่

### Scenario B: Sales Inquiry / Demo Request

ลูกค้าส่ง context ยาว ขอ pilot/demo และถามว่าจะเริ่ม workflow แบบไหน ผู้ใช้ต้องตอบกลับโดยไม่ต้องอ่านใหม่ทั้งหมด

MIND ต้องชนะโดย:

- อ่านว่าเป็น `client_response`
- สรุป pain point ของลูกค้า
- เสนอ next response action
- มี reply panel ที่ตรงบริบท
- ไม่หลุดเป็น generic project resume

## 3. Painpoint And Root Cause

### Core User Problem

ผู้ใช้ไม่ได้ขาดข้อมูล แต่ขาดวิธีเปลี่ยนข้อมูลกระจัดกระจายให้เป็น next move ที่ทำได้ตอนนี้

pain หลัก:

- client work goes stale
- feedback กระจัดกระจาย
- scope ไม่ชัด
- user low-energy และเริ่มใหม่ยาก

### Root Cause

เครื่องมือทั่วไปแยกกันทำคนละส่วน:

- chatbot ตอบได้ แต่ไม่ผูกกับ task lifecycle
- note app เก็บ context ได้ แต่ไม่ผลักให้เกิด action
- task manager track งานได้ แต่ไม่อ่าน messy client dump
- workflow tools ทำ process ได้ แต่ไม่ช่วย rescue/reentry ในงานลูกค้าหนึ่งชิ้น

MIND จึงเลือกชนะที่ `task-scoped continuity`

## 4. System Design

### Functional Requirements

MIND ต้องสามารถ:

1. รับ text-first dump และ optional file context
2. อ่าน task intent ผ่าน semantic layer เช่น `taskShape`
3. เสนอ `ONE_ACTION` ที่เริ่มได้จริง
4. แตก action เป็น scaffold ที่ refine ต่อได้
5. rescue ผู้ใช้เมื่อ stuck
6. reentry ผู้ใช้กลับเข้าบริบทเดิมหลังพัก
7. แยก sales inquiry / demo request ออกจาก proposal-start หรือ generic resume case

### Non-Functional Requirements

ระบบต้องมี:

- local-first trust
- honest failure
- route contracts ชัดเจน
- controlled-demo latency ที่รับได้
- safe fallback ที่ไม่ทำ context หาย
- repeatable smoke / gate verification

### Architecture Direction

MIND ใช้ operation-based AI architecture:

- `/api/ai/intake`
- `/api/ai/action`
- `/api/ai/scaffold`
- `/api/ai/rescue`
- `/api/ai/reentry`
- `/api/ai/health`

แต่ละ operation ต้องมี prompt, contract, timeout/repair behavior, eval, และ fallback expectation ของตัวเอง

### State Model

MIND แยก state เป็นสองระดับ:

- `uiRoute`: `DUMP_ENTRY`, `SYNTHESIZING`, `ONE_ACTION`, `SCAFFOLD`, `RESCUE`, `BOUNCE_BACK`, `MANUAL_FALLBACK`
- task-level `assistantMode`: `intake_review`, `action_negotiation`, `scaffold_refinement`, `rescue_diagnosis`, `reentry_brief`, `scaffold_completion`

### Data Flow

1. ผู้ใช้ paste context
2. `intake` แยก workflow, blockers, digest, และ task shape
3. `action` เลือก one action ที่ตรงกับ scenario
4. `scaffold` แตกเป็น living plan และ refine ได้
5. `rescue` วินิจฉัยเมื่อ stuck
6. `reentry` ช่วยกลับเข้าบริบทเดิม

## 5. KPI, Metrics, And Instrumentation

KPI ของ MIND ต้องพิสูจน์ว่า task ขยับจริง ไม่ใช่แค่ route ตอบได้

| Metric | Formula / Definition | Event / log needed | Owner | Cadence | Usage |
| --- | --- | --- | --- | --- | --- |
| Next Move Success Rate | `tasks that reached a concrete next move / total dumps` | `intake_completed`, `one_action_rendered`, accepted action event | Product + Eng | per pilot cohort | pilot |
| Time To Next Action | `median(one_action_ready_at - dump_submitted_at)` | dump submit time, action ready time | Eng | per release | pilot + post-release |
| Task-Flow Pass Rate | `completed task flows / total task-flow runs` | smoke repeat results | Eng | every gate run | pre-release gate |
| Route Validation Failure Rate | `invalid route outputs / total route outputs` | AI operation validation logs | Eng | every benchmark run | pre-release gate |
| Client OK Rate | `successful client-facing outputs / total client-facing attempts` | sales/proposal smoke and route result | Product + Eng | per gate run | pre-release gate |
| Retry Success Rate | `successful recoveries after first failure / retry attempts` | rescue retry/repair telemetry | Eng | per benchmark run | pre-release gate |
| Scaffold Completion Rate | `completed scaffold steps / planned scaffold steps` | scaffold step complete events | Product + Eng | weekly during pilot | pilot + post-release |
| Reentry Success | `successful reentry sessions / reentry attempts` | reentry smoke + user return events | Product + Eng | per release / cohort | pilot + post-release |

### KPI Hierarchy

- Strategic: Next Move Success Rate, Reentry Success
- Tactical: Scaffold Completion Rate, Client OK Rate
- Operational: Task-Flow Pass Rate, Route Validation Failure Rate, Retry Success Rate, Time To Next Action

### Measurement Discipline

`microbenchmarking` ใช้เป็น measurement-design lens เท่านั้น

สำหรับ MIND แหล่งวัดจริงคือ:

- browser smoke
- route benchmark
- telemetry logs
- repeated task-flow checks
- pilot feedback

## 6. Scenario-Based Benchmark

benchmark section ต้องเล่าเป็น scenario win story ไม่ใช่ feature matrix กว้าง ๆ

### Scenario A: Client Project Restart

| Tool category | Helps with | Fails where MIND should win |
| --- | --- | --- |
| ChatGPT / Claude | สรุปข้อความและสร้างคำตอบได้ดี | ไม่จำ task lifecycle, scaffold state, rescue/reentry ของงานเดิม |
| Notion AI | ทำงานบน notes / docs ได้ดี | ไม่ได้ออกแบบให้พาผู้ใช้ low-energy ไปสู่ next move เดียว |
| Linear / Asana | track task และ status ได้ดี | ไม่อ่าน messy client context แล้วบอกว่าควรเริ่มตรงไหน |
| Workflow tools | automate process ได้ | ไม่ช่วย contextual rescue เมื่อผู้ใช้ติด |

MIND win story:

> เมื่อผู้ใช้กลับมาที่งานลูกค้าที่ค้าง MIND ไม่ได้แค่สรุปข้อมูล แต่พาไปสู่ one action, scaffold, rescue, และ reentry ใน task เดิม

### Scenario B: Sales Inquiry / Demo Request

| Tool category | Helps with | Fails where MIND should win |
| --- | --- | --- |
| ChatGPT / Claude | ร่าง reply จากข้อความยาวได้ | ไม่มี product-specific gate ว่าเคสนี้ควรเป็น sales inquiry ไม่ใช่ generic resume |
| Notion AI | เก็บ meeting notes / docs ได้ | ไม่บังคับ next response action หรือ reply panel ตาม context |
| Linear / Asana | track follow-up task ได้ | ไม่อ่าน pain point ลูกค้าแล้วเสนอ response ที่ใช้ส่งต่อได้ |
| Workflow tools | สร้าง automation ได้ | ไม่ช่วยตีความ pilot/demo request จาก context ยาว |

MIND win story:

> เมื่อ lead ส่งข้อความยาว MIND อ่านว่าเป็น demo/pilot request, สรุป pain point, เสนอ action ตอบกลับ และมี reply panel ที่ตรงบริบท

## 7. Limits And Caveats

section นี้เป็น mandatory ในทุก report output

### Known Limitations For Current Phase

- MIND พร้อมสำหรับ controlled demo / closed beta ขนาดเล็กเท่านั้น
- broad launch ยังไม่พร้อม
- `rescue` ยัง caveat-managed
- eval coverage ต้องคง discipline ต่อ
- rare-state UX ยังต้องเก็บต่อก่อนใช้วงกว้าง

### Risks If Framed Incorrectly

- ถ้าเล่าเป็น note app: MIND จะดูเหมือน tool เก็บข้อมูลทั่วไป
- ถ้าเล่าเป็น generic chatbot: MIND จะเสียจุดต่างเรื่อง task lifecycle
- ถ้าเล่าเป็น team workspace: scope จะหลุดจาก v1 single-room / solo worker

### Stop-Ship Truth

`npm run gate:phase5` เป็น gate บังคับ

ถ้า gate fail:

- ห้าม demo / release

ถ้า gate pass:

- demo ได้แบบ controlled demo
- ยังไม่ใช่ broad launch
- ยังไม่ใช่ rescue promotion

## 8. Reviewer-Ready Short Answer

> MIND is a local-first AI task copilot for solo client-facing workers. We anchor the product on two real scenarios: restarting stale client work and replying to long sales/demo inquiries. The system is designed as operation-based AI across intake, one action, scaffold, rescue, and reentry. We measure success with task-flow pass rate, time-to-next-action, validation failure rate, retry success, scaffold completion, and reentry success. Compared with generic AI, note AI, and task tools, MIND’s gap is task-scoped continuity. It is ready for controlled demo use, but not broad launch, because rescue remains caveat-managed and must stay behind the Phase 5 gate.

## 9. Source Of Truth Used

- [MIND Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)
- [MIND Health Check: vNext Readiness](./health-check-vnext-readiness.md)
- [Phase 5 Pre-Demo / Pre-Release Gate Note](./phase-5-pre-demo-pre-release-gate-note.md)
- [Phase 5 Demo Readiness Evidence Note](./phase-5-demo-readiness-evidence-note.md)
- [MIND Founder / Demo Brief](./founder-demo-brief.md)
- [MIND Product Doctrine](../../AGENTS.md)
