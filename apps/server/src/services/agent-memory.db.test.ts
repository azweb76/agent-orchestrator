import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  createAgentMemory,
  listActiveMemoriesForPrompt,
  listAgentMemories,
  resolveSessionSystemPrompt,
  updateAgentMemory,
} from './agent-memory.js';
import type { AppContext } from './app-context.js';

function seedAgent(dataDir: string) {
  const db = initDatabase(dataDir);
  const repos = createRepositories(db);
  const now = new Date().toISOString();
  repos.workspaces.create({
    id: 'ws-1',
    name: 'Demo',
    repoUrl: 'https://github.com/acme/demo.git',
    repoPath: path.join(dataDir, 'repo'),
    defaultBranch: 'main',
    githubOwner: 'acme',
    githubRepo: 'demo',
    createdAt: now,
  });
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'feature',
    path: path.join(dataDir, 'wt'),
    branch: 'feature',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: now,
  });
  repos.agents.create({
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
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    autopilot: null,
  });
  return { repos, ctx: { repos, dataDir } as AppContext };
}

test('agent memory CRUD and prompt injection', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-mem-'));
  try {
    const { ctx } = seedAgent(dataDir);
    const created = createAgentMemory(ctx, 'ag-1', {
      scope: 'agent',
      kind: 'preference',
      key: 'pref.tests',
      content: 'Prefer vitest',
    });
    assert.equal(created.key, 'pref.tests');
    assert.equal(listAgentMemories(ctx, 'ag-1').length, 1);
    assert.equal(listActiveMemoriesForPrompt(ctx, 'ag-1').length, 1);

    const upserted = createAgentMemory(ctx, 'ag-1', {
      scope: 'agent',
      kind: 'preference',
      key: 'pref.tests',
      content: 'Prefer vitest + coverage',
    });
    assert.equal(upserted.id, created.id);
    assert.equal(upserted.content, 'Prefer vitest + coverage');

    createAgentMemory(ctx, 'ag-1', {
      scope: 'global',
      kind: 'fact',
      key: 'user.tz',
      content: 'America/Los_Angeles',
    });

    const prompt = resolveSessionSystemPrompt(ctx, 'ag-1', 'Be careful.');
    assert.match(prompt ?? '', /Be careful/);
    assert.match(prompt ?? '', /Orchestrator memory/);
    assert.match(prompt ?? '', /pref\.tests/);
    assert.match(prompt ?? '', /user\.tz/);

    updateAgentMemory(ctx, 'ag-1', created.id, { status: 'archived' });
    const afterArchive = resolveSessionSystemPrompt(ctx, 'ag-1', null);
    assert.doesNotMatch(afterArchive ?? '', /pref\.tests/);
    assert.match(afterArchive ?? '', /user\.tz/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
