# MIND Merge Readiness

Use this checklist before opening a PR, requesting review, or merging a release-bound branch.

Current canonical local AI path:

- Ollama host: `http://127.0.0.1:11437`
- Start local runtime: `npm run ollama:serve:cpu-safe`
- Verify runtime: `npm run runtime:ollama:check:gemma`
- Route smoke: `npm run smoke:ai-routes:gemma`
- Readiness gate: `npm run gate:phase5`

Metadata:

- Branch: `<branch-name>`
- Commit: `<hash>`
- Date: `<YYYY-MM-DD>`
- Notes: `<notes>`

## Merge Blockers

- [ ] `git status` is clean enough for a reviewable PR.
- [ ] No unresolved or unexplained untracked files remain.
- [ ] The diff is split into coherent commits. Do not merge a mega commit that mixes runtime, orchestration, UI, docs, and scripts.
- [ ] `npm run gate:phase5` passes, or there is an explicit written reason why the merge is not release-bound.
- [ ] Browser validation is recorded in [E2E_FLOW_CHECKLIST.md](/Users/ark1/Public/MIND/E2E_FLOW_CHECKLIST.md).
- [ ] The canonical local AI path still points to `11437`, not Ollama.app on `11434`.

## Important But Non-Blocking

- [ ] `README.md` and [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md) still match the runtime and demo path you are merging.
- [ ] New scripts in `scripts/` have clear names and belong to the release path or an intentionally documented debug path.
- [ ] New folders under `src/`, `docs/`, or `specs/` are intentional and not exploratory leftovers.
- [ ] Ambiguous experimental work is either documented or kept out of the merge.

## Working Tree And Commit Hygiene

- [ ] Commits are grouped by real scope, for example:
  - Runtime / Infra
  - Intake / Controller / Event flow
  - AI routes / runtime checks
  - UI / Product flow
  - Docs / Specs / Scripts
- [ ] Each commit message is imperative and specific, not `fix`, `wip`, or `temp`.
- [ ] `git add -p` or equivalent hunk selection was used where files contain mixed concerns.
- [ ] Rollback is safe: reverting one commit should not silently remove unrelated changes.

## Runtime / Infra Validation

- [ ] `npm run ollama:serve:cpu-safe` works on the target machine when the runtime is not already up.
- [ ] `npm run runtime:ollama:check:gemma` verifies `gemma2:2b` on `http://127.0.0.1:11437`.
- [ ] `npm run smoke:ai-routes:gemma` passes for the current branch.
- [ ] `npm run dev` and `npm run start` still use the guarded canonical local AI path.
- [ ] If `11434` is running on the machine, the merge notes or docs make it clear that `11434` is not the repo default.

## Closed Scope: Do Not Reopen In This Merge

- [ ] Do not reopen the intake serializer canonical-merge fix unless there is a new concrete bug.
- [ ] Do not change minimal intake request support at `/api/ai/intake`.
- [ ] Do not modify `AiIntakeResponseSchema` as part of merge cleanup.
- [ ] Do not add a success `status` field to the intake response.
- [ ] Do not change downstream branching based on `requiresClarification` and `candidateActions[0]`.

## Docs / Specs Alignment

- [ ] Behavior changes that affect demos, release flow, or task lifecycle are reflected in `README.md`, `docs/`, or `specs/`.
- [ ] [specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md](/Users/ark1/Public/MIND/specs/006-mind-vnext-prd/phase-5-pre-demo-pre-release-gate-note.md) still reflects the actual gate.
- [ ] Runbook commands in docs match the commands that actually work on this branch.

## Final Sign-Off

- [ ] This merge is reviewable by subsystem, not just by reading one large diff.
- [ ] The branch state, commit hash, and E2E notes above are filled in.
- [ ] If this merge is not ready, stop here and slice commits before asking for review.
