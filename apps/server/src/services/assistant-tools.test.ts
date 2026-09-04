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
  assert.equal(ASSISTANT_TOOLS.find((t) => t.name === 'create_agent_from_goal')?.risk, 'write');
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

test('unknown tool returns error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'not_a_tool', {});
  assert.equal(result.isError, true);
});
