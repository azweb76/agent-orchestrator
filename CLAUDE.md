# CLAUDE.md

## Overview

Agent Orchestrator is a local web app that manages GitHub workspaces, git worktrees, and one
Claude Code agent per worktree. It is a pnpm monorepo (Node 20+, pnpm 10+): an Express + SQLite
API in `apps/server`, a Vite + React 19 + MUI SPA in `apps/web`, and shared DTOs/helpers in
`packages/shared`.

See @AGENTS.md for commands, Cursor Cloud setup, and shared operations.

## Quick start

```bash
cp .env.example .env          # set GITHUB_TOKEN (repo scope)
pnpm install
pnpm dev                      # API :3001 + Vite :5173 (proxies /api)
```

Key directories:

- `apps/server/src` — Express routes (Zod-validated), `db/` repositories, `services/` for
  git/GitHub/Claude process I/O. Tests colocated as `*.test.ts` (`node:test`).
- `apps/web/src` — pages, `components/ui/*` primitives, `api/client.ts` (must stay in sync with
  `apps/server/src/routes/index.ts`). Tests colocated as `*.test.ts` (Vitest).
- `packages/shared/src` — types and helpers used by both apps.
- `data/` — clones, worktrees, SQLite, run logs. Gitignored, never commit.

## Verification loop

After changes, run:

```bash
pnpm lint && pnpm typecheck && pnpm --filter @agent-orchestrator/server test
```

For web helpers: `pnpm --filter @agent-orchestrator/web test`.

Expensive-operation notes:

- `pnpm typecheck` builds `@agent-orchestrator/shared` first, then type-checks every package —
  it is the slowest check; run it once before finishing rather than per edit.
- After editing `packages/shared`, rebuild it
  (`pnpm --filter @agent-orchestrator/shared build`) before running server tests that import it,
  or they will type-check against stale `packages/shared/dist`.
- Narrow a slow suite with a file filter:
  `pnpm --filter @agent-orchestrator/server test -- src/services/git.test.ts`.
- `pnpm dev` is long-running; start it in the background and stop it when done.

Known environment-dependent failure: `apps/server/src/routes/index.test.ts` → "GET /api/status
returns system readiness fields" asserts `githubTokenConfigured === false`, so it fails whenever
`GITHUB_TOKEN` is exported in your shell. Prefix the run to get a clean suite:
`GITHUB_TOKEN= pnpm --filter @agent-orchestrator/server test`.

## Boundaries

- Do not commit `.env`, `data/`, or SQLite files. No secrets in tracked files.
- Do not modify `README.md` — it is human setup documentation. Agent-facing guidance goes in
  `AGENTS.md`; this file stays short.
- Keep multi-step workflows in `.claude/skills/<slug>/SKILL.md` (see
  `.claude/skills/cloud-agent-ui-test/SKILL.md`).
- Keep every source file at or under 400 lines; extract instead of growing a file.
- Do not add dependencies unless the task requires them.
- Do not auto-approve `AskUserQuestion` or `ExitPlanMode`, and do not kill detached Claude
  processes on shutdown — see the Architecture section of AGENTS.md.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), scoped with `(web)` / `(server)`
when package-specific.
