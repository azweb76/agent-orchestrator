import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { followAgentSession, streamAgentChat, type AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';

async function writeFakeClaude(binPath: string, script: string): Promise<void> {
  await fs.writeFile(binPath, script, { mode: 0o755 });
}

function mockResponse(): { res: Response; chunks: string[] } {
  const chunks: string[] = [];
  const res = {
    chunks,
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    writableEnded: false,
    socket: undefined,
    on: () => undefined,
    write(chunk: unknown) {
      chunks.push(String(chunk));
      return true;
    },
    end(chunk?: unknown) {
      if (chunk) chunks.push(String(chunk));
      res.writableEnded = true;
      return res;
    },
  };
  return { res: res as unknown as Response, chunks };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('timed out waiting for condition');
}

async function seed(
  tmp: string,
  script?: string,
): Promise<{ ctx: AppContext; agent: Agent }> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const binPath = path.join(tmp, 'fake-claude');
  await writeFakeClaude(
    binPath,
    script ??
      `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'user') {
    process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-follow' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'Live.' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Live.',
      session_id: 'claude-follow',
    }) + '\\n');
    process.exit(0);
  }
});
`,
  );

  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
    anthropic: { suggestChatTitle: async () => 'Stub title' } as unknown as AnthropicService,
    dataDir: tmp,
  };

  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Workspace);
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'agent-1',
    path: tmp,
    branch: 'feat',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Worktree);
  repos.agents.create({
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'Agent',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  } satisfies Agent);
  repos.sessions.create({
    id: 'sess-1',
    agentId: 'ag-1',
    title: 'Chat',
    template: 'chat',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return { ctx, agent: repos.agents.getById('ag-1')! };
}

test('followAgentSession heals leftover streaming on an idle session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-follow-idle-'));
  try {
    const { ctx } = await seed(tmp);
    ctx.repos.messages.create({
      id: 'a1',
      agentId: 'ag-1',
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'Partial',
      attachments: [],
      metadata: { streaming: true, timeline: [] },
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    const { res, chunks } = mockResponse();
    await followAgentSession(ctx, 'ag-1', 'sess-1', res);

    const assistant = ctx.repos.messages.getById('ag-1', 'a1');
    assert.equal(assistant?.metadata.streaming, false);
    assert.ok(chunks.some((chunk) => chunk.includes('event: done')));
    assert.ok(chunks.some((chunk) => chunk.includes('"streaming":false')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('followAgentSession tails a running chat without stealing the process', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-follow-live-'));
  try {
    const { ctx } = await seed(
      tmp,
      `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-slow' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'One' } },
  }) + '\\n');
  setTimeout(() => {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'Two' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'OneTwo',
      session_id: 'claude-slow',
    }) + '\\n');
    process.exit(0);
  }, 250);
});
`,
    );

    const chat = mockResponse();
    const chatPromise = streamAgentChat(ctx, 'ag-1', { message: 'go' }, chat.res, 'sess-1');
    await waitFor(() => ctx.repos.sessions.getById('sess-1')?.status === 'running');

    const follow = mockResponse();
    const followPromise = followAgentSession(ctx, 'ag-1', 'sess-1', follow.res);
    await Promise.all([chatPromise, followPromise]);

    assert.equal(ctx.repos.sessions.getById('sess-1')?.status, 'idle');
    assert.ok(follow.chunks.some((chunk) => chunk.includes('event: done')));
    const assistant = ctx.repos.messages.listBySession('sess-1').find((item) => item.role === 'assistant');
    assert.equal(assistant?.metadata.streaming, false);
    assert.match(assistant?.content ?? '', /OneTwo|One/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
