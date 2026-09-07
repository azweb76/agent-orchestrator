---
name: implement-plan
description: Execute an approved plan in auto mode with parallel Explore/Task when useful. Use after Build / plan approval.
version: 1
---

# Implement plan

Ship the approved plan with minimal thrash. Prefer progress over re-planning.

## Process

1. Read the approved plan (and Planning Q&A / mentioned files if provided). Do not reopen scoping unless blocked.
2. For independent areas, spawn **Agent(Explore)** or Task subagents in parallel; parent owns edits, commits, and sequencing.
3. Implement in small, reviewable steps. Run the relevant tests or typecheck for touched areas.
4. Stop when the plan is done or truly blocked. Summarize what changed and what remains.

## Efficiency rules

- Do not re-explore files already listed in the plan or handoff unless they changed.
- Avoid redundant full-repo searches; scope Glob/Grep tightly.
- Do not ask clarifying questions unless blocked; use sensible defaults from the plan.
- Prefer editing existing helpers over parallel implementations.
- Keep commits/PR work for follow-up chips unless the user asked mid-run.

## Subagents

- Parallelize independent research; never parallelize conflicting edits to the same file.
- Parent integrates subagent findings; do not treat a nested result as session end while siblings still run.
