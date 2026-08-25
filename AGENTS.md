# Agent Orchestrator

Local web app for managing GitHub workspaces, git worktrees, and one Claude Code agent per worktree. Human setup lives in `README.md`; this file is for coding agents.

## Commands

Run from the repo root. Node 20+ and pnpm 10+ are required.

```bash
cp .env.example .env          # set GITHUB_TOKEN (repo scope)
pnpm install
pnpm dev                      # API :3001 + Vite :5173 (proxies /api)
pnpm build && pnpm start      # production: server serves apps/web/dist
pnpm typecheck                # all packages
pnpm --filter @agent-orchestrator/server test
pnpm --filter @agent-orchestrator/server test -- src/services/git.test.ts
```

Shared types compile to `packages/shared/dist`. After changing `@agent-orchestrator/shared`, rebuild it (`pnpm --filter @agent-orchestrator/shared build`) or the full `pnpm build` before server tests that import the package.

There is no repo-wide lint or frontend test script. `pnpm typecheck` is the cross-package check; add or update `apps/server` tests for server behavior you change.

## Layout

```
apps/server/src/          Express API, SQLite, git/GitHub/Claude services
  index.ts                HTTP server, static web dist, graceful shutdown
  routes/index.ts         REST + SSE; Zod request bodies
  db/index.ts             better-sqlite3 schema + repositories
  services/app.ts         orchestration (workspaces, agents, chat, PRs)
  services/git.ts         git + detached Claude Code process
  services/*.test.ts      node:test suites (colocated)
apps/web/src/             Vite + React 19 + MUI v9 + TanStack Query
  api/client.ts           fetch wrapper + SSE chat helpers
  pages/                  routes in App.tsx
  components/ui/          PageHeader, EmptyState, ListPanel, ResponsiveDialog, …
  components/chat/        agent transcript, composer, permission cards
packages/shared/src/      types and helpers used by both apps
data/                     clones, worktrees, SQLite, run logs (gitignored)
```

Env vars (`GITHUB_TOKEN`, `GITHUB_LOGIN`, `CLAUDE_BIN`, `DATA_DIR`, `PORT`) are documented in `README.md` and `.env.example`. The server loads `.env` from the repo root.

## Architecture

- One worktree maps to one Claude Code agent. Chat is `claude` with `stream-json` I/O; follow-ups use `--resume <session_id>`.
- Claude processes are **detached**. App shutdown must not kill in-flight runs (`releaseAll` drops write handles only; a FIFO holder keeps stdin open). Logs live under `data/runs/`; startup reattaches via `recoverRunningAgents`. Do not kill a reattached run just because the log contains a historical `control_request`.
- New sessions start in **plan** mode. `AskUserQuestion` and `ExitPlanMode` always prompt in the UI and must **never** appear in `--allowedTools` (that flag auto-approves). See `allowedToolsForPermissionMode` and `shouldAutoAllowToolPermission`.
- Shared DTOs and stream/permission helpers belong in `packages/shared`. Keep `apps/web/src/api/client.ts` aligned with `apps/server/src/routes/index.ts`.
- From-idea kickoff sends the raw idea (`buildIdeaKickoffPrompt`); do not append extra instructions there.

## Conventions

- **Server / shared:** ESM `NodeNext`. Relative imports keep the `.js` suffix (`import { x } from './git.js'`).
- **Web:** bundler resolution, no file suffixes, `import type` for type-only imports (`verbatimModuleSyntax`).
- Prefer existing MUI components and `sx` over custom CSS. Reuse `components/ui/*`; use `ResponsiveDialog` for form dialogs (full-screen on `sm` down). Theme is dark (`theme.ts`); do not introduce a second styling system.
- Validate API bodies with Zod in the router. Persist via repositories in `db/`; put process/git/GitHub/Claude I/O in services.
- Colocate server tests as `*.test.ts` next to the module. Use `node:test` + `node:assert/strict`.

## Do / don't

- Do add or update tests for server behavior you change; run the affected suite and `pnpm typecheck` before finishing.
- Do keep UI changes responsive (phone and desktop). Verify chat, workspaces, and dashboard if you touch shared layout or state.
- Do not commit `.env`, `data/`, SQLite files, or secrets.
- Do not auto-approve `AskUserQuestion` or `ExitPlanMode`.
- Do not stop detached Claude processes on orchestrator shutdown.
- Do not add dependencies or new packages unless the task needs them.

## Git

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Scope with `(web)` / `(server)` when the change is package-specific (e.g. `feat(web): …`).
