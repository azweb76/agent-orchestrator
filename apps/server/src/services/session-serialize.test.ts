import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  buildApprovedPlan,
  createAgentSession,
  streamAgentChat,
  type AppContext,
} from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';

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
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(path.join(tmp, 'unused-claude'), path.join(tmp, 'runs')),
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

async function waitFor(check: () => boolean, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function mockClaude(
  tmp: string,
  options: {
    holdIds?: Set<string>;
    starts: string[];
    stopped: string[];
  },
): ClaudeService {
  const running = new Set<string>();
  const releases = new Map<string, () => void>();
  return {
    getRunningProcess: (id: string) =>
      running.has(id) ? { pid: 424_242, logPath: path.join(tmp, `${id}.log`) } : undefined,
    stop: (id: string) => {
      running.delete(id);
      options.stopped.push(id);
      releases.get(id)?.();
    },
    runStreaming: async (
      id: string,
      opts: { onStarted?: (handle: { pid: number; logPath: string }) => void },
    ) => {
      options.starts.push(id);
      running.add(id);
      opts.onStarted?.({ pid: 424_242, logPath: path.join(tmp, `${id}.log`) });
      if (options.holdIds?.has(id)) {
        await new Promise<void>((resolve) => {
          releases.set(id, resolve);
        });
      }
      running.delete(id);
      return { result: 'done', sessionId: `claude-${id}`, events: [], stopped: false };
    },
  } as unknown as ClaudeService;
}

test('a second mutating session waits until the running one finishes', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-lock-serial-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const starts: string[] = [];
    const stopped: string[] = [];
    const createdBuild = await createAgentSession(ctx, agent.id, { template: 'build' });
    const buildSession = createdBuild.session;
    const createdPr = await createAgentSession(ctx, agent.id, { template: 'create-draft-pr' });
    const prSession = createdPr.session;
    const holdIds = new Set([buildSession.id]);
    ctx.claude = mockClaude(tmp, { starts, stopped, holdIds });

    const buildRun = streamAgentChat(ctx, agent.id, { message: 'implement the plan' }, null, buildSession.id);
    await waitFor(() => ctx.repos.sessions.getById(buildSession.id)?.status === 'running');

    await streamAgentChat(ctx, agent.id, { message: 'open a draft PR' }, null, prSession.id);
    assert.equal(ctx.repos.sessions.getById(prSession.id)?.status, 'queued');
    assert.equal(ctx.repos.queued.listBySession(prSession.id).length, 1);
    assert.deepEqual(starts, [buildSession.id]);
    assert.equal(ctx.repos.sessions.getById(buildSession.id)?.status, 'running');

    ctx.claude.stop(buildSession.id);
    await buildRun;
    await waitFor(() => starts.includes(prSession.id));
    await waitFor(() => ctx.repos.sessions.getById(prSession.id)?.status === 'idle');
    assert.deepEqual(starts, [buildSession.id, prSession.id]);
    assert.equal(ctx.repos.queued.listBySession(prSession.id).length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('review and chat sessions still run in parallel with a mutating session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-lock-parallel-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const starts: string[] = [];
    const createdBuild = await createAgentSession(ctx, agent.id, { template: 'build' });
    const buildSession = createdBuild.session;
    const createdReview = await createAgentSession(ctx, agent.id, { template: 'review' });
    const holdIds = new Set([buildSession.id]);
    ctx.claude = mockClaude(tmp, { starts, stopped: [], holdIds });

    const buildRun = streamAgentChat(ctx, agent.id, { message: 'implement the plan' }, null, buildSession.id);
    await waitFor(() => ctx.repos.sessions.getById(buildSession.id)?.status === 'running');

    await streamAgentChat(ctx, agent.id, { message: 'review the diff' }, null, createdReview.session.id);
    await streamAgentChat(ctx, agent.id, { message: 'what is left?' }, null, 'plan-sess');

    assert.equal(ctx.repos.sessions.getById(createdReview.session.id)?.status, 'idle');
    assert.equal(ctx.repos.sessions.getById('plan-sess')?.status, 'idle');
    assert.ok(starts.includes(buildSession.id));
    assert.ok(starts.includes(createdReview.session.id));
    assert.ok(starts.includes('plan-sess'));
    assert.equal(ctx.repos.sessions.getById(buildSession.id)?.status, 'running');
    ctx.claude.stop(buildSession.id);
    await buildRun;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('force-send starts a mutating session by stopping the running peer', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-lock-force-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const starts: string[] = [];
    const stopped: string[] = [];
    const createdBuild = await createAgentSession(ctx, agent.id, { template: 'build' });
    const buildSession = createdBuild.session;
    const createdPr = await createAgentSession(ctx, agent.id, { template: 'create-draft-pr' });
    const holdIds = new Set([buildSession.id]);
    ctx.claude = mockClaude(tmp, { starts, stopped, holdIds });

    const buildRun = streamAgentChat(ctx, agent.id, { message: 'implement the plan' }, null, buildSession.id);
    await waitFor(() => ctx.repos.sessions.getById(buildSession.id)?.status === 'running');

    await streamAgentChat(
      ctx,
      agent.id,
      { message: 'open a draft PR now', force: true },
      null,
      createdPr.session.id,
    );

    assert.ok(stopped.includes(buildSession.id));
    assert.ok(starts.includes(createdPr.session.id));
    assert.equal(ctx.repos.sessions.getById(createdPr.session.id)?.status, 'idle');
    await buildRun;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('buildApprovedPlan queues behind a running mutating session instead of killing it', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-lock-build-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const starts: string[] = [];
    ctx.claude = mockClaude(tmp, { starts, stopped: [] });

    const createdPr = await createAgentSession(ctx, agent.id, { template: 'create-draft-pr' });
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById(createdPr.session.id)!,
      status: 'running',
      pid: 99,
      updatedAt: new Date().toISOString(),
    });

    const { res, chunks } = mockResponse();
    await buildApprovedPlan(ctx, agent.id, { plan: '## Plan\n\n1. Do the thing.' }, res, 'plan-sess');

    const build = ctx.repos.sessions.listByAgent(agent.id).find((item) => item.template === 'build');
    assert.ok(build);
    assert.equal(build.status, 'queued');
    assert.equal(ctx.repos.queued.listBySession(build.id).length, 1);
    assert.equal(ctx.repos.sessions.getById(createdPr.session.id)?.status, 'running');
    assert.equal(starts.length, 0);
    assert.ok(chunks.some((chunk) => chunk.includes('"status":"queued"')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
