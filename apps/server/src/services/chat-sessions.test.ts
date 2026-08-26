import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import {
  CHAT_SESSION_TEMPLATES,
  LISTED_CHAT_SESSION_TEMPLATES,
  buildImplementPlanPrompt,
} from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  buildApprovedPlan,
  createAgentSession,
  deleteAgentSession,
  getAgentDetail,
  getAgentMessages,
  streamAgentChat,
  type AppContext,
} from './app.js';
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

async function seedAgent(tmp: string): Promise<{ ctx: AppContext; agent: Agent }> {
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
    process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-new' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'Working.' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Working.',
      session_id: 'claude-new',
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
    anthropic: new AnthropicService(),
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
    claudeSessionId: 'claude-plan',
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);

  const session = repos.sessions.create({
    id: 'plan-sess',
    agentId: agent.id,
    title: 'Chat',
    template: 'chat',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: 'claude-plan',
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  repos.agents.update({ ...agent, activeSessionId: session.id });
  repos.messages.create({
    id: 'u1',
    agentId: agent.id,
    sessionId: session.id,
    role: 'user',
    content: 'plan a feature',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:01.000Z',
  });
  repos.messages.create({
    id: 'a1',
    agentId: agent.id,
    sessionId: session.id,
    role: 'assistant',
    content: '## Plan\n\n1. Do the thing.',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:02.000Z',
  });

  return { ctx, agent: repos.agents.getById(agent.id)! };
}

test('listed templates include Create draft PR and Review', () => {
  const ids = LISTED_CHAT_SESSION_TEMPLATES.map((item) => item.id);
  assert.deepEqual(ids, ['chat', 'create-draft-pr', 'review']);
  for (const template of CHAT_SESSION_TEMPLATES) {
    assert.ok(!template.prompt?.includes('ExitPlanMode'));
    assert.ok(!template.prompt?.includes('AskUserQuestion'));
  }
  assert.ok(buildImplementPlanPrompt('# Plan').includes('Approved plan'));
});

test('createAgentSession starts a parallel session without touching the original', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-sess-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('plan-sess')!,
      status: 'running',
      pid: 1234,
      updatedAt: new Date().toISOString(),
    });

    const created = await createAgentSession(ctx, agent.id, { template: 'review' });
    assert.equal(created.session.template, 'review');
    assert.equal(created.session.permissionMode, 'plan');
    assert.ok(created.kickoffPrompt?.includes('Review'));
    assert.equal(created.session.status, 'idle');

    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 2);
    const original = sessions.find((item) => item.id === 'plan-sess');
    assert.equal(original?.status, 'running');
    assert.equal(original?.pid, 1234);
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, created.session.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('buildApprovedPlan stashes the plan session and streams into a new Build session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-build-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const { res, chunks } = mockResponse();
    await buildApprovedPlan(
      ctx,
      agent.id,
      { plan: '## Plan\n\n1. Do the thing.' },
      res,
      'plan-sess',
    );

    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 2);
    const plan = sessions.find((item) => item.id === 'plan-sess');
    const build = sessions.find((item) => item.template === 'build');
    assert.ok(build);
    assert.equal(plan?.claudeSessionId, 'claude-plan');
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.ok(ctx.repos.messages.listBySession(build!.id).length >= 1);
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, build?.id);
    assert.ok(chunks.some((chunk) => chunk.includes('event: session')));
    assert.deepEqual(
      getAgentMessages(ctx, agent.id, 'plan-sess').map((item) => item.id),
      ['u1', 'a1'],
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('getAgentDetail includes sessions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-detail-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const detail = await getAgentDetail(ctx, agent.id);
    assert.equal(detail.sessions.length, 1);
    assert.equal(detail.activeSessionId, 'plan-sess');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession removes a session and keeps the other', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const created = await createAgentSession(ctx, agent.id, { template: 'review' });
    ctx.repos.messages.create({
      id: 'r1',
      agentId: agent.id,
      sessionId: created.session.id,
      role: 'user',
      content: 'review this',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:03.000Z',
    });
    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, 2);

    const detail = await deleteAgentSession(ctx, agent.id, created.session.id);
    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, 'plan-sess');
    assert.equal(detail.activeSessionId, 'plan-sess');
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.equal(ctx.repos.messages.listBySession(created.session.id).length, 0);
    assert.equal(ctx.repos.sessions.getById(created.session.id), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession recreates a chat session when deleting the last one', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-last-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const detail = await deleteAgentSession(ctx, agent.id, 'plan-sess');
    assert.equal(detail.sessions.length, 1);
    assert.notEqual(detail.sessions[0]?.id, 'plan-sess');
    assert.equal(detail.sessions[0]?.title, 'New chat');
    assert.equal(detail.sessions[0]?.template, 'chat');
    assert.equal(detail.activeSessionId, detail.sessions[0]?.id);
    assert.equal(ctx.repos.messages.listBySession(detail.sessions[0]!.id).length, 0);
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession rejects archived agents', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-arch-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.agents.update({
      ...ctx.repos.agents.getById(agent.id)!,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => deleteAgentSession(ctx, agent.id, 'plan-sess'),
      /archived/,
    );
    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

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
      claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
      anthropic: new AnthropicService(),
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
      claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
      anthropic: new AnthropicService(),
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
