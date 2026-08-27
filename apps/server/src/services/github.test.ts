import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubApiError, GitHubService } from './github.js';

interface RawRepo {
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
}

function rawRepo(owner: string, name: string): RawRepo {
  return {
    owner: { login: owner },
    name,
    full_name: `${owner}/${name}`,
    html_url: `https://github.com/${owner}/${name}`,
    description: null,
    private: false,
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function pageOf(url: string): number {
  return Number(new URL(url).searchParams.get('page') ?? '1');
}

function rawPr(number: number, title: string, state: string, headRef: string): unknown {
  return {
    number,
    title,
    state,
    draft: false,
    html_url: `https://github.com/azweb76/agent-orchestrator/pull/${number}`,
    head: { ref: headRef },
    base: { ref: 'main' },
    user: { login: 'azweb76' },
    updated_at: '2026-01-15T12:00:00Z',
  };
}

test('searchRepositories matches substring against repo name alone', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator'), rawRepo('azweb76', 'other-repo')];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('orch');

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'agent-orchestrator');
});

test('searchRepositories matches "owner/partial-name" spanning substrings', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator'), rawRepo('someoneelse', 'agent-tool')];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('76/agent');

  assert.equal(results.length, 1);
  assert.equal(results[0].fullName, 'azweb76/agent-orchestrator');
});

test('searchRepositories ranks prefix matches above pure substring matches', async (t) => {
  // "agent-tool" only contains "orchestrator"-adjacent text as a substring via owner name,
  // while "agent-orchestrator" starts with "agent".
  const substringOnly = rawRepo('has-agent-in-owner', 'unrelated-repo');
  const prefixMatch = rawRepo('azweb76', 'agent-orchestrator');
  // Order the raw list so the substring-only match comes first (mimicking "pushed" order),
  // to prove ranking reorders them rather than just preserving input order.
  const repos = [substringOnly, prefixMatch];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('agent');

  assert.equal(results.length, 2);
  assert.equal(results[0].fullName, 'azweb76/agent-orchestrator');
  assert.equal(results[1].fullName, 'has-agent-in-owner/unrelated-repo');
});

test('searchRepositories with empty query returns cached list order, capped at 30', async (t) => {
  const repos = Array.from({ length: 40 }, (_, i) => rawRepo('azweb76', `repo-${i}`));
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('');

  assert.equal(results.length, 30);
  assert.deepEqual(
    results.map((r) => r.name),
    repos.slice(0, 30).map((r) => r.name),
  );
});

test('searchRepositories caps results at 30 even when more repos match', async (t) => {
  const repos = Array.from({ length: 40 }, (_, i) => rawRepo('azweb76', `agent-repo-${i}`));
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('agent');

  assert.equal(results.length, 30);
});

test('searchRepositories throws when no token is configured', async () => {
  const service = new GitHubService({});
  await assert.rejects(() => service.searchRepositories('anything'), /GitHub token is not configured/);
});

test('getAllAccessibleRepos paginates until a short page, mapping all pages', async (t) => {
  const page1 = Array.from({ length: 100 }, (_, i) => rawRepo('azweb76', `repo-p1-${i}`));
  const page2 = Array.from({ length: 40 }, (_, i) => rawRepo('azweb76', `repo-p2-${i}`));

  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
    const page = pageOf(url);
    return jsonResponse(page === 1 ? page1 : page2);
  });

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('');

  assert.equal(fetchMock.mock.callCount(), 2);
  // 100 + 40 repos fetched in total, but the search result itself is capped at 30.
  assert.equal(results.length, 30);
});

test('getAllAccessibleRepos stops after the 5-page cap even if pages stay full', async (t) => {
  const fullPage = Array.from({ length: 100 }, (_, i) => rawRepo('azweb76', `repo-${i}`));

  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(fullPage));

  const service = new GitHubService({ token: 'tok' });
  await service.searchRepositories('');

  assert.equal(fetchMock.mock.callCount(), 5);
});

