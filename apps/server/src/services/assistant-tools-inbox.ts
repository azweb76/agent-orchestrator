import { z } from 'zod';
import { buildWorkQueue } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { listSidebarTree } from './workspaces.js';
import { getPullRequestInbox } from './pull-requests.js';
import { getIssueInbox } from './github-issues.js';
import { getJiraIssueInbox } from './jira-issues.js';
import {
  collectFailingPrs,
  serializeWorkItemAction,
} from './assistant-tools-actions.js';

export type InboxToolExecution = {
  content: string;
  isError?: boolean;
  navigateTo?: string;
  agentId?: string;
};

async function safeInbox<T>(label: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    return { error: `${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function handleGetWorkQueue(
  ctx: AppContext,
  input: Record<string, unknown>,
  readDismissedIds: (ctx: AppContext) => Set<string>,
): Promise<InboxToolExecution> {
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
    failingPrs: await collectFailingPrs(ctx, 'error' in inbox ? null : inbox),
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
        action: serializeWorkItemAction(item.action),
      })),
      inboxErrors: {
        pulls: 'error' in inbox ? inbox.error : null,
        issues: 'error' in issues ? issues.error : null,
        jira: 'error' in jira ? jira.error : null,
      },
    }),
  };
}

export async function handleListInbox(ctx: AppContext): Promise<InboxToolExecution> {
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

export const createFromGoalSchema = z.object({
  workspaceId: z.string().min(1),
  goal: z.string().min(1),
  task: z.string().min(1).max(63),
  name: z.string().optional(),
  baseBranch: z.string().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  confirm: z.boolean(),
});
