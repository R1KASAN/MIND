# Phase 5 Demo Readiness Evidence Note

Updated: 2026-04-12

## Summary

รอบนี้ยืนยันได้ว่า code-level verification ยังเขียว และ browser evidence บางส่วนเริ่มกลับมาเขียวแล้ว หลังแยก local Ollama runtime blocker ออกจาก product regression

สถานะล่าสุด:

- code-level verification: green
- direct local model generate: green เมื่อใช้ pinned Ollama `0.17.0`
- sales inquiry browser smoke: green บน fresh prod server
- reentry mobile smoke: green บน fresh prod server
- single browser task-flow smoke: green บน fresh prod server
- repeat loop / full gate: ยังไม่ green เต็ม เพราะ repeat loop ยัง fail ได้ใน post-rescue scaffold path

ดังนั้นยังไม่ควร claim `npm run gate:phase5` ว่า green ในรอบนี้

## Code-Level Verification

ผ่านแล้ว:

- `npm test` -> `63/63`
- `npm run lint`
- `npm run build`

ความหมาย:

- AI contract parsing ยังผ่าน
- `taskShape` behavior ยังผ่าน
- sales inquiry / demo request guard ยังผ่าน
- scaffold completion / make-smaller logic ยังผ่าน
- rescue retry tests ยังผ่าน
- IndexedDB/session normalization ยังผ่าน
- Next.js production build ผ่าน

## Local LLM Runtime Finding

runtime ที่มีปัญหา:

- Homebrew / app Ollama `0.20.x` และ `HEAD-4589fa2`
- direct generate ของ `qwen2.5:3b` และ `llama3.2:1b` fail ด้วย `llama runner process has terminated`
- server log ชี้ไปที่ Metal backend บน Apple M5:
  - `failed to initialize Metal backend`
  - `static_assert failed ... Input types must match cooperative tensor types`

workaround ที่ใช้พิสูจน์ต่อได้:

- ดาวน์โหลด Ollama `0.17.0` ไปที่ `/tmp/mind-ollama-0.17`
- runtime baseline สำหรับ demo ตอนนี้คือ `Ollama 0.17.0 @ 11434`
- รัน temp server จาก:

```bash
/tmp/mind-ollama-0.17/Ollama.app/Contents/Resources/ollama serve
```

direct generate ผ่าน:

```bash
curl -sS http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:3b","prompt":"ตอบคำว่า ok เท่านั้น","stream":false,"options":{"num_predict":8,"num_gpu":0}}'
```

ผลที่ได้:

- model ตอบ `ok`
- MIND `/api/ai/health` กลับมา `status = ready`
- `npm run runtime:ollama:check` ใช้เป็น preflight ได้

## Browser Evidence

### `npm run smoke:sales-inquiry`

ผลล่าสุด:

- passed
- screenshot: `/tmp/mind-sales-inquiry-verify.png`

สัญญาณที่ผ่าน:

- หน้า UI ไปถึง `ONE_ACTION`
- hero title มี demo context: `สรุปข้อมูลจากลูกค้าและเตรียมตอบนัด demo`
- reply panel แสดงสำหรับ demo/pilot request
- ไม่มี raw JSON / malformed structured summary หลุดขึ้น UI
- ไม่ถอยกลับเป็น generic project resume title

หมายเหตุ:

- เพิ่ม `MIND_SALES_INQUIRY_AI_TIMEOUT_MS` default `180000` เพื่อรองรับ local model ที่ cold/slow
- เพิ่ม deterministic contract normalization สำหรับ demo-request title ที่ generic เกินไป เพื่อไม่ต้องวน repair ช้าโดยไม่จำเป็น
- default base URL ของ standalone smoke ใช้ `127.0.0.1` แทน `localhost` เพื่อลด noise จาก dev/HMR path

### `npm run smoke:task-flow:browser`

ผลล่าสุด:

- passed
- screenshot: `/tmp/mind-browser-smoke-task-flow.png`

สัญญาณที่ผ่าน:

- reachedAction = true
- reachedScaffold = true
- reachedRescue = true
- reachedReentry = true
- reachedCompletionReset = true
- scaffoldStatus = 200
- scaffoldRetryStatus = 200

caveat ที่ยังอยู่:

- rescue ยังได้ `503`
- rescue pass type เป็น `timeout`
- failure detail ตัวอย่าง: `AI request timed out after 14000ms`

ตีความ:

- task-flow integration ยังไปถึงปลายทางได้บน fresh prod server
- smoke summary มี timing / console artifact เพิ่มขึ้น ทำให้แยก path fail ได้ง่ายกว่าเดิม
- rescue ยังเป็น caveat-managed subsystem ตาม RH-06 เดิม

### `npm run smoke:task-flow:repeat`

ผลล่าสุด:

- ยังไม่ถือว่า green
- รอบล่าสุด fail ที่ stage `post_rescue_scaffold`
- artifact ถูกเก็บต่อรอบใน output dir เช่น `/tmp/mind-smoke-task-flow-repeat-1775931671280`