test('getAllAccessibleRepos caches results within the TTL, avoiding refetch', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator')];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

  const service = new GitHubService({ token: 'tok' });
  await service.searchRepositories('');
  await service.searchRepositories('agent');

  assert.equal(fetchMock.mock.callCount(), 1);
});

test('getPullRequestForBranch returns null when no PR matches the branch', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([]));

  const service = new GitHubService({ token: 'tok' });
  const result = await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  assert.equal(result, null);
});

test('getPullRequestForBranch returns the mapped PR when one is found', async (t) => {
  const prs = [rawPr(42, 'Add feature', 'open', 'feature/foo')];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(prs));

  const service = new GitHubService({ token: 'tok' });
  const result = await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  assert.deepEqual(result, {
    number: 42,
    title: 'Add feature',
    state: 'open',
    headRef: 'feature/foo',
    baseRef: 'main',
    htmlUrl: 'https://github.com/azweb76/agent-orchestrator/pull/42',
    draft: false,
    authorLogin: 'azweb76',
    updatedAt: '2026-01-15T12:00:00Z',
  });
});

test('getPullRequestForBranch queries GitHub with the owner:branch head filter and state=all', async (t) => {
  let requestedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requestedUrl = url;
    return jsonResponse([]);
  });

  const service = new GitHubService({ token: 'tok' });
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, '/repos/azweb76/agent-orchestrator/pulls');
  assert.equal(parsed.searchParams.get('head'), 'azweb76:feature/foo');
  assert.equal(parsed.searchParams.get('state'), 'all');
});

test('getPullRequestForBranch caches the result per owner/repo/branch within the TTL', async (t) => {
  const prs = [rawPr(42, 'Add feature', 'open', 'feature/foo')];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(prs));

  const service = new GitHubService({ token: 'tok' });
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  assert.equal(fetchMock.mock.callCount(), 1);
});

test('getPullRequestForBranch refetches for a different branch (separate cache key)', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse([]));

  const service = new GitHubService({ token: 'tok' });
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/bar');

  assert.equal(fetchMock.mock.callCount(), 2);
});

function searchIssue(overrides: {
  number: number;
  title: string;
  owner?: string;
  repo?: string;
  isPr?: boolean;
}) {
  const owner = overrides.owner ?? 'azweb76';
  const repo = overrides.repo ?? 'agent-orchestrator';
  return {
    number: overrides.number,
    title: overrides.title,
    state: 'open',
    draft: false,
    html_url: `https://github.com/${owner}/${repo}/pull/${overrides.number}`,
    updated_at: '2026-02-01T00:00:00Z',
    user: { login: 'octocat' },
    repository_url: `https://api.github.com/repos/${owner}/${repo}`,
    pull_request: overrides.isPr === false ? undefined : { url: 'https://api.github.com/pulls/1' },
  };
}

test('searchRepositoryPullRequests with empty query lists open PRs', async (t) => {
  const prs = [rawPr(1, 'Open PR', 'open', 'feature/one')];
  let requestedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requestedUrl = url;
    return jsonResponse(prs);
  });

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositoryPullRequests('azweb76', 'agent-orchestrator', '  ');

  assert.equal(results.length, 1);
  assert.equal(results[0].number, 1);
  assert.match(requestedUrl, /\/repos\/azweb76\/agent-orchestrator\/pulls\?state=open/);
});

test('searchRepositoryPullRequests searches GitHub issues scoped to the repo', async (t) => {
  let requestedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requestedUrl = url;
    return jsonResponse({
      items: [
        searchIssue({ number: 9, title: 'Fix login' }),
        searchIssue({ number: 10, title: 'Not a PR', isPr: false }),
        searchIssue({ number: 11, title: 'Other repo', owner: 'someone', repo: 'else' }),
      ],
    });
  });

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositoryPullRequests('azweb76', 'agent-orchestrator', 'login');

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, '/search/issues');
  assert.equal(parsed.searchParams.get('q'), 'is:pr repo:azweb76/agent-orchestrator login');
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    number: 9,
    title: 'Fix login',
    state: 'open',
    headRef: '',
    baseRef: '',
    htmlUrl: 'https://github.com/azweb76/agent-orchestrator/pull/9',
    draft: false,
    authorLogin: 'octocat',
    updatedAt: '2026-02-01T00:00:00Z',
  });
});

