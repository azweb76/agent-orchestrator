/** Route for the in-app pull request detail page. */
export function pullRequestPath(owner: string, repo: string, prNumber: number): string {
  return `/pull-requests/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${prNumber}`;
}
