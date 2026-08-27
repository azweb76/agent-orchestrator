import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Message } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase, type AppRepositories } from './index.js';

async function seedRepos(tmp: string): Promise<AppRepositories> {
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
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'agent-1',
    path: tmp,
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
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  });
  repos.sessions.create({
    id: 'sess-1',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return repos;
}

function message(id: string, role: Message['role'], createdAt: string): Message {
  return {
    id,
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role,
    content: `${role} ${id}`,
    attachments: [],
    metadata: {},
    createdAt,
  };
}

test('messages with identical created_at keep insertion order', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-db-order-'));
  try {
    const repos = await seedRepos(tmp);
    // streamAgentChat creates the user message and the assistant placeholder
    // back-to-back, typically within the same millisecond.
    const sameInstant = '2026-01-02T00:00:00.000Z';
    repos.messages.create(message('zz-user', 'user', sameInstant));
    repos.messages.create(message('aa-assistant', 'assistant', sameInstant));
    repos.messages.create(message('mm-user-2', 'user', sameInstant));

    assert.deepEqual(
      repos.messages.listBySession('sess-1').map((item) => item.id),
      ['zz-user', 'aa-assistant', 'mm-user-2'],
    );
    assert.deepEqual(
      repos.messages.listByAgent('ag-1').map((item) => item.id),
      ['zz-user', 'aa-assistant', 'mm-user-2'],
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteFrom removes the target and later same-timestamp siblings', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-db-delete-from-'));
  try {
    const repos = await seedRepos(tmp);
    repos.messages.create(message('u1', 'user', '2026-01-02T00:00:00.000Z'));
    repos.messages.create(message('a1', 'assistant', '2026-01-02T00:00:01.000Z'));
    const sameInstant = '2026-01-02T00:00:02.000Z';
    repos.messages.create(message('u2', 'user', sameInstant));
    repos.messages.create(message('a2', 'assistant', sameInstant));

    const { removed, target } = repos.messages.deleteFrom('ag-1', 'u2');
    assert.equal(target?.id, 'u2');
    assert.equal(removed, 2);
    assert.deepEqual(
      repos.messages.listBySession('sess-1').map((item) => item.id),
      ['u1', 'a1'],
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
