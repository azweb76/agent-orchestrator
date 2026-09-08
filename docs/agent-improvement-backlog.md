# Agent improvement backlog

Ideas for a closed loop where every session makes the next one cheaper, faster, and less correction-prone. Session insights (context usage + analysis) is the first combined surface. Items are ordered by leverage, not calendar time.

## Now (shipped in this change)

- **Used vs skipped skills** — Grade context compares `availableSkills` to Skill-tool / slash use. Skipped phase skills prefer *update that skill* over a new slug.
- **Correction mining** — Rewind, user “no, do X”, permission denials, and failed tools are labeled failures in the grader prompt.
- **Grounded skill names** — `action.name` must match a listed skill or a valid kebab-case slug; invented tools are rewritten or dropped.
- **Offer routing** — Instruction-draft offers follow skills / CLAUDE.md / AGENTS.md actions (situational efficiency notes still go to memory).
- **Skill hygiene** — SKILL.md `charCount` is graded; oversized skills are flagged like bloated CLAUDE.md.
- **Compact-and-learn** — Compact & continue extracts durable lessons into the continuation prompt and a human-gated draft offer (never auto-writes files).
- **Insights chip** — Quiet badge when a skill draft is waiting; click opens Analysis next to the offer banner.

## Already on main

- **Skill-gap clustering** — Across agents, group repeated findings (“never ran tests”, “re-explored instead of using Explore”). After 3 similar grades, the instruction-draft offer is one personal skill instead of N one-off drafts.

## Next (high leverage)

1. **Memory vs skill vs CLAUDE.md routing** — Analysis already has `action.kind`/`scope`; keep tightening the classifier and UI copy so every offer follows the same rules.
2. **Session comparison** — “This build vs last build on the same skill version”: turns, tokens, cost, tool-call mix. Makes skill edits measurable.

## Fleet loop

8. **Post-session auto-insights** — Optional, after idle/complete (not only Build/Fix CI). Never auto-write files. Persist one offer per agent as today.
9. **Assistant “improve the fleet”** — A mutating Assistant tool (confirm required) that lists recent grades, clusters gaps, and queues personal skill drafts for review.
10. **Scheduled skill garden** — Cron: weekly digest of unused skills, low-score sessions, and skills whose post-apply metrics got worse (`SkillMetricsComparison` already exists — show it on the Analysis tab).
11. **Cross-workspace personal library** — Personal skills already live under the user home. Add a settings page: list, disable, pin, and see which sessions invoked each skill.

## Analysis quality

12. ~~Grounded skill names~~ — shipped (see Now).
13. **Session comparison** — “This build vs last build on the same skill version”: turns, tokens, cost, tool-call mix. Makes skill edits measurable.
14. **Subagent playbooks** — Findings for missing Explore/Task use should draft a *personal* “when to spawn a subagent” skill, not a paragraph in CLAUDE.md.
15. **Permission-mode waste** — Plan-mode ping-pong and over-broad auto-allow should become findings with a suggested default mode on the agent task, not a new skill every time.
16. **Model/effort hints** — If a session burned high effort on a mechanical fix, suggest a cheaper default on the task template.

## Product surfaces

17. ~~Insights chip states~~ — shipped (see Now).
18. **From-goal kickoff** — After grading, suggested *task* prompt/system-prompt edits (agent tasks), not only skills. Kickoff should not grow hard-coded instructions; edit the task.
19. **Diff the skill** — Improve-instructions dialog: show unified diff vs current SKILL.md before write.
20. **Dry-run apply** — Preview which future kickoffs would inject the new skill (slash discovery + allowedTools), so users see blast radius before writing to `~/.claude/skills`.

## Guardrails (do not drop)

- Never auto-write instruction files or skills; apply stays human-gated.
- Never auto-approve `AskUserQuestion` or `ExitPlanMode`.
- Personal is the default for *new* skills; project is for this repo or an existing phase skill.
- Keep analysis optional (settings). Auto-grade of Build/Fix CI remains a separate, conservative toggle.
