# Data Model: MIND Full PRD

**Branch**: `005-mind-full-prd` | **Date**: 2026-04-05  
**Storage**: `idb-keyval` (IndexedDB, browser-local, no server)

---

## Keys in IndexedDB

| Key | Type | Purpose |
|-----|------|---------|
| `mind_session` | `AppSession` | Single active session record |
| `mind_actions` | `Action[]` | All actions: pending, completed, archived, pinned |

---

## Entity: `AppSession`

Represents the live user session state machine node.

```typescript
interface AppSession {
  lastActive: number;               // Unix ms — used for bounce-back detection (>24h)
  status: SessionStatus;            // Current state machine node
  notThisCount: number;             // How many times user has rejected primary action
  currentActionId: string | null;   // ID of the action currently on-screen
  activeDumpContext?: string;        // Raw dump text — used for manual fallback/session restore
  lastMorningShown?: string;        // ISO date 'YYYY-MM-DD' — prevents repeated morning ritual
}
```

**State Transitions** (`SessionStatus`):

```
MORNING_RITUAL ──────────────────────────┐
      │ (skip or confirm dump)            │
      ▼                                   │
DUMP_ENTRY ──────────────────────────────┤
      │ (submit dump)                     │
      ▼                                   │
SYNTHESIZING                             │
      │ (AI returns)                      │
      ├─ requires_clarification → CLARIFICATION → SYNTHESIZING (with appended clarification)
      ├─ valid response         → ONE_ACTION
      └─ failure               → MANUAL_FALLBACK
                                           │
ONE_ACTION                                 │
      │ (accept)   → SCAFFOLD             │
      │ (reject x2)→ DECISION_BOARD       │
      │ (reject all)→ DUMP_ENTRY          │
                                           │
DECISION_BOARD → SCAFFOLD ───────────────┤
                                           │
SCAFFOLD                                   │
      │ (done)     → DUMP_ENTRY ──────────┘
      │ (stuck)    → RESCUE
      │ (smaller)  → SCAFFOLD (mutated micro-steps)
                                           
RESCUE
      │ (walk away)→ DUMP_ENTRY
      │ (smaller)  → SCAFFOLD

MANUAL_FALLBACK
      │ (manual entry) → SCAFFOLD

BOUNCE_BACK
      │ (fresh start)  → DUMP_ENTRY
      │ (resume)       → ONE_ACTION (loads previous currentActionId)

── OVERLAY (does not change SessionStatus) ──
OVERVIEW OVERLAY  — triggered from header, dismissed back to current state
ARCHIVE OVERLAY   — triggered from header, dismissed back to current state
```

---

## Entity: `Action`

Represents one discrete action object (current, past, archived, pinned).

```typescript
type ActionState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

interface Action {
  id: string;                // Timestamp string, e.g. "1743901200000"
  createdAt: number;         // Unix ms — used for weekly sweep boundary detection
  title: string;             // AI-compressed imperative sentence (present tense, specific)
  rationale: string;         // 1-sentence explanation of why this was chosen
  microSteps: string[];      // Exactly 3 items; physical, <5 min each
  isPinned: boolean;         // Survives weekly reset if true; max 3 pinned at any time
  state: ActionState;        // Lifecycle state
}
```

**Lifecycle Rules**:
- Created as `PENDING` when synthesis completes or manual fallback accepted.
- Transitions to `COMPLETED` when user taps Done in Scaffold.
- Transitions to `ARCHIVED` on weekly sweep if not pinned.
- Pinned items survive weekly sweep but are still capped at 3 total.
- If pinned count would exceed 3 during sweep, oldest pinned items are archived instead.

---

## Entity: `AiSynthesisResponse` (API contract, not stored)

Returned from `/api/ai`. Not persisted. Used to hydrate the `Action` entity.

```typescript
interface AiSynthesisResponse {
  requires_clarification: boolean;
  clarification_nudge?: string;          // 1-tap binary question if ambiguous
  recommended_action: {
    title: string;                        // Compressed imperative sentence
    rationale: string;                    // Why this was chosen
    micro_steps: string[];                // Exactly 3 items
  };
  alternative_actions: Array<{            // 0–2 hidden alternatives
    title: string;
    rationale: string;
  }>;
}
```

**Constraints**:
- `micro_steps` MUST have exactly 3 items (validated by Zod).
- `alternative_actions` max 2 items (validated by Zod).
- Archive data is NEVER included in request payload to AI.
- Only `dump` text (plain string) is sent in the POST body to `/api/ai`.
- `max_tokens: 300`, `temperature: 0.1` — enforced server-side.

---

## Weekly Reset Logic

Run on every app load via `processWeeklySweep()`:

1. Load all `Action[]` from IDB.
2. Calculate start of the current week (Monday midnight, local time).
3. For each `Action` where `createdAt` is before current week start:
   - If `isPinned === true` AND pinned count < 3 → keep as-is.
   - Otherwise → set `state = 'ARCHIVED'`, `isPinned = false`.
4. Write updated `Action[]` back to IDB if any changes occurred.
5. Emit `weekly_reset_applied` event if modified.

**Anti-Anxiety Communication**:
- The app must surface a brief message the first time a reset fires: "Your older items are safely searchable in the archive."
- This is a one-time notification stored in `AppSession` (add `hasSeenResetNotice: boolean`).

---

## Export Schema (Trust Triad)

Full JSON export triggered from Trust/Settings overlay:

```typescript
interface MindExport {
  exportedAt: string;      // ISO timestamp
  session: AppSession;
  actions: Action[];
}
```

Downloaded as `mind-export-YYYY-MM-DD.json`. No server call required.

---

## Delete All Local Data (Trust Triad)

Clears both IDB keys (`mind_session`, `mind_actions`) and resets session to default. Requires a confirmation step (a single "Are you sure?" tap, not a modal form).
