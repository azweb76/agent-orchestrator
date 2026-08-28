import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AppEvent } from '@agent-orchestrator/shared';
import { FIX_CI_RETRY_CAP } from '@agent-orchestrator/shared';
import { Notifier } from './notifier.js';
import { setAutomationSettings } from './automation-settings.js';
import {
  getCachedPrStatus,
  handleAutomationEvents,
  pollTargetState,
  type GithubPrChangeEvent,
} from './github-automation.js';
import type { PollTarget } from './github-poll-targets.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { GitHubService } from './github.js';

const headSha = 'a'.repeat(40);

function checksResult(rollup: 'success' | 'failure' | 'pending' | 'neutral' | 'none' = 'success') {
  return {
    headSha,
    rollup,
    total: 1,
    passing: rollup === 'success' ? 1 : 0,
    failing: rollup === 'failure' ? 1 : 0,
    pending: rollup === 'pending' ? 1 : 0,
    neutral: rollup === 'neutral' ? 1 : 0,
    truncated: false,
    checks: [],
  };
}

function prDetail(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'example',
    repo: 'demo',
    number: 42,
    title: 'Fix things',
    body: '',
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    rebaseable: true,
    headRef: 'feat',
    baseRef: 'main',
    headSha,
    baseSha: 'b'.repeat(40),
    htmlUrl: 'https://github.com/example/demo/pull/42',
    author: null,
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    commentCount: 0,
    reviewCommentCount: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    mergeCommitSha: null,
    allowedMergeMethods: ['squash'],
    deleteBranchOnMerge: false,
    workspaceId: 'ws-1',
    agentId: 'ag-1',
    ...overrides,
  };
}

function mockGithub(overrides: Partial<GitHubService> = {}): GitHubService {
  return {
    getPullRequestDetail: async () => prDetail(),
    getPullRequestChecks: async () => checksResult(),
    listPullRequestReviews: async () => [],
    listPullRequestReviewComments: async () => [],
    listAuthoredOpenPullRequests: async () => [],
    listReviewRequestedPullRequests: async () => [],
    ...overrides,
  } as unknown as GitHubService;
}

function captureEvents(notifier: Notifier): AppEvent[] {
  const events: AppEvent[] = [];
  notifier.subscribe((event) => events.push(event));
  return events;
}

function target(overrides: Partial<PollTarget> = {}): PollTarget {
  return {
    owner: 'example',
    repo: 'demo',
    number: 42,
    agentId: 'ag-1',
    worktreeId: 'wt-1',
    authored: true,
    reviewRequested: false,
    ...overrides,
  };
}

