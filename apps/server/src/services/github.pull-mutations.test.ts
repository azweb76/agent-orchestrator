import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubApiError, GitHubService } from './github.js';
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  rawPr,
  rawPrDetail,
  REPO_SETTINGS,
  routeFetch,
} from './github.test-helpers.js';

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

test('markPullRequestReadyForReview sends the GraphQL mutation and returns the refreshed PR', async (t) => {
  let prCalls = 0;
  const graphqlCalls: Array<{ url: string; init: RequestInit }> = [];
  routeFetch(t, [
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
    [
      /\/pulls\/42$/,
      () => {
        prCalls++;
        return jsonResponse(rawPrDetail({ node_id: 'PR_node42', draft: prCalls === 1 }));
      },
    ],
  ]);
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (new URL(url).pathname === '/graphql') {
      graphqlCalls.push({ url, init });
      return jsonResponse({ data: { markPullRequestReadyForReview: { pullRequest: { number: 42 } } } });
    }
    return original(url as never, init as never);
  });

  const service = new GitHubService({ token: 'tok' });
  const pr = await service.markPullRequestReadyForReview('azweb76', 'agent-orchestrator', 42);

  assert.equal(graphqlCalls.length, 1);
  assert.equal(graphqlCalls[0].init.method, 'POST');
  const body = JSON.parse(String(graphqlCalls[0].init.body)) as {
    query: string;
    variables: { id: string };
  };
  assert.match(body.query, /markPullRequestReadyForReview/);
  assert.equal(body.variables.id, 'PR_node42');
  assert.equal(prCalls, 2);
  assert.equal(pr.draft, false);
});

test('markPullRequestReadyForReview short-circuits when the PR is not a draft', async (t) => {
  const fetchMock = routeFetch(t, [
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail({ node_id: 'PR_node42', draft: false }))],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const pr = await service.markPullRequestReadyForReview('azweb76', 'agent-orchestrator', 42);

  assert.equal(pr.draft, false);
  const urls = fetchMock.mock.calls.map((call) => new URL(String(call.arguments[0])).pathname);
  assert.ok(!urls.includes('/graphql'), 'must not call GraphQL for a non-draft PR');
});

test('markPullRequestReadyForReview surfaces GraphQL errors from a 200 response', async (t) => {
  routeFetch(t, [
    [/^\/repos\/azweb76\/agent-orchestrator$/, () => jsonResponse(REPO_SETTINGS)],
    [/\/pulls\/42$/, () => jsonResponse(rawPrDetail({ node_id: 'PR_node42', draft: true }))],
    [/^\/graphql$/, () => jsonResponse({ errors: [{ message: 'Pull request is in unstable status' }] })],
  ]);

  const service = new GitHubService({ token: 'tok' });
  await assert.rejects(
    () => service.markPullRequestReadyForReview('azweb76', 'agent-orchestrator', 42),
    /unstable status/,
  );
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
