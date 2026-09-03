import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CHAT_SESSION_TEMPLATES,
  LISTED_CHAT_SESSION_TEMPLATES,
  buildImplementPlanPrompt,
} from '@agent-orchestrator/shared';
import { createAgentSession } from './app.js';
import { GitHubService } from './github.js';
import { seedAgent } from './chat-sessions.test-helpers.js';

test('listed templates include Create draft PR, Review, Address review, Fix CI, and Resolve conflicts', () => {
  const ids = LISTED_CHAT_SESSION_TEMPLATES.map((item) => item.id);
  assert.deepEqual(ids, [
    'chat',
    'create-draft-pr',
    'review',
    'address-review',
    'fix-ci',
    'resolve-conflicts',
  ]);
  for (const template of CHAT_SESSION_TEMPLATES) {
    assert.ok(!template.prompt?.includes('ExitPlanMode'));
    assert.ok(!template.prompt?.includes('AskUserQuestion'));
  }
  assert.ok(buildImplementPlanPrompt('# Plan').includes('Approved plan'));
});

test('createAgentSession starts a parallel session without touching the original', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-sess-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('plan-sess')!,
      status: 'running',
      pid: 1234,
      updatedAt: new Date().toISOString(),
    });

    const created = await createAgentSession(ctx, agent.id, { template: 'review' });
    assert.equal(created.session.template, 'review');
    assert.equal(created.session.permissionMode, 'plan');
    assert.ok(created.kickoffPrompt?.includes('Review'));
    assert.equal(created.session.status, 'idle');

    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 2);
    const original = sessions.find((item) => item.id === 'plan-sess');
    assert.equal(original?.status, 'running');
    assert.equal(original?.pid, 1234);
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, created.session.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession seeds address-review kickoff with live PR review context', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-address-review-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const headSha = 'a'.repeat(40);
    ctx.github = {
      getOpenPullRequestForBranch: async () => ({
        number: 42,
        title: 'Fix review',
        state: 'open',
        headRef: 'feat',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/42',
        draft: false,
        authorLogin: 'alice',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      getPullRequestDetail: async () => ({
        headSha,
        number: 42,
        title: 'Fix review',
        state: 'open',
        headRef: 'feat',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/42',
      }),
      listPullRequestReviewComments: async () => [
        {
          id: '1',
          author: { login: 'bob', avatarUrl: null, htmlUrl: null },
          body: 'Please fix the null check',
          path: 'src/foo.ts',
          line: 10,
          htmlUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
          inReplyToId: null,
          pullRequestReviewId: '9',
        },
      ],
      listPullRequestReviews: async () => [],
      listPullRequestComments: async () => [],
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'address-review' });
    assert.equal(created.session.template, 'address-review');
    assert.equal(created.session.permissionMode, 'auto');
    assert.ok(created.kickoffPrompt?.includes('PR #42'));
    assert.ok(created.kickoffPrompt?.includes('src/foo.ts:10'));
    assert.ok(created.kickoffPrompt?.includes('null check'));
    assert.equal(created.kickoffPrompt?.includes('Start by inspecting'), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession address-review kickoff states plainly when no open PR exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-address-no-pr-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.github = {
      getOpenPullRequestForBranch: async () => null,
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'address-review' });
    assert.ok(created.kickoffPrompt?.includes('No open pull request was found'));
    assert.equal(created.kickoffPrompt?.includes('Start by inspecting'), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession address-review kickoff resolves PR by stored prNumber for pr-<n> branches', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-address-pr-number-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const worktree = ctx.repos.worktrees.getById(agent.worktreeId)!;
    ctx.repos.worktrees.update({
      ...worktree,
      branch: 'pr-42',
      prNumber: 42,
      prTitle: 'Fix review',
    });
    const headSha = 'b'.repeat(40);
    let branchLookups = 0;
    ctx.github = {
      getPullRequest: async () => ({
        number: 42,
        title: 'Fix review',
        state: 'open',
        headRef: 'feature/foo',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/42',
        draft: false,
        authorLogin: 'alice',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      getOpenPullRequestForBranch: async () => {
        branchLookups += 1;
        return null;
      },
      getPullRequestDetail: async () => ({
        headSha,
        number: 42,
        title: 'Fix review',
        state: 'open',
        headRef: 'feature/foo',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/42',
      }),
      listPullRequestReviewComments: async () => [
        {
          id: '1',
          author: { login: 'bob', avatarUrl: null, htmlUrl: null },
          body: 'Please fix the null check',
          path: 'src/foo.ts',
          line: 10,
          htmlUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
          inReplyToId: null,
          pullRequestReviewId: '9',
        },
      ],
      listPullRequestReviews: async () => [],
      listPullRequestComments: async () => [],
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'address-review' });
    assert.equal(branchLookups, 0);
    assert.ok(created.kickoffPrompt?.includes('PR #42'));
    assert.ok(created.kickoffPrompt?.includes('null check'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession fix-ci kickoff includes failing checks and log excerpts', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-fix-ci-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const headSha = 'c'.repeat(40);
    ctx.github = {
      getOpenPullRequestForBranch: async () => ({
        number: 7,
        title: 'CI fix',
        state: 'open',
        headRef: 'feat',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/7',
        draft: false,
        authorLogin: 'alice',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      getPullRequestDetail: async () => ({ headSha, number: 7, title: 'CI fix' }),
      getPullRequestChecks: async () => ({
        headSha,
        rollup: 'failure',
        total: 2,
        passing: 1,
        failing: 1,
        pending: 0,
        neutral: 0,
        truncated: false,
        checks: [
          {
            id: 'check_run:1',
            name: 'build',
            source: 'check_run',
            status: 'completed',
            conclusion: 'failure',
            summary: 'Compile failed at main.go:42',
            detailsUrl: 'https://ci.example/build',
            startedAt: null,
            completedAt: null,
          },
          {
            id: 'check_run:2',
            name: 'lint',
            source: 'check_run',
            status: 'completed',
            conclusion: 'success',
            summary: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
          },
        ],
      }),
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'fix-ci' });
    assert.equal(created.session.permissionMode, 'auto');
    assert.ok(created.kickoffPrompt?.includes('Failing checks'));
    assert.ok(created.kickoffPrompt?.includes('build'));
    assert.ok(created.kickoffPrompt?.includes('Compile failed'));
    assert.ok(created.kickoffPrompt?.includes('1 other check(s) passed'));
    assert.equal(created.kickoffPrompt?.includes('Start by inspecting'), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession fix-ci kickoff states plainly when all checks are green', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-fix-ci-green-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const headSha = 'd'.repeat(40);
    ctx.github = {
      getOpenPullRequestForBranch: async () => ({
        number: 8,
        title: 'Green CI',
        state: 'open',
        headRef: 'feat',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/8',
        draft: false,
        authorLogin: 'alice',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      getPullRequestDetail: async () => ({ headSha, number: 8, title: 'Green CI' }),
      getPullRequestChecks: async () => ({
        headSha,
        rollup: 'success',
        total: 2,
        passing: 2,
        failing: 0,
        pending: 0,
        neutral: 0,
        truncated: false,
        checks: [
          {
            id: 'check_run:1',
            name: 'build',
            source: 'check_run',
            status: 'completed',
            conclusion: 'success',
            summary: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
          },
          {
            id: 'check_run:2',
            name: 'lint',
            source: 'check_run',
            status: 'completed',
            conclusion: 'success',
            summary: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
          },
        ],
      }),
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'fix-ci' });
    assert.ok(created.kickoffPrompt?.includes('No failing CI checks were found'));
    assert.ok(created.kickoffPrompt?.includes('All 2 checks are passing'));
    assert.equal(created.kickoffPrompt?.includes('Fix the failing CI checks'), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('createAgentSession kickoff falls back to inspect prompt when GitHub fetch fails', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-kickoff-fail-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.github = {
      getOpenPullRequestForBranch: async () => {
        throw new Error('rate limited');
      },
    } as unknown as GitHubService;

    const created = await createAgentSession(ctx, agent.id, { template: 'fix-ci' });
    assert.ok(created.kickoffPrompt?.includes('Could not load PR/CI context'));
    assert.ok(created.kickoffPrompt?.includes('rate limited'));
    assert.ok(created.kickoffPrompt?.includes('Start by inspecting'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
