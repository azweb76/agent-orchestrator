/** Parse a Jira issue key like `PROJ-123` (case-insensitive). */
export function parseJiraIssueKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const browseMatch = trimmed.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  if (browseMatch?.[1]) return browseMatch[1]!.toUpperCase();

  const keyMatch = trimmed.match(/^([A-Z][A-Z0-9]+-\d+)$/i);
  if (keyMatch?.[1]) return keyMatch[1]!.toUpperCase();

  return null;
}

export interface JiraKickoffComment {
  authorDisplayName: string | null;
  body: string;
}

/** Build the first chat prompt from a Jira issue and optional comments. */
export function buildJiraKickoffPrompt(
  issue: { key: string; summary: string; description: string; htmlUrl: string },
  comments: JiraKickoffComment[] = [],
): string {
  const parts = [
    `# ${issue.key}: ${issue.summary}`,
    '',
    issue.description?.trim() || '_No description provided._',
    '',
    `Source: ${issue.htmlUrl}`,
  ];

  if (comments.length > 0) {
    parts.push('', '## Comments');
    for (const comment of comments) {
      parts.push('', `### ${comment.authorDisplayName ?? 'unknown'}`, comment.body.trim());
    }
  }

  return parts.join('\n');
}
