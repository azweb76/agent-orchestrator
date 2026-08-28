import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from './github.js';
import { jsonResponse, rawPr, searchIssue } from './github.test-helpers.js';

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
