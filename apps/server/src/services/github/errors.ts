/** GitHub REST error with the status preserved so routes can map it faithfully. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}
