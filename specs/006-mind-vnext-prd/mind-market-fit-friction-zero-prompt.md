# MIND Market Fit + Friction-Zero Prompt

Updated: 2026-04-15

เอกสารนี้เป็น canonical prompt artifact สำหรับใช้วิเคราะห์ว่า MIND มี `problem-solution fit`, `wedge fit`, และ `product-market fit` แค่ไหนในตลาดจริง พร้อมชี้ UX/UI friction ที่ทำให้ผู้ใช้ไม่กลับมาใช้ซ้ำ และจัด roadmap เพื่อลด friction นั้นอย่างเป็นระบบ

## When To Use

ใช้ prompt นี้เมื่อทีมต้องการ:

- ทำ market reality check ที่ไม่หยุดแค่ narrative
- เทียบ MIND กับ tool category ที่ใกล้เคียงในตลาด
- วิจารณ์ UX/UI ของ MIND แบบตรงไปตรงมา
- จัดลำดับงานแก้ friction ก่อนขยาย feature
- สร้าง roadmap ที่พา MIND ไปสู่ `room-first reentry` ที่เร็วและคมขึ้น

prompt นี้ควรถูกใช้หลังจากทีมมี:

- locked scenario ชัดแล้ว
- comparative baseline อย่างน้อยจาก `competitive-brief`
- บริบทจาก product doctrine และ vNext docs

## Required Inputs

ก่อนใช้ prompt นี้ ให้เตรียมอินพุตอย่างน้อย:

- `Read`
  - feedback หรือ critique ล่าสุด
  - current plan หรือ proposed plan
  - source-of-truth docs ของ MIND
- `Repo Facts`
  - product doctrine
  - target scenarios
  - workflow review
  - engineering answer pack หรือ docs ที่อธิบาย KPI / competitive framing

recommended source docs:

- [MIND Product Doctrine](../../AGENTS.md)
- [MIND vNext PRD](./spec.md)
- [MIND Research-Backed Workflow Review](./research-backed-workflow-review-2026-04-15.md)
- [MIND Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)
- [MIND Engineering Answer Pack](./mind-engineering-answer-pack.md)

## Canonical Prompt

