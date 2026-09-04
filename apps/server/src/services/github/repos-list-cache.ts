import fs from 'node:fs';
import path from 'node:path';
import type { GitHubRepository } from '@agent-orchestrator/shared';
import {
  GITHUB_USER_REPOS_CACHE_FILE,
  MAX_USER_REPO_PAGES,
  REPO_CACHE_TTL_MS,
} from './constants.js';
import type { GitHubClientContext } from './client.js';
import { request } from './client.js';
import { mapRepository } from './mappers.js';

type RawListRepo = {
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
};

type PersistedRepoCache = {
  fetchedAt: number;
  repos: GitHubRepository[];
};

function cacheFilePath(ctx: GitHubClientContext): string | null {
  const dir = ctx.options.cacheDir?.trim();
  if (!dir) return null;
  return path.join(dir, GITHUB_USER_REPOS_CACHE_FILE);
}

export function clearPersistedRepoCache(ctx: GitHubClientContext): void {
  const file = cacheFilePath(ctx);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // missing or unreadable — ignore
  }
}

function loadPersistedRepoCache(ctx: GitHubClientContext): PersistedRepoCache | null {
  const file = cacheFilePath(ctx);
  if (!file) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as PersistedRepoCache;
    if (!parsed || !Array.isArray(parsed.repos) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedRepoCache(ctx: GitHubClientContext, entry: PersistedRepoCache): void {
  const file = cacheFilePath(ctx);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entry));
  } catch {
    // Disk full / permissions — memory cache still works.
  }
}

function hydrateRepoCacheFromDisk(ctx: GitHubClientContext): void {
  if (ctx.repoCache) return;
  const persisted = loadPersistedRepoCache(ctx);
  if (persisted) {
    ctx.repoCache = persisted;
  }
}

function isFresh(fetchedAt: number, now = Date.now()): boolean {
  return now - fetchedAt < REPO_CACHE_TTL_MS;
}

async function fetchUserReposPage(ctx: GitHubClientContext, page: number): Promise<RawListRepo[]> {
  return request<RawListRepo[]>(
    ctx,
    `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`,
  );
}

async function fetchAllAccessibleReposFromApi(ctx: GitHubClientContext): Promise<GitHubRepository[]> {
  const repos: GitHubRepository[] = [];

  for (let page = 1; page <= MAX_USER_REPO_PAGES; page++) {
    const data = await fetchUserReposPage(ctx, page);
    repos.push(...data.map(mapRepository));
    if (data.length < 100) {
      break;
    }
  }

  return repos;
}

function startRepoListRefresh(ctx: GitHubClientContext): Promise<GitHubRepository[]> {
  if (ctx.repoListRefresh) return ctx.repoListRefresh;

  ctx.repoListRefresh = fetchAllAccessibleReposFromApi(ctx)
    .then((repos) => {
      const entry = { repos, fetchedAt: Date.now() };
      ctx.repoCache = entry;
      savePersistedRepoCache(ctx, entry);
      return repos;
    })
    .finally(() => {
      ctx.repoListRefresh = null;
    });

  return ctx.repoListRefresh;
}

/**
 * Accessible repos for the authenticated user.
 * Fresh memory/disk hits return immediately; stale hits return cached data and
 * refresh in the background (stale-while-revalidate). Cold misses wait on GitHub.
 */
export async function getAllAccessibleRepos(
  ctx: GitHubClientContext,
  options: { allowStale?: boolean } = {},
): Promise<GitHubRepository[]> {
  const allowStale = options.allowStale !== false;
  hydrateRepoCacheFromDisk(ctx);

  if (ctx.repoCache && isFresh(ctx.repoCache.fetchedAt)) {
    return ctx.repoCache.repos;
  }

  if (allowStale && ctx.repoCache && ctx.repoCache.repos.length > 0) {
    void startRepoListRefresh(ctx);
    return ctx.repoCache.repos;
  }

  return startRepoListRefresh(ctx);
}

/** Kick a background refresh when the list is missing or stale (no await). */
export function ensureRepoListWarm(ctx: GitHubClientContext): void {
  hydrateRepoCacheFromDisk(ctx);
  if (ctx.repoCache && isFresh(ctx.repoCache.fetchedAt)) return;
  void startRepoListRefresh(ctx);
}
