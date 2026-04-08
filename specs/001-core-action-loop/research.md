# Phase 0: Research & Architecture Decisions

## Stack Selection
- **Decision:** Next.js (App Router), TypeScript, Vanilla CSS.
- **Rationale:** Next.js provides simple API routes to securely handle AI requests while serving a fast frontend. Vanilla CSS complies with the strict design guidelines against default Tailwind designs. By using the App router, we can leverage Server Actions or simple API routes to protect our AI API keys without setting up a separate backend server.
- **Alternatives:** Vite + React (requires a separate backend for secure AI calls, adding complexity). 

## State Management & Storage
- **Decision:** `typeof window !== 'undefined' ? localStorage` wrapper or lightweight IndexedDB (idb-keyval) + React Context for the MVP.
- **Rationale:** To support "Fast start", no login or onboarding is required. The data model uses local storage to seamlessly maintain session states, brain dumps, and recovery states across reloads without spinning up a heavy database.
- **Alternatives:** PostgreSQL / Supabase, which are overengineered for day-1 validation and would introduce authentication friction and cognitive load.

## AI Interaction Flow
- **Decision:** Standard Server Action wrapping OpenAI/Gemini structured outputs (JSON).
- **Rationale:** To extract the "Next Action" reliably, we prompt the LLM to return a strict schema (e.g., `{ next_action: "Read PRD paragraph 1" }`). This ensures the UI can depend on a deterministic single string output rather than parsing markdown.
- **Alternatives:** Streaming response blocks. Considered but rejected because we do not want partial rendering of multiple tasks. We want a decisive, single, finished string.

## UI/UX Flow & Routing
- **Decision:** A Single-Page-like experience governed by a state machine or React Context, rather than hard URL routes for each tiny mode (dump -> action -> focus).
- **Rationale:** The transition from "Dump" to "Start Now" to "Focus Mode" should feel instantaneous and fluid, without full page unmounts if possible, maintaining the user momentum.
