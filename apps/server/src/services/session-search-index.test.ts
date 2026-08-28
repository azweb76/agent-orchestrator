import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { Notifier } from './notifier.js';
import {
  refreshSessionSearchIndex,
  searchSessionTranscripts,
  summarizeAssistantContent,
} from './session-search-index.js';

async function seed(tmp: string): Promise<AppContext> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: {} as AnthropicService,
    dataDir: tmp,
    notifier: new Notifier(),
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
    branch: 'feat/setup-wizard',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Worktree);
  repos.agents.create({
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'Setup wizard agent',
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
  } satisfies Agent);
  repos.sessions.create({
    id: 'sess-1',
    agentId: 'ag-1',
    title: 'Plan setup wizard',
    template: 'chat',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  repos.messages.create({
    id: 'm-user',
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role: 'user',
    content: 'Build a setup wizard for first-time users',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-02T00:00:01.000Z',
  });
  repos.messages.create({
    id: 'm-assistant',
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role: 'assistant',
    content: 'I will scaffold the setup wizard with onboarding steps.',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-02T00:00:02.000Z',
  });
  return ctx;
}

test('summarizeAssistantContent drops placeholders and clips long text', () => {
  assert.equal(summarizeAssistantContent('[stopped]'), '');
  assert.equal(summarizeAssistantContent('hello'), 'hello');
  assert.equal(summarizeAssistantContent('x'.repeat(600)).length, 500);
});

test('refreshSessionSearchIndex indexes title, first prompt, and last summary', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-search-'));
  try {
    const ctx = await seed(tmp);
    refreshSessionSearchIndex(ctx, 'sess-1');
    const hits = searchSessionTranscripts(ctx, 'setup wizard');
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.sessionId, 'sess-1');
    assert.equal(hits[0]?.agentId, 'ag-1');
    assert.match(hits[0]?.snippet ?? '', /setup wizard/i);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('searchSessionTranscripts requires every token to match', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-search-'));
  try {
    const ctx = await seed(tmp);
    refreshSessionSearchIndex(ctx, 'sess-1');
    assert.equal(searchSessionTranscripts(ctx, 'setup wizard').length, 1);
    assert.equal(searchSessionTranscripts(ctx, 'setup zebra').length, 0);
    assert.equal(searchSessionTranscripts(ctx, 'nonexistent-topic').length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
