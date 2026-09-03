import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import { streamAgentChat, type AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { mockResponse, writeFakeClaude } from './chat-sessions.test-helpers.js';

test('streamAgentChat goes idle after a result even if Claude keeps running', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-idle-'));
  try {
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
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-hi' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'Hi! Plan mode is on.' }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Hi! Plan mode is on.',
    session_id: 'claude-hi',
  }) + '\\n');
});
setInterval(() => {}, 1000);
`,
    );

    const ctx: AppContext = {
      repos,
      git: new GitService(),
      github: new GitHubService({}),
      jira: new JiraService({}),
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
    });
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
    });
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
    });
    repos.sessions.create({
      id: 'sess-1',
      agentId: 'ag-1',
      title: 'New chat 2',
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

    const { res, chunks } = mockResponse();
    await streamAgentChat(ctx, 'ag-1', { message: 'hi' }, res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.status, 'idle');
    assert.equal(session?.pid, null);
    const assistant = ctx.repos.messages
      .listBySession('sess-1')
      .find((item) => item.role === 'assistant');
    assert.equal(assistant?.content, 'Hi! Plan mode is on.');
    assert.equal(assistant?.metadata.streaming, false);
    assert.equal(ctx.repos.agents.getById('ag-1')?.status, 'idle');
    assert.ok(chunks.some((chunk) => chunk.includes('event: done')));
    assert.ok(
      chunks.some((chunk) => chunk.includes('"status":"running"')),
      'chat SSE must publish the session after it is marked running so the UI can poll/follow',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat keeps nested Explore text out of the parent message', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-nested-'));
  try {
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
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-parent' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'assistant',
    message: { content: [{
      type: 'tool_use',
      id: 'tool_explore',
      name: 'Task',
      input: { subagent_type: 'Explore', description: 'Analyze conflicts' },
    }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    parent_tool_use_id: 'tool_explore',
    event: { delta: { type: 'text_delta', text: 'No nested guidance for release-manager/.' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    parent_tool_use_id: 'tool_explore',
    result: 'Conflicts are in src/merge.ts',
    session_id: 'claude-explore',
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Here is the plan.' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Here is the plan.',
    session_id: 'claude-parent',
  }) + '\\n');
  process.exit(0);
});
`,
    );

    const ctx: AppContext = {
      repos,
      git: new GitService(),
      github: new GitHubService({}),
      jira: new JiraService({}),
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
    });
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
    });
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
    });
    repos.sessions.create({
      id: 'sess-1',
      agentId: 'ag-1',
      title: 'New chat 2',
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

    const { res } = mockResponse();
    await streamAgentChat(ctx, 'ag-1', { message: 'plan the merge' }, res, 'sess-1');

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.claudeSessionId, 'claude-parent');
    const assistant = ctx.repos.messages
      .listBySession('sess-1')
      .find((item) => item.role === 'assistant');
    assert.equal(assistant?.content, 'Here is the plan.');
    assert.equal(assistant?.content.includes('No nested guidance'), false);
    const explore = assistant?.metadata.timeline?.find(
      (part) => part.type === 'tool' && part.id === 'tool_explore',
    );
    assert.equal(explore?.type === 'tool' && explore.status, 'done');
    assert.match((explore && explore.type === 'tool' && explore.detail) || '', /No nested guidance|Conflicts are in src\/merge/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat does not persist [no output] for an empty Claude result', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-empty-'));
  try {
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
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-empty' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: '',
    session_id: 'claude-empty',
    total_cost_usd: 0,
  }) + '\\n');
  process.exit(0);
});
`,
    );

    const ctx: AppContext = {
      repos,
      git: new GitService(),
      github: new GitHubService({}),
      jira: new JiraService({}),
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
    });
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
    });
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
    });
    repos.sessions.create({
      id: 'sess-1',
      agentId: 'ag-1',
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
    });

    const { res } = mockResponse();
    await streamAgentChat(ctx, 'ag-1', { message: 'did you stall?' }, res, 'sess-1');

    const assistant = ctx.repos.messages
      .listBySession('sess-1')
      .find((item) => item.role === 'assistant');
    assert.equal(assistant?.content, '');
    assert.equal(assistant?.content.includes('[no output]'), false);
    assert.equal(assistant?.metadata.streaming, false);
    assert.equal(ctx.repos.sessions.getById('sess-1')?.claudeSessionId, 'claude-empty');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
