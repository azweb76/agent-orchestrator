import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from './github.js';
import { jsonResponse, routeFetch } from './github.test-helpers.js';

test('getIssue rejects pull requests on the issues endpoint', async (t) => {
  routeFetch(t, [
    [
      /\/issues\/9$/,
      () =>
        jsonResponse({
          number: 9,
          title: 'Not an issue',
          body: '',
          state: 'open',
          html_url: 'https://github.com/azweb76/agent-orchestrator/pull/9',
          user: { login: 'dan' },
          updated_at: '2026-01-01T00:00:00Z',
          pull_request: { url: 'https://api.github.com/repos/azweb76/agent-orchestrator/pulls/9' },
        }),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  await assert.rejects(
    () => service.getIssue('azweb76', 'agent-orchestrator', 9),
    /pull request, not an issue/,
  );
});

test('getIssueDetail includes top-level comments', async (t) => {
  routeFetch(t, [
    [
      /\/issues\/149$/,
      () =>
        jsonResponse({
          number: 149,
          title: 'Issue title',
          body: 'Issue body',
          state: 'open',
          html_url: 'https://github.com/azweb76/agent-orchestrator/issues/149',
          user: { login: 'dan' },
          updated_at: '2026-01-01T00:00:00Z',
        }),
    ],
    [
      /\/issues\/149\/comments/,
      () =>
        jsonResponse([
          {
            id: 1,
            user: { login: 'reviewer' },
            body: 'Please add tests.',
            created_at: '2026-01-02T00:00:00Z',
          },
        ]),
    ],
  ]);

  const service = new GitHubService({ token: 'tok' });
  const issue = await service.getIssueDetail('azweb76', 'agent-orchestrator', 149);
  assert.equal(issue.title, 'Issue title');
  assert.equal(issue.comments.length, 1);
  assert.equal(issue.comments[0]?.authorLogin, 'reviewer');
});
