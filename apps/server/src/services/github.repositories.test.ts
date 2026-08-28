import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from './github.js';
import { jsonResponse, pageOf, rawRepo } from './github.test-helpers.js';

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
