# MIND Skill Stack Workflow Guide

Updated: 2026-04-11

เอกสารนี้เป็น workflow runner guide สำหรับใช้ skill stack กับ MIND แบบ scenario-anchored ไม่ใช่แค่ใช้ skill เพื่อผลิต report ให้ดูดี

เป้าหมายคือให้ทุก report, deck, หรือ reviewer answer เริ่มจาก “MIND ต้องชนะงานลูกค้าจริงแบบไหน” ก่อน แล้วค่อยใช้ system design, problem solving, competitive analysis, metric framing, และ KPI presentation มาช่วยพิสูจน์

## Skill Stack To Use

ใช้ตามลำดับนี้:

0. `Product Target Scenario Lock-in`
1. `system-design`
2. `problem-solving`
3. `competitive-brief`
4. `microbenchmarking`
5. `kpi-dashboard-design`

หลักคิด:

- `Step 0` ล็อก real-world scenario ก่อน ไม่ให้ workflow กลายเป็น report สวยแต่ไม่ตอบ use-case
- `system-design` วางโครงระบบจาก scenario จริง
- `problem-solving` จัดเหตุผลจาก pain -> root cause -> design decision
- `competitive-brief` ทำ scenario-based comparison ไม่ใช่ feature matrix กว้าง ๆ
- `microbenchmarking` ใช้เป็น measurement-design lens ไม่ใช่ .NET benchmark plan
- `kpi-dashboard-design` จัด KPI ให้อ่านง่ายและใช้กับ reviewer ได้

## Step 0: Product Target Scenario Lock-in

### When to use

ใช้ก่อนทุกครั้งที่ต้องเขียน report, deck, PRD, หรือ answer pack เกี่ยวกับ MIND

### Goal

ล็อกว่าใน phase นี้ MIND ต้องชนะ scenario ใด ไม่ใช่ชนะทุก productivity workflow

### Current locked scenarios

1. `Client project restart`
2. `Sales inquiry / demo request`

canonical scenario artifact อยู่ที่:

- [MIND Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)

### Required output

ทุก scenario ต้องมี:

- user archetype
- current workflow without MIND
- failure mode without MIND
- with-MIND happy path
- success criteria
- `What MIND is NOT for this scenario`

### Prompt pattern

```md
Using MIND Product Doctrine, Founder Demo Brief, Health Check, and the current gate notes, lock the target scenario for this workflow.

For each scenario, define:
- user archetype
- current workflow without MIND
- failure modes without MIND
- with-MIND happy path
- success criteria
- What MIND is NOT for this scenario

Do not continue to system design until the scenario is concrete enough to demo.
```

### What to do next

Use the locked scenario as the input to `system-design`

## Step 1: Use `system-design`

### When to use

ใช้หลังจาก scenario ถูกล็อกแล้ว เพื่อแปลง scenario เป็น requirements, architecture, boundaries, และ trade-offs

### Goal

- แตก FR / NFR จาก scenario จริง
- อธิบาย operation-based architecture
- แยก component และ route boundaries
- ระบุ trade-offs ของ single-room, DUMP-first, local-first design

### Prompt pattern

```md
Use [$system-design](/Users/ark1/.agents/skills/system-design/SKILL.md) to turn the locked MIND scenarios into:
- functional requirements
- non-functional requirements
- operation-based architecture
- state model
- route boundaries
- key trade-offs

Scenario inputs:
- Client project restart
- Sales inquiry / demo request
```

### Expected output

- requirements table
- component/route map
- data flow summary
- architecture trade-offs

### What to do next

Feed the system frame into `problem-solving`

## Step 2: Use `problem-solving`

### When to use

ใช้หลังจากได้ architecture frame แล้ว แต่ narrative ยังต้องการ causal reasoning สำหรับ reviewer

### Goal

- จัด story แบบ problem -> cause -> options -> decision
- อธิบายว่าทำไม MIND ไม่ใช่ note app, generic chatbot, หรือ team workspace
- ลดความเสี่ยงที่ report จะกลายเป็น feature list

### Prompt pattern

