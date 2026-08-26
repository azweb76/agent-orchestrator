import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, ChatSession, Message, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { recoverRunningAgents, type AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService, isPidAlive } from './git.js';
import { GitHubService } from './github.js';

async function writeFakeClaude(binPath: string, script: string): Promise<void> {
  await fs.writeFile(binPath, script, { mode: 0o755 });
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000, pollMs = 40): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('timed out waiting for condition');
}

test('recoverRunningAgents keeps AskUserQuestion pending without duplicating chat text', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-recover-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const session = 'sess-recover-1';
const rl = readline.createInterface({ input: process.stdin });
let gotPrompt = false;
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!gotPrompt && msg.type === 'user') {
    gotPrompt = true;
    process.stdout.write(JSON.stringify({ type: 'system', session_id: session }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'What should I do?' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'AskUserQuestion',
        input: { questions: [{ question: 'Pick one', header: 'Q', options: [{ label: 'A' }] }] },
      },
    }) + '\\n');
    return;
  }
  if (msg.type === 'control_response') {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' thanks' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'What should I do? thanks',
      session_id: session,
    }) + '\\n');
    process.exit(0);
  }
});
`,
  );

  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const claudeA = new ClaudeService(binPath, runsDir);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: claudeA,
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
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: 'chat-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);

  const chatSession: ChatSession = {
    id: 'chat-1',
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
  };
  repos.sessions.create(chatSession);

  repos.messages.create({
    id: 'u1',
    agentId: agent.id,
    sessionId: chatSession.id,
    role: 'user',
    content: 'hi',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:01.000Z',
  } satisfies Message);

  const assistant: Message = {
    id: 'a1',
    agentId: agent.id,
    sessionId: chatSession.id,
    role: 'assistant',
    content: 'What should I do?',
    attachments: [],
    metadata: { streaming: true, timeline: [{ type: 'text', id: 't1', text: 'What should I do?' }] },
    createdAt: '2026-01-01T00:00:02.000Z',
  };
  repos.messages.create(assistant);

  let startedPid: number | null = null;
  let startedLog: string | null = null;
  const runPromise = claudeA.runStreaming(chatSession.id, {
    cwd: tmp,
    prompt: 'hi',
    permissionMode: 'plan',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
  });

  await waitFor(() => claudeA.listPendingPermissions(chatSession.id).length === 1);
  assert.ok(startedPid);
  assert.ok(startedLog);

  repos.sessions.update({
    ...chatSession,
    status: 'running',
    pid: startedPid,
    runLogPath: startedLog,
    updatedAt: new Date().toISOString(),
  });
  repos.agents.update({
    ...agent,
    status: 'running',
    pid: startedPid,
    runLogPath: startedLog,
    updatedAt: new Date().toISOString(),
  });

  claudeA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true);

  const claudeB = new ClaudeService(binPath, runsDir);
  ctx.claude = claudeB;
  recoverRunningAgents(ctx);

  await waitFor(() => claudeB.listPendingPermissions(chatSession.id).length === 1);
  assert.equal(isPidAlive(startedPid!), true, 'waiting session must stay running after recovery');

  const afterCatchUp = repos.messages.listBySession(chatSession.id);
  assert.equal(afterCatchUp.filter((item) => item.role === 'assistant').length, 1);
  assert.equal(afterCatchUp[afterCatchUp.length - 1]?.content, 'What should I do?');
  assert.equal(afterCatchUp[afterCatchUp.length - 1]?.metadata.streaming, true);

  const answered = claudeB.respondToPermission(chatSession.id, 'req-1', {
    behavior: 'allow',
    updatedInput: { answers: { Q: 'A' } },
  });
  assert.equal(answered, true);

  await runPromise.catch(() => undefined);
  await waitFor(() => {
    const current = repos.sessions.getById(chatSession.id);
    return current?.status === 'idle';
  });

  const finalMessages = repos.messages.listBySession(chatSession.id);
  const last = finalMessages[finalMessages.length - 1];
  assert.equal(finalMessages.filter((item) => item.role === 'assistant').length, 1);
  assert.equal(last?.content.includes('What should I do?What should I do?'), false);
  assert.match(last?.content ?? '', /What should I do\?/);
  assert.equal(last?.metadata.streaming, false);

  await fs.rm(tmp, { recursive: true, force: true });
});
