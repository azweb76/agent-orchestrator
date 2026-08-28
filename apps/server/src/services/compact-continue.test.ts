import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { compactAndContinueSession } from './compact-continue.js';
import type { AppContext } from './app.js';
import type { AnthropicService } from './anthropic.js';
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

interface CapturedRun {
  id: string;
  prompt: string;
  sessionId: string | null | undefined;
  permissionMode: string | undefined;
}

function mockClaude(options: { runs: CapturedRun[]; stopped: string[] }): ClaudeService {
  return {
    getRunningProcess: () => undefined,
    listPendingPermissions: () => [],
    stop: (id: string) => {
      options.stopped.push(id);
      return true;
    },
    runStreaming: async (
      id: string,
      opts: {
        prompt: string;
        sessionId?: string | null;
        permissionMode?: string;
        onStarted?: (handle: { pid: number; logPath: string }) => void;
      },
    ) => {
      options.runs.push({
        id,
        prompt: opts.prompt,
        sessionId: opts.sessionId,
        permissionMode: opts.permissionMode,
      });
      return { result: 'done', sessionId: `claude-${id}`, events: [], stopped: false };
    },
  } as unknown as ClaudeService;
}

function stubAnthropic(options: {
  summaries: Array<{ title: string; transcript: string }>;
  summary?: string;
  fail?: boolean;
}): AnthropicService {
  return {
    suggestChatTitle: async () => 'Stub title',
    summarizeSessionForContinuation: async (input: { title: string; transcript: string }) => {
      options.summaries.push(input);
      if (options.fail) throw new Error('summarizer unavailable');
      return options.summary ?? 'Summary of prior work.';
    },
  } as unknown as AnthropicService;
}

async function seedAgent(tmp: string): Promise<{ ctx: AppContext; agent: Agent }> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(path.join(tmp, 'unused-claude'), path.join(tmp, 'runs')),
    anthropic: stubAnthropic({ summaries: [] }),
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
  repos.sessions.create({
    id: 'hot-sess',
    agentId: agent.id,
    title: 'Login fixes',
    template: 'chat',
    status: 'idle',
    model: 'opus',
    effort: 'max',
    permissionMode: 'acceptEdits',
    claudeSessionId: 'claude-hot',
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  repos.agents.update({ ...agent, activeSessionId: 'hot-sess' });
  repos.messages.create({
    id: 'u1',
    agentId: agent.id,
    sessionId: 'hot-sess',
    role: 'user',
    content: 'Please fix the login bug in src/auth/login.ts',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:01.000Z',
  });
  repos.messages.create({
    id: 'a1',
    agentId: agent.id,
    sessionId: 'hot-sess',
    role: 'assistant',
    content: 'Patched the token check.',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:02.000Z',
  });
  return { ctx, agent: repos.agents.getById(agent.id)! };
}

test('compact-and-continue stashes the session and seeds a continuation', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-compact-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const runs: CapturedRun[] = [];
    const stopped: string[] = [];
    const summaries: Array<{ title: string; transcript: string }> = [];
    ctx.claude = mockClaude({ runs, stopped });
    ctx.anthropic = stubAnthropic({ summaries });
    ctx.repos.queued.create({
      id: 'q1',
      agentId: agent.id,
      sessionId: 'hot-sess',
      content: 'stale follow-up',
      attachments: [],
      createdAt: '2026-01-01T00:00:03.000Z',
    });

    const { res } = mockResponse();
    await compactAndContinueSession(ctx, agent.id, res, 'hot-sess');

    // Summarizer saw the transcript of the hot session.
    assert.equal(summaries.length, 1);
    assert.match(summaries[0]!.transcript, /fix the login bug/);
    assert.equal(summaries[0]!.title, 'Login fixes');

    // A continuation session exists with the same template/mode/model/effort.
    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    const continuation = sessions.find((item) => item.id !== 'hot-sess');
    assert.ok(continuation);
    assert.equal(continuation.title, 'Login fixes (continued)');
    assert.equal(continuation.template, 'chat');
    assert.equal(continuation.permissionMode, 'acceptEdits');
    assert.equal(continuation.model, 'opus');
    assert.equal(continuation.effort, 'max');
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, continuation.id);

    // The continuation ran as a fresh Claude session seeded with the summary.
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.id, continuation.id);
    assert.equal(runs[0]!.sessionId ?? null, null);
    assert.equal(runs[0]!.permissionMode, 'acceptEdits');
    assert.match(runs[0]!.prompt, /## Session summary/);
    assert.match(runs[0]!.prompt, /Summary of prior work\./);
    assert.match(runs[0]!.prompt, /## Files in play/);
    assert.match(runs[0]!.prompt, /src\/auth\/login\.ts/);

    // The stashed session is untouched: transcript and Claude session survive.
    assert.equal(ctx.repos.messages.listBySession('hot-sess').length, 2);
    assert.equal(ctx.repos.sessions.getById('hot-sess')?.claudeSessionId, 'claude-hot');
    // Stale follow-ups were dropped so they cannot fire on the stashed session.
    assert.equal(ctx.repos.queued.listBySession('hot-sess').length, 0);

    const event = ctx.repos.events
      .listByAgent(agent.id)
      .find((item) => item.type === 'session_compacted');
    assert.ok(event);
    assert.equal(event.data.stashedSessionId, 'hot-sess');
    assert.equal(event.data.sessionId, continuation.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('compact-and-continue stops a running session before continuing', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-compact-stop-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const runs: CapturedRun[] = [];
    const stopped: string[] = [];
    ctx.claude = mockClaude({ runs, stopped });
    ctx.anthropic = stubAnthropic({ summaries: [] });
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('hot-sess')!,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    const { res } = mockResponse();
    await compactAndContinueSession(ctx, agent.id, res, 'hot-sess');

    assert.ok(stopped.includes('hot-sess'));
    assert.equal(ctx.repos.sessions.getById('hot-sess')?.status, 'idle');
    assert.equal(runs.length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('compact-and-continue rejects when the session has no messages', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-compact-empty-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.messages.deleteBySession('hot-sess');
    const before = ctx.repos.sessions.listByAgent(agent.id).length;

    const { res } = mockResponse();
    await assert.rejects(
      compactAndContinueSession(ctx, agent.id, res, 'hot-sess'),
      /Nothing to compact/,
    );
    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, before);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('a summarizer failure leaves the session untouched', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-compact-fail-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const stopped: string[] = [];
    ctx.claude = mockClaude({ runs: [], stopped });
    ctx.anthropic = stubAnthropic({ summaries: [], fail: true });
    ctx.repos.queued.create({
      id: 'q1',
      agentId: agent.id,
      sessionId: 'hot-sess',
      content: 'keep me',
      attachments: [],
      createdAt: '2026-01-01T00:00:03.000Z',
    });
    const before = ctx.repos.sessions.listByAgent(agent.id).length;

    const { res } = mockResponse();
    await assert.rejects(
      compactAndContinueSession(ctx, agent.id, res, 'hot-sess'),
      /summarizer unavailable/,
    );

    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, before);
    assert.equal(stopped.length, 0);
    assert.equal(ctx.repos.queued.listBySession('hot-sess').length, 1);
    assert.equal(ctx.repos.messages.listBySession('hot-sess').length, 2);
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, 'hot-sess');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
