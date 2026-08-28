import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from './github.js';
import { jsonResponse, rawPr, routeFetch } from './github.test-helpers.js';

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

test('createPullRequest forwards the draft flag to GitHub', async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse({ number: 8, html_url: 'https://github.com/azweb76/agent-orchestrator/pull/8' });
  });

  const service = new GitHubService({ token: 'tok' });
  await service.createPullRequest('azweb76', 'agent-orchestrator', {
    title: 'Add feature',
    head: 'feature/foo',
    base: 'main',
    draft: true,
  });

  assert.equal(JSON.parse(String(calls[0].init.body)).draft, true);
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
