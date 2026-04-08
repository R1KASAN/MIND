# Research & Decisions: MIND Core PRD

**Date**: 2026-04-05

## Decision 1: Client-Side State (MVP)
- **Decision**: Use `idb-keyval` for the 50-user Beta.
- **Rationale**: Next.js App Router API routes can process AI securely on the edge, but keeping all user backlog text locked inside the local device mitigates severe privacy liabilities for the beta. It completely avoids managing a PostgreSQL DB and user authentication overhead.
- **Alternatives**: Supabase / Vercel KV. Rejected due to auth overhead.

## Decision 2: State Machine UI Architecture
- **Decision**: Manage the entire Dump -> Scaffold flow inside a single React Context/State Machine rendered within a single Next.js page component (`page.tsx`).
- **Rationale**: Multi-page navigation (e.g. `router.push('/execute')`) introduces lag and breaks psychological momentum. A single unified state machine ensures sub-15s time-to-start.
- **Alternatives**: Standard React Router paths. Rejected due to perceived load friction.
