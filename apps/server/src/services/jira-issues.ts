import type {
  CreateAgentFromJiraIssueRequest,
  CreateWorktreeFromJiraIssueRequest,
  JiraIssueInbox,
} from '@agent-orchestrator/shared';
import {
  buildJiraKickoffPrompt,
  matchJiraWorkspace,
  normalizeJiraWorkspaceMap,
  parseJiraIssueKey,
  type Agent,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { createWorktreeFromBranch } from './worktrees.js';

const JIRA_WORKSPACE_MAP_KEY = 'jira_workspace_map';

export function readJiraWorkspaceMap(ctx: AppContext): Record<string, string> {
  const raw = ctx.repos.settings.get(JIRA_WORKSPACE_MAP_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') record[key] = value;
    }
    return normalizeJiraWorkspaceMap(record);
  } catch {
    return {};
  }
}

export function rememberJiraWorkspace(
  ctx: AppContext,
  projectKey: string,
  workspaceId: string,
): void {
  const key = projectKey.trim().toUpperCase();
  if (!key || !workspaceId.trim()) return;
  const map = readJiraWorkspaceMap(ctx);
  map[key] = workspaceId.trim();
  ctx.repos.settings.set(JIRA_WORKSPACE_MAP_KEY, JSON.stringify(map));
}

function workspaceCandidates(ctx: AppContext) {
  return ctx.repos.workspaces.list().map((ws) => ({
    id: ws.id,
    name: ws.name,
    githubOwner: ws.githubOwner,
    githubRepo: ws.githubRepo,
  }));
}

export function suggestWorkspaceForJiraProject(
  ctx: AppContext,
  projectKey: string,
): string | null {
  return matchJiraWorkspace(projectKey, workspaceCandidates(ctx), readJiraWorkspaceMap(ctx));
}

export async function getJiraIssueInbox(ctx: AppContext): Promise<JiraIssueInbox> {
  if (!ctx.jira.isConfigured()) {
    return { assigned: [] };
  }
  const assigned = await ctx.jira.listAssignedOpenIssues();
  const remembered = readJiraWorkspaceMap(ctx);
  const candidates = workspaceCandidates(ctx);
  return {
    assigned: assigned.map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      issueType: issue.issueType,
      projectKey: issue.projectKey,
      projectName: issue.projectName,
      htmlUrl: issue.htmlUrl,
      reporterDisplayName: issue.reporterDisplayName,
      updatedAt: issue.updatedAt,
      suggestedWorkspaceId: matchJiraWorkspace(issue.projectKey, candidates, remembered),
    })),
  };
}

export async function createWorktreeFromJiraIssue(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromJiraIssueRequest,
) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  if (!ctx.jira.isConfigured()) {
    throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.');
  }

  const issueKey = parseJiraIssueKey(body.issueKey);
  if (!issueKey) {
    throw new Error('Invalid Jira issue key. Use PROJ-123 or a Jira browse URL.');
  }

  const issue = await ctx.jira.getIssueDetail(issueKey);
  const prompt = buildJiraKickoffPrompt(
    issue,
    issue.comments.map((comment) => ({
      authorDisplayName: comment.authorDisplayName,
      body: comment.body,
    })),
  );

  const branchName = await ctx.anthropic.suggestBranchName(
    `${issue.key} ${issue.summary}\n\n${issue.description}`.trim(),
  );
  const { worktree, agent } = await createWorktreeFromBranch(ctx, workspaceId, {
    branch: branchName,
    createNew: true,
    baseBranch: body.baseBranch,
    name: body.name,
    overwrite: body.overwrite,
  });

  const configured: Agent = {
    ...agent,
    model: body.model?.trim() || agent.model,
    effort: body.effort ?? agent.effort,
    permissionMode: body.permissionMode ?? 'plan',
    updatedAt: nowIso(),
  };
  if (
    configured.model !== agent.model ||
    configured.effort !== agent.effort ||
    configured.permissionMode !== agent.permissionMode
  ) {
    ctx.repos.agents.update(configured);
  }

  rememberJiraWorkspace(ctx, issue.projectKey, workspaceId);

  return { worktree, agent: configured, branchName, issueKey: issue.key, prompt, projectKey: issue.projectKey };
}

export async function createAgentFromJiraIssue(
  ctx: AppContext,
  body: CreateAgentFromJiraIssueRequest,
) {
  const issueKey = parseJiraIssueKey(body.issueKey);
  if (!issueKey) {
    throw new Error('Invalid Jira issue key. Use PROJ-123 or a Jira browse URL.');
  }

  let workspaceId = body.workspaceId?.trim() || null;
  if (!workspaceId) {
    // Peek project key from the issue key prefix when matching before fetch.
    const projectGuess = issueKey.split('-')[0] ?? '';
    workspaceId = suggestWorkspaceForJiraProject(ctx, projectGuess);
  }
  if (!workspaceId) {
    throw new Error(
      'No workspace matched this Jira project. Pass workspaceId or clone a matching repo first.',
    );
  }

  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const { worktree, agent, prompt, issueKey: resolvedKey } = await createWorktreeFromJiraIssue(
    ctx,
    workspace.id,
    {
      issueKey: body.issueKey,
      name: body.name,
    },
  );

  return {
    workspace,
    worktree,
    agent,
    prompt,
    issueKey: resolvedKey,
    created: true as const,
  };
}
