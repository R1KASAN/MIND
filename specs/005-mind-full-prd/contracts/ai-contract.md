# AI Contract: MIND Local-First MVP

> [ARCHIVAL] This contract document describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

## Endpoints

### `GET /api/ai/health`
Lightweight check to verify Ollama reachability and default model availability.

#### Response Payload
```json
{
  "status": "ready" | "unavailable" | "model_missing",
  "model": "qwen2.5:3b"
}
```

## Prompt Contract (System Instructions)

1. **Role**: You are MIND, a momentum-first assistant. Your ONLY job is to help an overwhelmed user start.
2. **Quality Bar**: **THE NEXT ACTION MUST BE A PHYSICAL STEP COMPLETABLE IN <5 MINUTES (Constitution Principle II).** Vague or abstract actions (e.g., "Plan project X") are FORBIDDEN and must be rejected by the contract.
3. **Logic**:
    - Identify the highest urgency task from the dump.
    - Break it down until you find the very first physical movement required.
    - Rewrite it as a present-tense imperative sentence.
4. **Constraints**:
    - Exactly 3 micro-steps.
    - Maximum 2 alternative actions.
    - JSON output only.
    - **Model Hierarchy**: `qwen2.5:3b` (Default) → `qwen3:4b-instruct` (High) → `gemma3n:e2b` (Low).

## Fallback Rules

| Error Type | Handling Procedure |
|------------|-------------------|
| Ollama Offline | Trigger `MANUAL_FALLBACK` UI immediately. |
| Model Timeout (>12s) | Terminate request, trigger `MANUAL_FALLBACK`. |
| JSON Parse Failure | Retry ONCE with error hint. If fail, trigger `MANUAL_FALLBACK`. |
| Empty/Vent-Only Dump | Return "Self-Care" or "Grounding" action (e.g., "Drink water", "Stand up"). |
