import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from './github.js';
import { rawPrDetail, REPO_SETTINGS, routeFetch, jsonResponse } from './github.test-helpers.js';

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
