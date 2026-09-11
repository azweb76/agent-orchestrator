import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ClaudeService, GitService } from './git.js';
import { createAgentForWorktree } from './agent-core.js';
import {
  agentGoalFilePath,
  ensureAgentGoalFile,
  requireAgentGoal,
  syncAgentGoalFile,
} from './agent-goal.js';
import { updateAgentGoal } from './agents-lifecycle.js';
import { createAgentSession } from './sessions.js';
import { streamAgentChat } from './chat-stream.js';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { seedAgent } from './chat-sessions.test-helpers.js';

function tempCtx(dir: string): AppContext {
  const db = initDatabase(dir);
  return {
    repos: createRepositories(db),
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
    claude: new ClaudeService('claude', path.join(dir, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: dir,
  };
}

test('requireAgentGoal rejects empty goals', () => {
  assert.throws(() => requireAgentGoal({ goal: '' }), /Set a goal/);
  assert.throws(() => requireAgentGoal({ goal: '  ' }), /Set a goal/);
  requireAgentGoal({ goal: 'Ship dark mode' });
});

test('syncAgentGoalFile writes GOAL.md under dataDir', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-goal-'));
  try {
    const ctx = tempCtx(tmp);
    const filePath = await syncAgentGoalFile(ctx, { id: 'ag-1', goal: 'Ship dark mode' });
    assert.equal(filePath, agentGoalFilePath(tmp, 'ag-1'));
    const body = await fs.readFile(filePath!, 'utf8');
    assert.equal(body, 'Ship dark mode\n');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('ensureAgentGoalFile recreates a missing file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-goal-ensure-'));
  try {
    const ctx = tempCtx(tmp);
    const agent = { id: 'ag-1', goal: 'Keep the lights on' };
    const first = await syncAgentGoalFile(ctx, agent);
    await fs.rm(first!, { force: true });
    const restored = await ensureAgentGoalFile(ctx, agent);
    assert.equal(restored, first);
    assert.equal(await fs.readFile(restored!, 'utf8'), 'Keep the lights on\n');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentForWorktree persists goal and writes GOAL.md outside the worktree', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-goal-create-'));
  const ctx = tempCtx(tmp);
  try {
    const now = new Date().toISOString();
    ctx.repos.workspaces.create({
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo.git',
      repoPath: path.join(tmp, 'repo'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: now,
    });
    const worktreePath = path.join(tmp, 'wt');
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(path.join(worktreePath, 'README.md'), 'ok\n');
    ctx.repos.worktrees.create({
      id: 'wt-1',
      workspaceId: 'ws-1',
      name: 'feat',
      path: worktreePath,
      branch: 'feat',
      prNumber: null,
      prTitle: null,
      baseBranch: 'main',
      createdAt: now,
    });
    const agent = await createAgentForWorktree(ctx, 'wt-1', 'feature agent', {
      goal: 'Add a settings toggle',
    });
    assert.equal(agent.goal, 'Add a settings toggle');
    const goalFile = agentGoalFilePath(tmp, agent.id);
    assert.equal(await fs.readFile(goalFile, 'utf8'), 'Add a settings toggle\n');
    assert.equal((await fs.readdir(worktreePath)).includes('GOAL.md'), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('updateAgentGoal rejects empty text and updates the file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-goal-patch-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    await assert.rejects(() => updateAgentGoal(ctx, agent.id, '  '), /Goal is required/);
    const detail = await updateAgentGoal(ctx, agent.id, '  New contract  ');
    assert.equal(detail.goal, 'New contract');
    assert.equal(detail.goalPath, agentGoalFilePath(tmp, agent.id));
    assert.equal(await fs.readFile(detail.goalPath!, 'utf8'), 'New contract\n');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('chat and new sessions require a goal', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-goal-gate-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.agents.update({ ...ctx.repos.agents.getById(agent.id)!, goal: '' });
    await assert.rejects(
      () => createAgentSession(ctx, agent.id, { template: 'chat' }),
      /Set a goal/,
    );
    await assert.rejects(
      () => streamAgentChat(ctx, agent.id, { message: 'hello' }, null, 'plan-sess'),
      /Set a goal/,
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
