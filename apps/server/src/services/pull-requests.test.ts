import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app.js';
import { getPullRequestInbox } from './pull-requests.js';
import type { GitHubService } from './github.js';
import type { SearchedPullRequest } from './github/raw-types.js';

function makePr(overrides: Partial<SearchedPullRequest> & { owner: string; repo: string; number: number }): SearchedPullRequest {
  return {
    title: `PR #${overrides.number}`,
    state: 'open',
    htmlUrl: `https://github.com/${overrides.owner}/${overrides.repo}/pull/${overrides.number}`,
    draft: false,
    authorLogin: 'dan',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function makeCtx(github: Partial<GitHubService>): Promise<AppContext> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-pr-inbox-'));
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return {
    repos,
    git: {} as AppContext['git'],
    github: github as unknown as GitHubService,
    jira: {} as AppContext['jira'],
    claude: {} as AppContext['claude'],
    anthropic: {} as AppContext['anthropic'],
    dataDir: tmp,
  };
}

test('getPullRequestInbox excludes PRs from an archived repo', async () => {
  const archivedPr = makePr({ owner: 'acme', repo: 'archived-repo', number: 1 });
  const activePr = makePr({ owner: 'acme', repo: 'active-repo', number: 2 });

  const ctx = await makeCtx({
    listAuthoredOpenPullRequests: async () => [archivedPr, activePr],
    listReviewRequestedPullRequests: async () => [],
    isRepoArchived: async (_owner: string, repo: string) => repo === 'archived-repo',
  });

  const inbox = await getPullRequestInbox(ctx);

  assert.equal(inbox.authored.length, 1);
  assert.equal(inbox.authored[0].repo, 'active-repo');
});

test('getPullRequestInbox fails open when a per-repo archived lookup errors', async () => {
  const flakyPr = makePr({ owner: 'acme', repo: 'flaky-repo', number: 1 });
  const okPr = makePr({ owner: 'acme', repo: 'ok-repo', number: 2 });

  const ctx = await makeCtx({
    listAuthoredOpenPullRequests: async () => [flakyPr, okPr],
    listReviewRequestedPullRequests: async () => [],
    isRepoArchived: async (_owner: string, repo: string) => {
      if (repo === 'flaky-repo') throw new Error('boom');
      return false;
    },
  });

  const inbox = await getPullRequestInbox(ctx);

  const repos = inbox.authored.map((pr) => pr.repo).sort();
  assert.deepEqual(repos, ['flaky-repo', 'ok-repo']);
});

test('getPullRequestInbox dedupes archived lookups for PRs in the same repo', async () => {
  const firstPr = makePr({ owner: 'acme', repo: 'shared-repo', number: 1 });
  const secondPr = makePr({ owner: 'acme', repo: 'shared-repo', number: 2 });

  let callCount = 0;
  const ctx = await makeCtx({
    listAuthoredOpenPullRequests: async () => [firstPr, secondPr],
    listReviewRequestedPullRequests: async () => [],
    isRepoArchived: async () => {
      callCount += 1;
      return false;
    },
  });

  const inbox = await getPullRequestInbox(ctx);

  assert.equal(callCount, 1);
  const numbers = inbox.authored.map((pr) => pr.number).sort();
  assert.deepEqual(numbers, [1, 2]);
});