```md
Use [$problem-solving](/Users/ark1/.agents/skills/problem-solving/SKILL.md) to structure MIND’s engineering narrative from:
- locked scenario
- real user pain
- root cause
- design alternatives
- chosen MIND direction
- why this architecture fits better than a note app, generic chatbot, or team workspace
```

### Expected output

- root cause framing
- rejected alternatives
- chosen direction
- scenario-specific justification

### What to do next

Use the narrative as context for `competitive-brief`

## Step 3: Use `competitive-brief`

### When to use

ใช้เมื่อรู้แล้วว่า scenario ไหนต้องชนะ และต้องพิสูจน์ว่า MIND ต่างจาก product category อื่นอย่างไร

### Goal

- ทำ scenario-based market comparison
- เทียบ workflow outcome ไม่ใช่แค่ feature list
- สร้าง `MIND win story` สำหรับแต่ละ scenario

### Prompt pattern

```md
Use [$competitive-brief](/Users/ark1/.agents/skills/competitive-brief/SKILL.md) to compare MIND against:
- ChatGPT / Claude
- Notion AI
- Linear / Asana
- workflow tools

Use these scenarios as the comparison axis:
- Client project restart
- Sales inquiry / demo request

For each scenario, compare:
- where the existing tool helps
- where it fails
- where MIND wins through task-scoped continuity, next-move generation, rescue, and reentry
```

### Expected output

- scenario-based comparison table
- gap analysis
- MIND win story
- threat / limitation summary

### What to do next

Use the scenario comparison to define metrics with `microbenchmarking`

## Step 3.5: Use `market-fit + friction-zero prompt`

### When to use

ใช้เมื่อทีมมี comparative baseline แล้ว แต่ยังต้องการคำตอบที่เข้มกว่า `competitive-brief` ใน 3 เรื่องพร้อมกัน:

- market reality check
- UX/UI critique ที่ผูกกับ user behavior จริง
- prioritized roadmap สำหรับลด friction ก่อนขยาย feature

### Goal

- แยก `problem-solution fit` ออกจาก `product-market fit`
- ชี้ว่าจุดแข็งของ MIND ชนะตลาดตรงไหนจริง
- ระบุ UX/UI weak points ที่ทำให้ user ไม่กลับมาใช้ซ้ำ
- บังคับให้ roadmap เริ่มจาก `reentry-first + lower friction` ไม่ใช่ feature expansion

### Canonical artifact

- [MIND Market Fit + Friction-Zero Prompt](./mind-market-fit-friction-zero-prompt.md)

### Prompt pattern

```md
Use the canonical prompt in [MIND Market Fit + Friction-Zero Prompt](./mind-market-fit-friction-zero-prompt.md).

Feed it with:
- the current critique / founder feedback / proposed plan
- repo facts from the doctrine, target scenarios, workflow review, and engineering answer pack

Require the output to include:
- market comparison matrix
- UX/UI weak points
- prioritized MVP adjustments
- friction-reduction roadmap
- metrics dashboard
- self-critique
```

### Expected output

- market matrix ที่เทียบ MIND กับ tool จริงในตลาด
- verdict ว่า MIND อยู่ที่ระดับไหนของ fit
- UX/UI change list ที่เรียง `P0 now`, `P1 next`, `P2 later`
- friction roadmap 3 phases
- metric table สำหรับพิสูจน์ว่าการแก้ friction ได้ผล

### What to do next

ใช้ผลลัพธ์นี้เพื่อ:

- refactor room / reentry hierarchy
- tighten product narrative สำหรับ founder / reviewer
- feed headline metrics กลับเข้า `microbenchmarking` และ `kpi-dashboard-design`

## Step 3.6: Prepare `Read + Repo Facts`

### When to use

ใช้ก่อนรัน canonical prompt ทุกครั้ง เพื่อทำให้ input มีรูปแบบเดียวกันและลดการเดา

### Goal

- ล็อก repo facts ให้เป็นชุดเดียวกัน
- ใส่คำถาม / focus ของ run นี้ให้ชัด
- บังคับ guardrails ก่อนเข้าสู่ market-fit analysis

### Canonical artifact

