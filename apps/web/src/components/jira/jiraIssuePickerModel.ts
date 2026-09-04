import type { InboxJiraIssue } from '@agent-orchestrator/shared';

/** Filter assigned Jira issues by key, summary, project, or type. */
export function filterJiraInboxIssues(
  issues: readonly InboxJiraIssue[],
  query: string,
): InboxJiraIssue[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...issues];
  return issues.filter((issue) => {
    const haystack = [
      issue.key,
      issue.summary,
      issue.projectKey,
      issue.projectName,
      issue.issueType,
      issue.status,
      issue.reporterDisplayName,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Prefer issues whose suggested workspace matches the current workspace,
 * then sort by most recently updated.
 */
export function sortJiraInboxIssuesForWorkspace(
  issues: readonly InboxJiraIssue[],
  workspaceId: string,
): { suggested: InboxJiraIssue[]; other: InboxJiraIssue[] } {
  const suggested: InboxJiraIssue[] = [];
  const other: InboxJiraIssue[] = [];
  for (const issue of issues) {
    if (issue.suggestedWorkspaceId === workspaceId) suggested.push(issue);
    else other.push(issue);
  }
  const byUpdatedDesc = (a: InboxJiraIssue, b: InboxJiraIssue) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  suggested.sort(byUpdatedDesc);
  other.sort(byUpdatedDesc);
  return { suggested, other };
}
