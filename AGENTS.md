# Agent Orchestrator

Local web app for managing GitHub workspaces, git worktrees, and one Claude Code agent per worktree. Human setup lives in `README.md`; this file is for coding agents.

## Commands

Run from the repo root. Node 20+ and pnpm 10+ are required.

```bash
cp .env.example .env          # set GITHUB_TOKEN (repo scope)
pnpm install
pnpm dev                      # API :3001 + Vite :5173 (proxies /api)
pnpm build && pnpm start      # production: server serves apps/web/dist
pnpm lint                     # ESLint across all packages
pnpm typecheck                # all packages
pnpm --filter @agent-orchestrator/server test
pnpm --filter @agent-orchestrator/server test -- src/services/git.test.ts
pnpm --filter @agent-orchestrator/web test # Vitest suite for web helpers
```

Shared types compile to `packages/shared/dist`. After changing `@agent-orchestrator/shared`, rebuild it (`pnpm --filter @agent-orchestrator/shared build`) or the full `pnpm build` before server tests that import the package.

`pnpm lint` runs ESLint (typescript-eslint flat config at the repo root) across web, server, and shared. `pnpm typecheck` is the cross-package type check; add or update `apps/server` tests for server behavior you change. Web helper tests run with Vitest and are colocated as `*.test.ts` in `apps/web/src`.

## Cursor Cloud specific instructions

Repo-managed Cloud Agent config lives in `.cursor/environment.json` (Dockerfile + `scripts/cloud-agent-install.sh`). After boot:

- API: `http://localhost:3001` (terminal sets `HOST=0.0.0.0`)
- Vite: `http://localhost:5173` (proxies `/api` to the server)
- `GITHUB_TOKEN` is optional to boot the UI; add it as a Cursor secret for clone/PR features
- Jira is optional (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`); assigned issues appear on the dashboard when set
- Claude Code CLI is optional to boot; chat/agent runs need an authenticated `CLAUDE_BIN`
- Do not commit `.env`, `data/`, SQLite files, or secrets

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

Env vars (`GITHUB_TOKEN`, `GITHUB_LOGIN`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `CLAUDE_BIN`, `DATA_DIR`, `PORT`, `HOST`, `AUTH_TOKEN`) are documented in `README.md` and `.env.example`. The server loads `.env` from the repo root.

## Architecture

- One worktree maps to one Claude Code agent. An agent can have multiple chat sessions; chat is `claude` with `stream-json` I/O; follow-ups use `--resume <session_id>`.
- Claude processes are **detached**. App shutdown must not kill in-flight runs (`releaseAll` drops write handles only; a FIFO holder keeps stdin open). Logs live under `data/runs/`; startup reattaches via `recoverRunningAgents`. Do not kill a reattached run just because the log contains a historical `control_request`. A top-level `result` must not end the run while a background Task/Explore subagent is still running — the CLI wakes Claude when the task settles (`monitorRun` defers the stdin close/reap; the UI keeps the message streaming while subagent rows run).
- New sessions start in **plan** mode unless a template says otherwise. `AskUserQuestion` and `ExitPlanMode` always prompt in the UI and must **never** appear in `--allowedTools` (that flag auto-approves). See `allowedToolsForPermissionMode` and `shouldAutoAllowToolPermission`.
- **Build** stashes the current plan session (keeps its messages and Claude session) and creates a new auto-mode session to implement. Do not delete the plan transcript.
- Shared DTOs and stream/permission helpers belong in `packages/shared`. Keep `apps/web/src/api/client.ts` aligned with `apps/server/src/routes/index.ts`.
- From-goal kickoff resolves an **AgentTask** (`task` slug or `"auto"` via purpose). Optional `model`/`effort` override the task defaults; prompt template / system prompt / permissions / tools come from the task. Auto fails if no purpose-bearing task matches. Do not hard-code extra kickoff instructions in the create path (edit the task instead).
- Session grades persist on `chat_sessions` (`grade_score` / comment / transcript snapshot). Instruction drafts write only allowed paths: `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, and `.claude/skills/<slug>/SKILL.md`.
- Agent **delivery phase** (`resolveAgentDeliveryPhase` in `@agent-orchestrator/shared`) is derived from sessions + linked PR checks/reviews — plan → build → needs PR → draft → CI/review → ready → merged → archived. Prefer this for “where is this agent?” UI over inventing a second workflow engine.

## Conventions

- **Server / shared:** ESM `NodeNext`. Relative imports keep the `.js` suffix (`import { x } from './git.js'`).
- **Web:** bundler resolution, no file suffixes, `import type` for type-only imports (`verbatimModuleSyntax`).
- Prefer existing MUI components and `sx` over custom CSS. Reuse `components/ui/*`; use `ResponsiveDialog` for form dialogs (full-screen on `sm` down). Theme is dark (`theme.ts`); do not introduce a second styling system.
- Validate API bodies with Zod in the router. Persist via repositories in `db/`; put process/git/GitHub/Claude I/O in services.
- Colocate server tests as `*.test.ts` next to the module. Use `node:test` + `node:assert/strict`.
- Keep every source file at most **400 lines**. Split modules, components, or helpers when a file grows past that limit.
- When designing code, always prefer reuse: extend or compose existing helpers, components, and services before adding parallel implementations.

## Do / don't

- Do add or update tests for server behavior you change; run the affected suite and `pnpm typecheck` before finishing.
- Do keep UI changes responsive (phone and desktop). Verify chat, workspaces, and dashboard if you touch shared layout or state.
- Do keep new and edited files within the 400-line limit; extract shared pieces instead of duplicating logic.
- Do not commit `.env`, `data/`, SQLite files, or secrets.
- Do not auto-approve `AskUserQuestion` or `ExitPlanMode`.
- Do not stop detached Claude processes on orchestrator shutdown.
- Do not add dependencies or new packages unless the task needs them.

## Git

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Scope with `(web)` / `(server)` when the change is package-specific (e.g. `feat(web): …`).
