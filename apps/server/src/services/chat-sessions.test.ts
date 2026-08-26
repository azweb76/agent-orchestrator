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
  getAgentDetail,
  getAgentMessages,
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
