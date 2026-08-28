import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import type {
  Agent,
  AgentEvent,
  AppEvent,
  ChatSession,
  SessionGradeFinding,
  Workspace,
  Worktree,
} from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { buildApprovedPlan, type AppContext } from './app.js';
import type { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { Notifier } from './notifier.js';
import { offerInstructionDraftAfterRun } from './instruction-offer.js';

function finding(
  category: SessionGradeFinding['category'],
  severity: SessionGradeFinding['severity'],
): SessionGradeFinding {
  return { category, severity, title: `${category} ${severity}`, detail: 'detail' };
}

function gradedSession(
  template: ChatSession['template'],
  findings: SessionGradeFinding[],
): ChatSession {
  return {
    id: 'sess-1',
    agentId: 'ag-1',
    title: 'Session',
    template,
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'auto',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    grade: {
      score: 3,
      comment: 'Summary',
      gradedAt: '2026-01-01T00:01:00.000Z',
      analysis: {
        summary: 'Summary',
        findings,
        stats: {
          userTurns: 1,
          assistantTurns: 1,
          estimatedTokens: 100,
          costUsd: null,
          toolCalls: 0,
          instructionFileCount: 0,
          skillCount: 0,
        },
      },
    },
  };
}

function fakeCtx(): { ctx: AppContext; appEvents: AppEvent[]; agentEvents: AgentEvent[] } {
  const appEvents: AppEvent[] = [];
  const agentEvents: AgentEvent[] = [];
  const notifier = new Notifier();
  notifier.subscribe((event) => appEvents.push(event));
  const ctx = {
    notifier,
    repos: {
      events: {
        create(event: AgentEvent) {
          agentEvents.push(event);
          return event;
        },
      },
    },
  } as unknown as AppContext;
  return { ctx, appEvents, agentEvents };
}

test('offers a draft after a Build run graded with instruction findings', async () => {
  const { ctx, appEvents, agentEvents } = fakeCtx();
  const graded = gradedSession('build', [
    finding('excessive_turns', 'ok'),
    finding('instruction_files', 'issue'),
    finding('skills', 'warning'),
  ]);
  const offered = await offerInstructionDraftAfterRun(ctx, graded, {}, async () => graded);

  assert.equal(offered, true);
  assert.equal(appEvents.length, 1);
  assert.equal(appEvents[0]?.type, 'instruction_draft_offer');
  assert.equal(appEvents[0]?.agentId, 'ag-1');
  assert.equal(appEvents[0]?.sessionId, 'sess-1');
  assert.deepEqual(appEvents[0]?.data.categories, ['instruction_files', 'skills']);
  assert.equal(agentEvents[0]?.type, 'instruction_draft_offered');
  assert.deepEqual(agentEvents[0]?.data.categories, ['instruction_files', 'skills']);
});

test('offers a draft after a Fix CI run with a skills finding', async () => {
  const { ctx, appEvents } = fakeCtx();
  const graded = gradedSession('fix-ci', [finding('skills', 'warning')]);
  const offered = await offerInstructionDraftAfterRun(ctx, graded, {}, async () => graded);

  assert.equal(offered, true);
  assert.deepEqual(appEvents[0]?.data.categories, ['skills']);
});

test('does not offer when instruction findings are all ok', async () => {
  const { ctx, appEvents, agentEvents } = fakeCtx();
  const graded = gradedSession('build', [
    finding('wasted_tokens', 'issue'),
    finding('instruction_files', 'ok'),
    finding('skills', 'ok'),
  ]);
  const offered = await offerInstructionDraftAfterRun(ctx, graded, {}, async () => graded);

  assert.equal(offered, false);
  assert.equal(appEvents.length, 0);
  assert.equal(agentEvents.length, 0);
});

test('does not grade or offer for non Build / Fix CI templates', async () => {
  const { ctx, appEvents } = fakeCtx();
  for (const template of ['chat', 'review', 'create-draft-pr', 'address-review'] as const) {
    let gradeCalls = 0;
    const graded = gradedSession(template, [finding('instruction_files', 'issue')]);
    const offered = await offerInstructionDraftAfterRun(ctx, graded, {}, async () => {
      gradeCalls += 1;
      return graded;
    });
    assert.equal(offered, false, template);
    assert.equal(gradeCalls, 0, template);
  }
  assert.equal(appEvents.length, 0);
});

test('does not grade stopped or failed runs', async () => {
  const { ctx, appEvents } = fakeCtx();
  const graded = gradedSession('build', [finding('instruction_files', 'issue')]);
  let gradeCalls = 0;
  const grade = async () => {
    gradeCalls += 1;
    return graded;
  };

  assert.equal(await offerInstructionDraftAfterRun(ctx, graded, { stopped: true }, grade), false);
  assert.equal(
    await offerInstructionDraftAfterRun(ctx, graded, { error: 'claude exited' }, grade),
    false,
  );
  assert.equal(gradeCalls, 0);
  assert.equal(appEvents.length, 0);
});

test('swallows grading failures without offering', async () => {
  const { ctx, appEvents, agentEvents } = fakeCtx();
  const session = gradedSession('build', []);
  const offered = await offerInstructionDraftAfterRun(ctx, session, {}, async () => {
    throw new Error('anthropic unavailable');
  });

  assert.equal(offered, false);
  assert.equal(appEvents.length, 0);
  assert.equal(agentEvents.length, 0);
});

async function seedBuildAgent(tmp: string): Promise<{ ctx: AppContext; agent: Agent }> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const binPath = path.join(tmp, 'fake-claude');
  await fs.writeFile(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'user') {
    process.stdout.write(JSON.stringify({ type: 'system', session_id: 'claude-build' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'assistant',
      session_id: 'claude-build',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Implemented the plan.' }] },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Implemented the plan.',
      session_id: 'claude-build',
    }) + '\\n');
    process.exit(0);
  }
});
`,
    { mode: 0o755 },
  );

  const notifier = new Notifier();
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService(binPath, path.join(tmp, 'runs')),
    anthropic: {
      suggestChatTitle: async () => 'Stub title',
      analyzeSessionGrade: async () => ({
        score: 2,
        summary: 'Instructions need work.',
        findings: [
          finding('instruction_files', 'issue'),
          finding('skills', 'ok'),
        ],
        stats: {
          userTurns: 1,
          assistantTurns: 1,
          estimatedTokens: 100,
          costUsd: null,
          toolCalls: 0,
          instructionFileCount: 0,
          skillCount: 0,
        },
      }),
    } as unknown as AnthropicService,
    dataDir: tmp,
    notifier,
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
    claudeSessionId: 'claude-plan',
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);
  const session = repos.sessions.create({
    id: 'plan-sess',
    agentId: agent.id,
    title: 'Chat',
    template: 'chat',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: 'claude-plan',
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  repos.agents.update({ ...agent, activeSessionId: session.id });
  repos.messages.create({
    id: 'a1',
    agentId: agent.id,
    sessionId: session.id,
    role: 'assistant',
    content: '## Plan\n\n1. Do the thing.',
    attachments: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:02.000Z',
  });

  return { ctx, agent: repos.agents.getById(agent.id)! };
}

function mockResponse(): Response {
  const res = {
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    writableEnded: false,
    on: () => undefined,
    write: () => true,
    end() {
      res.writableEnded = true;
      return res;
    },
  };
  return res as unknown as Response;
}

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test('a completed Build run grades the session and emits the offer', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-offer-build-'));
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'claude-config');
  try {
    const { ctx, agent } = await seedBuildAgent(tmp);
    const offers: AppEvent[] = [];
    ctx.notifier!.subscribe((event) => {
      if (event.type === 'instruction_draft_offer') offers.push(event);
    });

    await buildApprovedPlan(ctx, agent.id, { plan: '## Plan\n\n1. Do the thing.' }, mockResponse(), 'plan-sess');
    await waitFor(() => offers.length > 0);

    const build = ctx.repos.sessions.listByAgent(agent.id).find((item) => item.template === 'build');
    assert.ok(build);
    assert.equal(offers[0]?.agentId, agent.id);
    assert.equal(offers[0]?.sessionId, build!.id);
    assert.deepEqual(offers[0]?.data.categories, ['instruction_files']);
    assert.equal(ctx.repos.sessions.getById(build!.id)?.grade?.score, 2);
    assert.ok(
      ctx.repos.events
        .listByAgent(agent.id)
        .some((event) => event.type === 'instruction_draft_offered'),
    );
  } finally {
    if (previousConfigDir == null) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
