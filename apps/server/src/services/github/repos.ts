import type { GitHubRepository } from '@agent-orchestrator/shared';
import { REPO_CACHE_TTL_MS, REPO_SEARCH_RESULT_LIMIT } from './constants.js';
import type { GitHubClientContext } from './client.js';
import { request } from './client.js';
import { mapRepository, sanitizePullRequestSearchText } from './mappers.js';
import type { RawRepoSettings } from './raw-types.js';
import {
  ensureRepoListWarm,
  getAllAccessibleRepos,
} from './repos-list-cache.js';

export { getAllAccessibleRepos } from './repos-list-cache.js';

function filterLocalRepos(repos: GitHubRepository[], query: string): GitHubRepository[] {
  const normalized = query.toLowerCase();
  const matches = repos.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase().includes(normalized));

  const isPrefixMatch = (repo: GitHubRepository) => {
    const combined = `${repo.owner}/${repo.name}`.toLowerCase();
    return combined.startsWith(normalized) || repo.name.toLowerCase().startsWith(normalized);
  };

  const prefixMatches = matches.filter(isPrefixMatch);
  const substringMatches = matches.filter((repo) => !isPrefixMatch(repo));
  return [...prefixMatches, ...substringMatches];
}

function buildRepositorySearchQuery(raw: string): string {
  const cleaned = sanitizePullRequestSearchText(raw);
  if (!cleaned) return '';
  // Prefer name/description matches; include forks so org mirrors are reachable.
  return `${cleaned} in:name,description fork:true`;
}

async function searchRepositoriesViaApi(
  ctx: GitHubClientContext,
  query: string,
): Promise<GitHubRepository[]> {
  const q = buildRepositorySearchQuery(query);
  if (!q) return [];

  const data = await request<{
    items?: Array<{
      owner: { login: string };
      name: string;
      full_name: string;
      html_url: string;
      description: string | null;
      private: boolean;
    }>;
  }>(
    ctx,
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${REPO_SEARCH_RESULT_LIMIT}`,
  );

  return (data.items ?? []).map(mapRepository);
}

function mergeRepositoryResults(
  remote: GitHubRepository[],
  local: GitHubRepository[],
): GitHubRepository[] {
  const seen = new Set<string>();
  const merged: GitHubRepository[] = [];

  for (const repo of [...remote, ...local]) {
    const key = repo.fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(repo);
    if (merged.length >= REPO_SEARCH_RESULT_LIMIT) break;
  }

  return merged;
}

/**
 * Empty query: recent accessible repos from the durable SWR cache.
 * Typed query: GitHub Search (authenticated) merged with local-cache matches,
 * falling back to local-only when Search fails or returns nothing useful.
 */
export async function searchRepositories(
  ctx: GitHubClientContext,
  query: string,
): Promise<GitHubRepository[]> {
  if (!ctx.options.token) {
    throw new Error('GitHub token is not configured');
  }

  const trimmed = query.trim();
  if (!trimmed) {
    const allRepos = await getAllAccessibleRepos(ctx, { allowStale: true });
    return allRepos.slice(0, REPO_SEARCH_RESULT_LIMIT);
  }

  // Warm the durable list in the background for empty-query / fallback use.
  ensureRepoListWarm(ctx);

  let remote: GitHubRepository[] = [];
  try {
    remote = await searchRepositoriesViaApi(ctx, trimmed);
  } catch {
    remote = [];
  }

  // Prefer stale local matches without blocking on a cold full-list fetch.
  let local: GitHubRepository[] = [];
  if (ctx.repoCache?.repos.length) {
    local = filterLocalRepos(ctx.repoCache.repos, trimmed);
  } else if (remote.length === 0) {
    const allRepos = await getAllAccessibleRepos(ctx, { allowStale: true });
    local = filterLocalRepos(allRepos, trimmed);
  }

  if (remote.length === 0) {
    return local.slice(0, REPO_SEARCH_RESULT_LIMIT);
  }

  return mergeRepositoryResults(remote, local);
}

/** Repo settings drive which merge buttons the UI may offer. */
export async function getRepoSettings(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
): Promise<RawRepoSettings> {
  const cacheKey = `${owner}/${repo}`;
  const cached = ctx.repoDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < REPO_CACHE_TTL_MS) {
    return cached.settings;
  }

  const settings = await request<RawRepoSettings>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}`,
  );
  ctx.repoDetailCache.set(cacheKey, { settings, fetchedAt: Date.now() });
  return settings;
}

export async function isRepoArchived(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
): Promise<boolean> {
  const settings = await getRepoSettings(ctx, owner, repo);
  return settings.archived === true;
}
