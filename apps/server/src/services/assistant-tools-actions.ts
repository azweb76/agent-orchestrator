import { z } from 'zod';
import type {
  PullRequestInbox,
  WorkItemAction,
  WorkQueueFailingPr,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { startAutomationTemplate } from './automation-templates.js';
import { enqueueChatMessage } from './chat-queue.js';
import { createAgentFromIssue } from './github-issues.js';
import {
  allowPermissionRequest,
  denyPermissionRequest,
  listPendingPermissions,
} from './permissions-plan.js';
import { getCachedPrStatus } from './pr-status-cache.js';
import { createAgentFromPullRequest, getPullRequestChecks } from './pull-requests.js';
import { createAgentSession } from './sessions.js';
import { listSidebarTree } from './workspaces.js';

export type ActionToolResult = {
  content: string;
  isError?: boolean;
  navigateTo?: string;
  agentId?: string;
};

type ConfirmFn = (confirm: boolean | undefined, toolName: string) => void;

export function serializeWorkItemAction(action: WorkItemAction): Record<string, unknown> {
  switch (action.type) {
    case 'navigate':
      return { type: action.type, to: action.to, state: action.state };
    case 'start_pr_template':
      return {
        type: action.type,
        template: action.template,
        owner: action.pr.owner,
        repo: action.pr.repo,
        number: action.pr.number,
        agentId: action.pr.agentId,
        workspaceId: action.pr.workspaceId,
      };
    case 'start_github_issue':
      return {
        type: action.type,
        owner: action.issue.owner,
        repo: action.issue.repo,
        number: action.issue.number,
        workspaceId: action.issue.workspaceId,
      };
    case 'start_jira_issue':
      return {
        type: action.type,
        key: action.issue.key,
        workspaceId: action.workspaceId,
      };
    default:
      return { type: 'unknown' };
  }
}

export async function collectFailingPrs(
  ctx: AppContext,
  inbox: PullRequestInbox | null,
): Promise<WorkQueueFailingPr[]> {
  if (!inbox) return [];
  const failing: WorkQueueFailingPr[] = [];

  for (const pr of inbox.authored) {
    const cached = getCachedPrStatus(ctx, pr.owner, pr.repo, pr.number);
    if (cached?.checksRollup === 'failure') {
      failing.push({ pr, failing: Math.max(1, cached.checksFailing ?? 1) });
      continue;
    }
    if (cached) continue;
    if (!pr.agentId) continue;
    try {
      const checks = await getPullRequestChecks(ctx, pr.owner, pr.repo, pr.number);
      if (checks.rollup === 'failure') {
        failing.push({ pr, failing: Math.max(1, checks.failing) });
      }
    } catch {
      // Skip PRs we cannot inspect; other queue signals still return.
    }
  }

  return failing;
}

const startSessionSchema = z
  .object({
    agentId: z.string().min(1).optional(),
    owner: z.string().min(1).optional(),
    repo: z.string().min(1).optional(),
    number: z.number().int().positive().optional(),
    template: z.enum(['fix-ci', 'address-review', 'resolve-conflicts']),
    confirm: z.boolean(),
  })
  .superRefine((value, schemaCtx) => {
    if (value.agentId) return;
    if (!value.owner || !value.repo || value.number == null) {
      schemaCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide agentId, or owner + repo + number for a pull request',
      });
    }
  });

export async function handleStartAgentSession(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<ActionToolResult> {
  const body = startSessionSchema.parse(input);
  requireConfirm(body.confirm, 'start_agent_session');

  if (body.agentId) {
    const session = await startAutomationTemplate(ctx, body.agentId, body.template);
    if (!session) {
      return {
        content: JSON.stringify({
          ok: false,
          error:
            'Could not start template (agent missing/archived, or the same template is already active/queued)',
          agentId: body.agentId,
          template: body.template,
        }),
        isError: true,
      };
    }
    return {
      content: JSON.stringify({
        ok: true,
        agentId: body.agentId,
        sessionId: session.id,
        template: body.template,
        navigateTo: `/agents/${body.agentId}`,
      }),
      navigateTo: `/agents/${body.agentId}`,
      agentId: body.agentId,
    };
  }

  const created = await createAgentFromPullRequest(ctx, {
    owner: body.owner!,
    repo: body.repo!,
    prNumber: body.number!,
    template: body.template,
  });
  return {
    content: JSON.stringify({
      ok: true,
      agentId: created.agent.id,
      sessionId: created.sessionId,
      template: body.template,
      created: created.created,
      reused: created.reused,
      navigateTo: `/agents/${created.agent.id}`,
    }),
    navigateTo: `/agents/${created.agent.id}`,
    agentId: created.agent.id,
  };
}

const createFromIssueSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  name: z.string().optional(),
  confirm: z.boolean(),
});

