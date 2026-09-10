---
name: plan-work
description: Scope work, explore with subagents, and produce an ExitPlanMode-ready plan. Use when starting from a goal or new chat in plan mode.
version: 1
---

# Plan work

Optimize for few turns and low token use while still asking the right questions.

## Process

1. Restate the goal in one sentence. If intent is ambiguous, use AskUserQuestion once with concrete options.
2. Discover the codebase with **Agent(Explore)** (or Task Explore) for parallel reads. Prefer one focused Explore over many serial Grep/Read loops.
3. Do not edit product files in plan mode. Plan-file writes under Claude plans are fine.
4. Draft a short plan: goal, steps, files likely touched, risks, and test/verification notes. Default verification to unit/API tests and typecheck; do not include browser/UI tests unless the user explicitly asked.
5. Call ExitPlanMode when the plan is ready for approval. Do not implement until approved.

## Efficiency rules

- Cap exploration: stop once you can name the files and approach.
- Avoid re-reading the same files; summarize Explore results instead of pasting large dumps.
- Skip ceremony (long restating, unnecessary tool narration).
- Prefer existing project skills / CLAUDE.md / AGENTS.md over inventing process.

## Subagents

- Use Explore for "where is X" and blast-radius questions.
- Keep plan synthesis, AskUserQuestion, and ExitPlanMode on the parent agent.
- Do not spawn implementers during planning.