สัญญาณที่พบ:

- รอบล่าสุด action / scaffold แรกยังผ่าน
- rescue กลับมาเป็น `503 / timeout`
- หลัง rescue fail บางรอบยังไม่กลับสู่ post-rescue scaffold state ภายใน budget ที่ smoke คาดไว้
- repeat runner เก็บ `screenshot`, `failureScreenshot`, `serverLog`, `consoleErrors`, และ timing summary ต่อรอบแล้ว
- repeat runner ใช้ port แยกต่อรอบและมี child timeout cleanup แล้ว เพื่อลด false hang

ตีความ:

- ยังไม่ใช่ evidence ว่า product flow หลักพัง
- เป็น mix ของ rescue caveat, runtime slowness, และ browser/state verification ที่ยังต้อง harden ต่อ
- ยังไม่ผ่านเกณฑ์ `5/5` สำหรับ controlled-demo gate รอบนี้

### `npm run smoke:reentry-mobile`

ผลล่าสุด:

- passed บน fresh prod server

สิ่งที่แก้ใน smoke harness:

- mobile seed ไม่รอ `document.body.innerText` ก่อนเขียน IndexedDB แล้ว
- seed สร้าง IndexedDB object store `keyval` เองถ้ายังไม่มี เพื่อให้ self-contained ขึ้น
- standalone `smoke:reentry-mobile` จะบูต fresh production server เองถ้าไม่ได้ส่ง `MIND_BASE_URL`

ตีความ:

- ปัญหา blank page/HMR เดิมเป็น dev-server artifact ไม่ใช่ตัวชี้ว่า reentry path พังบน prod
- รอบนี้มี evidence ว่า reentry-mobile ใช้งานได้บน fresh production server

## Code / Harness Changes From This Pass

- `scripts/browser-verify-sales-inquiry.ts`
  - เพิ่ม configurable AI wait timeout
  - default เป็น `180000ms`
- `src/lib/ai/operation-contract.ts`
  - demo-request taskShape guard ดูจาก `workContext` และ `missingInputs`
  - title ที่ generic เกินไปใน demo-request จะถูก normalize เป็น task-shaped fallback copy
- `src/lib/ai/operation-contract.test.ts`
  - อัปเดต test ให้ยืนยัน deterministic rewrite แทนการพึ่ง repair
- `scripts/browser-smoke-reentry-mobile.ts`
  - ทำ seed ให้ self-contained ขึ้นเมื่อ IndexedDB store ยังไม่ถูกสร้าง
- `scripts/run-smoke-reentry-mobile.ts`
  - wrapper สำหรับ standalone reentry mobile บน fresh production server
- `scripts/run-smoke-sales-inquiry.ts`
  - wrapper สำหรับ standalone sales inquiry บน fresh production server
- `scripts/check-local-ollama-runtime.ts`
  - runtime preflight สำหรับ Ollama demo baseline
- `scripts/browser-smoke-task-flow.ts`
  - เปลี่ยน scaffold smoke ให้ยึด visible plan/UI state เป็น source of truth มากขึ้น
  - เก็บ console/page errors และ timing summary เพิ่ม
- `scripts/run-smoke-task-flow-repeat.ts`
  - เก็บ screenshot และ server log ต่อรอบเพื่อไล่ flaky run ง่ายขึ้น
- `scripts/run-phase-5-gate.ts`
  - รัน browser smoke บน fresh production server แยกต่อ step เพื่อลด state leak

## Interpretation

นี่ไม่ใช่ evidence ว่า MIND product flow ถอย regression

สิ่งที่ยืนยันได้:

- code path หลักยังเขียว
- sales inquiry / demo request context อ่านตรงขึ้นและ UI proof ผ่านแล้ว
- single browser task-flow ยังไปถึง action, scaffold, rescue, reentry, completion reset ได้

สิ่งที่ยังต้อง hold:

- full `gate:phase5` ยังไม่ผ่านครบ
- repeat loop ยังไม่ `5/5`
- rescue ยังเป็น timeout-heavy caveat

สถานะล่าสุดจึงเป็น:

- controlled-demo candidate: improving, but not fully re-certified in this pass
- release/gate decision: hold until repeat + mobile + full gate pass

## Next Required Step

เริ่มรอบถัดไปจาก fresh runtime:

1. ปิด dev server เก่าและ Ollama server เก่าทั้งหมด
2. รัน Ollama temp `0.17.0` หรือ runtime ที่ direct generate ผ่าน
3. รัน `npm run runtime:ollama:check`
4. รัน production server ใหม่จาก build ล่าสุด
4. rerun ตามลำดับ:

```bash
npm run smoke:sales-inquiry
npm run smoke:task-flow:browser
npm run smoke:reentry-mobile
npm run smoke:task-flow:repeat
npm run gate:phase5
```

## Stop-Ship Decision

ใช้คำตัดสินรอบนี้:

- `hold release and fix verification/runtime stability`

ไม่ใช่:

- `ship for controlled demo`
- `product regression confirmed`
