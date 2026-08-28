import type { CreateAgentFromIssueRequest, InboxIssue, IssueInbox } from '@agent-orchestrator/shared';
import type { SearchedIssue } from './github/raw-types.js';
import { type AppContext } from './app-context.js';
import { createWorkspace } from './workspaces.js';
import { createWorktreeFromIssue } from './worktrees.js';

function enrichInboxIssue(ctx: AppContext, issue: SearchedIssue): InboxIssue {
  const workspace = ctx.repos.workspaces.getByOwnerRepo(issue.owner, issue.repo);
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.htmlUrl,
    owner: issue.owner,
    repo: issue.repo,
    authorLogin: issue.authorLogin,
    updatedAt: issue.updatedAt,
    workspaceId: workspace?.id ?? null,
  };
}

export async function getIssueInbox(ctx: AppContext): Promise<IssueInbox> {
  const assigned = await ctx.github.listAssignedOpenIssues();
  return { assigned: assigned.map((issue) => enrichInboxIssue(ctx, issue)) };
}

export async function createAgentFromIssue(ctx: AppContext, body: CreateAgentFromIssueRequest) {
  let workspace = ctx.repos.workspaces.getByOwnerRepo(body.owner, body.repo);

  if (!workspace) {
    workspace = await createWorkspace(ctx, {
      repoUrl: `https://github.com/${body.owner}/${body.repo}`,
      name: body.repo,
    });
  }

  const { worktree, agent, prompt } = await createWorktreeFromIssue(ctx, workspace.id, {
    issueNumber: body.issueNumber,
    name: body.name,
  });

  return {
    workspace,
    worktree,
    agent,
    prompt,
    created: true as const,
  };
}
