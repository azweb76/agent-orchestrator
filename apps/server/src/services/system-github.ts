import path from 'node:path';
import fs from 'node:fs/promises';
import { cachedClaudeInstalled, cachedDataDirBytes } from './status-cache.js';
import {
  CLAUDE_DOCS_URL,
  SETUP_DOCS_URL,
  configureClaudeBin,
  configureGithubToken,
  detectClaudeCandidates,
} from './setup.js';
import { type AppContext } from './app-context.js';

export async function listGitHubBranches(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return ctx.github.listBranches(workspace.githubOwner, workspace.githubRepo);
}

export async function listGitHubPullRequests(ctx: AppContext, workspaceId: string, query = '') {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  let viewerLogin: string | null;
  try {
    viewerLogin = await ctx.github.getAuthenticatedLogin();
  } catch {
    viewerLogin = null;
  }

  const pullRequests = query.trim()
    ? await ctx.github.searchRepositoryPullRequests(
        workspace.githubOwner,
        workspace.githubRepo,
        query.trim(),
      )
    : await ctx.github.listPullRequests(workspace.githubOwner, workspace.githubRepo);

  return { viewerLogin, pullRequests };
}

export async function searchGitHubRepositories(ctx: AppContext, query: string) {
  return ctx.github.searchRepositories(query);
}

export async function getSystemStatus(ctx: AppContext) {
  const claudeInstalled = await cachedClaudeInstalled(ctx.claude);
  let githubLogin: string | null = null;
  if (process.env.GITHUB_TOKEN || process.env.GITHUB_LOGIN?.trim()) {
    try {
      githubLogin = await ctx.github.getAuthenticatedLogin();
    } catch {
      githubLogin = null;
    }
  }
  return {
    claudeInstalled,
    claudeBin: ctx.claude.getBin(),
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    githubLogin,
    authRequired: Boolean(process.env.AUTH_TOKEN?.trim()),
    archivedAgentCount: ctx.repos.agents.countArchived(),
    dataDirBytes: await cachedDataDirBytes(ctx.dataDir, directorySizeBytes),
    setupDocsUrl: SETUP_DOCS_URL,
    claudeDocsUrl: CLAUDE_DOCS_URL,
  };
}

export async function getSetupInfo(ctx: AppContext) {
  const claudeCandidates = await detectClaudeCandidates(ctx.claude.getBin());
  return {
    claudeCandidates,
    claudeBin: ctx.claude.getBin(),
    claudeInstalled: await cachedClaudeInstalled(ctx.claude),
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    setupDocsUrl: SETUP_DOCS_URL,
    claudeDocsUrl: CLAUDE_DOCS_URL,
  };
}

async function directorySizeBytes(root: string): Promise<number> {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch {
        // skipped
      }
    }
  }
  return total;
}

export { configureGithubToken, configureClaudeBin };
