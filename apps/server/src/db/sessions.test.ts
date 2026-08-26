import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Agent, Message, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from './index.js';

function seedWorkspace(repos: ReturnType<typeof createRepositories>, dataDir: string) {
  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: path.join(dataDir, 'demo'),
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Workspace);
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
  } satisfies Worktree);
}

describe('chat session migration and isolation', () => {
  it('backfills a default session and attaches existing messages on reopen', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sessions-mig-'));
    try {
      let repos = createRepositories(initDatabase(dataDir));
      seedWorkspace(repos, dataDir);

      const agent: Agent = {
        id: 'ag-legacy',
        worktreeId: 'wt-1',
        name: 'Agent',
        status: 'idle',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'plan',
        claudeSessionId: 'claude-1',
        pid: null,
        runLogPath: null,
        activeSessionId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      };
      repos.agents.create(agent);
      repos.messages.create({
        id: 'm1',
        agentId: agent.id,
        sessionId: '',
        role: 'user',
        content: 'hello',
        attachments: [],
        metadata: {},
        createdAt: '2026-01-01T00:00:01.000Z',
      } satisfies Message);

      assert.equal(repos.sessions.listByAgent(agent.id).length, 0);

      repos = createRepositories(initDatabase(dataDir));
      const sessions = repos.sessions.listByAgent(agent.id);
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0]?.title, 'Chat');
      assert.equal(sessions[0]?.claudeSessionId, 'claude-1');
      assert.equal(repos.agents.getById(agent.id)?.activeSessionId, sessions[0]?.id);
      assert.equal(repos.messages.listBySession(sessions[0]!.id).length, 1);
      assert.equal(repos.messages.listBySession(sessions[0]!.id)[0]?.content, 'hello');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps rewind/deleteFrom scoped to one session', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sessions-iso-'));
    const repos = createRepositories(initDatabase(dataDir));
    try {
      seedWorkspace(repos, dataDir);
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
        activeSessionId: 'sess-a',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      });
      const sessionA = repos.sessions.create({
        id: 'sess-a',
        agentId: 'ag-1',
        title: 'Chat',
        template: 'chat',
        status: 'idle',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'plan',
        claudeSessionId: null,
        pid: null,
        runLogPath: null,
        createdAt: '2026-01-01T00:00:10.000Z',
        updatedAt: '2026-01-01T00:00:10.000Z',
      });
      const sessionB = repos.sessions.create({
        id: 'sess-b',
        agentId: 'ag-1',
        title: 'Review',
        template: 'review',
        status: 'idle',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'plan',
        claudeSessionId: null,
        pid: null,
        runLogPath: null,
        createdAt: '2026-01-01T00:00:11.000Z',
        updatedAt: '2026-01-01T00:00:11.000Z',
      });

      const mk = (id: string, sessionId: string, createdAt: string): Message => ({
        id,
        agentId: 'ag-1',
        sessionId,
        role: 'user',
        content: id,
        attachments: [],
        metadata: {},
        createdAt,
      });

      repos.messages.create(mk('a1', sessionA.id, '2026-01-01T00:00:12.000Z'));
      repos.messages.create(mk('a2', sessionA.id, '2026-01-01T00:00:13.000Z'));
      repos.messages.create(mk('b1', sessionB.id, '2026-01-01T00:00:14.000Z'));

      const result = repos.messages.deleteFrom('ag-1', 'a1');
      assert.equal(result.removed, 2);
      assert.deepEqual(
        repos.messages.listBySession(sessionA.id).map((item) => item.id),
        [],
      );
      assert.deepEqual(
        repos.messages.listBySession(sessionB.id).map((item) => item.id),
        ['b1'],
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
