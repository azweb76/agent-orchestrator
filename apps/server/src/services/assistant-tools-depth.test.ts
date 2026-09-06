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
import { getAutomationSettings } from './automation-settings.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';

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

test('depth tools are registered in ASSISTANT_TOOLS', () => {
  const names = ASSISTANT_TOOLS.map((tool) => tool.name);
  for (const name of [
    'get_pull_request',
    'create_agent_pull_request',
    'list_agent_memories',
    'create_agent_memory',
    'update_agent_memory',
    'get_usage_summary',
    'get_automation_settings',
    'set_automation_settings',
    'trigger_automation_poll',
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
});

test('mutating depth tools require confirm=true', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-depth-confirm-'));
  const ctx = makeCtx(tmp);
  for (const [name, input] of [
    ['create_agent_pull_request', { agentId: 'ag-1', title: 'PR', confirm: false }],
    [
      'create_agent_memory',
      { agentId: 'ag-1', scope: 'agent', key: 'pref.x', content: 'y', confirm: false },
    ],
    ['update_agent_memory', { agentId: 'ag-1', memoryId: 'm-1', confirm: false }],
    ['set_automation_settings', { enabled: true, confirm: false }],
    ['trigger_automation_poll', { confirm: false }],
  ] as const) {
    const result = await executeAssistantTool(ctx, name, { ...input });
    assert.equal(result.isError, true, name);
    assert.match(result.content, /confirm=true/);
  }
});

test('get_usage_summary returns fleet spend rollup', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-depth-usage-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'get_usage_summary', { topAgents: 3 });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content) as {
    totalCostUsd: number;
    todayCostUsd: number;
    agents: unknown[];
  };
  assert.equal(typeof body.totalCostUsd, 'number');
  assert.equal(typeof body.todayCostUsd, 'number');
  assert.ok(Array.isArray(body.agents));
});

test('automation settings get/set via assistant tools', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-depth-auto-'));
  const ctx = makeCtx(tmp);

  const before = await executeAssistantTool(ctx, 'get_automation_settings', {});
  assert.equal(before.isError, undefined);
  const initial = JSON.parse(before.content) as { enabled: boolean; autoFixCi: boolean };
  assert.equal(initial.enabled, false);

  const updated = await executeAssistantTool(ctx, 'set_automation_settings', {
    enabled: true,
    autoFixCi: true,
    confirm: true,
  });
  assert.equal(updated.isError, undefined);
  const body = JSON.parse(updated.content) as {
    ok: boolean;
    settings: { enabled: boolean; autoFixCi: boolean };
  };
  assert.equal(body.ok, true);
  assert.equal(body.settings.enabled, true);
  assert.equal(body.settings.autoFixCi, true);
  assert.equal(getAutomationSettings(ctx).autoFixCi, true);
});

test('agent memory create/list/update via assistant tools', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-depth-mem-'));
  const ctx = makeCtx(tmp);

  const created = await executeAssistantTool(ctx, 'create_agent_memory', {
    agentId: 'ag-1',
    scope: 'agent',
    key: 'pref.tests',
    content: 'Prefer vitest',
    kind: 'preference',
    confirm: true,
  });
  assert.equal(created.isError, undefined);
  const createdBody = JSON.parse(created.content) as {
    memory: { id: string; key: string; status: string };
  };
  assert.equal(createdBody.memory.key, 'pref.tests');
  assert.equal(createdBody.memory.status, 'active');

  const listed = await executeAssistantTool(ctx, 'list_agent_memories', { agentId: 'ag-1' });
  const memories = JSON.parse(listed.content) as Array<{ id: string; key: string }>;
  assert.equal(memories.length, 1);
  assert.equal(memories[0]?.key, 'pref.tests');

  const archived = await executeAssistantTool(ctx, 'update_agent_memory', {
    agentId: 'ag-1',
    memoryId: createdBody.memory.id,
    status: 'archived',
    confirm: true,
  });
  assert.equal(archived.isError, undefined);
  const activeOnly = await executeAssistantTool(ctx, 'list_agent_memories', { agentId: 'ag-1' });
  assert.equal((JSON.parse(activeOnly.content) as unknown[]).length, 0);
  const withArchived = await executeAssistantTool(ctx, 'list_agent_memories', {
    agentId: 'ag-1',
    includeArchived: true,
  });
  assert.equal((JSON.parse(withArchived.content) as unknown[]).length, 1);
});

test('get_pull_request returns detail payload', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-depth-pr-'));
  const ctx = makeCtx(tmp);
  const detail = {
    owner: 'example',
    repo: 'demo',
    number: 42,
    title: 'Feature',
    body: '',
    state: 'open',
    draft: true,
    merged: false,
    mergeable: true as boolean | null,
    mergeableState: 'clean' as const,
    rebaseable: true as boolean | null,
    headRef: 'feature/x',
    baseRef: 'main',
    headSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    htmlUrl: 'https://github.com/example/demo/pull/42',
    author: null,
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    commentCount: 0,
    reviewCommentCount: 0,
    labels: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mergedAt: null,
    closedAt: null,
    mergeCommitSha: null,
    allowedMergeMethods: ['squash' as const],
    deleteBranchOnMerge: false,
    archived: false,
    workspaceId: 'ws-1',
    agentId: 'ag-1',
  };
  ctx.github.getPullRequestDetail = async () => detail;
  ctx.github.getPullRequestChecks = async () => ({
    headSha: detail.headSha,
    rollup: 'failure' as const,
    total: 2,
    passing: 1,
    failing: 1,
    pending: 0,
    neutral: 0,
    truncated: false,
    checks: [],
  });

  const result = await executeAssistantTool(ctx, 'get_pull_request', {
    owner: 'example',
    repo: 'demo',
    number: 42,
    includeChecks: true,
  });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content) as {
    number: number;
    agentId: string;
    checks: { rollup: string; failing: number };
  };
  assert.equal(body.number, 42);
  assert.equal(body.agentId, 'ag-1');
  assert.equal(body.checks.rollup, 'failure');
  assert.equal(body.checks.failing, 1);
});