- [Read + Repo Facts Template](./mind-market-fit-friction-zero-read-template.md)

### Prompt pattern

```md
Fill out [Read + Repo Facts Template](./mind-market-fit-friction-zero-read-template.md) with:
- current repo facts
- latest spec references
- specific questions / focus
- guardrails

Then feed the completed template into the canonical prompt in [MIND Market Fit + Friction-Zero Prompt](./mind-market-fit-friction-zero-prompt.md).
```

### Expected output

- read packet ที่พร้อมรัน
- repo facts summary ที่ไม่ drift
- questions / focus ที่ชัดเจนพอให้ model ตอบแบบ market reality check

### What to do next

รัน canonical prompt แล้วเทียบผลลัพธ์กับตัวอย่าง run จากไฟล์ example

## Step 3.7: Review `Example Run`

### When to use

ใช้หลังรัน canonical prompt ครั้งแรก หรือเมื่ออยากเทียบว่าคุณภาพ output ยังอยู่ในระดับ reference ไหม

### Goal

- ให้ทีมเห็น output shape ที่คาดหวัง
- ลด variance ตอนใช้ prompt ข้ามรอบ
- ใช้เป็น reference ก่อนส่ง review / deck / roadmap

### Canonical artifact

- [Example Run](./mind-market-fit-friction-zero-example-run.md)

### Prompt pattern

```md
Use [Example Run](./mind-market-fit-friction-zero-example-run.md) as the reference shape for the canonical prompt output.

Check that the final answer still includes:
- Executive Verdict
- Market Comparison Matrix
- UX/UI Verdict
- Prioritized MVP Adjustments
- Friction Reduction Roadmap
- Metrics Dashboard Prototype
- Self-Critique
```

### Expected output

- reference output ที่อ่านเร็ว
- compare-able sample สำหรับทีม
- reminder ว่า output ต้องยึด 7 ส่วนหลักของ canonical prompt

### What to do next

ใช้ canonical prompt + read template + example run เป็นชุดเดียวกันสำหรับทุก market-fit review

## Step 3.8: Use `T050 reentry-first shell prompt`

### When to use

ใช้เมื่อ `Real Run #1` หรือ market-fit review ฟันธงแล้วว่า `P0 now` อยู่ที่ `first paint / reentry hierarchy` และทีมต้องแปลง verdict นี้ไปสู่ implementation plan ของ `T050`

### Goal

- ล็อก implementation boundary ของ `T050` ให้แคบ
- รักษา shell ปัจจุบันของ MIND ไว้
- ทำให้ main canvas ของ `DUMP_ENTRY`, `BOUNCE_BACK`, `MORNING_RITUAL`, และ `ONE_ACTION` มี first paint ที่ชัดขึ้น
- เคลียร์ blocker ให้ `T051`, `T052`, `T053`

### Canonical artifact

- [MIND T050 Reentry-First Shell Prompt](./mind-t050-reentry-first-shell-prompt.md)

### Prompt pattern

```md
Use the implementation prompt in [MIND T050 Reentry-First Shell Prompt](./mind-t050-reentry-first-shell-prompt.md).

Feed it with:
- the `P0 now` verdict from market-fit review
- current `page.tsx` shell facts
- T050 task scope from `tasks.md`

Require the output to stay minimal-patch:
- no full shell rewrite
- no Tailwind/shadcn assumptions
- no new deps
- no route/state changes
```

### Expected output

- current hierarchy diagnosis
- new main-canvas hierarchy
- targeted code changes for `page.tsx`
- acceptance checklist
- explicit blockers cleared / not cleared for `T051`, `T052`, `T053`

### What to do next

ใช้ผลลัพธ์นี้เป็น implementation brief สำหรับ engineer ที่จะรับ `T050` ต่อ ก่อนแตกงานละเอียดของ `T051`, `T052`, และ `T053`

## Step 4: Use `microbenchmarking`

### When to use

ใช้เมื่อต้องเปลี่ยน success criteria ของ scenario ให้เป็น measurement plan ที่วัดได้จริง

### Important note

