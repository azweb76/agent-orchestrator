/** Coarse PR lifecycle status used for GitHub-style status icons. */
export type PullRequestStatusKind = 'open' | 'draft' | 'merged' | 'closed';

export const PULL_REQUEST_STATUS_LABELS: Record<PullRequestStatusKind, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
};

/** Map GitHub PR fields to a single display status (merged wins over closed). */
export function resolvePullRequestStatus(pr: {
  state: string;
  draft?: boolean;
  merged?: boolean;
}): PullRequestStatusKind {
  if (pr.merged) return 'merged';
  if (pr.state !== 'open') return 'closed';
  if (pr.draft) return 'draft';
  return 'open';
}
