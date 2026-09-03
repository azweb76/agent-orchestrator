import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { uniqueSessionTitle } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  createAgentSession,
  streamAgentChat,
  updateAgentSession,
  type AppContext,
} from './app.js';
import type { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';

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

function stubAnthropic(
  suggestChatTitle: (prompt: string) => Promise<string> = async (prompt) => prompt,
): AnthropicService {
  return {
    suggestChatTitle,
  } as unknown as AnthropicService;
}

async function seed(tmp: string, anthropic: AnthropicService = stubAnthropic()): Promise<{
  ctx: AppContext;
  agent: Agent;
}> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const binPath = path.join(tmp, 'fake-claude');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'user') {
    process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-title' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Working.',
      session_id: 'claude-title',
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
    jira: new JiraService({}),
    claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
    anthropic,
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

  const agent: Agent = {
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
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);

  const session = repos.sessions.create({
    id: 'sess-1',
    agentId: agent.id,
    title: 'New chat',
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
    titleSource: 'default',
  });
  repos.agents.update({ ...agent, activeSessionId: session.id });
  return { ctx, agent: ctx.repos.agents.getById(agent.id)! };
}

test('uniqueSessionTitle appends a numeric suffix for collisions', () => {
  assert.equal(uniqueSessionTitle(['New chat'], 'New chat'), 'New chat 2');
  assert.equal(uniqueSessionTitle(['New chat', 'New chat 2'], 'New chat'), 'New chat 3');
  assert.equal(uniqueSessionTitle(['Review'], 'Add dark mode'), 'Add dark mode');
  assert.equal(uniqueSessionTitle([], '  '), 'Chat');
});

test('createAgentSession records default vs user title sources', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-create-'));
  try {
    const { ctx, agent } = await seed(tmp);
    const created = await createAgentSession(ctx, agent.id, { template: 'review' });
    assert.equal(created.session.title, 'Review');
    assert.equal(created.session.titleSource, 'default');

    const named = await createAgentSession(ctx, agent.id, { title: 'Login retry' });
    assert.equal(named.session.title, 'Login retry');
    assert.equal(named.session.titleSource, 'user');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('updateAgentSession marks a renamed title as user-owned', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-rename-'));
  try {
    const { ctx, agent } = await seed(tmp);
    const updated = await updateAgentSession(ctx, agent.id, 'sess-1', { title: 'Retries' });
    assert.equal(updated.title, 'Retries');
    assert.equal(updated.titleSource, 'user');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat auto-names the first prompt via the agent API', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-auto-'));
  try {
    const { ctx } = await seed(
      tmp,
      stubAnthropic(async () => 'Add Dark Mode'),
    );
    const { res, chunks } = mockResponse();
    await streamAgentChat(ctx, 'ag-1', { message: 'Please add a dark mode toggle' }, res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.title, 'Add Dark Mode');
    assert.equal(session?.titleSource, 'auto');
    assert.ok(chunks.some((chunk) => chunk.includes('Add Dark Mode')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat does not overwrite a user-renamed title', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-locked-'));
  try {
    const { ctx, agent } = await seed(
      tmp,
      stubAnthropic(async () => 'Should Not Apply'),
    );
    await updateAgentSession(ctx, agent.id, 'sess-1', { title: 'My name' });
    const { res } = mockResponse();
    await streamAgentChat(ctx, 'ag-1', { message: 'Please add a dark mode toggle' }, res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.title, 'My name');
    assert.equal(session?.titleSource, 'user');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat only auto-names the first user turn', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-second-'));
  let calls = 0;
  try {
    const { ctx } = await seed(
      tmp,
      stubAnthropic(async () => {
        calls += 1;
        return calls === 1 ? 'First Title' : 'Second Title';
      }),
    );
    await streamAgentChat(ctx, 'ag-1', { message: 'first prompt' }, mockResponse().res, 'sess-1');
    await streamAgentChat(ctx, 'ag-1', { message: 'follow up' }, mockResponse().res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.title, 'First Title');
    assert.equal(calls, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat falls back to the prompt when the agent API fails', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-fallback-'));
  try {
    const { ctx } = await seed(
      tmp,
      stubAnthropic(async () => {
        throw new Error('no credentials');
      }),
    );
    await streamAgentChat(
      ctx,
      'ag-1',
      { message: 'Please add retry logic for the API client now' },
      mockResponse().res,
      'sess-1',
    );

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.title, 'Please add retry logic for the');
    assert.equal(session?.titleSource, 'auto');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat uniquifies an auto title against sibling sessions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-title-unique-'));
  try {
    const { ctx, agent } = await seed(
      tmp,
      stubAnthropic(async () => 'Add Dark Mode'),
    );
    ctx.repos.sessions.create({
      id: 'sess-other',
      agentId: agent.id,
      title: 'Add Dark Mode',
      template: 'chat',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      titleSource: 'auto',
    });
    await streamAgentChat(ctx, 'ag-1', { message: 'dark mode please' }, mockResponse().res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.title, 'Add Dark Mode 2');
    assert.equal(session?.titleSource, 'auto');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
