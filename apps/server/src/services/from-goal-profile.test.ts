import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionProfile } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { createAgentForWorktree } from './agent-core.js';
import { ensureFromGoalProfile, updateSessionProfile } from './session-profiles.js';

function tempCtx(): { ctx: AppContext; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-from-goal-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  return {
    ctx: {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
      claude: {} as AppContext['claude'],
      anthropic: {} as AppContext['anthropic'],
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

test('createAgentForWorktree applies from-goal profile to agent and session', async () => {
  const { ctx, cleanup } = tempCtx();
  try {
    const profile = ensureFromGoalProfile(ctx);
    updateSessionProfile(ctx, profile.id, {
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'plan',
      systemPrompt: 'Prefer small diffs.',
      allowedTools: 'Read,Glob,Grep,AskUserQuestion',
      promptTemplate: 'Goal: {{goal}}',
    });
    const refreshed = ctx.repos.sessionProfiles.getById(profile.id) as SessionProfile;

    const worktreeId = seedWorktree(ctx);
    const agent = await createAgentForWorktree(ctx, worktreeId, 'feature agent', {
      profile: refreshed,
    });

    assert.equal(agent.model, 'opus');
    assert.equal(agent.effort, 'xhigh');
    assert.equal(agent.permissionMode, 'plan');

    const session = ctx.repos.sessions.getById(agent.activeSessionId!);
    assert.ok(session);
    assert.equal(session?.profileId, refreshed.id);
    assert.equal(session?.model, 'opus');
    assert.equal(session?.effort, 'xhigh');
    assert.equal(session?.systemPrompt, 'Prefer small diffs.');
    assert.equal(session?.allowedTools, 'Read,Glob,Grep');
  } finally {
    cleanup();
  }
});
