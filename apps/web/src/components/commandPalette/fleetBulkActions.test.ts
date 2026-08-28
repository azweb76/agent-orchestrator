import { describe, expect, it } from 'vitest';
import type {
  InboxPullRequest,
  MergedFleetAgent,
  PullRequestChecks,
  PullRequestInbox,
  SidebarAgent,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import {
  buildFleetBulkCounts,
  selectAddressReviewBulkTargets,
  selectArchiveMergedBulkTargets,
  selectFixCiBulkTargets,
  selectNeedsInputBulkTargets,
} from './fleetBulkActions';

function makeAgent(overrides: Partial<SidebarAgent> = {}): SidebarAgent {
  return {
    id: 'agent-1',
    worktreeId: 'wt-1',
    name: 'Blocked agent',
    status: 'running',
    claudeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    worktree: { id: 'wt-1', name: 'feat', branch: 'feat/x', prNumber: 7 },
    pendingPermissionCount: 0,
    ...overrides,
  } as SidebarAgent;
}

function makePr(overrides: Partial<InboxPullRequest> = {}): InboxPullRequest {
  return {
    number: 7,
    title: 'Feature',
    state: 'open',
    htmlUrl: 'https://github.com/acme/demo/pull/7',
    draft: false,
    owner: 'acme',
    repo: 'demo',
    authorLogin: 'dan',
    updatedAt: '2026-01-02T00:00:00.000Z',
    category: 'authored',
    workspaceId: 'ws-1',
    agentId: 'agent-1',
    ...overrides,
  };
}

function mockChecks(failing: number): PullRequestChecks {
  return {
    headSha: 'abc',
    rollup: failing > 0 ? 'failure' : 'success',
    total: failing,
    passing: 0,
    failing,
    pending: 0,
    neutral: 0,
    truncated: false,
    checks: [],
  };
}

describe('selectFixCiBulkTargets', () => {
  const inbox: PullRequestInbox = {
    authored: [
      makePr({ number: 7, agentId: 'agent-1' }),
      makePr({ number: 8, agentId: null }),
      makePr({ number: 9, agentId: 'agent-2' }),
    ],
    reviewRequested: [],
  };

  it('includes only authored PRs with agents and failing checks', () => {
    const checksForPr = (pr: InboxPullRequest) =>
      pr.number === 7 ? mockChecks(2) : mockChecks(0);
    expect(selectFixCiBulkTargets(inbox, checksForPr)).toEqual([
      { pr: inbox.authored[0], failing: 2 },
    ]);
  });
});

describe('selectAddressReviewBulkTargets', () => {
  it('includes review-requested PRs that already have agents', () => {
    const inbox: PullRequestInbox = {
      authored: [],
      reviewRequested: [
        makePr({ category: 'review_requested', agentId: 'agent-3' }),
        makePr({ category: 'review_requested', number: 10, agentId: null }),
      ],
    };
    expect(selectAddressReviewBulkTargets(inbox)).toHaveLength(1);
    expect(selectAddressReviewBulkTargets(inbox)[0]?.agentId).toBe('agent-3');
  });
});

describe('selectNeedsInputBulkTargets', () => {
  it('returns non-archived agents with pending permissions', () => {
    const tree: SidebarWorkspace[] = [
      {
        id: 'ws-1',
        name: 'demo',
        repoUrl: 'https://github.com/acme/demo',
        repoPath: '/tmp',
        defaultBranch: 'main',
        githubOwner: 'acme',
        githubRepo: 'demo',
        createdAt: '2026-01-01T00:00:00.000Z',
        agents: [
          makeAgent({ pendingPermissionCount: 2 }),
          makeAgent({ id: 'agent-2', status: 'archived', pendingPermissionCount: 1 }),
          makeAgent({ id: 'agent-3', pendingPermissionCount: 0 }),
        ],
      },
    ];
    expect(selectNeedsInputBulkTargets(tree)).toEqual([{ agentId: 'agent-1', name: 'Blocked agent' }]);
  });
});

describe('selectArchiveMergedBulkTargets', () => {
  it('returns the merged agent list from the API', () => {
    const merged: MergedFleetAgent[] = [
      {
        agentId: 'agent-9',
        agentName: 'Merged agent',
        workspaceName: 'demo',
        owner: 'acme',
        repo: 'demo',
        prNumber: 42,
        prTitle: 'Done',
      },
    ];
    expect(selectArchiveMergedBulkTargets(merged)).toEqual(merged);
  });
});

describe('buildFleetBulkCounts', () => {
  it('aggregates all bulk action counts', () => {
    const counts = buildFleetBulkCounts({
      inbox: {
        authored: [makePr()],
        reviewRequested: [makePr({ category: 'review_requested', agentId: 'agent-4' })],
      },
      checksForPr: () => mockChecks(1),
      sidebar: [
        {
          id: 'ws-1',
          name: 'demo',
          repoUrl: 'https://github.com/acme/demo',
          repoPath: '/tmp',
          defaultBranch: 'main',
          githubOwner: 'acme',
          githubRepo: 'demo',
          createdAt: '2026-01-01T00:00:00.000Z',
          agents: [makeAgent({ pendingPermissionCount: 1 })],
        },
      ],
      mergedAgents: [
        {
          agentId: 'agent-9',
          agentName: 'Merged',
          workspaceName: 'demo',
          owner: 'acme',
          repo: 'demo',
          prNumber: 1,
          prTitle: 'Merged',
        },
      ],
    });
    expect(counts).toEqual({
      fixCi: 1,
      addressReview: 1,
      archiveMerged: 1,
      needsInput: 1,
    });
  });
});