test('searchRepositoryPullRequests looks up a number via search and the PR endpoint', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/search/issues')) {
      return jsonResponse({ items: [] });
    }
    return jsonResponse(rawPr(42, 'Add feature', 'open', 'feature/foo'));
  });

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositoryPullRequests(
    'azweb76',
    'agent-orchestrator',
    'https://github.com/azweb76/agent-orchestrator/pull/42',
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].number, 42);
  assert.equal(results[0].headRef, 'feature/foo');
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('searchRepositoryPullRequests strips search operators from free text', async (t) => {
  let requestedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requestedUrl = url;
    return jsonResponse({ items: [] });
  });

  const service = new GitHubService({ token: 'tok' });
  await service.searchRepositoryPullRequests('azweb76', 'agent-orchestrator', 'repo:evil "quoted"');

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.searchParams.get('q'), 'is:pr repo:azweb76/agent-orchestrator repo evil quoted');
});

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** 202/204 responses from write endpoints can carry no body at all. */
function emptyResponse(status: number): Response {
  return {
    ok: true,
    status,
    json: async () => {
      throw new Error('no body');
    },
    text: async () => '',
  } as unknown as Response;
}

function rawPrDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 42,
    title: 'Add feature',
    body: 'Body text',
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    rebaseable: true,
    html_url: 'https://github.com/azweb76/agent-orchestrator/pull/42',
    user: { login: 'dclayton', avatar_url: 'https://avatars/1', html_url: 'https://github.com/dclayton' },
    head: { ref: 'feature/foo', sha: 'a'.repeat(40) },
    base: { ref: 'main', sha: 'b'.repeat(40) },
    additions: 12,
    deletions: 3,
    changed_files: 2,
    commits: 4,
    comments: 1,
    review_comments: 5,
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    merged_at: null,
    closed_at: null,
    merge_commit_sha: 'c'.repeat(40),
    ...overrides,
  };
}

const REPO_SETTINGS = {
  allow_merge_commit: true,
  allow_squash_merge: true,
  allow_rebase_merge: true,
  delete_branch_on_merge: true,
};

/** Route mocked fetches by pathname so parallel detail+settings calls both resolve. */
function routeFetch(
  t: { mock: { method: typeof import('node:test').mock.method } },
  handlers: Array<[RegExp, (url: string) => Response]>,
) {
  return t.mock.method(globalThis, 'fetch', async (url: string) => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(new URL(url).pathname)) return handler(url);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

test('getPullRequestDetail maps the full payload and repo merge settings', async (t) => {
  routeFetch(t, [
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail())],
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);

  assert.equal(pr.body, 'Body text');
  assert.equal(pr.author?.login, 'dclayton');
  assert.equal(pr.mergeable, true);
  assert.equal(pr.mergeableState, 'clean');
  assert.equal(pr.headSha, 'a'.repeat(40));
  assert.equal(pr.additions, 12);
  assert.equal(pr.deletions, 3);
  assert.equal(pr.changedFiles, 2);
  assert.equal(pr.commitCount, 4);
  assert.equal(pr.commentCount, 1);
  assert.equal(pr.reviewCommentCount, 5);
  assert.deepEqual(pr.labels, [{ name: 'enhancement', color: 'a2eeef' }]);
  assert.deepEqual(pr.allowedMergeMethods, ['merge', 'squash', 'rebase']);
  assert.equal(pr.deleteBranchOnMerge, true);
});

test('getPullRequestDetail derives allowedMergeMethods from repo settings', async (t) => {
  routeFetch(t, [
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail())],
    [
      /^\/repos\/azweb76\/agent-orchestrator$/,
      () => jsonResponse({ ...REPO_SETTINGS, allow_merge_commit: false, allow_rebase_merge: false }),
    ],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);

  assert.deepEqual(pr.allowedMergeMethods, ['squash']);
});

