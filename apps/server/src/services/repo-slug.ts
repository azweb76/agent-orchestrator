/** Hosts accepted as GitHub. The app talks to github.com only. */
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

function invalid(): never {
  throw new Error('Invalid GitHub repository URL');
}

/**
 * Parse owner/repo out of a GitHub URL, anchored to the real host.
 *
 * The previous regex matched `github.com[/:]owner/repo` anywhere in the string,
 * so any host whose path merely contained that shape (for example
 * `https://elsewhere.example/github.com/a/b`) satisfied it and was then treated
 * as a GitHub repository.
 */
export function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } {
  const trimmed = repoUrl.trim();
  // A leading dash would be read as an option, not an operand, by git.
  if (!trimmed || trimmed.startsWith('-')) invalid();

  // scp-like syntax: [user@]host:owner/repo[.git]
  if (!trimmed.includes('://')) {
    const scp = /^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(
      trimmed,
    );
    if (scp) {
      if (!GITHUB_HOSTS.has(scp[1]!.toLowerCase())) invalid();
      return { owner: scp[2]!, repo: scp[3]! };
    }
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    invalid();
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) invalid();

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) invalid();
  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, '');
  if (!owner || !repo) invalid();
  return { owner, repo };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
