import type { AgentStatus } from './types/entities.js';
import type { ChatSessionTemplateId } from './chat-session.js';
import type { InboxIssue, InboxPullRequest } from './types/github.js';
import type { InboxJiraIssue } from './types/jira.js';

export type WorkItemKind =
  | 'agent_blocked'
  | 'pr_failing_ci'
  | 'pr_review'
  | 'github_issue'
  | 'jira_issue'
  | 'agent_idle';

export interface WorkQueueAgent {
  id: string;
  name: string;
  workspaceName: string;
  status: AgentStatus;
  pendingPermissionCount: number;
}

export interface WorkQueueFailingPr {
  pr: InboxPullRequest;
  failing: number;
}

export type WorkItemAction =
  | {
      type: 'navigate';
      to: string;
      state?: Record<string, unknown>;
    }
  | {
      type: 'start_pr_template';
      pr: InboxPullRequest;
      template: Extract<ChatSessionTemplateId, 'fix-ci' | 'address-review' | 'resolve-conflicts'>;
    }
  | {
      type: 'start_github_issue';
      issue: InboxIssue;
    }
  | {
      type: 'start_jira_issue';
      issue: InboxJiraIssue;
      /** Null when the user must pick a workspace first. */
      workspaceId: string | null;
    };

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  /** Lower number = higher urgency. */
  priority: number;
  title: string;
  subtitle: string;
  actionLabel: string;
  action: WorkItemAction;
}

export interface WorkQueueInput {
  agents: WorkQueueAgent[];
  inbox: { authored: InboxPullRequest[]; reviewRequested: InboxPullRequest[] } | null;
  failingPrs: WorkQueueFailingPr[];
  githubIssues: InboxIssue[];
  jiraIssues: InboxJiraIssue[];
  /** Work item ids the user snoozed / dismissed. */
  dismissedIds?: ReadonlySet<string>;
  /** Max items to return (default 8). */
  limit?: number;
}

export interface WorkQueueResult {
  items: WorkItem[];
  summary: string;
}

const PRIORITY: Record<WorkItemKind, number> = {
  agent_blocked: 10,
  pr_failing_ci: 20,
  pr_review: 30,
  github_issue: 40,
  jira_issue: 50,
  agent_idle: 60,
};

const DEFAULT_LIMIT = 8;

function activeAgents(agents: WorkQueueAgent[]): WorkQueueAgent[] {
  return agents.filter((agent) => agent.status !== 'archived');
}

function formatNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}

function collectItems(input: WorkQueueInput): WorkItem[] {
  const items: WorkItem[] = [];
  const agents = activeAgents(input.agents);

  for (const agent of agents.filter((a) => a.pendingPermissionCount > 0)) {
    items.push({
      id: `blocked:${agent.id}`,
      kind: 'agent_blocked',
      priority: PRIORITY.agent_blocked,
      title: `${agent.name} needs input`,
      subtitle: agent.workspaceName,
      actionLabel: `Answer ${agent.name}`,
      action: {
        type: 'navigate',
        to: `/agents/${agent.id}`,
        state: { focusAttention: 'needs-input' },
      },
    });
  }

  for (const item of input.failingPrs) {
    const { pr } = item;
    items.push({
      id: `fix-ci:${pr.owner}/${pr.repo}#${pr.number}`,
      kind: 'pr_failing_ci',
      priority: PRIORITY.pr_failing_ci,
      title: `#${pr.number} ${pr.title}`,
      subtitle: `${pr.owner}/${pr.repo} · ${item.failing} failing check${item.failing === 1 ? '' : 's'}`,
      actionLabel: `Fix CI on #${pr.number}`,
      action: { type: 'start_pr_template', pr, template: 'fix-ci' },
    });
  }

  for (const pr of input.inbox?.reviewRequested ?? []) {
    items.push({
      id: `review:${pr.owner}/${pr.repo}#${pr.number}`,
      kind: 'pr_review',
      priority: PRIORITY.pr_review,
      title: `#${pr.number} ${pr.title}`,
      subtitle: `${pr.owner}/${pr.repo} · review requested`,
      actionLabel: `Review #${pr.number}`,
      action: { type: 'start_pr_template', pr, template: 'address-review' },
    });
  }

  for (const issue of input.githubIssues) {
    items.push({
      id: `gh-issue:${issue.owner}/${issue.repo}#${issue.number}`,
      kind: 'github_issue',
      priority: PRIORITY.github_issue,
      title: `#${issue.number} ${issue.title}`,
      subtitle: `${issue.owner}/${issue.repo}${issue.workspaceId ? ' · workspace ready' : ' · will clone'}`,
      actionLabel: 'Start agent',
      action: { type: 'start_github_issue', issue },
    });
  }

  for (const issue of input.jiraIssues) {
    const workspaceId = issue.suggestedWorkspaceId ?? null;
    items.push({
      id: `jira:${issue.key}`,
      kind: 'jira_issue',
      priority: PRIORITY.jira_issue,
      title: `${issue.key} ${issue.summary}`,
      subtitle: workspaceId
        ? `${issue.projectKey} · ${issue.status} · workspace matched`
        : `${issue.projectKey} · ${issue.status} · pick workspace`,
      actionLabel: workspaceId ? 'Start agent' : 'Choose workspace',
      action: { type: 'start_jira_issue', issue, workspaceId },
    });
  }

  const idle = agents.filter(
    (a) => a.status === 'idle' && a.pendingPermissionCount === 0,
  );
  if (idle.length > 0) {
    const agent = idle[0]!;
    items.push({
      id: `idle:${agent.id}`,
      kind: 'agent_idle',
      priority: PRIORITY.agent_idle,
      title: `${agent.name} is idle`,
      subtitle: agent.workspaceName,
      actionLabel: `Plan with ${agent.name}`,
      action: {
        type: 'navigate',
        to: `/agents/${agent.id}`,
        state: { sessionTemplate: 'chat' },
      },
    });
  }

  return items;
}