test('getPullRequestDetail retries while GitHub is still computing mergeability', async (t) => {
  let prCalls = 0;
  routeFetch(t, [
    [
      /\/pulls\/42$/,
      () => {
        prCalls++;
        return jsonResponse(
          prCalls === 1
            ? rawPrDetail({ mergeable: null, mergeable_state: 'unknown' })
            : rawPrDetail({ mergeable: true, mergeable_state: 'clean' }),
        );
      },
    ],
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);

  assert.equal(prCalls, 2);
  assert.equal(pr.mergeableState, 'clean');
});

test('getPullRequestDetail reports unknown honestly when mergeability never resolves', async (t) => {
  let prCalls = 0;
  routeFetch(t, [
    [
      /\/pulls\/42$/,
      () => {
        prCalls++;
        return jsonResponse(rawPrDetail({ mergeable: null, mergeable_state: 'unknown' }));
      },
    ],
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);

  // Initial request plus the two bounded retries.
  assert.equal(prCalls, 3);
  assert.equal(pr.mergeable, null);
  assert.equal(pr.mergeableState, 'unknown');
});

test('getPullRequestDetail does not retry a merged or closed pull request', async (t) => {
  let prCalls = 0;
  routeFetch(t, [
    [
      /\/pulls\/42$/,
      () => {
        prCalls++;
        return jsonResponse(
          rawPrDetail({ state: 'closed', merged: true, mergeable: null, mergeable_state: 'unknown' }),
        );
      },
    ],
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);

  assert.equal(prCalls, 1);
  assert.equal(pr.merged, true);
});

test('getPullRequestChecks merges check runs with legacy commit statuses', async (t) => {
  routeFetch(t, [
    [
      /\/check-runs$/,
      () =>
        jsonResponse({
          total_count: 1,
          check_runs: [
            {
              id: 1,
              name: 'build',
              status: 'completed',
              conclusion: 'success',
              output: { title: 'Build passed' },
              details_url: 'https://ci/build',
              started_at: '2026-01-01T00:00:00Z',
              completed_at: '2026-01-01T00:05:00Z',
            },
          ],
        }),
    ],
    [
      /\/status$/,
      () =>
        jsonResponse({
          statuses: [
            {
              id: 9,
              context: 'legacy/lint',
              state: 'success',
              description: 'Lint clean',
              target_url: 'https://ci/lint',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:02:00Z',
            },
          ],
        }),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const checks = await service.getPullRequestChecks('azweb76', 'agent-orchestrator', 'a'.repeat(40));

  assert.equal(checks.total, 2);
  assert.equal(checks.passing, 2);
  assert.equal(checks.rollup, 'success');
  assert.equal(checks.truncated, false);
  assert.deepEqual(
    checks.checks.map((check) => [check.name, check.source, check.status, check.conclusion]),
    [
      ['build', 'check_run', 'completed', 'success'],
      ['legacy/lint', 'status', 'completed', 'success'],
    ],
  );
  assert.equal(checks.checks[1].detailsUrl, 'https://ci/lint');
});

test('getPullRequestChecks rolls up to failure when only a legacy status failed', async (t) => {
  routeFetch(t, [
    [
      /\/check-runs$/,
      () =>
        jsonResponse({
          total_count: 1,
          check_runs: [{ id: 1, name: 'build', status: 'completed', conclusion: 'success' }],
        }),
    ],
    [
      /\/status$/,
      () =>
        jsonResponse({
          statuses: [
            { id: 9, context: 'legacy/lint', state: 'failure', description: null, target_url: null },
          ],
        }),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const checks = await service.getPullRequestChecks('azweb76', 'agent-orchestrator', 'a'.repeat(40));

  assert.equal(checks.rollup, 'failure');
  assert.equal(checks.failing, 1);
  assert.equal(checks.passing, 1);
});

test('getPullRequestChecks maps a pending legacy status to an in-progress check', async (t) => {
  routeFetch(t, [
    [/\/check-runs$/, () => jsonResponse({ total_count: 0, check_runs: [] })],
    [
      /\/status$/,
      () =>
        jsonResponse({
          statuses: [
            { id: 9, context: 'legacy/lint', state: 'pending', description: 'Running', target_url: null },
          ],
        }),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const checks = await service.getPullRequestChecks('azweb76', 'agent-orchestrator', 'a'.repeat(40));

  assert.equal(checks.checks[0].status, 'in_progress');
  assert.equal(checks.checks[0].conclusion, null);
  assert.equal(checks.pending, 1);
  assert.equal(checks.rollup, 'pending');
});

test('getPullRequestChecks reports an empty rollup when there are no checks at all', async (t) => {
  routeFetch(t, [
    [/\/check-runs$/, () => jsonResponse({ total_count: 0, check_runs: [] })],
    [/\/status$/, () => jsonResponse({ statuses: [] })],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const checks = await service.getPullRequestChecks('azweb76', 'agent-orchestrator', 'a'.repeat(40));

  assert.equal(checks.total, 0);
  assert.equal(checks.rollup, 'none');
  assert.equal(checks.truncated, false);
});

test('getPullRequestChecks paginates check runs up to total_count', async (t) => {
  const page = (start: number) =>
    Array.from({ length: 100 }, (_, i) => ({
      id: start + i,
      name: `check-${start + i}`,
      status: 'completed',
      conclusion: 'success',
    }));

  const pages: string[] = [];
  routeFetch(t, [
    [
      /\/check-runs$/,
      (url) => {
        const requested = Number(new URL(url).searchParams.get('page'));
        pages.push(String(requested));
        return jsonResponse({ total_count: 150, check_runs: requested === 1 ? page(0) : page(100).slice(0, 50) });
      },
    ],
    [/\/status$/, () => jsonResponse({ statuses: [] })],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const checks = await service.getPullRequestChecks('azweb76', 'agent-orchestrator', 'a'.repeat(40));

  assert.deepEqual(pages, ['1', '2']);
  assert.equal(checks.total, 150);
  assert.equal(checks.truncated, false);
});

test('getPullRequestChecks requests the head sha, not the test merge commit', async (t) => {
  const requested: string[] = [];
  routeFetch(t, [
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail())],
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
    [
      /\/check-runs$/,
      (url) => {
        requested.push(new URL(url).pathname);
        return jsonResponse({ total_count: 0, check_runs: [] });
      },
    ],
    [/\/status$/, () => jsonResponse({ statuses: [] })],
  ]);

  const service = new GitHubService({ token: 'tok', mergeabilityRetryDelayMs: 0 });
  const pr = await service.getPullRequestDetail('azweb76', 'agent-orchestrator', 42);
  await service.getPullRequestChecks('azweb76', 'agent-orchestrator', pr.headSha);

  assert.equal(requested.length, 1);
  assert.match(requested[0], new RegExp(`/commits/${'a'.repeat(40)}/check-runs$`));
  assert.doesNotMatch(requested[0], /c{40}/);
});

test('mergePullRequest sends PUT with the merge method and expected head sha', async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse({ merged: true, message: 'Pull Request successfully merged', sha: 'd'.repeat(40) });
  });

  const service = new GitHubService({ token: 'tok' });
  const result = await service.mergePullRequest('azweb76', 'agent-orchestrator', 42, {
    method: 'squash',
    commitTitle: 'Add feature (#42)',
    expectedHeadSha: 'a'.repeat(40),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'PUT');
  assert.match(new URL(calls[0].url).pathname, /\/pulls\/42\/merge$/);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    merge_method: 'squash',
    commit_title: 'Add feature (#42)',
    sha: 'a'.repeat(40),
  });
  assert.equal(result.merged, true);
  assert.equal(result.sha, 'd'.repeat(40));
});

test('mergePullRequest surfaces GitHub message and status on a 405', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    errorResponse(405, { message: 'Pull Request is not mergeable' }),
  );

  const service = new GitHubService({ token: 'tok' });
  await assert.rejects(
    () => service.mergePullRequest('azweb76', 'agent-orchestrator', 42, { method: 'merge' }),
    (error: unknown) => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.status, 405);
      assert.equal(error.message, 'Pull Request is not mergeable');
      return true;
    },
  );
});

test('mergePullRequest invalidates the branch→PR cache so agent pages refetch', async (t) => {
  let prListCalls = 0;
  routeFetch(t, [
    [
      /\/pulls$/,
      () => {
        prListCalls++;
        return jsonResponse([rawPr(42, 'Add feature', 'open', 'feature/foo')]);
      },
    ],
    [/\/pulls\/42\/merge$/, () => jsonResponse({ merged: true, message: 'merged', sha: 'd'.repeat(40) })],
  ]);

  const service = new GitHubService({ token: 'tok' });
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');
  await service.mergePullRequest('azweb76', 'agent-orchestrator', 42, { method: 'merge' });
  await service.getPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  assert.equal(prListCalls, 2);
});

test('updatePullRequestBranch accepts a 202 with a message body', async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    calls.push(init);
    return jsonResponse({ message: 'Updating pull request branch.' });
  });

  const service = new GitHubService({ token: 'tok' });
  const result = await service.updatePullRequestBranch('azweb76', 'agent-orchestrator', 42, 'a'.repeat(40));

  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[0].body)), { expected_head_sha: 'a'.repeat(40) });
  assert.equal(result.queued, true);
  assert.equal(result.message, 'Updating pull request branch.');
});

