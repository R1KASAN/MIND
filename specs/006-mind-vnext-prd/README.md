# MIND vNext PRD: Market-Fit Kit

Updated: 2026-04-15

หน้า index นี้ใช้เป็นจุดเริ่มต้นสำหรับ workflow วิเคราะห์ `market fit + friction-zero` ของ MIND

## Start Here

1. [Workflow Guide](./mind-skill-stack-workflow-guide.md)
2. [Canonical Prompt](./mind-market-fit-friction-zero-prompt.md)
3. [Read + Repo Facts Template](./mind-market-fit-friction-zero-read-template.md)
4. [Real Run #1 / Example Run](./mind-market-fit-friction-zero-example-run.md)
5. [Target Scenarios And Product Proof](./mind-target-scenarios-and-product-proof.md)
6. [T050 Reentry-First Shell Prompt](./mind-t050-reentry-first-shell-prompt.md)

## Fast Workflow

1. fill `Read + Repo Facts`
2. run the canonical prompt
3. compare output against `Real Run #1`
4. extract:
   - executive verdict
   - top 3 MVP adjustments
   - phase 1 roadmap
   - metrics to track
5. if `P0 now` = `first paint / reentry hierarchy`, use [T050 Reentry-First Shell Prompt](./mind-t050-reentry-first-shell-prompt.md)

## Source Of Truth

- canonical prompt: [mind-market-fit-friction-zero-prompt.md](./mind-market-fit-friction-zero-prompt.md)
- T050 implementation prompt: [mind-t050-reentry-first-shell-prompt.md](./mind-t050-reentry-first-shell-prompt.md)
- workflow entry point: [mind-skill-stack-workflow-guide.md](./mind-skill-stack-workflow-guide.md)
- repo doctrine: [AGENTS.md](../../AGENTS.md)

## Guardrails

- keep MIND framed as `local-first AI task copilot`
- optimize for `room-first reentry`, not broad productivity breadth
- do not drift into note app, workspace-first, or generic chatbot framing
- prefer friction reduction before feature expansion
