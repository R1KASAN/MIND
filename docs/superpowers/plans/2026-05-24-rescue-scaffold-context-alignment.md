# Rescue Scaffold Context Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before production code changes. Use superpowers:systematic-debugging to keep the fix tied to the observed UI behavior.

**Goal:** Keep the accepted One Action and scaffold aligned to the messy room context, while preserving rescue as one smaller grounded recovery step.

**Architecture:** Fix the deterministic scaffold/action mapping at the source of the observed drift, then add a narrow validator so generic multi-item customer templates cannot replace a single incident/payment API room context. Keep AI provider flow, prompts, env, model names, retrieval schema, analytics contract, and token budgets unchanged.

**Tech Stack:** Next.js, TypeScript, Node test runner, IndexedDB session model.

---

## Root Cause

The observed scaffold steps come from `src/lib/orchestrator/task-machine.ts`, especially `buildGroundedArtifactMicroSteps()`. For room context containing `Dashboard`, `payment API`, or generic `API`, the fallback branch returns:

- `แยกงานค้างของ <customer> เป็นรายการสั้น`
- `จดสถานะล่าสุดของแต่ละรายการ`
- `ร่างข้อความตอบ <customer> แบบไม่ commit เวลา`

That branch is too generic for the supplied room context. The input describes one incident/status-update problem: ABC Corp, payment API timeout, CS needs customer-facing wording, Dashboard has not been checked, user is tired/stuck. The rescue path now recovers correctly, but the accepted action scaffold still turns the room into a generic multi-item customer work list.

## Files

- Modify: `src/lib/orchestrator/task-machine.ts`
- Modify: `src/lib/orchestrator/task-machine.test.ts`
- Possibly modify: `src/lib/orchestrator/task-controller.test.ts`
- Possibly modify: `src/app/page.tsx` only if copy still makes the action proposal/scaffold state ambiguous after behavior fix

## Task 1: Lock the BrainDump Scaffold Regression

- [ ] **Step 1: Add a failing test for the exact BrainDump**

Add a test in `src/lib/orchestrator/task-machine.test.ts` that builds action artifacts from a task whose `sourceText` is:

```text
เหนื่อยมาก
ต้องตอบ ABC Corp
payment API timeout ไป 20 นาที
CS ถามว่าจะตอบลูกค้ายังไง
ยังไม่ได้เปิด Dashboard
หัวตื้อ ไม่รู้จะเริ่มตรงไหน
```

Assert the generated micro steps:

```typescript
assert.deepEqual(payload.recommended_action.micro_steps, [
  'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
  'เติมอัปเดต 3 บรรทัดให้ CS',
  'ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลาเกินข้อมูลที่เห็น',
]);
```

Also assert no step contains `แยกงานค้าง` or `แต่ละรายการ`.

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --import tsx --test src/lib/orchestrator/task-machine.test.ts
```

Expected: FAIL because current fallback emits `แยกงานค้างของ ABC Corp เป็นรายการสั้น`.

## Task 2: Fix the Payment API/Dashboard/CS Mapping

- [ ] **Step 1: Implement the minimal branch in `buildGroundedArtifactMicroSteps()`**

Before the generic `hasDashboard || hasPayment || anchors.includes('API')` branch, add a narrower case for payment API + Dashboard and CS/customer communication context:

```typescript
if (hasDashboard && hasPayment && hasChat) {
  return [
    'เปิด Dashboard เช็กสถานะล่าสุดของ payment API',
    'เติมอัปเดต 3 บรรทัดให้ CS',
    `ร่างข้อความตอบ ${customerAnchor} แบบไม่ commit เวลาเกินข้อมูลที่เห็น`,
  ];
}
```

If `CS` is not currently collected as an anchor, extend `collectRoomArtifactAnchors()` with a `CS` keyword anchor and derive `hasSupportChannel` from it rather than treating all customer text as CS.

- [ ] **Step 2: Run targeted test and verify GREEN**

Run:

```bash
node --import tsx --test src/lib/orchestrator/task-machine.test.ts
```

Expected: PASS.

## Task 3: Add Guardrail Against Generic Multi-Item Drift

- [ ] **Step 1: Add a validator test**

In `src/lib/orchestrator/task-machine.test.ts`, add a test where AI starter steps for the same room are:

```typescript
[
  'แยกงานค้างของ ABC Corp เป็นรายการสั้น',
  'จดสถานะล่าสุดของแต่ละรายการ',
  'ร่างข้อความตอบ ABC Corp แบบไม่ commit เวลา',
]
```

Assert `buildPayloadFromAiActionResponse()` rejects those steps and uses the grounded fallback.

- [ ] **Step 2: Implement minimal rejection**

Extend `shouldUseGroundedFallbackSteps()` so a single-incident/payment API room rejects generic multi-item wording:

```typescript
const genericMultiItemDrift = hasAnchorInStep(steps.join(' '), ['payment API', 'Dashboard']) &&
  steps.some((step) => /แยกงานค้าง|แต่ละรายการ/u.test(step));
```

Use the existing anchor/task shape helpers rather than adding a new architecture layer.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
node --import tsx --test src/lib/orchestrator/task-machine.test.ts
```

Expected: PASS.

## Task 4: Verify Rescue Apply Still Replaces the Current Step

- [ ] **Step 1: Run existing rescue/apply tests**

Run:

```bash
node --import tsx --test src/lib/ai/rescue-runtime.test.ts src/app/api/ai/rescue/route.test.ts src/lib/orchestrator/task-controller.test.ts
```

Expected: PASS. Applying rescue keeps one step and does not reopen the old three-step scaffold sequence.

## Task 5: Clarify UI Copy Only If Needed

- [ ] **Step 1: Inspect the action proposal and scaffold labels in browser**

Use the BrainDump flow. Confirm whether the user can tell these states apart:

- action proposal: one recommended next action
- accepted scaffold: the working view for that action
- rescue: one smaller recovery step

- [ ] **Step 2: If ambiguous, make copy-only changes in `src/app/page.tsx`**

Keep copy narrow. Prefer labels like `ก้าวที่แนะนำ` for the proposal and `ทำก้าวนี้` for scaffold. Do not change routing or AI calls.

## Verification

Run:

```bash
git diff --check
npm run typecheck:app
node --import tsx --test src/lib/orchestrator/task-machine.test.ts src/lib/ai/rescue-runtime.test.ts src/app/api/ai/rescue/route.test.ts src/lib/orchestrator/task-controller.test.ts
npm run smoke:evidence-one-action
npm run smoke:demo-browser
```

Then do a targeted browser check with the BrainDump:

- One Action stays customer/status-update oriented.
- Scaffold first step is Dashboard/payment API status, not generic backlog splitting.
- Rescue recommended step is one grounded action.
- Applying rescue replaces/refines the active step with one step.
- `CPU spike` and `10:20` do not appear unless in current room context.
- Reentry labels source as latest input, existing room context, or both.
