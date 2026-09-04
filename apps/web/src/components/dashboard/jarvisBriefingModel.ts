import type { InboxPullRequest } from '@agent-orchestrator/shared';
import {
  buildWorkQueue,
  type WorkQueueAgent,
} from '@agent-orchestrator/shared';

export type JarvisAgent = WorkQueueAgent;

export interface JarvisFailingPr {
  pr: InboxPullRequest;
  failing: number;
}

export {
  buildWorkQueue as buildJarvisBriefingQueue,
  type WorkItem as JarvisWorkItem,
  type WorkItemAction as JarvisAction,
  type WorkQueueResult as JarvisBriefingResult,
} from '@agent-orchestrator/shared';

/** @deprecated Prefer buildWorkQueue — kept for existing test import paths. */
export function buildJarvisBriefing(input: {
  systemsOk: boolean;
  systemsPartial: boolean;
  githubConfigured: boolean;
  agents: WorkQueueAgent[];
  inbox: { authored: InboxPullRequest[]; reviewRequested: InboxPullRequest[] } | null;
  cachedFailingPrs: JarvisFailingPr[];
  githubIssues?: import('@agent-orchestrator/shared').InboxIssue[];
  jiraIssues?: import('@agent-orchestrator/shared').InboxJiraIssue[];
  dismissedIds?: ReadonlySet<string>;
  limit?: number;
}) {
  const queue = buildWorkQueue({
    agents: input.agents,
    inbox: input.inbox,
    failingPrs: input.cachedFailingPrs,
    githubIssues: input.githubIssues ?? [],
    jiraIssues: input.jiraIssues ?? [],
    dismissedIds: input.dismissedIds,
    limit: input.limit ?? 3,
  });

  let summary = queue.summary;
  if (queue.items.length === 0) {
    if (!input.systemsOk) {
      summary = input.systemsPartial
        ? 'Some systems still need setup — check Claude Code and GitHub connectivity.'
        : 'Configure Claude Code and a GitHub token to get started.';
    } else if (!input.githubConfigured) {
      summary =
        'All systems nominal. Clone a workspace to spin up your first agent.';
    }
  }

  return {
    summary,
    actions: queue.items.map((item) => ({
      id: item.id,
      label: item.actionLabel,
      ...toLegacyAction(item.action),
    })),
    items: queue.items,
  };
}

function toLegacyAction(
  action: import('@agent-orchestrator/shared').WorkItemAction,
):
  | { type: 'navigate'; to: string; state?: Record<string, unknown> }
  | {
      type: 'start-pr-template';
      pr: InboxPullRequest;
      template: 'fix-ci' | 'address-review' | 'resolve-conflicts';
    }
  | { type: 'start-github-issue'; issue: import('@agent-orchestrator/shared').InboxIssue }
  | {
      type: 'start-jira-issue';
      issue: import('@agent-orchestrator/shared').InboxJiraIssue;
      workspaceId: string | null;
    } {
  if (action.type === 'navigate') {
    return { type: 'navigate', to: action.to, state: action.state };
  }
  if (action.type === 'start_pr_template') {
    return { type: 'start-pr-template', pr: action.pr, template: action.template };
  }
  if (action.type === 'start_github_issue') {
    return { type: 'start-github-issue', issue: action.issue };
  }
  return {
    type: 'start-jira-issue',
    issue: action.issue,
    workspaceId: action.workspaceId,
  };
}
