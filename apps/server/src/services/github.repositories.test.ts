import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitHubService } from './github.js';
import { jsonResponse, pageOf, rawRepo } from './github.test-helpers.js';

function routeFetch(handlers: Array<[(url: string) => boolean, unknown]>) {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [match, body] of handlers) {
      if (match(url)) return jsonResponse(body);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

test('searchRepositories matches substring against repo name alone', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator'), rawRepo('azweb76', 'other-repo')];
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: [] }],
      [(url) => url.includes('/user/repos'), repos],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('orch');

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'agent-orchestrator');
});

test('searchRepositories matches "owner/partial-name" spanning substrings', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator'), rawRepo('someoneelse', 'agent-tool')];
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: [] }],
      [(url) => url.includes('/user/repos'), repos],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('76/agent');

  assert.equal(results.length, 1);
  assert.equal(results[0].fullName, 'azweb76/agent-orchestrator');
});

test('searchRepositories ranks prefix matches above pure substring matches', async (t) => {
  const substringOnly = rawRepo('has-agent-in-owner', 'unrelated-repo');
  const prefixMatch = rawRepo('azweb76', 'agent-orchestrator');
  const repos = [substringOnly, prefixMatch];
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: [] }],
      [(url) => url.includes('/user/repos'), repos],
    ]),
  );

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
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: [] }],
      [(url) => url.includes('/user/repos'), repos],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('agent');

  assert.equal(results.length, 30);
});

test('searchRepositories throws when no token is configured', async () => {
  const service = new GitHubService({});
  await assert.rejects(() => service.searchRepositories('anything'), /GitHub token is not configured/);
});

test('searchRepositories uses GitHub Search results for typed queries', async (t) => {
  const remote = [rawRepo('octo', 'search-hit'), rawRepo('octo', 'other-hit')];
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: remote }],
      [(url) => url.includes('/user/repos'), []],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  const results = await service.searchRepositories('search');

  assert.equal(results.length, 2);
  assert.equal(results[0].fullName, 'octo/search-hit');
});

test('searchRepositories merges Search hits with local-only matches', async (t) => {
  const local = [rawRepo('azweb76', 'local-only-agent'), rawRepo('azweb76', 'unrelated')];
  const remote = [rawRepo('octo', 'agent-remote')];
  t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: remote }],
      [(url) => url.includes('/user/repos'), local],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  // Warm local cache first (empty query).
  await service.searchRepositories('');
  const results = await service.searchRepositories('agent');

  assert.equal(results[0].fullName, 'octo/agent-remote');
  assert.ok(results.some((r) => r.fullName === 'azweb76/local-only-agent'));
  assert.ok(!results.some((r) => r.fullName === 'azweb76/unrelated'));
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
  assert.equal(results.length, 30);
});

test('getAllAccessibleRepos stops after the page cap even if pages stay full', async (t) => {
  const fullPage = Array.from({ length: 100 }, (_, i) => rawRepo('azweb76', `repo-${i}`));

  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(fullPage));

  const service = new GitHubService({ token: 'tok' });
  await service.searchRepositories('');

  assert.equal(fetchMock.mock.callCount(), 50);
});

test('getAllAccessibleRepos caches results within the TTL, avoiding refetch', async (t) => {
  const repos = [rawRepo('azweb76', 'agent-orchestrator')];
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    routeFetch([
      [(url) => url.includes('/search/repositories'), { items: [] }],
      [(url) => url.includes('/user/repos'), repos],
    ]),
  );

  const service = new GitHubService({ token: 'tok' });
  await service.searchRepositories('');
  await service.searchRepositories('agent');

  // empty query → /user/repos once; typed query → Search API once; local list served from memory
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('getAllAccessibleRepos persists to disk and reloads across service instances', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-repo-cache-'));
  const repos = [rawRepo('azweb76', 'persisted-repo')];
  try {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));

    const first = new GitHubService({ token: 'tok', cacheDir });
    await first.searchRepositories('');
    assert.equal(fetchMock.mock.callCount(), 1);

    const second = new GitHubService({ token: 'tok', cacheDir });
    const results = await second.searchRepositories('');
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(results[0].fullName, 'azweb76/persisted-repo');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('setToken clears persisted repo cache', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-repo-cache-'));
  const repos = [rawRepo('azweb76', 'persisted-repo')];
  try {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(repos));
    const service = new GitHubService({ token: 'tok', cacheDir });
    await service.searchRepositories('');
    assert.equal(fetchMock.mock.callCount(), 1);

    service.setToken('other-tok');
    await service.searchRepositories('');
    assert.equal(fetchMock.mock.callCount(), 2);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});


test('getAllAccessibleRepos serves stale disk cache when GitHub refresh fails', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-repo-cache-'));
  const repos = [rawRepo('azweb76', 'stale-repo')];
  try {
    // Seed a stale disk cache (fetchedAt far in the past).
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'github-user-repos.json'),
      JSON.stringify({
        fetchedAt: Date.now() - 60 * 60 * 1000,
        repos: [
          {
            owner: 'azweb76',
            name: 'stale-repo',
            fullName: 'azweb76/stale-repo',
            htmlUrl: 'https://github.com/azweb76/stale-repo',
            description: null,
            private: false,
          },
        ],
      }),
    );

    t.mock.method(globalThis, 'fetch', async () => {
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Bad credentials' }),
        json: async () => ({ message: 'Bad credentials' }),
      } as unknown as Response;
    });

    const service = new GitHubService({ token: 'tok', cacheDir });
    const results = await service.searchRepositories('');
    assert.equal(results[0].fullName, 'azweb76/stale-repo');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});
