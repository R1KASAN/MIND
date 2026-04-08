# MIND vNext — Quickstart for Implementers

**Target reader**: Developer implementing `specs/006-mind-vnext-prd/plan.md`
**Product narrative**: "Reply + Resume สำหรับงานลูกค้าที่ค้าง"

---

## Prerequisites

- Node.js 20+, `npm` available
- Ollama installed locally: `ollama serve` running on `localhost:11434`
- At least one supported model pulled: `ollama pull qwen2.5:3b`
- Dev server running: `npm run dev` in `/Users/ark1/Public/MIND`

## Getting Started

```bash
# Verify Ollama is running and model is available
ollama ps                        # see loaded models
ollama list                      # see installed models
curl http://localhost:11434/api/tags  # raw check

# Start dev server (if not already running)
npm run dev
# App opens at http://localhost:3000
```

## Phase 1 — Implement in this order

```
1. src/lib/store/idb.ts          → add ActiveDumpContext, AiFailureReason types
2. src/lib/ai/ollama-runtime.ts  → enrich AiHealthResult shape
3. src/app/api/ai/health/route.ts → no logic change needed, just export
4. src/app/api/ai/route.ts       → remove synthetic success, return structured errors
5. src/components/BrainDump/Fallback.tsx → retry-first layout, show failure reason
6. src/app/page.tsx              → migration shim + failure routing + retry wiring
```

**Smoke test after each file**: load app, disable Ollama, submit a dump, verify honest MANUAL_FALLBACK shown.

## Phase 2 — Implement in this order

```
1. src/lib/ai/schema.ts          → extend Zod schema with optional vNext fields
2. src/lib/ai/prompts.ts         → replace SYSTEM_PROMPT with vNext version
3. src/lib/store/idb.ts          → add Action vNext fields (workflowType, situationSummary, etc.)
4. src/components/ActionScaffold/OneAction.tsx → add supporting outputs below action card
5. src/lib/instrumentation.ts    → add 9 vNext events
6. src/app/page.tsx              → telemetry wiring + vNext Action creation
```

**Smoke test after Phase 2**: paste a real client email → verify workflow_type, summary, reply draft rendered correctly with action card on top.

## Key Rules (must never break)

1. **Never render reply_draft above the action card**
2. **Never call synthesizeLocally() silently on AI failure** — always surface honest failure
3. **Never add a mode selector before the dump input**
4. **Never add situation_summary or reply_draft as a hero/primary element**
5. **Max 1 clarification question per session** — enforced in system prompt
6. **Completion loop must be silent** — SCAFFOLD to DONE to DUMP_ENTRY with no animation

## Architecture Reference

```
User dumps text
  ↓
BrainDump/Input.tsx         → onSubmit → page.tsx: handleDump()
  ↓
POST /api/ai (route.ts)
  ├─ Ollama success → AiSynthesisPayload (with vNext fields)
  │    ↓ page.tsx: createAction() with vNext fields
  │    ↓ session: ONE_ACTION
  │    ↓ OneAction.tsx: action card + [summary] + [reply draft]
  │
  └─ Ollama failure → 503 structured error
       ↓ page.tsx: set activeDumpContext.lastFailureReason
       ↓ session: MANUAL_FALLBACK
       ↓ Fallback.tsx: retry-first panel with honest reason
            ├─ Retry → re-submit activeDumpContext.text → POST /api/ai
            └─ Manual → user types action → ONE_ACTION (no AI label)
```

## Privacy Rules

- Do not add any fetch() call to external URLs in the synthesis or health path
- Do not log dump content to any external service
- Event telemetry (trackEvent) is console-only in dev; no network calls

## Anti-drift Reminder

If you find yourself reaching for any of these, stop and re-read the plan:

| Temptation | What to do instead |
|---|---|
| Adding a "choose workflow" button | Let AI classify from dump — single input |
| Importing a calendar library | None of the phases require dates |
| Creating a "client profile" storage entity | Blocker signals are inference-only, not stored |
| Adding a progress ring or streak counter | Completion is silent — remove and move on |
| Showing local synthesis output as "AI result" | Return structured error and route to MANUAL_FALLBACK |