export async function handleCreateAgentFromGithubIssue(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<ActionToolResult> {
  const body = createFromIssueSchema.parse(input);
  requireConfirm(body.confirm, 'create_agent_from_github_issue');
  const created = await createAgentFromIssue(ctx, {
    owner: body.owner,
    repo: body.repo,
    issueNumber: body.issueNumber,
    name: body.name,
  });
  return {
    content: JSON.stringify({
      ok: true,
      agentId: created.agent.id,
      agentName: created.agent.name,
      workspaceId: created.workspace.id,
      worktreeId: created.worktree.id,
      navigateTo: `/agents/${created.agent.id}`,
    }),
    navigateTo: `/agents/${created.agent.id}`,
    agentId: created.agent.id,
  };
}

const sendMessageSchema = z.object({
  agentId: z.string().min(1),
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  confirm: z.boolean(),
});

export async function handleSendAgentMessage(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<ActionToolResult> {
  const body = sendMessageSchema.parse(input);
  requireConfirm(body.confirm, 'send_agent_message');

  const agent = ctx.repos.agents.getById(body.agentId);
  if (!agent || agent.archivedAt) {
    return {
      content: JSON.stringify({ ok: false, error: 'Agent not found or archived' }),
      isError: true,
    };
  }

  let sessionId = body.sessionId ?? agent.activeSessionId ?? null;
  if (!sessionId) {
    const sessions = ctx.repos.sessions.listByAgent(body.agentId);
    sessionId = sessions[sessions.length - 1]?.id ?? null;
  }
  if (!sessionId) {
    const created = await createAgentSession(ctx, body.agentId, { template: 'chat' });
    sessionId = created.session.id;
  }

  const session = ctx.repos.sessions.getById(sessionId);
  if (!session) {
    return { content: JSON.stringify({ ok: false, error: 'Session not found' }), isError: true };
  }

  if (session.status === 'running' || session.status === 'queued') {
    const queued = await enqueueChatMessage(
      ctx,
      body.agentId,
      sessionId,
      { message: body.message },
      { drain: true },
    );
    return {
      content: JSON.stringify({
        ok: true,
        queued: true,
        queuedId: queued.id,
        agentId: body.agentId,
        sessionId,
        navigateTo: `/agents/${body.agentId}`,
      }),
      navigateTo: `/agents/${body.agentId}`,
      agentId: body.agentId,
    };
  }

  const { streamAgentChat } = await import('./chat-stream.js');
  void streamAgentChat(ctx, body.agentId, { message: body.message }, null, sessionId);
  return {
    content: JSON.stringify({
      ok: true,
      queued: false,
      started: true,
      agentId: body.agentId,
      sessionId,
      navigateTo: `/agents/${body.agentId}`,
    }),
    navigateTo: `/agents/${body.agentId}`,
    agentId: body.agentId,
  };
}

export async function handleListPendingPermissions(
  ctx: AppContext,
  input: Record<string, unknown>,
): Promise<ActionToolResult> {
  const agentIdFilter =
    typeof input.agentId === 'string' && input.agentId.trim() ? input.agentId.trim() : null;
  const tree = await listSidebarTree(ctx);
  const agents = tree.flatMap((ws) =>
    ws.agents
      .filter((agent) =>
        agentIdFilter ? agent.id === agentIdFilter : (agent.pendingPermissionCount ?? 0) > 0,
      )
      .map((agent) => ({ agent, workspaceName: ws.name })),
  );

  const pending = agents.flatMap(({ agent, workspaceName }) => {
    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    return sessions.flatMap((session) => {
      try {
        return listPendingPermissions(ctx, agent.id, session.id).map((request) => ({
          agentId: agent.id,
          agentName: agent.name,
          workspaceName,
          sessionId: session.id,
          requestId: request.requestId,
          toolName: request.toolName,
          createdAt: request.createdAt,
        }));
      } catch {
        return [];
      }
    });
  });

  return { content: JSON.stringify({ count: pending.length, pending }) };
}

const respondPermissionSchema = z.object({
  agentId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(['allow', 'deny']),
  message: z.string().optional(),
  sessionId: z.string().min(1).optional(),
  confirm: z.boolean(),
});

export async function handleRespondPermission(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<ActionToolResult> {
  const body = respondPermissionSchema.parse(input);
  requireConfirm(body.confirm, 'respond_permission');

  if (body.decision === 'allow') {
    await allowPermissionRequest(
      ctx,
      body.agentId,
      { requestId: body.requestId },
      body.sessionId,
    );
  } else {
    await denyPermissionRequest(
      ctx,
      body.agentId,
      { requestId: body.requestId, message: body.message },
      body.sessionId,
    );
  }

  return {
    content: JSON.stringify({
      ok: true,
      agentId: body.agentId,
      requestId: body.requestId,
      decision: body.decision,
      navigateTo: `/agents/${body.agentId}`,
    }),
    navigateTo: `/agents/${body.agentId}`,
    agentId: body.agentId,
  };
}
