import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app.js';
import { createAgentFromPullRequest } from './pull-requests.js';
import { resolveLocalPrContext } from './pr-agent-lookup.js';
import type { GitHubService } from './github.js';

function seedPrAgent(tmp: string, options: { prNumber?: number | null; branch: string; archived?: boolean }) {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
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
    branch: options.branch,
    prNumber: options.prNumber ?? null,
    prTitle: options.prNumber ? `PR #${options.prNumber}` : null,
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
    archivedAt: options.archived ? '2026-01-02T00:00:00.000Z' : null,
    autopilot: null,
  };
  repos.agents.create(agent);
  const ctx: AppContext = {
    repos,
    git: {} as AppContext['git'],
    github: {
      getPullRequest: async () => ({
        number: 42,
        title: 'Fix things',
        state: 'open',
        headRef: 'feature/foo',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/42',
        draft: false,
        authorLogin: 'dan',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    } as unknown as GitHubService,
    jira: {} as AppContext['jira'],
    claude: {} as AppContext['claude'],
    anthropic: {} as AppContext['anthropic'],
    dataDir: tmp,
  };
  return { ctx };
}

test('resolveLocalPrContext finds agents by PR number', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-pr-lookup-'));
  const { ctx } = seedPrAgent(tmp, { prNumber: 42, branch: 'pr-42' });
  const local = resolveLocalPrContext(ctx, 'example', 'demo', 42, 'feature/foo');
  assert.equal(local.agentId, 'ag-1');
  assert.equal(local.worktreeId, 'wt-1');
});

test('resolveLocalPrContext finds agents by branch when pr_number is unset', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-pr-branch-'));
  const { ctx } = seedPrAgent(tmp, { prNumber: null, branch: 'feature/foo' });
  const local = resolveLocalPrContext(ctx, 'example', 'demo', 42, 'feature/foo');
  assert.equal(local.agentId, 'ag-1');
});

test('createAgentFromPullRequest reuses an active agent instead of creating a worktree', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-pr-reuse-'));
  const { ctx } = seedPrAgent(tmp, { prNumber: 42, branch: 'pr-42' });
  const result = await createAgentFromPullRequest(ctx, {
    owner: 'example',
    repo: 'demo',
    prNumber: 42,
  });
  assert.equal(result.created, false);
  assert.equal(result.reused, true);
  assert.equal(result.agent.id, 'ag-1');
});

test('resolveLocalPrContext ignores archived agents', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-pr-archived-'));
  const { ctx } = seedPrAgent(tmp, { prNumber: 42, branch: 'pr-42', archived: true });
  const local = resolveLocalPrContext(ctx, 'example', 'demo', 42, 'feature/foo');
  assert.equal(local.agentId, null);
});
