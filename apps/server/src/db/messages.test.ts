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

describe('MessageRepository.update', () => {
  let dataDir: string;
  let repos: ReturnType<typeof createRepositories>;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-messages-upd-'));
    const db = initDatabase(dataDir);
    repos = createRepositories(db);

    repos.workspaces.create({
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: path.join(dataDir, 'demo'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    repos.worktrees.create({
      id: 'wt-1',
      workspaceId: 'ws-1',
      name: 'agent-1',
      path: path.join(dataDir, 'wt'),
      branch: 'feat',
      prNumber: null,
      prTitle: null,
      baseBranch: 'main',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    repos.agents.create({
      id: 'ag-1',
      worktreeId: 'wt-1',
      name: 'Agent',
      status: 'idle',
      model: 'sonnet',
      environment: null,
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    });
  });

  after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('updates streaming assistant content and timeline in place', () => {
    const message: Message = {
      id: 'a1',
      agentId: 'ag-1',
      role: 'assistant',
      content: '',
      attachments: [],
      metadata: { streaming: true, timeline: [] },
      createdAt: '2026-01-01T00:00:01.000Z',
    };
    repos.messages.create(message);

    const updated = repos.messages.update({
      ...message,
      content: 'Hello',
      metadata: {
        streaming: true,
        timeline: [{ type: 'text', id: 't1', text: 'Hello' }],
      },
    });

    assert.equal(updated.content, 'Hello');
    const loaded = repos.messages.getById('ag-1', 'a1');
    assert.equal(loaded?.content, 'Hello');
    assert.equal(loaded?.metadata.streaming, true);
    assert.equal(loaded?.metadata.timeline?.[0]?.type, 'text');

    repos.messages.update({
      ...updated,
      content: 'Hello world',
      metadata: {
        streaming: false,
        timeline: [{ type: 'text', id: 't1', text: 'Hello world' }],
        durationMs: 1200,
      },
    });

    const final = repos.messages.listByAgent('ag-1');
    assert.equal(final.length, 1);
    assert.equal(final[0]?.content, 'Hello world');
    assert.equal(final[0]?.metadata.streaming, false);
    assert.equal(final[0]?.metadata.durationMs, 1200);
  });
});