test('updatePullRequestBranch tolerates a body-less 204', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => emptyResponse(204));

  const service = new GitHubService({ token: 'tok' });
  const result = await service.updatePullRequestBranch('azweb76', 'agent-orchestrator', 42);

  assert.equal(result.queued, true);
  assert.equal(result.message, 'Updating pull request branch.');
});

test('setPullRequestState sends PATCH with the new state', async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  routeFetch(t, [
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail({ state: 'closed', closed_at: '2026-01-03T00:00:00Z' }))],
  ]);
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (init?.method === 'PATCH') calls.push({ url, init });
    return original(url as never, init as never);
  });

  const service = new GitHubService({ token: 'tok' });
  const pr = await service.setPullRequestState('azweb76', 'agent-orchestrator', 42, 'closed');

  assert.equal(calls.length, 1);
  assert.match(new URL(calls[0].url).pathname, /\/pulls\/42$/);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { state: 'closed' });
  assert.equal(pr.state, 'closed');
});

test('listPullRequestFiles tolerates a missing patch on binary files', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    jsonResponse([
      {
        filename: 'logo.png',
        status: 'added',
        additions: 0,
        deletions: 0,
        changes: 0,
        blob_url: 'https://github.com/blob/logo.png',
      },
      {
        filename: 'src/index.ts',
        previous_filename: 'src/old.ts',
        status: 'renamed',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: '@@ -1 +1 @@',
      },
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const result = await service.listPullRequestFiles('azweb76', 'agent-orchestrator', 42);

  assert.equal(result.truncated, false);
  assert.equal(result.files[0].patch, null);
  assert.equal(result.files[0].previousFilename, null);
  assert.equal(result.files[1].patch, '@@ -1 +1 @@');
  assert.equal(result.files[1].previousFilename, 'src/old.ts');
});

test('path segments are validated before any request is made', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse({}));

  const service = new GitHubService({ token: 'tok' });
  await assert.rejects(
    () => service.getPullRequestDetail('..', 'agent-orchestrator', 42),
    /Invalid owner/,
  );
  await assert.rejects(
    () => service.getPullRequestChecks('azweb76', 'agent-orchestrator', '../../etc'),
    /Invalid sha/,
  );

  assert.equal(fetchMock.mock.callCount(), 0);
});

