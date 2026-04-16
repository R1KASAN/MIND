# Specification Quality Checklist: MIND Start-and-Recovery Engine

> [ARCHIVAL] This checklist describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

**Purpose**: "Unit Tests for English" - Validates the quality, clarity, and completeness of the MIND requirements prior to implementation.
**Created**: 2026-04-05
**Feature**: [005-mind-full-prd](file:///Users/ark1/Public/MIND/specs/005-mind-full-prd/spec.md)
**Primary Audience**: AI Assistant (`speckit-implement`)

## 1. Product Identity & Negative Tests (Anti-Drift)
- [ ] **CHK001** - Does the spec explicitly forbid editable backlog lists in all Phase 5+ tasks? [Consistency, Spec §4]
- [ ] **CHK002** - Are general-purpose conversational AI interfaces explicitly excluded from the implementation scope? [Coverage, Spec §4]
- [ ] **CHK003** - Is the "Anti-Task-Graveyard" principle (Principle V) translated into a search-only archive requirement? [Clarity, Spec §5]
- [ ] **CHK004c** - **COGNITIVE LOAD**: Does the feature increase decision paralysis or triage overhead? (MUST FAIL if yes). [Constitution VIII]
- [ ] **CHK004d** - **RETRY QUALITY**: Does retry success skip all theatrics (checkmarks/animations) and transition immediately? (MUST FAIL if no). [Constitution IV]
- [ ] **CHK005** - Is the "Physical Action Bar" quantified by a concrete <5-minute duration requirement? [Clarity, Spec §8]
- [ ] **CHK006** - Does the AI contract explicitly forbid abstract or vague outputs like "Plan project X"? [Consistency, Contract §Prompt]
- [ ] **CHK007** - Are the requirements for the "Rationale" field limited to a single, trust-building sentence? [Completeness, Spec §11]
- [ ] **CHK008** - Is the requirement for "Exactly 3 micro-steps" consistent across the spec, plan, and data model? [Consistency]

## 3. Rejection Rotation Behavior
- [ ] **CHK009** - Does the spec mandate that "Not this" cycles through *pre-computed* alternatives *without* a new AI call? [Completeness, Spec §7]
- [ ] **CHK010** - Is the persistence requirement for `notThisCount` explicitly documented to ensure rotation survives a refresh? [Clarity, Data Model §AppSession]
- [ ] **CHK011** - Are the transition rules defined for when all alternatives are exhausted? [Coverage, Spec §7]

## 4. Bounce-Back Tone & Control
- [ ] **CHK012** - Are elapsed-time displays and "days away" statistics explicitly forbidden from the Bounce-Back screen? [Consistency, Spec §1]
- [ ] **CHK013** - Does the spec mandate exactly two choices ("Continue" or "Start Fresh") for re-entry? [Clarity, Spec §1]
- [ ] **CHK014** - Is the "Warm, non-shaming" tone requirement for Bounce-Back translated into specific prohibited phrases (e.g., "You missed X days")? [Clarity, Spec §6]

## 5. Silent Completion Loop
- [ ] **CHK015** - Does the specification explicitly define the transition from "Done" to "Dump Entry" as silent and animation-free? [Completeness, Spec §7]
- [ ] **CHK016** - Is the abruptness of the silent loop acknowledged as a deliberate momentum requirement? [Plan §Review]
- [ ] **CHK017** - Is the "Success Screen" explicitly marked as out-of-scope? [Gap, Consistency]

## 6. Minimal Overview & Pin UX
- [ ] **CHK018** - Is the hard UI cap of **3 pinned items** explicitly specified for the Overview surface? [Completeness, Spec §7]
- [ ] **CHK019** - Is the requirement to **disable the Pin button** and show a "Max 3 pinned items" cue documented? [Clarity, Plan §3]
- [ ] **CHK020** - Does the spec define the Overview as strictly read-only with NO backlog management? [Consistency, Spec §1]

## 7. Morning Ritual Lightweightness
- [ ] **CHK021** - Is the Morning Ritual requirement strictly limited to an in-app intercept (no push notifications)? [Completeness, Spec §7]
- [ ] **CHK022** - Does the spec define local-timezone handling for the "first-session-of-the-day" trigger? [Clarity, Plan §1]

## 8. Trust Triad & Data Control
- [ ] **CHK023** - Are the three mandatory components of the "Trust Triad" (Rationale, JSON Export, Delete All) explicitly defined? [Completeness, Spec §7]
- [ ] **CHK024** - Does the "Delete All Local Data" requirement specify a confirmation step? [Clarity, Data Model §169]

## 9. Local-First & AI Reliability (Ollama)
- [ ] **CHK025** - Is the **non-blocking** nature of the local AI health check explicitly mandated? [CRITICAL Risk, Plan §1]
- [ ] **CHK026** - Is the AI timeout standardized to **exactly 12 seconds** across all three core artifacts? [Consistency]
- [ ] **CHK027** - Does the AI contract specify the `qwen2.5:3b` model as the default MVP weight? [Completeness, Spec §8]

## 10. ManualFallback & Retry Momentum
- [ ] **CHK028** - Does the spec require the "Retry AI" action to stay **inline** within ManualFallback? [Clarity, Plan §4]
- [ ] **CHK029** - is the reuse of `activeDumpContext` for the retry loop explicitly defined? [Completeness, Plan §4]
- [ ] **CHK030** - Does the requirement for retry success explicitly forbid checkmarks, success animations, or transient states? [Clarity, Plan §4]
- [ ] **CHK031** - Is the AI status indicator requirement defined as **passive and non-clickable**? [Clarity, Plan §1]

## 11. Metrics & Verification Proofs
- [ ] **CHK032** - Is `scaffold_completed` clearly identified as the **primary differentiation metric**? [Measurability, Spec §10]
- [ ] **CHK033** - Are telemetry requirements defined for `retry_clicked`, `retry_success`, and `retry_failed`? [Coverage, Plan §Telemetrty]
- [ ] **CHK034** - Does the spec define a measurable threshold for success (e.g., >50% beta sessions end in "Done")? [Measurability, Spec §10]

## 12. Edge Case & Failure Recovery
- [ ] **CHK035** - Are requirements defined for "Empty/Vent-Only Dump" failures (Self-Care/Grounding fallback)? [Coverage, Contract §Fallback]
- [ ] **CHK036** - Is the behavior specified for when a user rejects all available alternatives? [Gap, Spec §7]
- [ ] **CHK037** - Does the spec define the state transition for a failed retry? [Clarity, Plan §4]

---

## Final Review
- [ ] Is every item phrased as pass/fail?
- [ ] Are all 15 categories addressed?
- [ ] Are the "Negative Tests" (No Backlog/No Chat) explicitly mapped?
- [ ] Is the 12s timeout consistency verified across all IDs?
- [ ] Are the Pin Cap UI state requirements explicitly testable?
