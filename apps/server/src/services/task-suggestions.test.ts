import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getTaskSuggestionsOffer,
  maybeSuggestFollowUpTasks,
  parseTaskFollowUpSelection,
  recentAssistantMessagesFromSession,
} from './task-suggestions.js';
import { ensureBuiltInTaskFollowUps } from './task-followups.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { GitService } from './git.js';

test('parseTaskFollowUpSelection keeps known ids in order', () => {
  const ids = parseTaskFollowUpSelection(
    { followUpIds: ['a', 'missing', 'b', 'a'] },
    new Set(['a', 'b', 'c']),
  );
  assert.deepEqual(ids, ['a', 'b']);
});

test('maybeSuggestFollowUpTasks selects catalog ids via Anthropic', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-task-suggestions-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ensureBuiltInTaskFollowUps(ctx);
    ctx.git = {
      hasChanges: async () => true,
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;
    ctx.github = {
      getPullRequestForBranch: async () => null,
    } as unknown as typeof ctx.github;

    const catalog = ctx.repos.taskFollowUps.listEnabled();
    const commit = catalog.find((item) => item.name === 'commit-and-push');
    const createPr = catalog.find((item) => item.name === 'create-draft-pr');
    const continueItem = catalog.find((item) => item.name === 'continue');
    assert.ok(commit && createPr && continueItem);

    let capturedMessages: string[] | undefined;
    ctx.anthropic = {
      selectTaskFollowUps: async (input: { recentAssistantMessages: string[] }) => {
        capturedMessages = input.recentAssistantMessages;
        return [commit.id, continueItem.id];
      },
    } as unknown as typeof ctx.anthropic;

    const session = ctx.repos.sessions.create({
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
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
    for (let i = 1; i <= 6; i++) {
      ctx.repos.messages.create({
        id: `msg-${i}`,
        agentId: agent.id,
        sessionId: session.id,
        role: 'assistant',
        content: `Assistant reply ${i}`,
        attachments: [],
        metadata: {},
        createdAt: `2026-01-01T00:00:0${i}.000Z`,
      });
    }

    await maybeSuggestFollowUpTasks(ctx, session, {});
    const offer = getTaskSuggestionsOffer(ctx, agent.id);
    assert.ok(offer);
    assert.equal(offer.sessionId, session.id);
    assert.deepEqual(
      offer.suggestions.map((s) => s.title),
      ['Commit and Push', 'Continue'],
    );
    assert.equal(offer.suggestions[0]?.kind, 'commit-and-push');
    assert.ok(capturedMessages);
    assert.equal(capturedMessages.length, 5);
    assert.equal(capturedMessages[0], 'Assistant reply 2');
    assert.equal(capturedMessages[4], 'Assistant reply 6');
    assert.deepEqual(recentAssistantMessagesFromSession(ctx, session.id).length, 5);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('maybeSuggestFollowUpTasks falls back when LLM fails', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-task-suggestions-fallback-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ensureBuiltInTaskFollowUps(ctx);
    ctx.git = {
      hasChanges: async () => false,
      getDiff: async () => ({ stat: '', patch: '' }),
    } as unknown as GitService;
    ctx.anthropic = {
      selectTaskFollowUps: async () => {
        throw new Error('no key');
      },
    } as unknown as typeof ctx.anthropic;

    const session = ctx.repos.sessions.create({
      id: 'sess-2',
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
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
    ctx.repos.messages.create({
      id: 'msg-2',
      agentId: agent.id,
      sessionId: session.id,
      role: 'assistant',
      content: 'All done.',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:02.000Z',
    });

    await maybeSuggestFollowUpTasks(ctx, session, {});
    const offer = getTaskSuggestionsOffer(ctx, agent.id);
    assert.ok(offer);
    assert.ok(offer.suggestions.some((s) => s.title === 'Create PR (draft)'));
    assert.ok(offer.suggestions.every((s) => s.description));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
