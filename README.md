# Agent Orchestrator

Local web app for managing GitHub workspaces, git worktrees, and one Claude Code agent per worktree.

## Features

- **Command center** — home dashboard with the live agent fleet, a **Needs attention** panel when agents are waiting on prompts, spend/usage rollup (today's cost, all-time, top spend per agent), system readiness, recent workspaces, and PR / GitHub / Jira issue inboxes. Everything updates live over SSE — no manual refresh.
- **Workspaces** — clone GitHub repos as managed workspaces.
- **Pull requests** — browse your open PRs and review requests; open a PR to see checks, files, commits, reviews, and conversation, and start an agent from it. **Fix CI** and **Address review** kick off ready-made sessions against the PR branch.
- **Agents** — one Claude Code agent per git worktree. Create one **From goal** (pick a **task** or **Auto** via purpose; optional model/effort override task defaults), **From branch**, or **From PR**. Each agent page has two tabs: **Chat** and **Changes**.
- **Chat** — streaming conversations with follow-up support via Claude session resume:
  - Sessions start in **plan mode**; Claude can ask clarifying questions (`AskUserQuestion`) and present a plan (`ExitPlanMode`) with a **Build** action that stashes the plan session and starts a new auto-mode session to implement.
  - Multiple sessions per agent, created from templates (**New chat**, **Review**, **Create draft PR**, **Address review**, **Fix CI**). Git-mutating sessions take a per-worktree lock; a queued session shows **Waiting** until the worktree is free.
  - Queue follow-ups or force-send (interrupts the current run); stop generation; clear history (`/clear`); rewind to any user message (`/rewind` or the history button on a bubble).
  - Slash commands with real gathered context: `/diff` attaches the current diff, `/test` runs the project's tests and attaches the output, `/pr` pulls the PR and its checks, `/review` opens a Review session — plus autocomplete for project, personal, and bundled skills.
  - `@` mentions in the composer attach context: `@diff` for the current worktree patch, `@path/to/file` for any file in the worktree.
  - A context-usage chip shows tokens and percent toward the auto-compact threshold; when context runs hot, a **Compact & continue** banner starts a fresh session seeded with a summary while keeping the old transcript.
  - Model, effort, and permission-mode controls; manual/plan modes prompt in the UI for tool permissions. `AskUserQuestion` and `ExitPlanMode` always prompt and are never auto-approved.
  - Image attachments (paste or upload), markdown replies, compact tool-use progress bar.
  - Analyze and grade a session with AI (turns, tokens, context, instruction files, skills). After a graded Build or Fix CI session, the app may offer an instruction-file draft (a skill, `CLAUDE.md`, or `AGENTS.md`) — review and apply it, or dismiss; nothing is written until you apply.
  - New chats are auto-named from the first prompt via the Anthropic API; rename from the session bar.
- **Changes** — file-tree diff of the agent's worktree, scoped to pending changes or all PR changes; **Commit & push** from the UI; create or view the pull request on GitHub.
- **Notifications** — optional browser notifications (bell in the app bar) when a run finishes or an agent needs your input.
- **Unlock screen** — when `AUTH_TOKEN` is set, the UI asks for the token once and stores it locally.

## Stack

- **Backend:** Node.js, Express, TypeScript (ESM), SQLite
- **Frontend:** Vite, React, MUI v9, TanStack Query
- **Agent runtime:** local [Claude Code](https://code.claude.com) CLI

## Prerequisites

- Node.js 20+
- pnpm 10+
- git
- [Claude Code CLI](https://code.claude.com) installed and authenticated
- GitHub personal access token with `repo` scope (for branches, PRs, and creating PRs)

## Setup

```bash
cp .env.example .env
# Edit .env and set GITHUB_TOKEN

pnpm install
pnpm build
pnpm start
```

Open http://localhost:3001

### Development

Run backend and frontend together with hot reload:

```bash
pnpm dev
```

- API: http://localhost:3001/api
- Web (dev): http://localhost:5173 (proxies `/api` to the server)

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub PAT for API access | — |
| `GITHUB_LOGIN` | Optional GitHub username override for PR inbox searches | from token `/user` |
| `JIRA_BASE_URL` | Jira Cloud site URL (e.g. `https://your-domain.atlassian.net`) | — |
| `JIRA_EMAIL` | Atlassian account email for Jira API auth | — |
| `JIRA_API_TOKEN` | Atlassian API token for Jira. On macOS, falls back to keychain item `jira-api-token` for `$USER` when unset (`security find-generic-password -a "$USER" -s jira-api-token -g -w`) | — |
| `CLAUDE_BIN` | Path to Claude Code binary | `claude` |
| `DATA_DIR` | Directory for repos, worktrees, and SQLite DB | `./data` |
| `PORT` | Server port | `3001` |
| `HOST` | Bind address | `127.0.0.1` |
| `AUTH_TOKEN` | Optional shared secret for API access | — |

The server binds to loopback by default. Set `HOST=0.0.0.0` only if you intend to expose the UI on the network, and pair it with `AUTH_TOKEN` — the web UI will then show an unlock screen asking for the token.

## Usage

1. **Add a workspace** — paste a GitHub repo URL; the app clones it locally. Or start from the **Pull requests** inbox: starting an agent from a PR clones the workspace for you.
2. **Create an agent** — from an idea, a branch, or an open PR; a git worktree is created automatically. From an idea, the agent opens with your idea as the first prompt.
3. **Plan, then build** — sessions start in plan mode; when Claude presents a plan, hit **Build** to hand off to an auto-mode session that implements it.
4. **Review and ship** — watch the diff on the **Changes** tab, commit and push from the UI, and create the PR when ready.

## Architecture

```
apps/
  server/   Express API, git/GitHub/Claude services, SQLite
  web/      React UI
packages/
  shared/   Shared TypeScript types
data/       Cloned repos, worktrees, database (gitignored)
```

Each worktree maps 1:1 to a Claude Code agent. An agent can have multiple chat sessions (plan, build, review, draft PR) running in parallel; sessions that mutate the worktree are serialized behind a per-worktree lock. Chat uses `claude` with `stream-json` output; follow-ups resume via `--resume <session_id>`.

Claude runs are **detached** from the orchestrator process: shutting down or restarting the app does not stop in-flight agents. Run output is written to log files under `data/runs/`; stdin uses a named pipe plus a small holder process so AskUserQuestion / permission prompts stay pending across restart. On startup the server re-attaches, rebuilds chat history from the log (without duplicating it), restores any unanswered prompts, and finalizes when the run completes.
