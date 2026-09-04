import { describe, expect, it } from 'vitest';
import type { InboxJiraIssue } from '@agent-orchestrator/shared';
import { filterJiraInboxIssues, sortJiraInboxIssuesForWorkspace } from './jiraIssuePickerModel';

function issue(partial: Partial<InboxJiraIssue> & Pick<InboxJiraIssue, 'key'>): InboxJiraIssue {
  return {
    summary: 'Summary',
    status: 'To Do',
    issueType: 'Task',
    projectKey: 'ENG',
    projectName: 'Engineering',
    htmlUrl: `https://acme.atlassian.net/browse/${partial.key}`,
    reporterDisplayName: 'Ada',
    updatedAt: '2026-09-01T00:00:00.000Z',
    suggestedWorkspaceId: null,
    ...partial,
  };
}

describe('filterJiraInboxIssues', () => {
  const issues = [
    issue({ key: 'ENG-1', summary: 'Fix login OAuth' }),
    issue({ key: 'OPS-9', summary: 'Rotate certs', projectKey: 'OPS', projectName: 'Ops' }),
  ];

  it('returns all issues when query is empty', () => {
    expect(filterJiraInboxIssues(issues, '  ')).toHaveLength(2);
  });

  it('matches key, summary, and project', () => {
    expect(filterJiraInboxIssues(issues, 'eng-1').map((i) => i.key)).toEqual(['ENG-1']);
    expect(filterJiraInboxIssues(issues, 'oauth').map((i) => i.key)).toEqual(['ENG-1']);
    expect(filterJiraInboxIssues(issues, 'ops').map((i) => i.key)).toEqual(['OPS-9']);
  });
});

describe('sortJiraInboxIssuesForWorkspace', () => {
  it('groups suggested workspace matches first and sorts by updatedAt', () => {
    const issues = [
      issue({
        key: 'ENG-1',
        updatedAt: '2026-09-01T00:00:00.000Z',
        suggestedWorkspaceId: 'ws-a',
      }),
      issue({
        key: 'ENG-2',
        updatedAt: '2026-09-03T00:00:00.000Z',
        suggestedWorkspaceId: 'ws-a',
      }),
      issue({
        key: 'OPS-1',
        updatedAt: '2026-09-04T00:00:00.000Z',
        suggestedWorkspaceId: 'ws-b',
      }),
    ];
    const { suggested, other } = sortJiraInboxIssuesForWorkspace(issues, 'ws-a');
    expect(suggested.map((i) => i.key)).toEqual(['ENG-2', 'ENG-1']);
    expect(other.map((i) => i.key)).toEqual(['OPS-1']);
  });
});
