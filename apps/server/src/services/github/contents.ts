import { assertPathSegment, request, type GitHubClientContext } from './client.js';
import { GitHubApiError } from './errors.js';

export async function getRepoDefaultBranch(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
): Promise<string> {
  const safeOwner = assertPathSegment(owner, 'owner');
  const safeRepo = assertPathSegment(repo, 'repo');
  const data = await request<{ default_branch?: string }>(
    ctx,
    `https://api.github.com/repos/${safeOwner}/${safeRepo}`,
  );
  return data.default_branch?.trim() || 'main';
}

export async function listRepoFilePaths(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  const safeOwner = assertPathSegment(owner, 'owner');
  const safeRepo = assertPathSegment(repo, 'repo');
  try {
    return await listTreeBlobs(ctx, safeOwner, safeRepo, ref);
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    const commit = await request<{ commit?: { tree?: { sha?: string } } }>(
      ctx,
      `https://api.github.com/repos/${safeOwner}/${safeRepo}/commits/${encodeURIComponent(ref)}`,
    );
    const treeSha = commit.commit?.tree?.sha;
    if (!treeSha) throw error;
    return listTreeBlobs(ctx, safeOwner, safeRepo, treeSha);
  }
}

async function listTreeBlobs(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  treeRef: string,
): Promise<string[]> {
  const data = await request<{
    tree?: Array<{ path?: string; type?: string }>;
  }>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`,
  );
  return (data.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path)
    .map((entry) => entry.path!);
}

export async function readRepoFileText(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string> {
  const safeOwner = assertPathSegment(owner, 'owner');
  const safeRepo = assertPathSegment(repo, 'repo');
  const encodedPath = filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const data = await request<{
    encoding?: string;
    content?: string;
    size?: number;
    type?: string;
  }>(
    ctx,
    `https://api.github.com/repos/${safeOwner}/${safeRepo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
  );
  if (data.type && data.type !== 'file') {
    throw new Error(`Not a file: ${filePath}`);
  }
  if ((data.size ?? 0) > 200_000) {
    throw new Error(`File too large: ${filePath}`);
  }
  const content = data.content ?? '';
  if (data.encoding === 'base64') {
    return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
  }
  return content;
}
