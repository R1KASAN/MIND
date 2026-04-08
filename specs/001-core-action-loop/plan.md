# Implementation Plan: Core Action Loop

**Branch**: `001-core-action-loop` | **Date**: 2026-04-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-core-action-loop/spec.md`

## Summary

Build the foundational mobile-first interface allowing a user to "brain dump", have AI synthesize a single next action, and enter a distraction-free start mode. Includes recovery logic for interrupted sessions.

## Technical Context

**Language/Version**: TypeScript / Node 20+  
**Primary Dependencies**: Next.js (App Router), Vanilla CSS, OpenAI API/SDK (or similar)  
**Storage**: IndexedDB (Client-side MVP via `idb-keyval`)  
**Testing**: Jest + React Testing Library  
**Target Platform**: Mobile-first Web App  
**Project Type**: Web Application  
**Performance Goals**: < 10s from dump to action, < 1s initial load  
**Constraints**: Keep UI highly minimal, no complex task abstractions  
**Scale/Scope**: Day 1 MVP validating the core loop  

## Constitution Check

*GATE: Passed. Follows One Next Action, Momentum First, Resilient Recovery, and Invisible AI Overhead principles.*

## Project Structure

### Documentation

```text
specs/001-core-action-loop/
├── plan.md              
├── research.md          
├── data-model.md        
└── quickstart.md        
```

### Source Code

```text
src/
├── app/
│   ├── api/ai/route.ts
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── BrainDumpInput.tsx
│   ├── ActionPreview.tsx
│   ├── FocusMode.tsx
│   ├── BounceBackPrompt.tsx
│   └── RescuePrompt.tsx
├── lib/
│   ├── ai.ts
│   └── store.ts (localStorage / IndexedDB)
└── types/
    └── models.ts
```

**Structure Decision**: Next.js App Router for single repository handling both UI and secure AI routing.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
