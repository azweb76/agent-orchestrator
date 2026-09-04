import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getTaskSuggestionsOffer,
  maybeSuggestFollowUpTasks,
  parseTaskSuggestionDrafts,
} from './task-suggestions.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { GitService } from './git.js';

test('parseTaskSuggestionDrafts accepts a single suggestion', () => {
  const drafts = parseTaskSuggestionDrafts({
    suggestions: [{ title: 'Add tests', prompt: 'Add unit tests for the helper.' }],
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.title, 'Add tests');
});

test('maybeSuggestFollowUpTasks always offers chips including status actions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-task-suggestions-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.git = {
      hasChanges: async () => true,
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;
    ctx.github = {
      getPullRequestForBranch: async () => null,
    } as unknown as typeof ctx.github;
    ctx.anthropic = {
      generateTaskSuggestions: async () => [
        { id: 'llm-1', title: 'Add unit tests', prompt: 'Add unit tests for the new helper.' },
      ],
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
    ctx.repos.messages.create({
      id: 'msg-1',
      agentId: agent.id,
      sessionId: session.id,
      role: 'assistant',
      content: 'I updated the helper and left tests for later.',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:02.000Z',
    });

    await maybeSuggestFollowUpTasks(ctx, session, {});
    const offer = getTaskSuggestionsOffer(ctx, agent.id);
    assert.ok(offer);
    assert.equal(offer.sessionId, session.id);
    const titles = offer.suggestions.map((s) => s.title);
    assert.ok(titles.includes('Commit and Push'));
    assert.ok(titles.includes('Create PR (draft)'));
    assert.ok(titles.includes('Add unit tests'));
    assert.equal(
      offer.suggestions.find((s) => s.title === 'Commit and Push')?.kind,
      'commit-and-push',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('maybeSuggestFollowUpTasks offers fallback when LLM fails and tree is clean', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-task-suggestions-fallback-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.git = {
      hasChanges: async () => false,
      getDiff: async () => ({ stat: '', patch: '' }),
    } as unknown as GitService;
    ctx.anthropic = {
      generateTaskSuggestions: async () => {
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
    assert.equal(offer.suggestions.length, 1);
    assert.equal(offer.suggestions[0]?.title, 'Continue');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
