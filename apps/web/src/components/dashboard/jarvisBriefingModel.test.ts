import { describe, expect, it } from 'vitest';
import { buildJarvisBriefing, type JarvisAgent } from './jarvisBriefingModel';

function agent(partial: Partial<JarvisAgent> & Pick<JarvisAgent, 'id' | 'name'>): JarvisAgent {
  return {
    workspaceName: 'demo',
    status: 'idle',
    pendingPermissionCount: 0,
    ...partial,
  };
}

function pr(
  partial: Partial<{
    number: number;
    title: string;
    owner: string;
    repo: string;
    agentId: string | null;
    category: 'authored' | 'review_requested';
  }> = {},
) {
  return {
    number: partial.number ?? 42,
    title: partial.title ?? 'Ship it',
    state: 'open',
    htmlUrl: 'https://github.com/acme/demo/pull/42',
    draft: false,
    owner: partial.owner ?? 'acme',
    repo: partial.repo ?? 'demo',
    authorLogin: 'dan',
    updatedAt: '2026-01-01T00:00:00.000Z',
    category: partial.category ?? ('authored' as const),
    workspaceId: null,
    agentId: partial.agentId ?? null,
  };
}

describe('buildJarvisBriefing', () => {
  it('summarizes blocked agents and offers to answer', () => {
    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [
        agent({ id: 'a1', name: 'Alpha', status: 'running', pendingPermissionCount: 2 }),
        agent({ id: 'a2', name: 'Beta', status: 'idle' }),
      ],
      inbox: { authored: [], reviewRequested: [] },
      cachedFailingPrs: [],
    });

    expect(result.summary).toContain('Alpha needs your input.');
    expect(result.summary).toContain('nothing runs until you click');
    expect(result.actions[0]).toMatchObject({
      label: 'Answer Alpha',
      type: 'navigate',
      to: '/agents/a1',
      state: { focusAttention: 'needs-input' },
    });
  });

  it('prioritizes fix-ci actions when cached checks are failing', () => {
    const authored = [pr({ number: 7, title: 'Broken build' })];
    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [agent({ id: 'a1', name: 'Alpha', status: 'running' })],
      inbox: { authored, reviewRequested: [] },
      cachedFailingPrs: [{ pr: authored[0]!, failing: 2 }],
    });

    expect(result.summary).toContain('failing CI');
    expect(result.actions[0]).toMatchObject({
      label: 'Fix CI on #7',
      type: 'start-pr-template',
      template: 'fix-ci',
    });
  });

  it('mentions review requests and offers address-review', () => {
    const reviewRequested = [pr({ number: 9, title: 'Needs eyes', category: 'review_requested' })];

    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [],
      inbox: { authored: [], reviewRequested },
      cachedFailingPrs: [],
    });

    expect(result.summary).toContain('waiting for your review');
    expect(result.actions[0]).toMatchObject({
      label: 'Review #9',
      type: 'start-pr-template',
      template: 'address-review',
    });
  });

  it('offers GitHub and Jira issue kickoffs', () => {
    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [],
      inbox: { authored: [], reviewRequested: [] },
      cachedFailingPrs: [],
      githubIssues: [
        {
          number: 3,
          title: 'Flaky test',
          state: 'open',
          htmlUrl: 'https://github.com/acme/demo/issues/3',
          owner: 'acme',
          repo: 'demo',
          authorLogin: 'dan',
          updatedAt: '2026-01-01T00:00:00.000Z',
          workspaceId: 'ws-1',
        },
      ],
      jiraIssues: [
        {
          key: 'ENG-9',
          summary: 'Login bug',
          status: 'To Do',
          issueType: 'Bug',
          projectKey: 'ENG',
          projectName: 'Engineering',
          htmlUrl: 'https://acme.atlassian.net/browse/ENG-9',
          reporterDisplayName: 'Ada',
          updatedAt: '2026-01-01T00:00:00.000Z',
          suggestedWorkspaceId: 'ws-1',
        },
      ],
      limit: 8,
    });

    expect(result.summary).toContain('assigned GitHub issue');
    expect(result.summary).toContain('assigned Jira issue');
    expect(result.actions.some((a) => a.type === 'start-github-issue')).toBe(true);
    expect(result.actions.some((a) => a.type === 'start-jira-issue')).toBe(true);
  });

  it('falls back to planning with an idle agent', () => {
    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [agent({ id: 'a1', name: 'Gamma', status: 'idle' })],
      inbox: { authored: [], reviewRequested: [] },
      cachedFailingPrs: [],
    });

    expect(result.summary).toContain('Gamma is idle and ready.');
    expect(result.actions[0]).toMatchObject({
      label: 'Plan with Gamma',
      to: '/agents/a1',
      state: { sessionTemplate: 'chat' },
    });
  });

  it('caps actions at three by default', () => {
    const reviewRequested = [
      pr({ number: 1, category: 'review_requested' }),
      pr({ number: 2, category: 'review_requested' }),
      pr({ number: 3, category: 'review_requested' }),
      pr({ number: 4, category: 'review_requested' }),
    ];

    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [
        agent({ id: 'a1', name: 'Blocked', pendingPermissionCount: 1 }),
        agent({ id: 'a2', name: 'Idle', status: 'idle' }),
      ],
      inbox: { authored: [], reviewRequested },
      cachedFailingPrs: [],
    });

    expect(result.actions).toHaveLength(3);
  });

  it('respects dismissed work item ids', () => {
    const result = buildJarvisBriefing({
      systemsOk: true,
      systemsPartial: true,
      githubConfigured: true,
      agents: [agent({ id: 'a1', name: 'Alpha', pendingPermissionCount: 1 })],
      inbox: { authored: [], reviewRequested: [] },
      cachedFailingPrs: [],
      dismissedIds: new Set(['blocked:a1']),
    });

    expect(result.actions.every((a) => a.id !== 'blocked:a1')).toBe(true);
  });
});
