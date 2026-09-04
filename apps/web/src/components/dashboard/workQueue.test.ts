import { describe, expect, it } from 'vitest';
import { buildWorkQueue, matchJiraWorkspace } from '@agent-orchestrator/shared';

describe('matchJiraWorkspace', () => {
  const workspaces = [
    { id: 'ws-eng', name: 'Engineering', githubOwner: 'acme', githubRepo: 'eng-app' },
    { id: 'ws-demo', name: 'demo', githubOwner: 'acme', githubRepo: 'demo' },
  ];

  it('prefers remembered mappings', () => {
    expect(matchJiraWorkspace('ENG', workspaces, { ENG: 'ws-demo' })).toBe('ws-demo');
  });

  it('matches exact repo name', () => {
    expect(matchJiraWorkspace('demo', workspaces)).toBe('ws-demo');
  });

  it('matches loose contains', () => {
    expect(matchJiraWorkspace('ENG', workspaces)).toBe('ws-eng');
  });
});

describe('buildWorkQueue', () => {
  it('ranks blocked agents before issues', () => {
    const result = buildWorkQueue({
      agents: [
        {
          id: 'a1',
          name: 'Alpha',
          workspaceName: 'demo',
          status: 'running',
          pendingPermissionCount: 1,
        },
      ],
      inbox: { authored: [], reviewRequested: [] },
      failingPrs: [],
      githubIssues: [
        {
          number: 1,
          title: 'Bug',
          state: 'open',
          htmlUrl: 'https://github.com/acme/demo/issues/1',
          owner: 'acme',
          repo: 'demo',
          authorLogin: 'dan',
          updatedAt: '2026-01-01T00:00:00.000Z',
          workspaceId: null,
        },
      ],
      jiraIssues: [],
    });

    expect(result.items[0]?.kind).toBe('agent_blocked');
    expect(result.items[1]?.kind).toBe('github_issue');
    expect(result.summary).toContain('nothing runs until you click');
  });
});