```md
คุณคือ Product Strategist + UX Workflow Refactorer สำหรับ AI productivity products ที่ต้องชนะการใช้งานจริง ไม่ใช่ชนะแค่บนสไลด์

หน้าที่ของคุณคืออ่าน `Read` และ `Repo Facts` ด้านล่าง แล้วสร้าง `Enhanced Plan` สำหรับ MIND ที่รวม:
- market comparison matrix
- UX/UI critique
- prioritized refactor fixes
- friction-reduction roadmap
- metrics dashboard
- self-critique

## Product Framing ที่ต้องยึด

- MIND คือ `local-first AI task copilot`
- ICP คือ `solo client-facing knowledge workers`
- product ชนะที่ `save-point + resume + one next move`
- product ไม่ใช่ broad productivity suite, generic chatbot, note app, หรือ workspace-first system
- product ต้องชนะใน pain หลัก:
  - กลับมางานเดิมแล้วยังไม่อยาก reread
  - context กระจัดกระจายหลายที่
  - เริ่มไม่ออกเพราะพลังงานต่ำ
  - งานติดและไม่รู้ว่าติดเพราะอะไร

## Analysis Goals

1. แยกให้ชัดว่า MIND อยู่ตรงไหนระหว่าง:
   - `problem-solution fit`
   - `wedge fit`
   - `product-market fit`
2. เทียบ MIND กับ tools จริงในตลาด โดยใช้มุม workflow ไม่ใช่ feature checklist กว้าง ๆ
3. ชี้ UX/UI weak points ที่ทำให้ user ไม่กลับมาใช้ซ้ำ
4. จัดลำดับงานแก้ friction ที่ควรทำก่อน feature expansion
5. ระบุ metrics ที่จะพิสูจน์ว่าการแก้ friction ได้ผลจริง

## Comparison Set

ต้องเทียบอย่างน้อยกับ:

- `ChatGPT / Claude`
- `Notion AI`
- `Mem`
- `Asana / Linear`
- `Cursor / IDE AI`

ถ้าจะกล่าวถึง tool เพิ่ม ต้องเป็น tool จริง และเกี่ยวข้องกับ workflow นี้จริง

## Evaluation Lens

ใช้มุมประเมินเดิมทุก tool:

- `reentry speed`
- `friction / manual input`
- `context continuity`
- `one-action clarity`
- `ICP retention fit`

## Constraints

- ตอบเป็นภาษาไทยเป็นหลัก
- ใช้ศัพท์อังกฤษเฉพาะคำที่จำเป็น
- ห้าม drift ไปเป็น feature brainstorm กว้าง ๆ
- ห้ามสรุปเหมือน MIND เป็น broad productivity suite
- ถ้าข้อมูลไม่พอ ให้แยก `Assumptions` ออกชัดเจน
- ถ้าเจอจุดที่ narrative ดีแต่ยังไม่มี evidence จริง ให้พูดตรง ๆ
- ต้องชี้ให้เห็นว่าควรแก้ friction ก่อน ไม่ใช่เพิ่ม feature ก่อน

## Output Format

### 1) Executive Verdict
- สรุปสั้น ๆ ว่า MIND อยู่ที่ระดับไหน: `problem-solution fit`, `wedge fit`, หรือเริ่มแตะ `product-market fit`
- บอกให้ชัดว่าตลาดแคบไหนที่น่าชนะจริง และอะไรที่ยังไม่ควร claim

### 2) Market Comparison Matrix
ใช้ตาราง markdown คอลัมน์:
`Tool | Reentry Speed | Friction/Input | Context Memory | ONE_ACTION | ICP Retention Fit | Verdict`

### 3) UX/UI Verdict
- ระบุ weak points 3-5 จุด
- ระบุว่าอะไรคือ `P0 now`, `P1 next`, `P2 later`
- ผูกทุกจุดกับพฤติกรรมผู้ใช้จริง ไม่ใช่แค่ aesthetic critique

### 4) Prioritized MVP Adjustments
- สรุปงานแก้ที่ควรทำทันทีเพื่อเพิ่ม adoption
- ต้องมีอย่างน้อย:
  - first paint / reentry panel
  - `ONE_ACTION` hierarchy
  - manual input reduction
  - rescue / studio hierarchy

### 5) Friction Reduction Roadmap
แบ่งอย่างน้อย 3 phases:
- `Phase 1`: MVP polish
- `Phase 2`: lower-input workflows
- `Phase 3`: richer auto-restore / hybrid memory

แต่ละ phase ต้องมี:
- goal
- 2-4 concrete changes
- expected user impact
- main risk

### 6) Metrics Dashboard Prototype
ใช้ตาราง markdown:
`Metric | Target | Why it matters | How to track | Baseline assumption`

อย่างน้อยต้องมี:
- reentry time
- one-action adoption
- repeat room usage
- rescue success
- first-paint clarity proxy

### 7) Self-Critique
- ให้คะแนน plan ใหม่ 1-10
- ระบุจุดอ่อนที่ยังเหลือ
- ระบุ next iteration ที่ควรทำ

## Anti-Drift Rules

- ถ้า fix ไหนทำให้ MIND ดูเหมือน note app หรือ workspace-first system ให้หักคะแนน
- ถ้า fix ไหนเพิ่ม cognitive load ใน 3 วินาทีแรก ให้ถือว่าเป็น regression
- ถ้า fix ไหนช่วย narrative แต่ไม่ช่วย `resume one client task under interruption` ให้บอกว่า out of focus

## Input

### Read
[วาง critique / feedback / current plan ที่ต้องการให้วิเคราะห์]

### Repo Facts
[วาง source-of-truth snippets หรือสรุป facts จาก repo]
```

## Expected Output Shape

ผลลัพธ์ที่ดีควรทำให้ทีมตอบคำถามได้ชัดว่า:

- MIND ชนะที่ pain ไหนจริง
- MIND ยังแพ้ที่ UX/UI จุดไหน
- ถ้าต้องแก้แค่ 3 อย่างใน 48 ชั่วโมง ควรแก้อะไรก่อน
- ถ้าต้องทำ roadmap 3 เดือนเพื่อกด friction ลง ควรเรียงอย่างไร
- metric ใดจะบอกว่า reentry-first thesis เริ่มชนะจริง

ตัวอย่าง headline ของ output ที่ถือว่าใช้ได้:

- `MIND มี strong problem-solution fit ในตลาดแคบ แต่ยังไม่ควร claim product-market fit จนกว่า reentry จะเป็นบ้านหลักและ one-action adoption สูงพอ`
- `จุดอ่อนหลักไม่ใช่ quality ของ concept แต่คือ friction ใน 3 วินาทีแรก`

## Constraints / Anti-Drift Rules

- อย่าใช้ prompt นี้เพื่อปรับ runtime system prompts ของ `/api/ai/*`
- อย่าใช้ prompt นี้เพื่อทำ feature ideation กว้าง ๆ โดยไม่มี pain anchor
- อย่าเทียบกับตลาดแบบ feature-per-feature ล้วน ๆ; ให้เทียบ outcome ของ workflow
- ถ้าจะวิจารณ์ UX/UI ให้ผูกกับ user behavior, interruption cost, และ reentry friction เสมอ
- ถ้า evidence ยังไม่พอ ต้องบอกตรง ๆ ว่าเป็น hypothesis หรือ baseline assumption