function buildSummary(items: WorkItem[], input: WorkQueueInput): string {
  const blocked = items.filter((i) => i.kind === 'agent_blocked');
  const failing = items.filter((i) => i.kind === 'pr_failing_ci');
  const reviews = items.filter((i) => i.kind === 'pr_review');
  const ghIssues = items.filter((i) => i.kind === 'github_issue');
  const jira = items.filter((i) => i.kind === 'jira_issue');
  const idle = items.filter((i) => i.kind === 'agent_idle');
  const running = activeAgents(input.agents).filter(
    (a) => a.status === 'running' || a.status === 'queued',
  );

  const clauses: string[] = [];

  if (blocked.length === 1) {
    clauses.push(`${blocked[0]!.title.replace(/ needs input$/, '')} needs your input.`);
  } else if (blocked.length > 1) {
    clauses.push(
      `${formatNames(blocked.map((b) => b.title.replace(/ needs input$/, '')))} need your input.`,
    );
  }

  if (failing.length === 1) {
    clauses.push(`${failing[0]!.title} has failing CI.`);
  } else if (failing.length > 1) {
    clauses.push(`${failing.length} of your pull requests have failing CI.`);
  }

  if (reviews.length === 1) {
    clauses.push('You have 1 pull request waiting for your review.');
  } else if (reviews.length > 1) {
    clauses.push(`You have ${reviews.length} pull requests waiting for your review.`);
  }

  if (ghIssues.length === 1) {
    clauses.push('You have 1 assigned GitHub issue.');
  } else if (ghIssues.length > 1) {
    clauses.push(`You have ${ghIssues.length} assigned GitHub issues.`);
  }

  if (jira.length === 1) {
    clauses.push('You have 1 assigned Jira issue.');
  } else if (jira.length > 1) {
    clauses.push(`You have ${jira.length} assigned Jira issues.`);
  }

  if (running.length === 1) {
    clauses.push(`${running[0]!.name} is running.`);
  } else if (running.length > 1) {
    clauses.push(`${formatNames(running.map((a) => a.name))} are running.`);
  }

  if (idle.length > 0 && clauses.length < 4) {
    clauses.push(
      idle.length === 1
        ? `${idle[0]!.title.replace(/ is idle$/, '')} is idle and ready.`
        : `${idle.length} agents are idle and ready.`,
    );
  }

  if (clauses.length === 0) {
    return 'All clear. Nothing needs you right now — click an action when work shows up. Nothing starts until you do.';
  }

  return `${clauses.slice(0, 4).join(' ')} Suggested next steps — nothing runs until you click.`;
}

/** Ranked personal work queue from fleet + inbox sources. Never auto-starts work. */
export function buildWorkQueue(input: WorkQueueInput): WorkQueueResult {
  const dismissed = input.dismissedIds ?? new Set<string>();
  const limit = input.limit ?? DEFAULT_LIMIT;

  const items = collectItems(input)
    .filter((item) => !dismissed.has(item.id))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, limit);

  return {
    items,
    summary: buildSummary(items, input),
  };
}
