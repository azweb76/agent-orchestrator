import type {
  CreateAgentFromJiraIssueRequest,
  CreateWorktreeFromJiraIssueRequest,
  JiraIssueInbox,
} from '@agent-orchestrator/shared';
import { buildJiraKickoffPrompt, parseJiraIssueKey, type Agent } from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { createWorktreeFromBranch } from './worktrees.js';

export async function getJiraIssueInbox(ctx: AppContext): Promise<JiraIssueInbox> {
  if (!ctx.jira.isConfigured()) {
    return { assigned: [] };
  }
  const assigned = await ctx.jira.listAssignedOpenIssues();
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

  return { worktree, agent: configured, branchName, issueKey: issue.key, prompt };
}

export async function createAgentFromJiraIssue(
  ctx: AppContext,
  body: CreateAgentFromJiraIssueRequest,
) {
  const workspace = ctx.repos.workspaces.getById(body.workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const { worktree, agent, prompt, issueKey } = await createWorktreeFromJiraIssue(
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
    issueKey,
    created: true as const,
  };
}
