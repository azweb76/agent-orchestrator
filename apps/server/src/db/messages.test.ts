import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Agent, Message, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';

describe('MessageRepository.deleteFrom', () => {
  let dataDir: string;
  let repos: ReturnType<typeof createRepositories>;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-messages-'));
    const db = initDatabase(dataDir);
    repos = createRepositories(db);

    const workspace: Workspace = {
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: path.join(dataDir, 'demo'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    repos.workspaces.create(workspace);

    const worktree: Worktree = {
      id: 'wt-1',
      workspaceId: workspace.id,
      name: 'agent-1',
      path: path.join(dataDir, 'wt'),
      branch: 'feat',
      prNumber: null,
      prTitle: null,
      baseBranch: 'main',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    repos.worktrees.create(worktree);

    const agent: Agent = {
      id: 'ag-1',
      worktreeId: worktree.id,
      name: 'Agent',
      status: 'idle',
      model: 'sonnet',
      environment: null,
      permissionMode: 'plan',
      claudeSessionId: 'sess-1',
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    };
    repos.agents.create(agent);
  });

  after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('deletes the target message and every later message', () => {
    const agentId = 'ag-1';
    const mk = (id: string, role: Message['role'], createdAt: string): Message => ({
      id,
      agentId,
      role,
      content: id,
      attachments: [],
      metadata: {},
      createdAt,
    });

    repos.messages.create(mk('m1', 'user', '2026-01-01T00:00:01.000Z'));
    repos.messages.create(mk('m2', 'assistant', '2026-01-01T00:00:02.000Z'));
    repos.messages.create(mk('m3', 'user', '2026-01-01T00:00:03.000Z'));
    repos.messages.create(mk('m4', 'assistant', '2026-01-01T00:00:04.000Z'));

    const result = repos.messages.deleteFrom(agentId, 'm3');
    assert.equal(result.removed, 2);
    assert.equal(result.target?.id, 'm3');
    assert.deepEqual(
      repos.messages.listByAgent(agentId).map((m) => m.id),
      ['m1', 'm2'],
    );
  });

  it('returns zero when the message is missing', () => {
    const result = repos.messages.deleteFrom('ag-1', 'missing');
    assert.equal(result.removed, 0);
    assert.equal(result.target, null);
  });
});
