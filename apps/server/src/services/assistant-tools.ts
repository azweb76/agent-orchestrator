import { z } from 'zod';
import {
  ASSISTANT_TOOLS,
  assistantToolByName,
  schedulePolicyAllowsWrite,
  type AssistantSchedulePolicy,
  type AssistantToolDefinition,
  type AssistantToolRisk,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { listWorkspaces, listSidebarTree } from './workspaces.js';
import { getAgentDetail, archiveAgent, stopAgent } from './agents-lifecycle.js';
import { getSystemStatus } from './system-github.js';
import { createWorktreeFromGoal } from './worktrees.js';
import {
  handleCreateAgentTask,
  handleGetAgentTask,
  handleListAgentTasks,
  handleUpdateAgentTask,
} from './assistant-tools-tasks.js';
import {
  handleCreateAgentFromGithubIssue,
  handleListPendingPermissions,
  handleRespondPermission,
  handleSendAgentMessage,
  handleStartAgentSession,
} from './assistant-tools-actions.js';
import {
  handleCreateAgentFromJiraIssue,
  handleCreateAgentFromPullRequest,
} from './assistant-tools-inbox-writes.js';
import {
  handleCreateSchedule,
  handleDeleteSchedule,
  handleListScheduleRuns,
  handleListSchedules,
  handlePauseSchedule,
  handleScheduleOnce,
} from './assistant-tools-schedules.js';
import {
  handleCreateAgentMemory,
  handleCreateAgentPullRequest,
  handleGetAutomationSettings,
  handleGetPullRequest,
  handleGetUsageSummary,
  handleListAgentMemories,
  handleSetAutomationSettings,
  handleTriggerAutomationPoll,
  handleUpdateAgentMemory,
} from './assistant-tools-depth.js';
import {
  createFromGoalSchema,
  handleGetWorkQueue,
  handleListInbox,
} from './assistant-tools-inbox.js';

const DISMISSED_KEY = 'assistant.dismissedWorkItems';

export type AssistantToolExecution = {
  content: string;
  isError?: boolean;
  navigateTo?: string;
  agentId?: string;
};

export type AssistantToolOptions = {
  schedulePolicy?: AssistantSchedulePolicy;
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
  options: AssistantToolOptions = {},
): Promise<AssistantToolExecution> {
  const def = assistantToolByName(name);
  if (!def) {
    return { content: JSON.stringify({ error: `Unknown tool: ${name}` }), isError: true };
  }

  const gatedInput = { ...input };
  if (options.schedulePolicy) {
    const gate = schedulePolicyAllowsWrite(options.schedulePolicy, def.name, def.risk);
    if (!gate.allow) {
      return {
        content: JSON.stringify({ error: gate.reason ?? 'Blocked by schedule policy' }),
        isError: true,
      };
    }
    if (gate.autoConfirm && def.risk === 'write') {
      gatedInput.confirm = true;
    }
  }

  try {
    return await dispatchAssistantTool(ctx, def, gatedInput);
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
    case 'create_agent_task':
      return handleCreateAgentTask(ctx, input, requireConfirm);
    case 'update_agent_task':
      return handleUpdateAgentTask(ctx, input, requireConfirm);
    case 'get_status': {
      const status = await getSystemStatus(ctx);
      return { content: JSON.stringify(status) };
    }
    case 'get_work_queue':
      return handleGetWorkQueue(ctx, input, readDismissedIds);
    case 'list_inbox':
      return handleListInbox(ctx);
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
    case 'stop_agent': {
      const agentId = z.string().min(1).parse(input.agentId);
      requireConfirm(input.confirm === true, def.name);
      const agent = await stopAgent(ctx, agentId);
      return {
        content: JSON.stringify({
          ok: true,
          agentId,
          status: agent.status,
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
    case 'start_agent_session':
      return handleStartAgentSession(ctx, input, requireConfirm);
    case 'create_agent_from_github_issue':
      return handleCreateAgentFromGithubIssue(ctx, input, requireConfirm);
    case 'create_agent_from_jira_issue':
      return handleCreateAgentFromJiraIssue(ctx, input, requireConfirm);
    case 'create_agent_from_pull_request':
      return handleCreateAgentFromPullRequest(ctx, input, requireConfirm);
    case 'send_agent_message':
      return handleSendAgentMessage(ctx, input, requireConfirm);
    case 'list_pending_permissions':
      return handleListPendingPermissions(ctx, input);
    case 'respond_permission':
      return handleRespondPermission(ctx, input, requireConfirm);
    case 'list_schedules':
      return handleListSchedules(ctx, input);
    case 'create_schedule':
      return handleCreateSchedule(ctx, input, requireConfirm);
    case 'schedule_once':
      return handleScheduleOnce(ctx, input, requireConfirm);
    case 'pause_schedule':
      return handlePauseSchedule(ctx, input, requireConfirm);
    case 'delete_schedule':
      return handleDeleteSchedule(ctx, input, requireConfirm);
    case 'list_schedule_runs':
      return handleListScheduleRuns(ctx, input);
    case 'get_pull_request':
      return handleGetPullRequest(ctx, input);
    case 'create_agent_pull_request':
      return handleCreateAgentPullRequest(ctx, input, requireConfirm);
    case 'list_agent_memories':
      return handleListAgentMemories(ctx, input);
    case 'create_agent_memory':
      return handleCreateAgentMemory(ctx, input, requireConfirm);
    case 'update_agent_memory':
      return handleUpdateAgentMemory(ctx, input, requireConfirm);
    case 'get_usage_summary':
      return handleGetUsageSummary(ctx, input);
    case 'get_automation_settings':
      return handleGetAutomationSettings(ctx);
    case 'set_automation_settings':
      return handleSetAutomationSettings(ctx, input, requireConfirm);
    case 'trigger_automation_poll':
      return handleTriggerAutomationPoll(ctx, input, requireConfirm);
    default:
      return { content: JSON.stringify({ error: `Unhandled tool: ${def.name}` }), isError: true };
  }
}

export function toolRisk(name: string): AssistantToolRisk | undefined {
  return assistantToolByName(name)?.risk;
}

export function getAssistantSchedules(
  ctx: AppContext,
  options: { includePaused?: boolean; includeCompleted?: boolean } = {},
): { schedules: unknown[] } {
  const result = handleListSchedules(ctx, {
    includePaused: options.includePaused !== false,
    includeCompleted: options.includeCompleted === true,
  });
  try {
    const schedules = JSON.parse(result.content) as unknown[];
    return { schedules: Array.isArray(schedules) ? schedules : [] };
  } catch {
    return { schedules: [] };
  }
}

export async function getAssistantWorkQueue(
  ctx: AppContext,
  limit = 8,
): Promise<Record<string, unknown>> {
  const result = await handleGetWorkQueue(ctx, { limit }, readDismissedIds);
  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return { summary: '', items: [], error: 'Failed to parse work queue' };
  }
}

export { readDismissedIds, DISMISSED_KEY };