test('createPullRequest still posts through the shared request helper', async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse({ number: 7, html_url: 'https://github.com/azweb76/agent-orchestrator/pull/7' });
  });

  const service = new GitHubService({ token: 'tok' });
  const result = await service.createPullRequest('azweb76', 'agent-orchestrator', {
    title: 'Add feature',
    head: 'feature/foo',
    base: 'main',
  });

  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    (calls[0].init.headers as Record<string, string>)['Content-Type'],
    'application/json',
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    title: 'Add feature',
    body: '',
    head: 'feature/foo',
    base: 'main',
  });
  assert.deepEqual(result, { number: 7, htmlUrl: 'https://github.com/azweb76/agent-orchestrator/pull/7' });
});

test('createPullRequestReview posts the event and maps the review', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.equal(new URL(url).pathname, '/repos/azweb76/agent-orchestrator/pulls/9/reviews');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      event: 'APPROVE',
      body: 'LGTM',
    });
    return jsonResponse({
      id: 11,
      user: { login: 'dan', avatar_url: 'https://example.com/d.png' },
      state: 'APPROVED',
      body: 'LGTM',
      html_url: 'https://github.com/azweb76/agent-orchestrator/pull/9#pullrequestreview-11',
      submitted_at: '2026-08-27T12:00:00Z',
    });
  });

  const service = new GitHubService({ token: 'tok' });
  const review = await service.createPullRequestReview('azweb76', 'agent-orchestrator', 9, {
    event: 'APPROVE',
    body: 'LGTM',
  });
  assert.equal(review.id, '11');
  assert.equal(review.state, 'APPROVED');
  assert.equal(review.author?.login, 'dan');
});

