# Agent Orchestrator

Local web app for managing git workspaces, worktrees, and Claude Code agents.

## Features

- **Command center** — Jarvis-style home dashboard with live agent fleet, system readiness, workspaces, and PR inbox
- **Workspaces** — clone GitHub repos as managed workspaces
- **Pull requests** — browse your open PRs and review requests, then create a workspace + agent from any PR
- **Worktrees** — create worktrees from branches or existing pull requests
- **Agents** — one Claude Code agent per worktree
- **Chat** — streaming conversations with follow-up support via Claude session resume
  - Queue follow-ups or force-send (interrupts the current run)
  - Stop generation, clear history (`/clear` or Clear button), model + permission mode controls
  - Rewind to any user message (`/rewind` or the history button on a bubble) to truncate later turns, reset the Claude session, and restore the prompt for editing
  - Sessions start in **plan mode**; Claude can ask clarifying questions (`AskUserQuestion`) and present a plan (`ExitPlanMode`) with a **Build** action that stashes the plan session and starts a new auto-mode session to implement
  - Each agent can hold multiple chat sessions in parallel (for example a plan chat plus a Review or Create draft PR session)
  - Manual / plan modes prompt on the agent page for tool permissions; `AskUserQuestion` and `ExitPlanMode` always prompt and are never auto-approved via `--allowedTools`
  - Slash commands & skills autocomplete (project/personal/bundled)
  - Image attachments (paste or upload), markdown replies, compact tool-use progress bar (updates with the active tool)
  - Analyze a session with AI (turns, tokens, context, instruction files, skills) and generate a skill, CLAUDE.md, or AGENTS.md draft from the transcript
- **Diff & PRs** — view agent changes and open pull requests on GitHub
- **Events** — inspect Claude stream events and agent lifecycle activity
- **Sidebar** — browse workspaces/agents and create new agents in place

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
| `CLAUDE_BIN` | Path to Claude Code binary | `claude` |
| `DATA_DIR` | Directory for repos, worktrees, and SQLite DB | `./data` |
| `PORT` | Server port | `3001` |

## Usage

1. **Add a workspace** — paste a GitHub repo URL; the app clones it locally.
2. **Create a worktree** — pick a branch or open PR; a git worktree and agent are created automatically.
3. **Open the agent** — chat with Claude Code in the worktree directory, view diffs, and create PRs when ready.

## Architecture

```
apps/
  server/   Express API, git/GitHub/Claude services, SQLite
  web/      React UI
packages/
  shared/   Shared TypeScript types
data/       Cloned repos, worktrees, database (gitignored)
```

Each worktree maps 1:1 to a Claude Code agent. An agent can have multiple chat sessions (plan, build, review, draft PR) running in parallel. Chat uses `claude` with `stream-json` output; follow-ups resume via `--resume <session_id>`.

Claude runs are **detached** from the orchestrator process: shutting down or restarting the app does not stop in-flight agents. Run output is written to log files under `data/runs/`; stdin uses a named pipe plus a small holder process so AskUserQuestion / permission prompts stay pending across restart. On startup the server re-attaches, rebuilds chat history from the log (without duplicating it), restores any unanswered prompts, and finalizes when the run completes.
