# MIND Prototype User Validation Plan

**Document:** User Validation / Demo Protocol
**Target Stage:** Prototype Release Candidate (Phases 0–3.8 Complete)

## 1. Goal
Validate whether MIND solves the core pain of **client chaos reentry**: that a user can reopen a Room and immediately understand the operational context, evidence, open loops, and next move, even if some files failed OCR.

## 2. Hypothesis
> "MIND reduces reentry time and cognitive reset when returning to a client case."

## 3. Target User Profile
- Freelancer
- Consultant
- Solo knowledge worker managing multiple concurrent, unstructured client requests

## 4. Demo Scenario
**The "Messy Reality" Path:**
A client dumps a mix of good and bad files. The user needs to capture the state, figure out the next step, save it, and return later without starting over.

**Flow:**
1. Failed PDF (scanned/garbage) + Ready `notes.txt` attached.
2. Context shows `partial` — system proceeds gracefully.
3. System uses `notes.txt` and marks it with `ใช้เป็นบริบทแล้ว` (used as evidence).
4. User clicks Save Point.
5. User reopens the Room. Reentry Brief restores summary and topActions.

## 5. User Tasks
Observe the user attempting to complete the following:
1. **Create/open Room:** Navigate to or create a case workspace.
2. **Add messy client context:** Paste text and attach the test files (good + bad).
3. **Identify what happened:** State the current situation using the Reentry Brief/Snapshot.
4. **Identify next move:** Identify what action to take next without rereading the source files.
5. **Explain evidence:** State which file the AI actually used, and notice the failed file without feeling blocked.

## 6. Success Criteria & Scoring Rubric
| Metric | Pass | Fail |
|---|---|---|
| **Speed to Context** | User understands case state < 60 seconds after opening Room. | User re-reads raw files to remember the context. |
| **Action Clarity** | User names the next move clearly based on the UI. | User doesn't know what to do next. |
| **Trust in Evidence** | User confidently states which file was used based on the badge. | User is unsure if the AI hallucinated or used the failed file. |
| **Resilience to Failure** | User notices the failed file but proceeds confidently with the ready files. | User panics, stops work, or assumes the whole system is broken. |

## 7. Interview Questions (Post-Task)
1. When you reopened the Room, what was the first thing you looked at?
2. Did you feel confident in the AI's summary? Why or why not?
3. When the PDF failed, did you feel stuck?
4. In your real work, how long does it usually take you to resume a paused task like this?
5. What is the one thing missing that would prevent you from using this tomorrow?

## 8. Observer Notes Template
```markdown
- **User ID/Role:**
- **Time to Context (Task 3):** [ ] < 60s  [ ] > 60s
- **Evidence Trust (Task 5):** [ ] Clear  [ ] Confused
- **Failure Reaction:** [ ] Ignored/Proceeded  [ ] Blocked/Frustrated
- **Key Quotes:**
  - "..."
- **Critical Friction Points:**
  - ...
```
