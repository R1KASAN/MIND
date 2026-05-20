# MIND Dev Workflow

Use this note for local development recovery and command hygiene.

## Canonical Puter-First Run

1. Start Ollama on the CPU-safe local host.
2. Run `npm run dev` for the app.
3. `npm run dev` starts the demo rail with `MIND_AI_BACKEND=external_safe`, so Puter is tried first and Local Gemma is kept ready as the safety fallback.
4. Use `npm run dev:local-ai` when you intentionally want to bypass Puter, or `npm run dev:raw` for the non-canonical escape hatch.

## Dev Server Recovery (Turbopack / RSC / SWC)

When long-running AI requests or timeouts cause memory pressure and dev server restarts, you may see errors like:

- `Could not find the module ".../src/app/page.tsx#default" in the React Client Manifest`
- `Failed to load external module @swc/helpers-.../_/_interop_require_default`

Use this short dev-only recovery path before treating the issue as an app bug:

1. Stop the dev server:

   ```sh
   pkill -f "next dev" || true
   ```

2. Clear the Turbopack / RSC manifest cache:

   ```sh
   rm -rf .next
   ```

3. Ensure the project root has a single lockfile:
   - Keep `/Users/ark1/Public/MIND/package-lock.json`.
   - Move or rename `/Users/ark1/package-lock.json` if it is not an actual Next.js project root.

4. Reinstall dependencies if SWC helpers are missing:

   ```sh
   npm install
   # optional, only if needed:
   # npm install @swc/helpers --save-dev
   ```

5. Restart dev with the canonical command:

   ```sh
   npm run dev
   ```

If manifest / SWC errors still reproduce after this reset, treat it as a separate Next.js/Turbopack issue and consider a minimal reproduction or pinning Next.js to the last known-good version outside this sprint.

## Bounded AI Timeouts And Manual Fallback

The demo rail is Puter-first:

1. Puter must return contract-valid JSON for the happy path.
2. Puter failures such as bad JSON, timeout, auth, or network errors fall back to Local Gemma.
3. Local Gemma timeout or repeated AI failure returns deterministic/manual 200 JSON for the Room demo path instead of surfacing a 5xx.

Current demo budgets are intentionally bounded in `npm run dev`:

- Puter: `MIND_PUTER_TIMEOUT_MS=15000`, `MIND_PUTER_MODEL=gpt-5.4-nano`, `MIND_PUTER_INTAKE_MAX_TOKENS=1200`, `MIND_PUTER_ACTION_MAX_TOKENS=1000`, `MIND_PUTER_TEMPERATURE=0`, `MIND_PUTER_REASONING_EFFORT=minimal`, `MIND_PUTER_TEXT_VERBOSITY=low`
- Local Gemma primary/action: `AI_TIMEOUT_QWEN_MS=25000`, `AI_TIMEOUT_ACTION_QWEN_MS=25000`
- Local fallback/repair: `AI_TIMEOUT_FALLBACK_MS=12000`, `AI_TIMEOUT_ACTION_FALLBACK_MS=12000`, `AI_REPAIR_TIMEOUT_QWEN_MS=12000`
- Overall operation budget: `AI_OVERALL_TIMEOUT_MS=45000`

Fallback logging should show the chain at `console.warn` level: Puter -> Local Gemma -> manual, with operation, selected model, failure reason, `elapsed_ms`, and `timeout_ms`. Puter success logging should include `elapsed_ms` and contract-valid parse status so timeout tuning can be based on measured latency. Public client responses stay within the existing JSON contracts.

## Puter Intake / Action JSON Contract Notes

For the Room demo rail, Puter intake and action use compact Puter-only prompts. Local Gemma keeps the richer prompts.

Puter intake prompt template:

```text
คุณคือ intake copilot ของ MIND
OUTPUT ONLY JSON.
ห้าม Markdown, ห้าม code fence, ห้ามคำอธิบาย, ห้ามข้อความก่อนหรือหลัง JSON object.

งาน:
- classify room เป็น client_response หรือ client_resume
- สรุป roomDigest และ taskFrame จากบริบทจริง
- คืน blockers, taskShape, candidateActions 1-3 รายการ
- ถ้าบริบทเป็นแรงเสียดทานส่วนตัว เช่น เหนื่อย หิว หมดแรง ให้รักษาความจริงนั้นไว้ ห้ามแต่งเป็นงานลูกค้าเอง

คืน JSON shape นี้เท่านั้น:
{
  "workflowType": "client_response",
  "roomDigest": "ลูกค้าถามเรื่อง timeline และ scope ของ proposal ต้องตอบกลับอย่างระวัง",
  "taskFrame": {"objective": "เตรียมคำตอบลูกค้าเรื่อง timeline และ scope", "stage": "มีบริบทพอเลือกก้าวแรก", "stakeholders": ["ลูกค้า"]},
  "blockers": [],
  "requiresClarification": false,
  "clarificationQuestion": null,
  "taskShape": {"deliverableType": "reply", "immediateNeed": "send_reply_now", "behaviorIntent": "client_delivery", "missingInputs": [], "workContext": "ต้องตอบลูกค้าโดยไม่รับ commitment เกิน scope", "confidence": 0.82},
  "candidateActions": [{"title": "ร่างคำตอบลูกค้าเรื่อง timeline แบบยังไม่ commit เกิน scope", "rationale": "ตอบได้เร็วและลดความเสี่ยงจากข้อมูลที่ยังไม่ชัด", "kind": "reply_first"}],
  "meta": {"model": "puter", "usedRoomFiles": [], "repairUsed": false}
}
```

Puter action prompt template:

```text
คุณคือ action copilot ของ MIND
OUTPUT ONLY JSON.
ห้าม Markdown, ห้าม code fence, ห้ามคำอธิบาย, ห้ามข้อความก่อนหรือหลัง JSON object.

งาน:
- เลือก one next action ที่ทำได้จริงใน 15-30 นาที
- ใช้ taskShape, room digest, preferredCandidate, constraints, evidence summary เท่านั้น
- ห้าม productivity generic และห้ามแต่งบริบทที่ source ไม่บอก
- ถ้าไม่ใช่ send_reply_now ให้ replyDraft เป็น null

คืน JSON shape นี้เท่านั้น:
{
  "chosenAction": {"title": "ร่างคำตอบลูกค้าเรื่อง timeline แบบยังไม่ commit เกิน scope", "rationale": "เป็นก้าวที่ตอบลูกค้าได้ทันทีและยังกันความเสี่ยงจาก scope ที่ไม่ชัด", "successSignal": "มีข้อความตอบกลับสั้นที่ส่งหรือปรับต่อได้"},
  "alternatives": [{"title": "แยกคำถามที่ต้องยืนยันก่อนตอบ timeline", "rationale": "ลดความเสี่ยงถ้ายังไม่มีข้อมูลพอ"}],
  "whyThisNow": "ตอนนี้ลูกค้ารอคำตอบและมีบริบทพอร่างข้อความที่ไม่หลุด scope",
  "replyDraft": "ขอบคุณครับ ขอเช็ก scope ที่ยังไม่ชัดอีกจุดก่อนยืนยัน timeline แล้วจะส่งกรอบ pilot ที่ปลอดภัยให้ต่อครับ",
  "situationSummary": "ลูกค้าถามเรื่อง timeline และ scope จึงควรตอบแบบคุม commitment ก่อน",
  "meta": {"model": "puter", "usedRoomFiles": [], "repairUsed": false}
}
```

Observed on 2026-05-20 with `MIND_PUTER_DEBUG_RAW=1` and the Acme tired/client proposal Room demo:

- `gpt-5-nano` returned empty content with `finish_reason: "length"` at low token budgets; it needed larger budgets and was slower.
- `gpt-5.4-nano` returned contract-valid JSON for 3 consecutive intake -> action runs with no fallback.
- Intake latency: about 6.5s, 8.0s, 8.0s. Action latency: about 4.4s, 4.6s, 4.4s.
- Some intake responses included extra whitespace/prose/fence-like wrapping or non-contract candidate `kind` labels; the Puter-only pre-parser extracts the first JSON object and normalizes candidate `kind` into `reply_first`, `resume_first`, or `dependency_first` before the existing parser.

## What This Is For

- Use this step when Next.js reports SWC helper module not found, Turbopack helper errors, or similar local build-state corruption.
- Do not treat this reset path as part of the AI timeout root-cause investigation.
- For AI timeout work, keep the focus on prompt shape, model settings, and route timeout policy.
