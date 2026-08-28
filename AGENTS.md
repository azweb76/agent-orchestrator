---
name: agents-md
description: Project-level instructions for working on this multi-agent chat platform codebase
---

# Project Instructions: Multi-Agent Chat Platform

This is a TypeScript monorepo (web frontend + Node.js server) for a multi-agent chat platform. You are working with a human developer who approves plans before implementation.

## Repository Structure

- `apps/web/` — React (Vite) frontend with Tanstack Query for data fetching
- `apps/server/` — Node.js backend serving SSE-based chat streams
- Shared packages in `packages/` (if present)

## Development Workflow

1. **Plan approval required**: When given a task, present a plan and wait for explicit approval before implementing.
2. **Auto mode after approval**: Once approved, implement in auto mode—make progress with sensible defaults, don't ask clarifying questions unless truly blocked.
3. **Named-branch worktrees**: Work is typically done in git worktrees tracking named branches off `origin/main`.
4. **Verification before commit**: Always run tests, typecheck, and lint before committing. Run `semgrep` (via `/semgrep` skill) as a final security/quality gate.
5. **Integration options**: After committing, present three options: (1) merge to main locally, (2) push and create PR, (3) leave as-is.

## Key Technical Patterns

### Frontend (apps/web)

- **State management**: Tanstack Query (`queryClient`) for server state; React hooks for local UI state.
- **Chat streaming**: SSE connection per session in `useChatStreaming.ts`. Incoming frames route through `createChatStreamHandlers.ts` → `streamingPatchBuffer.ts` → cache updates.
- **Message identity**: Every assistant message has a stable `id` from the server. Use this id (not heuristics or scanning) to target streaming updates.
- **Rendering**: One `Message` object = one chat bubble. No grouping logic for consecutive messages—each renders independently (`ChatTranscriptList.tsx` → `useChatPanelRenderers.tsx` → `MessageTimeline.tsx`/`ChatBubble.tsx`).

### Backend (apps/server)

- **SSE streams**: `chat-stream.ts` and `chat-follow.ts` emit structured frames: `assistant_message` (stub with id), `token`, `event`, `error`, `done`.
- **Message id contract**: Server emits `assistant_message` frame with stable `id` *before* any `token`/`event` frames for that turn. Frontend must use this id to route subsequent frames.

## Common Pitfalls (Learned from This Session)

### Avoid Scanning/Heuristics for Message Targeting

**Anti-pattern**: Scanning backward through a messages array with a permissive predicate to find "the currently streaming assistant message."

```ts
// BAD: finds the last assistant message matching a heuristic
for (let i = messages.length - 1; i >= 0; i--) {
  if (messages[i].role === 'assistant' && someHeuristic(messages[i])) {
    messages[i] = mutate(messages[i]);
    break;
  }
}
```

**Why it fails**: Under concurrent streams (e.g., aborting old stream + new stream starting) or rapid consecutive turns, the scan finds the wrong (earlier, completed) message and appends new text to it.

**Correct pattern**: Track the exact message id in the SSE handler closure; pass it explicitly to every patch function.

```ts
// GOOD: track id from assistant_message frame, patch strictly by id
let currentAssistantMessageId: string | undefined;

onAssistantMessage: (msg) => {
  currentAssistantMessageId = msg.id;
},
onToken: (token) => {
  if (currentAssistantMessageId) {
    patchById(currentAssistantMessageId, (m) => appendToken(m, token));
  }
}
```

### Minimize Redundant File Reads and Verification Cycles

**Observed inefficiency**: This session consumed ~5.9M tokens over 67 turns for a 6-file fix. Root causes:

1. **Repeated file reads**: Re-reading large unchanged files (e.g., `useChatStreaming.ts`, `createChatStreamHandlers.ts`) multiple times after edits.
2. **Redundant verification**: Running tests/lint 3+ times after the first green result.
3. **Environmental noise**: Spending multiple turns on missing `node_modules` warnings before installing dependencies.

**Best practices**:

- After editing a file, **do not re-read it** unless you need to verify a specific detail.
- After tests pass once, **do not re-run** unless you make further changes.
- **Batch verifications**: Run `npm test && npm run typecheck && npm run lint` in one turn, not separately across multiple turns.
- **Install dependencies early**: If you see import errors, run `npm install` immediately—don't spend turns theorizing.

### Scope Instruction Files to Relevant Work

**Observed bloat**: 22 instruction files (~192k chars) loaded per turn, but only 3 were relevant (superpowers:executing-plans, superpowers:finishing-a-development-branch, /semgrep). The other 18 (~150k chars)—AWS, GHA, Playwright, MUI, etc.—were unrelated to a React/TypeScript frontend bug fix.

**Recommendation**: Use `.claudeignore` or per-session skill scoping to exclude backend/infra/platform skills when working on focused frontend tasks. Load only what's needed for the current context.

## Verification Checklist (Before Every Commit)

1. **Tests**: `npm test` (or workspace-specific command) — all green.
2. **Typecheck**: `npm run typecheck` (or `tsc --noEmit`) — no errors.
3. **Lint**: `npm run lint` — no errors (or only pre-existing warnings).
4. **Semgrep**: Run `/semgrep` skill — no new high/medium findings in your changed files.
5. **Manual spot-check** (optional but recommended): For UI changes, describe what you'd verify in a browser (e.g., "two consecutive assistant turns now render as separate bubbles").

## Skills Used in This Session

- `superpowers:executing-plans` — load approved plan, set up todos, drive implementation.
- `superpowers:finishing-a-development-branch` — verify tests, detect worktree, present integration options.
- `/semgrep` — scan codebase for security/quality issues before committing.

## When to Write AGENTS.md Updates

Update this file when:

- A new anti-pattern is discovered (like the message-targeting bug).
- A workflow convention changes (e.g., new pre-commit hooks, different test commands).
- A major architectural pattern emerges (e.g., how to handle WebSocket reconnects).

Do not update for one-off implementation details or API-specific fixes.
