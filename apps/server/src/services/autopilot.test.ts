import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  resolveAutopilotEnabled,
  shouldOfferDraftPr,
} from '@agent-orchestrator/shared';
import { setAutomationSettings } from './automation-settings.js';
import {
  clearAutopilotChain,
  evaluateDraftPrConditions,
  getDraftPrOfferSessionId,
  hasActiveAutopilotChain,
  isAutopilotEnabled,
  maybeAutopilotAfterBuild,
  setDraftPrOffer,
} from './autopilot.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { GitService } from './git.js';

test('resolveAutopilotEnabled prefers per-agent override over global default', () => {
  assert.equal(resolveAutopilotEnabled({ autopilot: false }, true), true);
  assert.equal(resolveAutopilotEnabled({ autopilot: true }, false), false);
  assert.equal(resolveAutopilotEnabled({ autopilot: true }, null), true);
});

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

test('maybeAutopilotAfterBuild stores a draft PR offer when autopilot is off', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-autopilot-offer-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    setAutomationSettings(ctx, { autopilot: false });
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

    await maybeAutopilotAfterBuild(ctx, build, {});
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), 'build-1');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('maybeAutopilotAfterBuild auto-starts create-draft-pr when autopilot is on', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-autopilot-auto-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    setAutomationSettings(ctx, { autopilot: true });
    ctx.git = {
      getDiff: async () => ({ stat: ' README.md | 1 +', patch: 'diff' }),
    } as unknown as GitService;
    ctx.github = {
      getPullRequestForBranch: async () => null,
    } as unknown as typeof ctx.github;

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

    await maybeAutopilotAfterBuild(ctx, build, {});
    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.ok(sessions.some((item) => item.template === 'create-draft-pr'));
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), null);
    assert.equal(hasActiveAutopilotChain(ctx, agent.id), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('evaluateDraftPrConditions reports ineligible when an open PR exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-autopilot-pr-'));
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

    beginChain(ctx, agent.id);
    const result = await evaluateDraftPrConditions(ctx, agent.id, build, {});
    assert.equal(result.eligible, false);
    assert.equal(result.hasOpenPr, true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('isAutopilotEnabled respects per-agent override', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-autopilot-agent-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    setAutomationSettings(ctx, { autopilot: false });
    assert.equal(isAutopilotEnabled(ctx, agent.id), false);
    ctx.repos.agents.update({ ...agent, autopilot: true });
    assert.equal(isAutopilotEnabled(ctx, agent.id), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

function beginChain(ctx: Parameters<typeof clearAutopilotChain>[0], agentId: string): void {
  ctx.repos.automationState.set(`autopilot.chain:${agentId}`, JSON.stringify({ phase: 'build' }));
}

test('setDraftPrOffer round-trips through getDraftPrOfferSessionId', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-autopilot-offer-key-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    setDraftPrOffer(ctx, agent.id, 'build-99');
    assert.equal(getDraftPrOfferSessionId(ctx, agent.id), 'build-99');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
