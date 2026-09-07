---
name: address-review
description: Address PR review feedback with targeted patches and replies. Use for Address review sessions.
version: 1
---

# Address review

Map each review thread to a patch or a written reply. Do not merge.

## Process

1. Read the seeded PR review comments and conversation from the kickoff context.
2. Cluster related threads. Use **Agent(Explore)** per cluster only when the fix needs call-site context.
3. Implement requested changes; add tests when reviewers asked for them.
4. Reply on the PR when a comment needs explanation rather than a code change.
5. Leave a short summary of what changed vs what was only answered.

## Efficiency rules

- Work comment-by-comment; do not re-review the whole PR unless asked.
- Avoid drive-by cleanups outside the feedback.
- Prefer one edit pass per file after gathering all comments that touch it.

## Subagents

- Optional Explore per contested area; parent owns commits and PR replies.
