import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { createAgentForWorktree } from './agent-core.js';
import { createAgentTask, updateAgentTask } from './agent-tasks.js';
import { resolveAgentTaskForGoal } from './worktrees.js';
import { sanitizeAgentTaskSelection } from './anthropic.js';

function tempCtx(anthropicOverrides: Partial<AppContext['anthropic']> = {}): {
  ctx: AppContext;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-from-goal-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  return {
    ctx: {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
      jira: {} as AppContext['jira'],
      claude: {} as AppContext['claude'],
      anthropic: {
        selectAgentTaskForGoal: async () => null,
        ...anthropicOverrides,
      } as AppContext['anthropic'],
      dataDir: dir,
    },
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedWorktree(ctx: AppContext): string {
  const workspaceId = crypto.randomUUID();
  const worktreeId = crypto.randomUUID();
  const now = new Date().toISOString();
  ctx.repos.workspaces.create({
    id: workspaceId,
    name: 'demo',
    repoUrl: 'https://github.com/example/demo.git',
    repoPath: path.join(ctx.dataDir, 'repos', workspaceId),
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: now,
  });
  ctx.repos.worktrees.create({
    id: worktreeId,
    workspaceId,
    name: 'feature',
    path: path.join(ctx.dataDir, 'worktrees', workspaceId, 'feature'),
    branch: 'feature/demo',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: now,
  });
  return worktreeId;
}

test('createAgentForWorktree applies agent task to agent and session', async () => {
  const { ctx, cleanup } = tempCtx();
  try {
    const task = createAgentTask(ctx, {
      name: 'plan-feature',
      title: 'Plan feature',
      purpose: 'New product features',
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'plan',
      systemPrompt: 'Prefer small diffs.',
      allowedTools: 'Read,Glob,Grep,AskUserQuestion',
      promptTemplate: 'Goal: {{goal}}',
    });
    const refreshed = updateAgentTask(ctx, task.id, {});

    const worktreeId = seedWorktree(ctx);
    const agent = await createAgentForWorktree(ctx, worktreeId, 'feature agent', {
      task: refreshed,
    });

    assert.equal(agent.model, 'opus');
    assert.equal(agent.effort, 'xhigh');
    assert.equal(agent.permissionMode, 'plan');

    const session = ctx.repos.sessions.getById(agent.activeSessionId!);
    assert.ok(session);
    assert.equal(session?.agentTaskId, refreshed.id);
    assert.equal(session?.model, 'opus');
    assert.equal(session?.effort, 'xhigh');
    assert.equal(session?.systemPrompt, 'Prefer small diffs.');
    assert.equal(session?.allowedTools, 'Read,Glob,Grep');
  } finally {
    cleanup();
  }
});

test('resolveAgentTaskForGoal loads explicit slug', async () => {
  const { ctx, cleanup } = tempCtx();
  try {
    createAgentTask(ctx, {
      name: 'fix-bugs',
      title: 'Fix bugs',
      purpose: 'Bug fixes',
    });
    const task = await resolveAgentTaskForGoal(ctx, 'fix login', 'fix-bugs');
    assert.equal(task.name, 'fix-bugs');
  } finally {
    cleanup();
  }
});

test('resolveAgentTaskForGoal Auto matches via anthropic', async () => {
  const { ctx, cleanup } = tempCtx({
    selectAgentTaskForGoal: async () => 'fix-bugs',
  });
  try {
    createAgentTask(ctx, {
      name: 'fix-bugs',
      title: 'Fix bugs',
      purpose: 'Bug fixes and regressions',
    });
    createAgentTask(ctx, {
      name: 'new-feature',
      title: 'New feature',
      purpose: 'Greenfield features',
    });
    const task = await resolveAgentTaskForGoal(ctx, 'fix the flaky test', 'auto');
    assert.equal(task.name, 'fix-bugs');
  } finally {
    cleanup();
  }
});

test('resolveAgentTaskForGoal Auto fails with no purposes', async () => {
  const { ctx, cleanup } = tempCtx();
  try {
    createAgentTask(ctx, { name: 'blank', title: 'Blank', purpose: '' });
    await assert.rejects(
      () => resolveAgentTaskForGoal(ctx, 'anything', 'auto'),
      /No tasks with a purpose/,
    );
  } finally {
    cleanup();
  }
});

test('resolveAgentTaskForGoal Auto fails when model returns none', async () => {
  const { ctx, cleanup } = tempCtx({
    selectAgentTaskForGoal: async () => null,
  });
  try {
    createAgentTask(ctx, {
      name: 'fix-bugs',
      title: 'Fix bugs',
      purpose: 'Bug fixes',
    });
    await assert.rejects(
      () => resolveAgentTaskForGoal(ctx, 'unrelated goal', 'auto'),
      /Could not match goal to a task/,
    );
  } finally {
    cleanup();
  }
});

test('sanitizeAgentTaskSelection accepts candidate slugs only', () => {
  assert.equal(sanitizeAgentTaskSelection('fix-bugs', ['fix-bugs', 'new-feature']), 'fix-bugs');
  assert.equal(sanitizeAgentTaskSelection('NONE', ['fix-bugs']), null);
  assert.equal(sanitizeAgentTaskSelection('invented', ['fix-bugs']), null);
  assert.equal(sanitizeAgentTaskSelection('"fix-bugs"', ['fix-bugs']), 'fix-bugs');
});
