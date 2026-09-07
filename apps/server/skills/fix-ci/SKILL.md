---
name: fix-ci
description: Reproduce and fix failing CI checks with minimal scope. Use for Fix CI sessions.
version: 1
---

# Fix CI

Fix the failing checks; leave coverage for the failure mode.

## Process

1. Read the failing check names, summaries, and log excerpts from the kickoff context.
2. Reproduce locally when possible (narrow command). Prefer the failing job's script over inventing new ones.
3. Use **Agent(Explore)** only to locate the failing code path; avoid broad re-reads.
4. Fix the root cause, add or update a test when it catches the failure, and re-run the relevant check.
5. Do not merge. Summarize which checks failed and what changed.

## Efficiency rules

- Fix only what the failures require; no opportunistic refactors.
- Do not re-run unrelated suites once the failing signal is green.
- Cache discovery: one Explore for the stack, then edit.

## Subagents

- Narrow Explore for "where does this assertion come from".
- Parent owns the patch and verification commands.
