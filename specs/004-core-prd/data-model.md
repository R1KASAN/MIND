# Data Model: MIND Core PRD

> [ARCHIVAL] This data model describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

## Core Entities

### AppSession (IndexedDB)
```typescript
interface AppSession {
  lastActive: number; // UNIX timestamp
  status: 'DUMP_ENTRY' | 'SYNTHESIZING' | 'ONE_ACTION' | 'DECISION_BOARD' | 'SCAFFOLD';
  notThisCount: number; // Resets when a new dump is processed
  currentActionId: string | null;
}
```

### Action (IndexedDB)
```typescript
interface Action {
  id: string;
  createdAt: number;
  title: string;
  rationale: string;
  microSteps: string[];
  isPinned: boolean;
  state: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
}
```

### Memory Store Rules
1. Weekly Reset runs on the first app execution where `Date.now()` is in a new calendar week.
2. `CurrentWeekQueue`: all Actions where `state` == `PENDING` or `IN_PROGRESS`.
3. During Weekly Reset: Fetch `CurrentWeekQueue`. Sort. Keep up to 3 `isPinned == true`. Mark the rest as `state = 'ARCHIVED'`.

### AI Schema Validation & Open-Weight Fallbacks
Since the MVP relies heavily on open-weight Llama 3.x / DeepSeek models via `/api/ai`, JSON parsing is prone to minor structural deviations or trailing markdown blocks.
1. **Validation Engine:** All LLM output must be parsed via Zod to enforce the `ai-synthesis.json` schema.
2. **Safe Fallback:** If the model hallucinates keys or fails JSON structural integrity:
   - Provide a safe string fallback error prompt asking the LLM to rewrite.
   - If fail loops exceed 1 retry, generate a hardcoded fallback action ("Sort your dump manually - AI context failed").
