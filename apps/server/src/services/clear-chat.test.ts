import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Message, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { clearAgentChat, type AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';

test('clearAgentChat drops messages and the session but keeps the permission mode', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-clear-'));
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(path.join(tmp, 'fake-claude'), path.join(tmp, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: tmp,
  };

  const workspace: Workspace = {
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: path.join(tmp, 'demo'),
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
    path: tmp,
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
    effort: 'high',
    permissionMode: 'acceptEdits',
    claudeSessionId: 'sess-1',
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);

  for (const [index, role] of (['user', 'assistant'] as const).entries()) {
    repos.messages.create({
      id: `m${index}`,
      agentId: agent.id,
      role,
      content: `message ${index}`,
      attachments: [],
      metadata: {},
      createdAt: `2026-01-01T00:00:0${index + 1}.000Z`,
    } satisfies Message);
  }

  const result = await clearAgentChat(ctx, agent.id);

  assert.equal(result.cleared, 2);
  assert.equal(repos.messages.listByAgent(agent.id).length, 0);

  const cleared = repos.agents.getById(agent.id);
  assert.equal(cleared?.claudeSessionId, null);
  assert.equal(cleared?.permissionMode, 'acceptEdits');

  await fs.rm(tmp, { recursive: true, force: true });
});
