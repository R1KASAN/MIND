# MIND Persona-based POF Test Cases

**Document:** Proof of Functionality (POF) / Scenario Testing Template
**Goal:** Simulate "Client Chaos Reentry" using 4 distinct PMF-aligned personas to expose UX friction without requiring real external users.
**Method:** Self-play walkthrough or Wizard-of-Oz testing with internal team members.

---

## 1. Persona 1: Freelance Consultant (Multi-client chaos)
**Context:** Manages 3-7 clients. Needs to resume a specific client's monthly reporting but forgot where they left off.

| Test Element | Details |
|---|---|
| **Input Files (Mock)** | 1x Email thread (txt), 1x Short note (txt), 1x PDF Report (good), 1x Slide Deck (mocked as unreadable PDF) |
| **Expected Behavior** | System shows `partial` context. Gracefully ignores the failed slide deck PDF. Generates a summary based on the email and notes. |
| **User Task** | Reopen the Room and identify the next action for the client. |
| **Metrics to Record** | <ul><li>Time to context < 60s? [ ] Yes [ ] No</li><li>Can identify next move? [ ] Yes [ ] No</li><li>Did the failed PDF block them? [ ] Yes [ ] No</li></ul> |

---

## 2. Persona 2: Agency Lead / Account Manager (Multi-project coordination)
**Context:** Juggling 5-10 projects. Needs to quickly check project status because the client is asking for an update.

| Test Element | Details |
|---|---|
| **Input Files (Mock)** | 1x Internal meeting notes (txt), 1x Chat snippet (txt), 1x PDF Client Brief (good), 1x Excel/CSV data (converted to text) |
| **Expected Behavior** | System merges internal and client-facing context. Identifies exactly what the client is waiting for. |
| **User Task** | Find out "What is the client waiting for?" and "What is our team's next action?" |
| **Metrics to Record** | <ul><li>Time to context < 60s? [ ] Yes [ ] No</li><li>Next action clear without opening raw files? [ ] Yes [ ] No</li><li>Trusts the evidence provided? [ ] Yes [ ] No</li></ul> |

---

## 3. Persona 3: In-house Product / PM (Context switching)
**Context:** Managing multiple internal initiatives. Returns to a PRD after a sprint planning meeting.

| Test Element | Details |
|---|---|
| **Input Files (Mock)** | 1x PRD (markdown), 1x Meeting summary (txt), 1x Customer research summary (failed PDF), 1x Issue list (txt) |
| **Expected Behavior** | System shows `partial` context. Synthesizes the PRD and meeting notes into a clear product decision summary. |
| **User Task** | Recall the latest product decision and draft a communication to the engineering team. |
| **Metrics to Record** | <ul><li>Time to context < 60s? [ ] Yes [ ] No</li><li>Decision context clear? [ ] Yes [ ] No</li><li>Failed PDF handled without panic? [ ] Yes [ ] No</li></ul> |

---

## 4. Persona 4: Solo Creator / Coach (High emotional/cognitive load)
**Context:** Coach with back-to-back sessions. Needs to recall the previous session's commitments before joining the next call.

| Test Element | Details |
|---|---|
| **Input Files (Mock)** | 2x Session notes (markdown), 1x Email recap (txt), 1x Intake form (failed PDF) |
| **Expected Behavior** | System isolates the commitments and emotional context from previous sessions. Next move focuses on how to open the upcoming session. |
| **User Task** | Prepare the opening topic for the upcoming session based on the previous commitments. |
| **Metrics to Record** | <ul><li>Time to context < 60s? [ ] Yes [ ] No</li><li>Reduced emotional/cognitive load? [ ] Yes [ ] No (Qualitative)</li><li>Clear session opening defined? [ ] Yes [ ] No</li></ul> |

---

## Evaluation Rubric
For each test, record:
1. **Time to Context:** Pass if < 60 seconds.
2. **Actionability:** Pass if the user can name the next move without rereading raw files.
3. **Resilience:** Pass if the user does not feel blocked or frustrated when a file (`อ่านไม่สำเร็จ`) fails.
4. **Evidence Trust:** Pass if the user correctly identifies which files were used (`ใช้เป็นบริบทแล้ว`).
5. **Friction Points:** Record the top 1-2 UX confusions (e.g., latency, unclear labels).
