# MIND Prototype RC Summary

**Date:** 2026-05-17
**Status:** Prototype Release Candidate Ready

## Core Pain Solved
**Client Chaos Reentry:** Knowledge workers struggle to resume complex, messy, multi-file client work after stepping away. The MIND prototype provides a resilient "Room" container that maintains operational context, prevents cognitive reset, and does not break when encountering messy or unscannable files.

## Implemented Work Cycle
1. **Create Room** — Secure isolated workspace for a specific client/project context
2. **Add Context** — Ingest manual text and/or files (txt, md, PDF, images)
3. **Context Health** — Real-time assessment of usable context (`ready` / `partial` / `blocked`)
4. **Reentry Brief / Working Snapshot** — Auto-generated operational memory of the current state
5. **Next Move** — System-proposed next action to maintain momentum
6. **Save Point** — Checkpoint capturing used sources, failed files, and latest summary
7. **Continue Later** — Resume work directly from the save point with evidence transparency

## Demo Path
**Scenario:** Resuming work with mixed-quality context
- User attaches a failed/unreadable scanned PDF and a ready `notes.txt`.
- Context Health shows `partial` — the system proceeds gracefully with `notes.txt`.
- An evidence chip indicates `notes.txt` was `ใช้เป็นบริบทแล้ว` (used as context).
- The user hits Save Point.
- The user reopens the Room. The Reentry Brief restores the `summary` and `topActions` seamlessly without losing progress.

## Validation Status
- ✅ `typecheck:app` — Clean
- ✅ `smoke:fallback-matrix` — 7/7 Pass
- ✅ `smoke:demo-browser` — Pass
- ✅ huashu POC audited — (`markitdown` extraction deferred)
- ✅ Synthetic Persona POC — Core reentry flow passed (See [Synthetic Persona POC](synthetic-persona-poc.md))
- ⚠️ **High Risk:** Processing latency (~45s) is the main UX friction point for impatient users.
- ⚠️ `smoke:fallback-e2e` port contention — Known tooling gap (EADDRINUSE 3205), not a product blocker

## Known Limitations & Deferred Polish
- No standalone Dashboard page
- No dedicated, labeled "Working Snapshot" panel (currently integrated into Reentry Brief)
- No dedicated, labeled "Next Move" panel (currently integrated into Reentry Brief / ONE_ACTION)
- OCR Accuracy improvements (Phase 4) explicitly deferred

## Latest Updates
RC Scaffold + Rescue UX patch = **worked for RC/demo** ✅
* 5/5 paths successfully passed on 2026-05-18.
* **Navigation Defect Solved:** Fixed the Rescue → Input bounce-back navigation loop. Returning to edit context is now 100% stable, preserves input text and files, and successfully routes back to ONE_ACTION/Scaffold on submit.
* **Required Demo Environment Setup:**
  * Must start the development server using: `npm run dev:local-ai` (starts Next.js on port 3000 and points `OLLAMA_HOST` to port `11437`).
  * Must ensure local CPU-safe Ollama is running on port `11437` (`127.0.0.1:11437`).
  * Must have model `gemma2:2b` loaded and ready in local Ollama instance.
* Ready to demo: context reentry, make-smaller (splits steps using local AI successfully), back-to-context, and save point.

## ห้ามแตะ (Do Not Touch Until Demo is Completed)
- OneAction 3-block layout
- Reentry Brief L1/L2
- prompts / retrieval / schema / persistence

## Next Recommendation
**Proceed to Prototype RC / Demo Validation.** (See [User Validation Plan](user-validation-plan.md))
Do not initiate Phase 4 (OCR Accuracy) unless a reproducible OCR extraction failure occurs on a real client document that the existing fallback resilience chain cannot recover from.
