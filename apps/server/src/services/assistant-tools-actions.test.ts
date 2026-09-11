import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ASSISTANT_TOOLS } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { executeAssistantTool } from './assistant-tools.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { setCachedPrStatus } from './pr-status-cache.js';

function makeCtx(tmp: string): AppContext {
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
    createdAt: new Date().toISOString(),
  });
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'feature',
    path: path.join(tmp, 'wt'),
    branch: 'feature/x',
    prNumber: 42,
    prTitle: 'Feature',
    baseBranch: 'main',
    createdAt: new Date().toISOString(),
  });
  repos.agents.create({
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'feature agent',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    activeSessionId: null,
    goal: '',
  });
  return {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: tmp,
  };
}

test('action tools are registered in ASSISTANT_TOOLS', () => {
  const names = ASSISTANT_TOOLS.map((tool) => tool.name);
  for (const name of [
    'start_agent_session',
    'create_agent_from_github_issue',
    'create_agent_from_jira_issue',
    'create_agent_from_pull_request',
    'send_agent_message',
    'list_pending_permissions',
    'respond_permission',
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
});

test('mutating action tools require confirm=true', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-actions-'));
  const ctx = makeCtx(tmp);

  for (const [name, input] of [
    ['start_agent_session', { agentId: 'ag-1', template: 'fix-ci', confirm: false }],
    [
      'create_agent_from_github_issue',
      { owner: 'example', repo: 'demo', issueNumber: 7, confirm: false },
    ],
    ['create_agent_from_jira_issue', { issueKey: 'PROJ-1', confirm: false }],
    [
      'create_agent_from_pull_request',
      { owner: 'example', repo: 'demo', number: 3, confirm: false },
    ],
    ['send_agent_message', { agentId: 'ag-1', message: 'hello', confirm: false }],
    [
      'respond_permission',
      { agentId: 'ag-1', requestId: 'req-1', decision: 'allow', confirm: false },
    ],
  ] as const) {
    const denied = await executeAssistantTool(ctx, name, { ...input });
    assert.equal(denied.isError, true, name);
    assert.match(denied.content, /confirm=true/, name);
  }
});

test('get_work_queue includes failing CI from PR status cache', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-failing-'));
  const ctx = makeCtx(tmp);

  setCachedPrStatus(ctx, 'example', 'demo', 99, {
    state: 'open',
    draft: false,
    merged: false,
    checksRollup: 'failure',
    updatedAt: new Date().toISOString(),
    checksFailing: 2,
  });

  ctx.github.listAuthoredOpenPullRequests = async () => [
    {
      number: 99,
      title: 'Break CI',
      state: 'open',
      htmlUrl: 'https://github.com/example/demo/pull/99',
      draft: false,
      owner: 'example',
      repo: 'demo',
      authorLogin: 'dev',
      updatedAt: new Date().toISOString(),
    },
  ];
  ctx.github.listReviewRequestedPullRequests = async () => [];
  ctx.github.isRepoArchived = async () => false;

  const result = await executeAssistantTool(ctx, 'get_work_queue', { limit: 8 });
  assert.equal(result.isError, undefined, result.content);
  const payload = JSON.parse(result.content) as {
    items: Array<{ kind: string; action?: { type: string; number?: number } }>;
  };
  const failing = payload.items.filter((item) => item.kind === 'pr_failing_ci');
  assert.equal(failing.length, 1, JSON.stringify(payload.items));
  assert.equal(failing[0]?.action?.type, 'start_pr_template');
  assert.equal(failing[0]?.action?.number, 99);
});

test('list_pending_permissions returns empty list when none pending', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-perms-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'list_pending_permissions', {});
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content) as { count: number; pending: unknown[] };
  assert.equal(payload.count, 0);
  assert.deepEqual(payload.pending, []);
});

test('getAssistantWorkQueue returns parsed queue payload for HTTP', async () => {
  const { getAssistantWorkQueue } = await import('./assistant-tools.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-wq-http-'));
  const ctx = makeCtx(tmp);
  ctx.github.listAuthoredOpenPullRequests = async () => [];
  ctx.github.listReviewRequestedPullRequests = async () => [];
  ctx.github.isRepoArchived = async () => false;

  const payload = await getAssistantWorkQueue(ctx, 5);
  assert.equal(typeof payload.summary, 'string');
  assert.ok(Array.isArray(payload.items));
});
