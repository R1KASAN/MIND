# Implementation Plan: 004-core-prd

**Branch**: `004-core-prd` | **Date**: 2026-04-05 | **Spec**: /specs/004-core-prd/spec.md
**Input**: Feature specification from `/specs/004-core-prd/spec.md`

## Summary

Build MIND: a mobile-first, strict Start-and-Recovery engine utilizing an explicit Dump -> 1 Next Action -> Start Scaffold pipeline. Relies heavily on text-driven LLM synthesis with a strict week-horizon memory strategy, optimized for rapid momentum entry over data completeness.

## Technical Context

**Language/Version**: TypeScript / Node 20+
**Primary Dependencies**: Next.js 14+ (App Router), React, Vanilla CSS (no Tailwind), simple IndexedDB (`idb-keyval`) for MVP persistence, OpenAI-compatible API route (`/api/ai`) targeting local Ollama or remote open-weight models (DeepSeek/Llama).
**Storage**: Client-side `idb-keyval` for the 50-user Beta.
**Testing**: Jest for logic testing, Playwright for end-to-end (flow testing).
**Target Platform**: Mobile-first Web App.
**Project Type**: Next.js Serverless web application.
**Performance Goals**: < 15s cold-start to action acceptance. < 5s AI synthesis.
**Constraints**: No server-side relational database complexity for the initial 50-user beta to control infrastructure. Hard constraint on LLM execution tokens.
**Scale/Scope**: 50 Users (Closed Beta). Single cohesive state-machine UI. 

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
- **One Next Action**: Passed. Forced reduction mechanism explicitly architected.
- **Momentum First**: Passed. Dump-first UI guarantees low friction entry.
- **Resilient Recovery**: Passed. Bounce-back handles expired sessions gracefully without overdue alerts.
- **Invisible AI Overhead**: Passed. AI restricts itself to routing; no chat interfaces.
- **Mobile-First Simplicity**: Passed. Target platform is Web but UI must scale down to single column mobile seamlessly.
- **Ruthless Scope Discipline**: Passed. No calendar integration; no pomodoro trackers in MVP.

## Project Structure

### Documentation (this feature)

```text
specs/004-core-prd/
├── plan.md              
├── research.md          
├── data-model.md        
├── quickstart.md        
├── contracts/ai-synthesis.json
└── tasks.md             
```

### Source Code (repository root)

```text
src/
├── app/                  # Next.js App Router (UI mapping constraints)
│   ├── layout.tsx
│   ├── page.tsx          # State Machine Container
│   ├── api/
│   │   └── ai/           # Edge route for LLM synthesis
│   └── globals.css       # Design System tokens (Vanilla CSS)
├── components/           # UI
│   ├── BrainDump/        # Text entry interface
│   ├── ActionScaffold/   # Mini decision board & Start Scaffold
│   └── Recovery/         # Bounce-back / Rescue UI 
├── lib/
│   ├── ai/               # Processing & Prompts
│   ├── store/            # Client-side state & idb wrappers
│   └── constants.ts      
└── tests/
    └── e2e/              # Playwright flows
```

**Structure Decision**: Next.js App Router architecture mapping a global UI state-machine to prevent multi-page routing friction during critical workflow sequences.

## 1. Frontend Flow & Screen Structure

- **State 0: Bounce-back Intercept (Conditional):** If `SessionState.lastActive` > 24h, intercept with Bounce-back prompt.
- **State 1: Dump-First Entry:** Minimal `textarea` focusing on text/dictation input. No task lists. Search bar hidden or de-emphasized.
- **State 2: Synthesis Loading:** Skeleton state while AI processes the dump.
- **State 3: One-Action Presentation:** Large typography showing exactly 1 action. Includes "Start", "Make it smaller", and "Not this" buttons.
- **State 4: Mini Decision Board (Conditional):** Unlocked if "Not this" clicked 3 times. Shows max 3 options.
- **State 5: Start Scaffold:** Action is locked in. Displays micro-steps (returned by AI). Exposes "I'm stuck" (Rescue trigger).
- **State 6: Archive Search:** Dedicated search overlay accessing previous weekly data. No list view. Data is only yielded based on query.

## 2. AI / Routing Flow

- **Input:** Raw user text.
- **System Prompt:** Instructs model to filter emotional noise, extract functional tasks, rank by inferred urgency (using strict semantic cues), and return a JSON structure containing: `recommended_action`, `micro_steps`, and potentially `alternative_actions` if conflict is detected. It is heavily optimized for zero-shot reasoning on mid-size open-weight models (8B-13B) limiting prompt output lengths.
- **Ambiguity Nudge:** If AI confidence in urgency is low, it returns `requires_clarification: true` with a 1-tap string.
- **Override Trigger:** Frontend tracks `not_this_count`. If `not_this_count >= 3`, UI fetches `alternative_actions` from the original AI generation.

## 3. Data Model

- **SessionState:** Tracks current stage (Dump, Scaffold, Expired), last active timestamp, and `not_this_count`.
- **Action:** Object containing `title`, `rationale`, `micro_steps[]`, `status`.
- **Memory Store (Weekly):** Separated into `CurrentWeekQueue` and `Archive`. At week boundary (e.g. Sunday 12:00AM), all incomplete `CurrentWeekQueue` items except `is_pinned: true` (Max 3) are flushed to `Archive`.

## 4. Minimal Trust Surfaces

- **Why-This-Now:** AI includes a 1-sentence "rationale" on why this task was chosen over others based on the dump.
- **Veto ("Make it Smaller" / "Not This"):** Proves to the user they retain control.
- **Safe Handling:** Prompt enforces validation of emotional dumps.

## 5. MVP Boundary vs Later Phases

**MVP Boundary:** Single-client IndexedDB. Client executes AI calls strictly via the `/api/ai` Edge route. This route abstracts the backend, designed to speak natively to local nodes (Ollama at localhost:11434) or cheap remote OpenAI-compatible endpoints (e.g., DeepSeek on Together/SiliconFlow) without any frontend/state machine changes. No user-accounts necessary for beta test. Capped at 50-100 closed-beta device distributions relying on environment variable restrictions. No timer/stats.

**Later Phases:** Cloud syncing, multi-device accounts.

## 6. Test Strategy

- **Fragility 1: AI JSON formatting:** Integration tests against realistic noisy prompts verifying JSON integrity.
- **Fragility 2: State Transitions:** Playwright tests simulating the full loop (Dump -> Reject 3x -> Board -> Start -> Rescue) without refreshing.
- **Fragility 3: Weekly Reset:** Unit tests spoofing the system clock to verify exact boundaries of the Archive sweep and the preservation of exactly 3 pinned items.

## 7. Technical Risks & Constraints (50-user Beta)

- **Risk:** High LLM Token utilization per dump, especially if summarizing previous week context.
- **Constraint/Mitigation:** Force heavy LLM processing context strictly to the *current dump*. Rely on the user to re-contextualize urgency rather than feeding the entire `Archive` into the context window. Use local-first / Ollama hosted open-weight models to keep token cost at absolute zero where available. If using an external remote endpoint for the beta, apply hard per-session execution and output token caps in `/api/ai`.
- **Risk:** Client-side local storage (`idb-keyval`) wiping out user data between updates or browser clears.
- **Constraint/Mitigation:** Acceptable for a closed beta tracking behavioral outcomes. A clear warning must be given to beta users.