skill นี้มีฐานคิดเป็น BenchmarkDotNet/.NET microbenchmark แต่สำหรับ MIND ให้ใช้เป็น `measurement-design lens` เท่านั้น

ห้ามอธิบายว่า MIND มี BDN benchmark suite หรือ .NET microbenchmark implementation เพราะไม่ตรงกับ repo ปัจจุบัน

### Goal

- แยก metric ที่พิสูจน์ว่า task ขยับจริง
- ระบุ event/log ที่ต้องเก็บ
- ระบุ owner และ review cadence
- แยกว่า metric ใช้ใน pilot, pre-release gate, หรือ post-release monitoring

### Prompt pattern

```md
Use [$microbenchmarking](/Users/ark1/.agents/skills/microbenchmarking/SKILL.md) as a measurement-design lens for MIND.

Do not assume .NET implementation.

For each metric, define:
- metric name
- formula
- event/log required
- owner
- review cadence
- whether it belongs to pilot, pre-release gate, or post-release monitoring

Use these metrics:
- task-flow pass rate
- time-to-next-action
- routeValidationFailureRate
- clientOkRate
- retrySuccessRate
- scaffold completion rate
- reentry success
```

### Expected output

- metric definitions
- formulas
- instrumentation plan
- owner / cadence table
- smoke vs route benchmark vs repeated flow distinction

### What to do next

Feed the metric pack into `kpi-dashboard-design`

## Step 5: Use `kpi-dashboard-design`

### When to use

ใช้ตอน metric set พร้อมแล้ว และต้องเล่าให้ reviewer เข้าใจเร็วโดยไม่เสียความเป็นวิศวกรรม

### Goal

- จัด KPI เป็น strategic / tactical / operational
- เลือก headline metrics
- ทำ reviewer-friendly summary
- แยก metric สำหรับ pilot, pre-release gate, post-release monitoring

### Prompt pattern

```md
Use [$kpi-dashboard-design](/Users/ark1/.agents/skills/kpi-dashboard-design/SKILL.md) to organize MIND’s KPI set into:
- strategic metrics
- tactical metrics
- operational metrics

Also mark each metric as:
- pilot signal
- pre-release gate signal
- post-release monitoring signal

Make the result suitable for:
- engineering report
- project review
- one-page presentation summary
```

### Expected output

- KPI hierarchy
- 4-6 headline metrics
- metric grouping
- reviewer-friendly summary layout

### What to do next

Merge scenario proof, system design, competitive analysis, and KPI hierarchy into the engineering answer pack

## Required Artifacts For Every Workflow Run

ทุกครั้งที่ใช้ workflow นี้ ต้องได้ artifact อย่างน้อย:

- target scenario proof
- FR / NFR table
- architecture summary
- problem-to-decision narrative
- scenario-based benchmark table
- KPI + instrumentation table
- limits / caveats section
- `What MIND is NOT for this scenario`
- 1-page headline summary สำหรับ reviewer

## Recommended Source Docs

ก่อนใช้ skill stack ให้โหลดบริบทจากเอกสารพวกนี้:

- [MIND Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)
- [MIND Health Check: vNext Readiness](./health-check-vnext-readiness.md)
- [Phase 5 Pre-Demo / Pre-Release Gate Note](./phase-5-pre-demo-pre-release-gate-note.md)
- [MIND Founder / Demo Brief](./founder-demo-brief.md)
- [MIND Engineering Answer Pack](./mind-engineering-answer-pack.md)
- [MIND Product Doctrine](../../AGENTS.md)

## Guardrails

- อย่าเริ่มจาก skill stack ถ้ายังไม่ได้ล็อก scenario
- อย่าอธิบาย MIND เหมือน note app
- อย่าอธิบาย MIND เหมือน generic chatbot
- อย่าอธิบาย MIND เหมือน team workspace
- benchmark ต้องเป็น scenario-based win story ไม่ใช่ feature matrix กว้าง ๆ
- KPI ต้องมี event/log, owner, และ cadence
- limits/caveats เป็น section บังคับ ไม่ใช่ optional checklist
- ใช้ `microbenchmarking` เป็นกรอบ measurement เท่านั้น ไม่ใช่ literal .NET benchmark plan
