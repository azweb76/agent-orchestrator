import { cachedAnthropicConfigured, cachedClaudeInstalled } from './status-cache.js';
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
  const claudeBin = ctx.claude.getBin();
  const [claudeInstalled, anthropicConfigured] = await Promise.all([
    cachedClaudeInstalled(ctx.claude),
    cachedAnthropicConfigured(claudeBin),
  ]);
  let githubLogin: string | null = null;
  if (process.env.GITHUB_TOKEN || process.env.GITHUB_LOGIN?.trim()) {
    try {
      githubLogin = await ctx.github.getAuthenticatedLogin();
    } catch {
      githubLogin = null;
    }
  }
  let jiraDisplayName: string | null = null;
  if (ctx.jira.isConfigured()) {
    try {
      jiraDisplayName = await ctx.jira.getAuthenticatedDisplayName();
    } catch {
      jiraDisplayName = null;
    }
  }
  return {
    claudeInstalled,
    claudeBin,
    /** Claude Code OAuth ready for Agent SDK (legacy field name). */
    anthropicConfigured,
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    githubLogin,
    jiraConfigured: ctx.jira.isConfigured(),
    jiraDisplayName,
    authRequired: Boolean(process.env.AUTH_TOKEN?.trim()),
    archivedAgentCount: ctx.repos.agents.countArchived(),
    setupDocsUrl: SETUP_DOCS_URL,
    claudeDocsUrl: CLAUDE_DOCS_URL,
  };
}

export async function getSetupInfo(ctx: AppContext) {
  const claudeBin = ctx.claude.getBin();
  const claudeCandidates = await detectClaudeCandidates(claudeBin);
  const [claudeInstalled, anthropicConfigured] = await Promise.all([
    cachedClaudeInstalled(ctx.claude),
    cachedAnthropicConfigured(claudeBin),
  ]);
  return {
    claudeCandidates,
    claudeBin,
    claudeInstalled,
    anthropicConfigured,
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    jiraConfigured: ctx.jira.isConfigured(),
    setupDocsUrl: SETUP_DOCS_URL,
    claudeDocsUrl: CLAUDE_DOCS_URL,
  };
}

export { configureGithubToken, configureClaudeBin };
