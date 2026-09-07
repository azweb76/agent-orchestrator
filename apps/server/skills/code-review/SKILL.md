---
name: code-review
description: Review the current diff for bugs, edge cases, missing tests, and regressions. Use for Review sessions and /code-review.
version: 1
---

# Code review

Find real defects fast. Do not rewrite the change unless asked.

## Process

1. Inspect the uncommitted and branch diff first (or the attached @diff context).
2. Use **Agent(Explore)** only for related call sites, invariants, or missing tests—not a full rewrite of discovery.
3. Report findings by severity: bugs / correctness, missing tests, regressions, nits.
4. Ask clarifying questions only when intent is unclear. Do not make code changes unless asked.

## Efficiency rules

- One pass over the diff; avoid re-reading unchanged files.
- Cite concrete file paths and lines; skip generic style lectures.
- Prefer high-signal issues over long prose.
- If the diff is empty, say so and stop.

## Subagents

- Optional Explore for "who calls this" or sibling patterns.
- Parent owns the final review verdict.
