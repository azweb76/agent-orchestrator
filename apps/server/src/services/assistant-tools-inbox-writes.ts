import { z } from 'zod';
import type { AppContext } from './app-context.js';
import { createAgentFromJiraIssue } from './jira-issues.js';
import { createAgentFromPullRequest } from './pull-requests.js';

export type CreateAgentToolResult = {
  content: string;
  isError?: boolean;
  navigateTo?: string;
  agentId?: string;
};

type ConfirmFn = (confirm: boolean | undefined, toolName: string) => void;

const createFromJiraSchema = z.object({
  issueKey: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  name: z.string().optional(),
  confirm: z.boolean(),
});

export async function handleCreateAgentFromJiraIssue(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<CreateAgentToolResult> {
  const body = createFromJiraSchema.parse(input);
  requireConfirm(body.confirm, 'create_agent_from_jira_issue');
  const created = await createAgentFromJiraIssue(ctx, {
    issueKey: body.issueKey,
    workspaceId: body.workspaceId,
    name: body.name,
  });
  return {
    content: JSON.stringify({
      ok: true,
      agentId: created.agent.id,
      agentName: created.agent.name,
      workspaceId: created.workspace.id,
      worktreeId: created.worktree.id,
      issueKey: created.issueKey,
      navigateTo: `/agents/${created.agent.id}`,
    }),
    navigateTo: `/agents/${created.agent.id}`,
    agentId: created.agent.id,
  };
}

const createFromPrSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
  name: z.string().optional(),
  confirm: z.boolean(),
});

export async function handleCreateAgentFromPullRequest(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<CreateAgentToolResult> {
  const body = createFromPrSchema.parse(input);
  requireConfirm(body.confirm, 'create_agent_from_pull_request');
  const created = await createAgentFromPullRequest(ctx, {
    owner: body.owner,
    repo: body.repo,
    prNumber: body.number,
    name: body.name,
  });
  return {
    content: JSON.stringify({
      ok: true,
      agentId: created.agent.id,
      agentName: created.agent.name,
      created: created.created,
      reused: created.reused,
      sessionId: created.sessionId,
      navigateTo: `/agents/${created.agent.id}`,
    }),
    navigateTo: `/agents/${created.agent.id}`,
    agentId: created.agent.id,
  };
}