test('createPullRequestComment posts to the issues comments endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.equal(new URL(url).pathname, '/repos/azweb76/agent-orchestrator/issues/9/comments');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { body: 'Thanks' });
    return jsonResponse({
      id: 22,
      user: { login: 'dan' },
      body: 'Thanks',
      html_url: 'https://github.com/azweb76/agent-orchestrator/pull/9#issuecomment-22',
      created_at: '2026-08-27T12:00:00Z',
    });
  });

  const service = new GitHubService({ token: 'tok' });
  const comment = await service.createPullRequestComment('azweb76', 'agent-orchestrator', 9, 'Thanks');
  assert.equal(comment.id, '22');
  assert.equal(comment.body, 'Thanks');
});

test('getOpenPullRequestForBranch queries state=open and ignores closed PRs', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('state'), 'open');
    return jsonResponse([rawPr(42, 'Open PR', 'open', 'feature/foo')]);
  });

  const service = new GitHubService({ token: 'tok' });
  const result = await service.getOpenPullRequestForBranch('azweb76', 'agent-orchestrator', 'feature/foo');

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(result?.number, 42);
  assert.equal(result?.state, 'open');
});

test('getBranchHeadSha returns the commit sha for a matching branch', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    jsonResponse([
      { name: 'main', commit: { sha: 'b'.repeat(40) }, protected: true },
      { name: 'feature/foo', commit: { sha: 'a'.repeat(40) }, protected: false },
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const sha = await service.getBranchHeadSha('azweb76', 'agent-orchestrator', 'feature/foo');
  assert.equal(sha, 'a'.repeat(40));
});

test('listPullRequestReviewComments maps inline review comments with thread metadata', async (t) => {
  routeFetch(t, [
    [
      /\/pulls\/42\/comments$/,
      () =>
        jsonResponse([
          {
            id: 101,
            user: { login: 'alice', avatar_url: null, html_url: 'https://github.com/alice' },
            body: 'Fix the null check',
            path: 'src/foo.ts',
            line: 12,
            html_url: 'https://github.com/azweb76/agent-orchestrator/pull/42#discussion_r101',
            created_at: '2026-01-02T00:00:00Z',
            in_reply_to_id: null,
            pull_request_review_id: 55,
          },
        ]),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const comments = await service.listPullRequestReviewComments('azweb76', 'agent-orchestrator', 42);

  assert.equal(comments.length, 1);
  assert.equal(comments[0].path, 'src/foo.ts');
  assert.equal(comments[0].line, 12);
  assert.equal(comments[0].pullRequestReviewId, '55');
  assert.match(comments[0].body, /null check/);
});
