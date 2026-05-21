# AGENTS.md

## Source Of Truth
- Read [docs/product/prototype-completion-plan.md](/Users/ark1/Public/MIND/docs/product/prototype-completion-plan.md) first.
- Conflict order: `prototype-completion-plan.md` > `AGENTS.md` > other docs.

## What MIND Is
- Narrow Room-based prototype.
- Demo story: paste messy context -> one next action -> evidence -> rescue/refine -> reentry in the same Room.

## In Scope
- Room-based file/text intake
- evidence / source reveal
- Room memory and reentry continuity
- summary / next action / save point
- rescue / refine when it helps the same Room flow
- small UI, copy, and test fixes that directly improve the prototype path

## Do Not Touch
- prompts
- retrieval schema
- analytics contract
- OCR provider/setup
- smoke harness
- orchestration architecture
- unrelated routing/product breadth
- anything else unless a proven blocking defect needs a tiny fix

## Work Principles
- Concrete, minimal, testable
- Smallest change that improves the prototype path
- Narrow + low risk -> execute
- Broad + risky -> Plan First
- No brainstorming unless asked
- Keep suggestions aligned to prototype completion, not product expansion

## Context Limits
- File >200KB -> read only the relevant section
- Whole codebase needed -> ask the user to narrow scope

## Demo Habit
- Use this path: `/` -> create/select Room -> paste context -> optionally attach file -> `ไปต่อ` -> evidence -> summary/next action -> confirm or recover -> return to the same Room
- Do not use `/business` as part of the normal demo path

## Verification Habit
- `git diff --check`
- `npm run typecheck:app`
- `npm run smoke:evidence-one-action`
- `npm run smoke:demo-browser`
- targeted browser check for intake, evidence, rescue, and reentry when needed

## Done Criteria
Task is done when:
1. All verification checks pass
2. Demo flow completes end-to-end
3. No new console errors
4. User confirms, or the prototype-completion plan marks it done

## Known Baseline
Update after each verified change:
- Smoke tests: 12/12 pass
- Demo flow: completes end-to-end
- Evidence: traces to source 100%
- Reentry: preserves context 100%
- If metrics degrade -> flag + rollback

## If Something Breaks
1. `git diff` to see changes
2. Identify the breaking change
3. `git checkout -- <file>` to revert
4. Report what broke and why before retry

## If No Task Is Given
Choose the smallest open prototype-gap task from the active plan. Prefer:
1. broken flow / dead end
2. reentry or save-point continuity
3. evidence visibility
4. intake clarity
5. narrow label / copy cleanup
