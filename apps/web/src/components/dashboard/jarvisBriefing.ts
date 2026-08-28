import type { AgentStatus, ChatSessionTemplateId, InboxPullRequest } from '@agent-orchestrator/shared';
import { pullRequestPath } from '../../utils/paths';

export interface JarvisAgent {
  id: string;
  name: string;
  workspaceName: string;
  status: AgentStatus;
  pendingPermissionCount: number;
}

export interface JarvisFailingPr {
  pr: InboxPullRequest;
  failing: number;
}

export interface JarvisBriefingInput {
  systemsOk: boolean;
  systemsPartial: boolean;
  githubConfigured: boolean;
  agents: JarvisAgent[];
  inbox: { authored: InboxPullRequest[]; reviewRequested: InboxPullRequest[] } | null;
  cachedFailingPrs: JarvisFailingPr[];
}

export type JarvisAction =
  | {
      id: string;
      label: string;
      type: 'navigate';
      to: string;
      state?: Record<string, unknown>;
    }
  | {
      id: string;
      label: string;
      type: 'start-pr-template';
      pr: InboxPullRequest;
      template: ChatSessionTemplateId;
    };

export interface JarvisBriefingResult {
  summary: string;
  actions: JarvisAction[];
}

const MAX_ACTIONS = 3;

function activeAgents(agents: JarvisAgent[]): JarvisAgent[] {
  return agents.filter((agent) => agent.status !== 'archived');
}

function blockedAgents(agents: JarvisAgent[]): JarvisAgent[] {
  return activeAgents(agents).filter((agent) => agent.pendingPermissionCount > 0);
}

function runningAgents(agents: JarvisAgent[]): JarvisAgent[] {
  return activeAgents(agents).filter((agent) => agent.status === 'running' || agent.status === 'queued');
}

function idleAgents(agents: JarvisAgent[]): JarvisAgent[] {
  return activeAgents(agents).filter((agent) => agent.status === 'idle');
}

function formatAgentNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}

function agentClause(agents: JarvisAgent[]): string | null {
  if (agents.length === 0) return null;
  const names = formatAgentNames(agents.map((agent) => agent.name));
  if (agents.length === 1) return `${names} is running.`;
  return `${names} are running.`;
}

function blockedClause(agents: JarvisAgent[]): string | null {
  if (agents.length === 0) return null;
  const names = formatAgentNames(agents.map((agent) => agent.name));
  if (agents.length === 1) return `${names} needs your input.`;
  return `${names} need your input.`;
}

function idleClause(agents: JarvisAgent[]): string | null {
  if (agents.length === 0) return null;
  if (agents.length === 1) return `${agents[0]!.name} is idle and ready.`;
  return `${agents.length} agents are idle and ready.`;
}

function reviewClause(count: number): string | null {
  if (count === 0) return null;
  if (count === 1) return 'You have 1 pull request waiting for your review.';
  return `You have ${count} pull requests waiting for your review.`;
}

function failingCiClause(items: JarvisFailingPr[]): string | null {
  if (items.length === 0) return null;
  const first = items[0]!;
  if (items.length === 1) {
    return `#${first.pr.number} ${first.pr.title} has failing CI.`;
  }
  return `${items.length} of your pull requests have failing CI.`;
}

function authoredClause(count: number): string | null {
  if (count === 0) return null;
  if (count === 1) return 'You have 1 open pull request.';
  return `You have ${count} open pull requests.`;
}

function systemsClause(input: JarvisBriefingInput): string | null {
  if (input.systemsOk) return null;
  if (!input.systemsPartial) {
    return 'Configure Claude Code and a GitHub token to get started.';
  }
  return 'Some systems still need setup — check Claude Code and GitHub connectivity.';
}

function buildSummary(input: JarvisBriefingInput): string {
  const blocked = blockedAgents(input.agents);
  const running = runningAgents(input.agents);
  const idle = idleAgents(input.agents);
  const reviewCount = input.inbox?.reviewRequested.length ?? 0;
  const authoredCount = input.inbox?.authored.length ?? 0;
  const failing = input.cachedFailingPrs;

  const clauses = [
    blockedClause(blocked),
    failingCiClause(failing),
    reviewClause(reviewCount),
    agentClause(running),
    idleClause(idle),
    authoredClause(authoredCount),
    systemsClause(input),
  ].filter((clause): clause is string => Boolean(clause));

  if (clauses.length === 0) {
    if (!input.githubConfigured) {
      return 'All systems nominal. Clone a workspace to spin up your first agent.';
    }
    return 'All systems nominal. Your fleet is standing by — open an agent or scan your PR inbox.';
  }

  return clauses.slice(0, 4).join(' ');
}

function pushAction(actions: JarvisAction[], action: JarvisAction | null): void {
  if (!action || actions.length >= MAX_ACTIONS) return;
  if (actions.some((item) => item.id === action.id)) return;
  actions.push(action);
}

export function buildJarvisBriefing(input: JarvisBriefingInput): JarvisBriefingResult {
  const actions: JarvisAction[] = [];
  const blocked = blockedAgents(input.agents);
  const idle = idleAgents(input.agents);
  const failing = input.cachedFailingPrs;
  const reviewRequested = input.inbox?.reviewRequested ?? [];
  const authored = input.inbox?.authored ?? [];

  for (const agent of blocked) {
    pushAction(actions, {
      id: `blocked:${agent.id}`,
      label: `Answer ${agent.name}`,
      type: 'navigate',
      to: `/agents/${agent.id}`,
      state: { focusAttention: 'needs-input' },
    });
    if (actions.length >= MAX_ACTIONS) break;
  }

  for (const item of failing) {
    pushAction(actions, {
      id: `fix-ci:${item.pr.owner}/${item.pr.repo}#${item.pr.number}`,
      label: `Fix CI on #${item.pr.number}`,
      type: 'start-pr-template',
      pr: item.pr,
      template: 'fix-ci',
    });
    if (actions.length >= MAX_ACTIONS) break;
  }

  for (const pr of reviewRequested) {
    pushAction(actions, {
      id: `review:${pr.owner}/${pr.repo}#${pr.number}`,
      label: `Review #${pr.number}`,
      type: 'start-pr-template',
      pr,
      template: 'address-review',
    });
    if (actions.length >= MAX_ACTIONS) break;
  }

  if (actions.length < MAX_ACTIONS && idle.length > 0) {
    const agent = idle[0]!;
    pushAction(actions, {
      id: `plan:${agent.id}`,
      label: `Plan with ${agent.name}`,
      type: 'navigate',
      to: `/agents/${agent.id}`,
      state: { sessionTemplate: 'chat' },
    });
  }

  if (actions.length < MAX_ACTIONS && authored.length > 0) {
    const pr = authored[0]!;
    pushAction(actions, {
      id: `open-pr:${pr.owner}/${pr.repo}#${pr.number}`,
      label: `Open #${pr.number}`,
      type: 'navigate',
      to: pullRequestPath(pr.owner, pr.repo, pr.number),
    });
  }

  if (actions.length < MAX_ACTIONS && activeAgents(input.agents).length === 0) {
    pushAction(actions, {
      id: 'workspaces',
      label: 'Open workspaces',
      type: 'navigate',
      to: '/workspaces',
    });
  }

  if (actions.length < MAX_ACTIONS && !input.systemsOk) {
    pushAction(actions, {
      id: 'settings',
      label: 'Open settings',
      type: 'navigate',
      to: '/settings',
    });
  }

  return {
    summary: buildSummary(input),
    actions: actions.slice(0, MAX_ACTIONS),
  };
}
