import { z } from 'zod';
import {
  ASSISTANT_TOOLS,
  assistantToolByName,
  buildWorkQueue,
  type AssistantToolDefinition,
  type AssistantToolRisk,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { listWorkspaces, listSidebarTree } from './workspaces.js';
import { getAgentDetail, archiveAgent } from './agents-lifecycle.js';
import { getSystemStatus } from './system-github.js';
import { getPullRequestInbox } from './pull-requests.js';
import { getIssueInbox } from './github-issues.js';
import { getJiraIssueInbox } from './jira-issues.js';
import { createWorktreeFromGoal } from './worktrees.js';
import {
  handleGetAgentTask,
  handleListAgentTasks,
  handleUpdateAgentTask,
} from './assistant-tools-tasks.js';

const DISMISSED_KEY = 'assistant.dismissedWorkItems';

export type AssistantToolExecution = {
  content: string;
  isError?: boolean;
  navigateTo?: string;
  agentId?: string;
};

function requireConfirm(confirm: boolean | undefined, toolName: string): void {
  if (confirm !== true) {
    throw new Error(
      `Refusing to run ${toolName} without confirm=true. Ask the user, then call again with confirm=true.`,
    );
  }
}

function readDismissedIds(ctx: AppContext): Set<string> {
  const raw = ctx.repos.automationState.get(DISMISSED_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(ctx: AppContext, ids: Set<string>): void {
  ctx.repos.automationState.set(DISMISSED_KEY, JSON.stringify([...ids]));
}

const createFromGoalSchema = z.object({
  workspaceId: z.string().min(1),
  goal: z.string().min(1),
  task: z.string().min(1).max(63),
  name: z.string().optional(),
  baseBranch: z.string().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  confirm: z.boolean(),
});

async function safeInbox<T>(label: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    return { error: `${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function anthropicToolsFromCatalog(
  tools: AssistantToolDefinition[] = ASSISTANT_TOOLS,
): Array<{ name: string; description: string; input_schema: AssistantToolDefinition['inputSchema'] }> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export async function executeAssistantTool(
  ctx: AppContext,
  name: string,
  input: Record<string, unknown>,
): Promise<AssistantToolExecution> {
  const def = assistantToolByName(name);
  if (!def) {
    return { content: JSON.stringify({ error: `Unknown tool: ${name}` }), isError: true };
  }

  try {
    const result = await dispatchAssistantTool(ctx, def, input);
    return result;
  } catch (error) {
    return {
      content: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      isError: true,
    };
  }
}

async function dispatchAssistantTool(
  ctx: AppContext,
  def: AssistantToolDefinition,
  input: Record<string, unknown>,
): Promise<AssistantToolExecution> {
  switch (def.name) {
    case 'list_workspaces': {
      const workspaces = await listWorkspaces(ctx);
      return {
        content: JSON.stringify(
          workspaces.map((ws) => ({
            id: ws.id,
            name: ws.name,
            repo: `${ws.githubOwner}/${ws.githubRepo}`,
            defaultBranch: ws.defaultBranch,
            worktreeCount: ws.worktreeCount,
            agentCount: ws.agentCount,
          })),
        ),
      };
    }
    case 'list_agents': {
      const includeArchived = Boolean(input.includeArchived);
      const tree = await listSidebarTree(ctx);
      const agents = tree.flatMap((ws) =>
        ws.agents
          .filter((agent) => includeArchived || !agent.archivedAt)
          .map((agent) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            workspaceId: ws.id,
            workspaceName: ws.name,
            deliveryPhase: agent.deliveryPhase,
            pendingPermissionCount: agent.pendingPermissionCount,
            branch: agent.worktree.branch,
            prNumber: agent.worktree.prNumber,
          })),
      );
      if (includeArchived) {
        for (const agent of ctx.repos.agents.listArchived()) {
          if (agents.some((row) => row.id === agent.id)) continue;
          const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
          const workspace = worktree ? ctx.repos.workspaces.getById(worktree.workspaceId) : null;
          agents.push({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            workspaceId: workspace?.id ?? '',
            workspaceName: workspace?.name ?? 'Unknown',
            deliveryPhase: 'archived',
            pendingPermissionCount: 0,
            branch: worktree?.branch ?? '',
            prNumber: worktree?.prNumber ?? null,
          });
        }
      }
      return { content: JSON.stringify(agents) };
    }
    case 'get_agent': {
      const agentId = z.string().min(1).parse(input.agentId);
      const detail = await getAgentDetail(ctx, agentId);
      return {
        content: JSON.stringify({
          id: detail.id,
          name: detail.name,
          status: detail.status,
          model: detail.model,
          effort: detail.effort,
          permissionMode: detail.permissionMode,
          workspace: {
            id: detail.workspace.id,
            name: detail.workspace.name,
            repo: `${detail.workspace.githubOwner}/${detail.workspace.githubRepo}`,
          },
          worktree: {
            id: detail.worktree.id,
            name: detail.worktree.name,
            branch: detail.worktree.branch,
            prNumber: detail.worktree.prNumber,
            prTitle: detail.worktree.prTitle,
          },
          sessions: detail.sessions.map((session) => ({
            id: session.id,
            title: session.title,
            template: session.template,
            status: session.status,
          })),
          prStatus: detail.prStatus,
        }),
      };
    }
    case 'list_agent_tasks':
      return handleListAgentTasks(ctx);
    case 'get_agent_task':
      return handleGetAgentTask(ctx, input);
    case 'update_agent_task':
      return handleUpdateAgentTask(ctx, input, requireConfirm);
    case 'get_status': {
      const status = await getSystemStatus(ctx);
      return { content: JSON.stringify(status) };
    }
    case 'get_work_queue': {
      const limit =
        typeof input.limit === 'number' && Number.isFinite(input.limit)
          ? Math.min(20, Math.max(1, Math.floor(input.limit)))
          : 8;
      const tree = await listSidebarTree(ctx);
      const agents = tree.flatMap((ws) =>
        ws.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          workspaceName: ws.name,
          status: agent.status,
          pendingPermissionCount: agent.pendingPermissionCount,
        })),
      );
      const inbox = await safeInbox('pulls', () => getPullRequestInbox(ctx));
      const issues = await safeInbox('issues', () => getIssueInbox(ctx));
      const jira = await safeInbox('jira', () => getJiraIssueInbox(ctx));
      const queue = buildWorkQueue({
        agents,
        inbox: 'error' in inbox ? null : inbox,
        failingPrs: [],
        githubIssues: 'error' in issues ? [] : issues.assigned,
        jiraIssues: 'error' in jira ? [] : jira.assigned,
        dismissedIds: readDismissedIds(ctx),
        limit,
      });
      return {
        content: JSON.stringify({
          summary: queue.summary,
          items: queue.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            subtitle: item.subtitle,
            actionLabel: item.actionLabel,
            actionType: item.action.type,
          })),
          inboxErrors: {
            pulls: 'error' in inbox ? inbox.error : null,
            issues: 'error' in issues ? issues.error : null,
            jira: 'error' in jira ? jira.error : null,
          },
        }),
      };
    }
    case 'list_inbox': {
      const pulls = await safeInbox('pulls', () => getPullRequestInbox(ctx));
      const issues = await safeInbox('issues', () => getIssueInbox(ctx));
      const jira = await safeInbox('jira', () => getJiraIssueInbox(ctx));
      return {
        content: JSON.stringify({
          pulls:
            'error' in pulls
              ? pulls
              : {
                  authored: pulls.authored.slice(0, 10).map((pr) => ({
                    number: pr.number,
                    title: pr.title,
                    repo: `${pr.owner}/${pr.repo}`,
                    url: pr.htmlUrl,
                  })),
                  reviewRequested: pulls.reviewRequested.slice(0, 10).map((pr) => ({
                    number: pr.number,
                    title: pr.title,
                    repo: `${pr.owner}/${pr.repo}`,
                    url: pr.htmlUrl,
                  })),
                },
          githubIssues:
            'error' in issues
              ? issues
              : issues.assigned.slice(0, 15).map((issue) => ({
                  number: issue.number,
                  title: issue.title,
                  repo: `${issue.owner}/${issue.repo}`,
                  url: issue.htmlUrl,
                  workspaceId: issue.workspaceId,
                })),
          jiraIssues:
            'error' in jira
              ? jira
              : jira.assigned.slice(0, 15).map((issue) => ({
                  key: issue.key,
                  summary: issue.summary,
                  url: issue.htmlUrl,
                })),
        }),
      };
    }
    case 'create_agent_from_goal': {
      const body = createFromGoalSchema.parse(input);
      requireConfirm(body.confirm, def.name);
      const created = await createWorktreeFromGoal(ctx, body.workspaceId, {
        goal: body.goal,
        task: body.task,
        name: body.name,
        baseBranch: body.baseBranch,
        model: body.model,
        effort: body.effort,
      });
      const navigateTo = `/agents/${created.agent.id}`;
      return {
        content: JSON.stringify({
          ok: true,
          agentId: created.agent.id,
          agentName: created.agent.name,
          worktreeId: created.worktree.id,
          branchName: created.branchName,
          task: created.task.name,
          navigateTo,
        }),
        navigateTo,
        agentId: created.agent.id,
      };
    }
    case 'archive_agent': {
      const agentId = z.string().min(1).parse(input.agentId);
      requireConfirm(input.confirm === true, def.name);
      const result = await archiveAgent(ctx, agentId, { deleteWorktree: false });
      return {
        content: JSON.stringify({
          ok: true,
          agentId,
          status: result.agent?.status ?? 'deleted',
        }),
      };
    }
    case 'dismiss_work_item': {
      const workItemId = z.string().min(1).parse(input.workItemId);
      requireConfirm(input.confirm === true, def.name);
      const ids = readDismissedIds(ctx);
      ids.add(workItemId);
      writeDismissedIds(ctx, ids);
      return { content: JSON.stringify({ ok: true, workItemId, dismissedCount: ids.size }) };
    }
    default:
      return { content: JSON.stringify({ error: `Unhandled tool: ${def.name}` }), isError: true };
  }
}

export function toolRisk(name: string): AssistantToolRisk | undefined {
  return assistantToolByName(name)?.risk;
}

export { readDismissedIds, DISMISSED_KEY };
