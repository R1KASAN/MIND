# AI Service Contract

> [ARCHIVAL] This contract document describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

This contract defines the structured communication between the MIND application frontend and the selected AI backend.

## 1. Request (Frontend -> Backend/AI)

```json
{
  "user_dump": "string",  
  "context": "string (optional)", 
  "action_type": "string ('PRIORITIZE' | 'SIMPLIFY' | 'RESCUE')"
}
```

## 2. Response (Backend/AI -> Frontend)

```json
{
  "next_action": "string",
  "confidence": "number (0-1)",
  "recovery_message": "string (optional, used during rescue/bounce-back)"
}
```

## Protocol
- **Format**: application/json
- **Handling**: Frontend must gracefully handle malformed JSON responses by triggering a retry or defaulting to an error state.
- **Latency**: Backend should aim to resolve this structured output within 3 seconds.
