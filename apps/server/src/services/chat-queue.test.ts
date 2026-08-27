import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  clearAgentChat,
  drainSessionQueue,
  enqueueChatMessage,
  listQueuedMessages,
  removeQueuedMessage,
  type AppContext,
} from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';

async function writeFakeClaude(binPath: string): Promise<void> {
  await fs.writeFile(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'user') {
    process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-q' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'Done.' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Done.',
      session_id: 'claude-q',
    }) + '\\n');
    process.exit(0);
  }
});
`,
    { mode: 0o755 },
  );
}

async function seedAgent(tmp: string): Promise<{ ctx: AppContext; agent: Agent }> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const binPath = path.join(tmp, 'fake-claude');
  await writeFakeClaude(binPath);

  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
    anthropic: { suggestChatTitle: async () => 'Stub title' } as unknown as AnthropicService,
    dataDir: tmp,
  };

  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Workspace);
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
  } satisfies Worktree);

  const agent: Agent = {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);
  const session = repos.sessions.create({
    id: 'sess-1',
    agentId: agent.id,
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
  repos.agents.update({ ...agent, activeSessionId: session.id });
  return { ctx, agent: repos.agents.getById(agent.id)! };
}

async function waitFor(check: () => boolean, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('enqueue on an idle session drains immediately', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-queue-idle-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const queued = await enqueueChatMessage(ctx, agent.id, 'sess-1', { message: 'hi there' });
    assert.equal(queued.sessionId, 'sess-1');

    await waitFor(() => ctx.repos.queued.listBySession('sess-1').length === 0);
    await waitFor(() => {
      const messages = ctx.repos.messages.listBySession('sess-1');
      return messages.some((item) => item.role === 'assistant' && item.content === 'Done.');
    });
    const messages = ctx.repos.messages.listBySession('sess-1');
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[0]?.content, 'hi there');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('messages queued while running stay queued, then drain in order', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-queue-run-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    await enqueueChatMessage(ctx, agent.id, 'sess-1', { message: 'first' });
    await enqueueChatMessage(ctx, agent.id, 'sess-1', { message: 'second' });
    // Give any (incorrect) immediate drain a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(
      listQueuedMessages(ctx, agent.id, 'sess-1').map((item) => item.content),
      ['first', 'second'],
    );

    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'idle',
      updatedAt: new Date().toISOString(),
    });
    await drainSessionQueue(ctx, agent.id, 'sess-1');

    assert.equal(ctx.repos.queued.listBySession('sess-1').length, 0);
    const userMessages = ctx.repos.messages
      .listBySession('sess-1')
      .filter((item) => item.role === 'user')
      .map((item) => item.content);
    assert.deepEqual(userMessages, ['first', 'second']);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('queue endpoints validate and remove entries', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-queue-rm-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    await assert.rejects(
      enqueueChatMessage(ctx, agent.id, 'sess-1', { message: '   ' }),
      /Message or image attachment required/,
    );

    const queued = await enqueueChatMessage(ctx, agent.id, 'sess-1', { message: 'later' });
    const removed = await removeQueuedMessage(ctx, agent.id, 'sess-1', queued.id);
    assert.equal(removed.removed, true);
    assert.equal(listQueuedMessages(ctx, agent.id, 'sess-1').length, 0);

    const again = await removeQueuedMessage(ctx, agent.id, 'sess-1', queued.id);
    assert.equal(again.removed, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('removing a queued message cannot target another session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-queue-other-session-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const other = ctx.repos.sessions.create({
      ...ctx.repos.sessions.getById('sess-1')!,
      id: 'sess-2',
      title: 'Other chat',
      status: 'running',
    });
    const queued = await enqueueChatMessage(ctx, agent.id, other.id, { message: 'belongs elsewhere' });

    const result = await removeQueuedMessage(ctx, agent.id, 'sess-1', queued.id);
    assert.equal(result.removed, false);
    assert.equal(ctx.repos.queued.listBySession(other.id).length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('clearAgentChat drops queued messages', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-queue-clear-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const messageAttachmentPath = path.join(tmp, 'message-image.png');
    await fs.writeFile(messageAttachmentPath, 'image');
    ctx.repos.messages.create({
      id: 'message-with-image',
      agentId: agent.id,
      sessionId: 'sess-1',
      role: 'user',
      content: '(image attachment)',
      attachments: [
        {
          id: 'message-image',
          type: 'image',
          mimeType: 'image/png',
          name: 'message-image.png',
          path: messageAttachmentPath,
          url: '/api/agents/ag-1/attachments/message-image',
        },
      ],
      metadata: {},
      createdAt: '2026-01-01T00:00:01.000Z',
    });
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });
    await enqueueChatMessage(ctx, agent.id, 'sess-1', { message: 'pending' });
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'idle',
      runLogPath: path.join(tmp, 'old-run.log'),
      updatedAt: new Date().toISOString(),
    });
    ctx.repos.sessions.setGrade(
      'sess-1',
      {
        score: 4,
        comment: 'Old conversation',
        gradedAt: new Date().toISOString(),
      },
      'old transcript',
    );

    await clearAgentChat(ctx, agent.id, 'sess-1');
    assert.equal(ctx.repos.queued.listBySession('sess-1').length, 0);
    assert.equal(ctx.repos.messages.listBySession('sess-1').length, 0);
    await assert.rejects(fs.access(messageAttachmentPath));
    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.runLogPath, null);
    assert.equal(session?.grade, null);
    assert.equal(ctx.repos.sessions.getGradeTranscript('sess-1'), '');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
