import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { executeAssistantTool, readDismissedIds } from './assistant-tools.js';
import { ASSISTANT_TOOLS } from '@agent-orchestrator/shared';

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
    prNumber: null,
    prTitle: null,
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

test('ASSISTANT_TOOLS catalog exposes expected MVP tools', () => {
  const names = ASSISTANT_TOOLS.map((tool) => tool.name);
  assert.ok(names.includes('list_workspaces'));
  assert.ok(names.includes('create_agent_from_goal'));
  assert.ok(names.includes('get_work_queue'));
  assert.ok(names.includes('list_agent_tasks'));
  assert.ok(names.includes('get_agent_task'));
  assert.ok(names.includes('create_agent_task'));
  assert.ok(names.includes('update_agent_task'));
  assert.equal(ASSISTANT_TOOLS.find((t) => t.name === 'create_agent_from_goal')?.risk, 'write');
  assert.equal(ASSISTANT_TOOLS.find((t) => t.name === 'create_agent_task')?.risk, 'write');
  assert.equal(ASSISTANT_TOOLS.find((t) => t.name === 'update_agent_task')?.risk, 'write');
});

test('list_workspaces and list_agents return seeded fleet', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const workspaces = await executeAssistantTool(ctx, 'list_workspaces', {});
  assert.equal(workspaces.isError, undefined);
  const ws = JSON.parse(workspaces.content) as Array<{ id: string; name: string }>;
  assert.equal(ws[0]?.id, 'ws-1');

  const agents = await executeAssistantTool(ctx, 'list_agents', {});
  const list = JSON.parse(agents.content) as Array<{ id: string; workspaceName: string }>;
  assert.equal(list[0]?.id, 'ag-1');
  assert.equal(list[0]?.workspaceName, 'demo');
});

test('create_agent_from_goal refuses without confirm=true', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'create_agent_from_goal', {
    workspaceId: 'ws-1',
    goal: 'Add a button',
    task: 'auto',
    confirm: false,
  });
  assert.equal(result.isError, true);
  assert.match(result.content, /confirm=true/);
});

test('dismiss_work_item persists ids', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const denied = await executeAssistantTool(ctx, 'dismiss_work_item', {
    workItemId: 'agent_blocked:ag-1',
    confirm: false,
  });
  assert.equal(denied.isError, true);

  const ok = await executeAssistantTool(ctx, 'dismiss_work_item', {
    workItemId: 'agent_blocked:ag-1',
    confirm: true,
  });
  assert.equal(ok.isError, undefined);
  assert.ok(readDismissedIds(ctx).has('agent_blocked:ag-1'));
});

test('archive_agent requires confirm and archives', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const denied = await executeAssistantTool(ctx, 'archive_agent', {
    agentId: 'ag-1',
    confirm: false,
  });
  assert.equal(denied.isError, true);

  const ok = await executeAssistantTool(ctx, 'archive_agent', {
    agentId: 'ag-1',
    confirm: true,
  });
  assert.equal(ok.isError, undefined);
  assert.equal(ctx.repos.agents.getById('ag-1')?.status, 'archived');
});

test('get_agent_task and update_agent_task require confirm and persist', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const created = ctx.repos.agentTasks.create({
    id: 'task-1',
    name: 'custom-fix',
    title: 'Custom Fix',
    description: '',
    purpose: 'fix bugs',
    promptTemplate: 'Fix: {{goal}}',
    systemPrompt: null,
    allowedTools: null,
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    listed: true,
    builtIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const listed = await executeAssistantTool(ctx, 'list_agent_tasks', {});
  const list = JSON.parse(listed.content) as Array<{ name: string; builtIn?: boolean }>;
  assert.ok(list.some((row) => row.name === 'custom-fix'));

  const detail = await executeAssistantTool(ctx, 'get_agent_task', { task: 'custom-fix' });
  assert.equal(detail.isError, undefined);
  const got = JSON.parse(detail.content) as { id: string; promptTemplate: string | null };
  assert.equal(got.id, created.id);
  assert.equal(got.promptTemplate, 'Fix: {{goal}}');

  const denied = await executeAssistantTool(ctx, 'update_agent_task', {
    task: 'custom-fix',
    purpose: 'Fix flaky tests and regressions',
    confirm: false,
  });
  assert.equal(denied.isError, true);
  assert.match(denied.content, /confirm=true/);

  const missingRef = await executeAssistantTool(ctx, 'update_agent_task', {
    purpose: 'no target',
    confirm: true,
  });
  assert.equal(missingRef.isError, true);

  const ok = await executeAssistantTool(ctx, 'update_agent_task', {
    taskId: created.id,
    purpose: 'Fix flaky tests and regressions',
    effort: 'max',
    confirm: true,
  });
  assert.equal(ok.isError, undefined);
  const payload = JSON.parse(ok.content) as {
    ok: boolean;
    task: { purpose: string; effort: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.task.purpose, 'Fix flaky tests and regressions');
  assert.equal(payload.task.effort, 'max');
  assert.equal(ctx.repos.agentTasks.getById(created.id)?.purpose, 'Fix flaky tests and regressions');
});

test('create_agent_task requires confirm and persists', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);

  const denied = await executeAssistantTool(ctx, 'create_agent_task', {
    name: 'new-feature',
    title: 'New Feature',
    purpose: 'Ship a new capability',
    confirm: false,
  });
  assert.equal(denied.isError, true);
  assert.match(denied.content, /confirm=true/);

  const ok = await executeAssistantTool(ctx, 'create_agent_task', {
    name: 'new-feature',
    title: 'New Feature',
    purpose: 'Ship a new capability',
    promptTemplate: 'Implement: {{goal}}',
    listed: true,
    confirm: true,
  });
  assert.equal(ok.isError, undefined);
  const payload = JSON.parse(ok.content) as {
    ok: boolean;
    task: { name: string; title: string; purpose: string; listed: boolean };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.task.name, 'new-feature');
  assert.equal(payload.task.title, 'New Feature');
  assert.equal(payload.task.purpose, 'Ship a new capability');
  assert.equal(payload.task.listed, true);
  assert.equal(ctx.repos.agentTasks.getByName('new-feature')?.title, 'New Feature');

  const conflict = await executeAssistantTool(ctx, 'create_agent_task', {
    name: 'new-feature',
    title: 'Duplicate',
    confirm: true,
  });
  assert.equal(conflict.isError, true);
  assert.match(conflict.content, /already exists/);
});

test('unknown tool returns error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'not_a_tool', {});
  assert.equal(result.isError, true);
});