test('pollTargetState emits github_pr_changed when checks transition to failure', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-auto-poll-'));
  try {
    const { ctx } = await seedAgent(tmp);
    const notifier = new Notifier();
    ctx.notifier = notifier;
    const events = captureEvents(notifier);

    let rollup: 'success' | 'failure' = 'success';
    ctx.github = mockGithub({
      getPullRequestChecks: async () => checksResult(rollup),
    });

    await pollTargetState(ctx, target());
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'github_pr_changed');
    assert.equal(events[0]?.data.kind, 'checks');

    rollup = 'failure';
    const polled = await pollTargetState(ctx, target());
    assert.equal(polled.some((item) => item.kind === 'checks' && item.checksRollup === 'failure'), true);
    assert.equal(events.filter((item) => item.type === 'github_pr_changed').length, 2);

    const cachedStatus = getCachedPrStatus(ctx, 'example', 'demo', 42);
    assert.equal(cachedStatus?.checksRollup, 'failure');
    assert.equal(cachedStatus?.state, 'open');
    assert.equal(cachedStatus?.merged, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('auto Fix CI enqueues a session and respects retry cap per commit SHA', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-auto-fixci-'));
  try {
    const { ctx } = await seedAgent(tmp);
    const notifier = new Notifier();
    ctx.notifier = notifier;
    const appEvents = captureEvents(notifier);

    ctx.repos.worktrees.update({
      ...ctx.repos.worktrees.getById('wt-1')!,
      prNumber: 42,
      prTitle: 'Fix things',
    });

    setAutomationSettings(ctx, { enabled: true, autoFixCi: true });
    ctx.github = mockGithub({
      getPullRequestChecks: async () => checksResult('failure'),
    });

    const change: GithubPrChangeEvent = {
      kind: 'checks',
      owner: 'example',
      repo: 'demo',
      number: 42,
      agentId: 'ag-1',
      headSha,
      checksRollup: 'failure',
    };

    await handleAutomationEvents(ctx, target(), [change]);
    const fixCiSessions = ctx.repos.sessions
      .listByAgent('ag-1')
      .filter((item) => item.template === 'fix-ci');
    assert.equal(fixCiSessions.length, 1);
    assert.ok(appEvents.some((item) => item.type === 'automation_triggered' && item.data.action === 'fix_ci_started'));

    await handleAutomationEvents(ctx, target(), [change]);
    assert.equal(
      ctx.repos.sessions.listByAgent('ag-1').filter((item) => item.template === 'fix-ci').length,
      1,
    );

    for (let i = 0; i < FIX_CI_RETRY_CAP; i += 1) {
      const current = ctx.repos.sessions
        .listByAgent('ag-1')
        .find((item) => item.template === 'fix-ci');
      if (current) ctx.repos.sessions.delete(current.id);
      await handleAutomationEvents(ctx, target(), [change]);
    }

    await handleAutomationEvents(ctx, target(), [change]);
    assert.ok(
      appEvents.some((item) => item.type === 'automation_triggered' && item.data.action === 'fix_ci_cap_hit'),
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('address review dedupes historical comments on first poll', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-auto-review-'));
  try {
    const { ctx } = await seedAgent(tmp);
    const notifier = new Notifier();
    ctx.notifier = notifier;
    const events = captureEvents(notifier);

    ctx.repos.worktrees.update({
      ...ctx.repos.worktrees.getById('wt-1')!,
      prNumber: 42,
    });
    setAutomationSettings(ctx, { enabled: true, autoAddressReview: true });

    const reviewComments = [
      {
        id: 'c1',
        author: { login: 'bob', avatarUrl: null, htmlUrl: null },
        body: 'fix this',
        path: 'src/a.ts',
        line: 1,
        htmlUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
        inReplyToId: null,
        pullRequestReviewId: 'r1',
      },
    ];

    ctx.github = mockGithub({
      listPullRequestReviewComments: async () => reviewComments,
      listPullRequestReviews: async () => [
        {
          id: 'r1',
          author: { login: 'bob', avatarUrl: null, htmlUrl: null },
          state: 'CHANGES_REQUESTED',
          body: 'please fix',
          htmlUrl: null,
          submittedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const first = await pollTargetState(ctx, target());
    assert.equal(first.some((item) => item.kind === 'reviews'), false);

    reviewComments.push({
      id: 'c2',
      author: { login: 'bob', avatarUrl: null, htmlUrl: null },
      body: 'also this',
      path: 'src/b.ts',
      line: 2,
      htmlUrl: null,
      createdAt: '2026-01-02T00:00:00Z',
      inReplyToId: null,
      pullRequestReviewId: 'r1',
    });

    const second = await pollTargetState(ctx, target());
    assert.equal(second.some((item) => item.kind === 'reviews'), true);

    await handleAutomationEvents(ctx, target(), second);
    assert.equal(
      ctx.repos.sessions.listByAgent('ag-1').filter((item) => item.template === 'address-review').length,
      1,
    );
    assert.ok(events.some((item) => item.type === 'automation_triggered' && item.data.action === 'address_review_started'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('auto-archive skips dirty worktree unless allowDirty is enabled', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-auto-archive-'));
  try {
    const { ctx } = await seedAgent(tmp);
    const notifier = new Notifier();
    ctx.notifier = notifier;
    const events = captureEvents(notifier);

    ctx.repos.worktrees.update({
      ...ctx.repos.worktrees.getById('wt-1')!,
      prNumber: 42,
    });
    setAutomationSettings(ctx, { enabled: true, autoArchiveOnMerge: true });

    execSync('git init', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });
    await fs.writeFile(path.join(tmp, 'dirty.txt'), 'wip\n');

    const mergedEvent: GithubPrChangeEvent = {
      kind: 'merged',
      owner: 'example',
      repo: 'demo',
      number: 42,
      agentId: 'ag-1',
      merged: true,
    };

    await handleAutomationEvents(ctx, target(), [mergedEvent]);
    assert.equal(ctx.repos.agents.getById('ag-1')?.archivedAt, null);
    assert.ok(events.some((item) => item.data.action === 'archive_skipped' && item.data.reason === 'dirty_worktree'));

    setAutomationSettings(ctx, { autoArchiveAllowDirty: true });
    await handleAutomationEvents(ctx, target(), [mergedEvent]);
    assert.ok(ctx.repos.agents.getById('ag-1')?.archivedAt);
    assert.ok(events.some((item) => item.data.action === 'archive_completed'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
