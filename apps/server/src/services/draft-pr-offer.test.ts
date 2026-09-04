import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { shouldOfferDraftPr } from '@agent-orchestrator/shared';
import {
  evaluateDraftPrConditions,
  getDraftPrOfferSessionId,
  maybeOfferDraftPrAfterBuild,
  setDraftPrOffer,
} from './draft-pr-offer.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { GitService } from './git.js';

test('shouldOfferDraftPr requires a clean build session, diff, and no open PR', () => {
  assert.equal(
    shouldOfferDraftPr({
      template: 'build',
      status: 'idle',
      hasDiff: true,
      hasOpenPr: false,
    }),
    true,
  );
  assert.equal(
    shouldOfferDraftPr({
      template: 'build',
      status: 'idle',
      hasDiff: false,
      hasOpenPr: false,
    }),
    false,
  );
  assert.equal(
    shouldOfferDraftPr({
      template: 'build',
      status: 'idle',
      hasDiff: true,
      hasOpenPr: true,
    }),
    false,
  );
  assert.equal(
    shouldOfferDraftPr({
      template: 'chat',
      status: 'idle',
      hasDiff: true,
      hasOpenPr: false,
    }),
    false,
  );
});

test('maybeOfferDraftPrAfterBuild stores a draft PR offer when eligible', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-draft-pr-offer-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.git = {
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;
    ctx.github = {
      getPullRequestForBranch: async () => null,
    } as unknown as typeof ctx.github;

    const build = ctx.repos.sessions.create({
      id: 'build-1',
      agentId: agent.id,
      title: 'Build',
      template: 'build',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'auto',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });

    await maybeOfferDraftPrAfterBuild(ctx, build, {});
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), 'build-1');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('maybeOfferDraftPrAfterBuild skips when an open PR exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-draft-pr-skip-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.worktrees.update({
      ...ctx.repos.worktrees.getById('wt-1')!,
      prNumber: 9,
      prTitle: 'Existing',
    });
    ctx.git = {
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;

    const build = ctx.repos.sessions.create({
      id: 'build-2',
      agentId: agent.id,
      title: 'Build',
      template: 'build',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'auto',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });

    await maybeOfferDraftPrAfterBuild(ctx, build, {});
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('evaluateDraftPrConditions reports ineligible when an open PR exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-draft-pr-pr-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.worktrees.update({
      ...ctx.repos.worktrees.getById('wt-1')!,
      prNumber: 9,
      prTitle: 'Existing',
    });
    ctx.git = {
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;

    const build = ctx.repos.sessions.create({
      id: 'build-3',
      agentId: agent.id,
      title: 'Build',
      template: 'build',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'auto',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });

    const result = await evaluateDraftPrConditions(ctx, agent.id, build, {});
    assert.equal(result.eligible, false);
    assert.equal(result.hasOpenPr, true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('setDraftPrOffer round-trips through getDraftPrOfferSessionId', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-draft-pr-offer-key-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    setDraftPrOffer(ctx, agent.id, 'build-99');
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), 'build-99');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
