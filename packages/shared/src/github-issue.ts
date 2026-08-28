export interface ParsedIssueReference {
  owner: string;
  repo: string;
  number: number;
}

/** Parse `owner/repo#n` or a GitHub issue URL. Returns null for PR URLs or free text. */
export function parseIssueReference(input: string): ParsedIssueReference | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (urlMatch) {
    const number = Number(urlMatch[3]);
    return Number.isInteger(number) && number > 0
      ? { owner: urlMatch[1]!, repo: urlMatch[2]!, number }
      : null;
  }

  const slugMatch = trimmed.match(/^([^/\s#]+)\/([^#\s]+)#(\d+)$/);
  if (slugMatch) {
    const number = Number(slugMatch[3]);
    return Number.isInteger(number) && number > 0
      ? { owner: slugMatch[1]!, repo: slugMatch[2]!, number }
      : null;
  }

  return null;
}

export interface IssueKickoffComment {
  authorLogin: string | null;
  body: string;
}

/** Build the first chat prompt from a GitHub issue and optional top-level comments. */
export function buildIssueKickoffPrompt(
  issue: { title: string; body: string; htmlUrl: string },
  comments: IssueKickoffComment[] = [],
): string {
  const parts = [
    `# ${issue.title}`,
    '',
    issue.body?.trim() || '_No description provided._',
    '',
    `Source: ${issue.htmlUrl}`,
  ];

  if (comments.length > 0) {
    parts.push('', '## Comments');
    for (const comment of comments) {
      parts.push('', `### ${comment.authorLogin ?? 'unknown'}`, comment.body.trim());
    }
  }

  return parts.join('\n');
}
