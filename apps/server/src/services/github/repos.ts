import type { GitHubRepository } from '@agent-orchestrator/shared';
import { REPO_CACHE_TTL_MS } from './constants.js';
import type { GitHubClientContext } from './client.js';
import { request } from './client.js';
import { mapRepository } from './mappers.js';
import type { RawRepoSettings } from './raw-types.js';

export async function getAllAccessibleRepos(ctx: GitHubClientContext): Promise<GitHubRepository[]> {
  if (ctx.repoCache && Date.now() - ctx.repoCache.fetchedAt < REPO_CACHE_TTL_MS) {
    return ctx.repoCache.repos;
  }

  const repos: GitHubRepository[] = [];
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page++) {
    const data = await request<
      Array<{
        owner: { login: string };
        name: string;
        full_name: string;
        html_url: string;
        description: string | null;
        private: boolean;
      }>
    >(
      ctx,
      `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`,
    );

    repos.push(...data.map(mapRepository));

    if (data.length < 100) {
      break;
    }
  }

  ctx.repoCache = { repos, fetchedAt: Date.now() };
  return repos;
}

export async function searchRepositories(
  ctx: GitHubClientContext,
  query: string,
): Promise<GitHubRepository[]> {
  if (!ctx.options.token) {
    throw new Error('GitHub token is not configured');
  }

  const allRepos = await getAllAccessibleRepos(ctx);

  const trimmed = query.trim();
  if (!trimmed) {
    return allRepos.slice(0, 30);
  }

  const normalized = trimmed.toLowerCase();
  const matches = allRepos.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase().includes(normalized));

  const isPrefixMatch = (repo: GitHubRepository) => {
    const combined = `${repo.owner}/${repo.name}`.toLowerCase();
    return combined.startsWith(normalized) || repo.name.toLowerCase().startsWith(normalized);
  };

  const prefixMatches = matches.filter(isPrefixMatch);
  const substringMatches = matches.filter((repo) => !isPrefixMatch(repo));

  return [...prefixMatches, ...substringMatches].slice(0, 30);
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
