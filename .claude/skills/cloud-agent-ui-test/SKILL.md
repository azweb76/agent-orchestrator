---
name: cloud-agent-ui-test
description: Efficiently verify Agent Orchestrator UI in Cursor Cloud when computerUse is flaky or SetupGate blocks routes. Use for walkthrough screenshots, Memory/chat banners, and Settings toggles.
---

# Cloud Agent UI testing

Use this when you need proof the web UI works in Cloud Agent VMs. Prefer API + package tests first; open the browser only for UI-visible changes.

## Unlock SetupGate quickly

`SetupGate` hides the app until `GET /api/status` reports both `githubTokenConfigured` and `claudeInstalled`.

```bash
# From repo root — dummy token is enough for status Boolean checks
cat > .env <<'EOF'
GITHUB_TOKEN=ghp_demo_token_for_ui_boot
CLAUDE_BIN=/workspace/apps/server/data/.bin/claude
DATA_DIR=./data
PORT=3001
HOST=0.0.0.0
EOF

mkdir -p apps/server/data/.bin
cat > apps/server/data/.bin/claude <<'EOF'
#!/bin/sh
[ "$1" = "--version" ] && { echo "Claude Code 0.0.0-demo"; exit 0; }
exit 0
EOF
chmod +x apps/server/data/.bin/claude

# Restart pnpm dev so the API reloads env
```

Confirm: `curl -s http://localhost:3001/api/status` shows both flags `true`.

Real GitHub clone/PR work still needs a real token secret.

## Screenshots without computerUse

Live SSE prevents `networkidle0` / plain `google-chrome --screenshot` from exiting reliably.

```bash
# One-shot puppeteer-core against the system Chrome
cd /tmp && npm pack puppeteer-core@24 >/dev/null
mkdir -p /tmp/pp && tar -xzf puppeteer-core-*.tgz -C /tmp/pp
cd /tmp/pp/package && npm install --omit=dev >/dev/null
```

In the script: `waitUntil: 'domcontentloaded'`, then `waitForFunction` on visible copy (e.g. `Session analysis`, `Save memory`, `Review draft`). Save under `/opt/cursor/artifacts/`.

Executable: `/usr/bin/google-chrome-stable` with `--no-sandbox --disable-dev-shm-usage`.

## Seed data without cloning

When no GitHub token, insert workspace/worktree/agent via `pnpm --filter @agent-orchestrator/server exec tsx` using `initDatabase` + `createRepositories`. The running API often uses `apps/server/data` as `DATA_DIR`.

For instruction-offer UI: set session `template` to `build`/`fix-ci`, `setGrade` with instruction/skill findings, and `automationState.set('instruction-draft.offer:<agentId>', JSON.stringify(offer))`.

## Efficiency checklist

- Do not retry hung headless Chrome more than once — switch to puppeteer + `domcontentloaded`
- Do not explore SetupGate source if `/api/status` already shows the blockers
- Keep walkthrough artifacts minimal: settings/feature surface, primary interaction, result state
- After changing `@agent-orchestrator/shared`, rebuild shared before server tests that import it
