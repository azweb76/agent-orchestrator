# Agent improvement backlog

Ideas for a closed loop where every session makes the next one cheaper, faster, and less correction-prone. Session insights (context usage + analysis) is the first combined surface. Items are ordered by leverage, not calendar time.

## Now (shipped in this change)

- **Attribution inside context** — Session insights splits occupancy into conversation, tool results, skills, CLAUDE.md/AGENTS.md, and memory. Analysis names the largest bucket and suggests a cut (trim a skill, stop re-reading a file, compact earlier).

## Next (high leverage)

1. **Skill-gap clustering** — Across agents, group repeated findings (“never ran tests”, “re-explored instead of using Explore”). After N similar grades, auto-offer one personal skill instead of N one-off drafts.
2. **Used vs skipped skills** — Compare `availableSkills` to Skill-tool / slash use. If `/code-review` or `plan-work` existed and was ignored, the skills finding should say so and prefer *update that skill* over a new slug.
3. **Correction mining** — Treat rewind, user “no, do X”, and permission denials as labeled failures. Fold those into analysis notes automatically so skills capture the human fix, not just token waste.
4. **Memory vs skill vs CLAUDE.md routing** — A small classifier: situational fact → memory; reusable habit → personal skill; repo convention → CLAUDE.md/AGENTS.md; phase tactic → project phase skill. Analysis already has `action.kind`/`scope`; make the UI and offers follow the same rules every time.
5. **Compact-and-learn** — Before compact & continue, extract durable lessons (and optional skill draft) so compaction does not throw away the improvement signal.
6. **Skill hygiene** — Detect duplicate, stale, or conflicting personal skills. Offer merge/archive. Bloated skills are a context problem; analysis should flag oversized SKILL.md files the same way it flags bloated CLAUDE.md.

## Fleet loop

8. **Post-session auto-insights** — Optional, after idle/complete (not only Build/Fix CI). Never auto-write files. Persist one offer per agent as today.
9. **Assistant “improve the fleet”** — A mutating Assistant tool (confirm required) that lists recent grades, clusters gaps, and queues personal skill drafts for review.
10. **Scheduled skill garden** — Cron: weekly digest of unused skills, low-score sessions, and skills whose post-apply metrics got worse (`SkillMetricsComparison` already exists — show it on the Analysis tab).
11. **Cross-workspace personal library** — Personal skills already live under the user home. Add a settings page: list, disable, pin, and see which sessions invoked each skill.

## Analysis quality

12. **Grounded skill names** — Require `action.name` to match an existing skill or a valid new slug; reject invented tools. Prefer updating phase skills on Build/Review/Fix CI unless the model explicitly marks the lesson personal.
13. **Session comparison** — “This build vs last build on the same skill version”: turns, tokens, cost, tool-call mix. Makes skill edits measurable.
14. **Subagent playbooks** — Findings for missing Explore/Task use should draft a *personal* “when to spawn a subagent” skill, not a paragraph in CLAUDE.md.
15. **Permission-mode waste** — Plan-mode ping-pong and over-broad auto-allow should become findings with a suggested default mode on the agent task, not a new skill every time.
16. **Model/effort hints** — If a session burned high effort on a mechanical fix, suggest a cheaper default on the task template.

## Product surfaces

17. **Insights chip states** — Color already tracks context heat. Add a quiet badge when a skill draft is waiting, and a one-click path from the chip to the offer banner.
18. **From-goal kickoff** — After grading, suggested *task* prompt/system-prompt edits (agent tasks), not only skills. Kickoff should not grow hard-coded instructions; edit the task.
19. **Diff the skill** — Improve-instructions dialog: show unified diff vs current SKILL.md before write.
20. **Dry-run apply** — Preview which future kickoffs would inject the new skill (slash discovery + allowedTools), so users see blast radius before writing to `~/.claude/skills`.

## Guardrails (do not drop)

- Never auto-write instruction files or skills; apply stays human-gated.
- Never auto-approve `AskUserQuestion` or `ExitPlanMode`.
- Personal is the default for *new* skills; project is for this repo or an existing phase skill.
- Keep analysis optional (settings). Auto-grade of Build/Fix CI remains a separate, conservative toggle.
