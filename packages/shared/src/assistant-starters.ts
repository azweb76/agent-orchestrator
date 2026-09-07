import type { WorkItemKind } from './work-queue.js';

/** Minimal queue item shape for Assistant starter chips (matches get_work_queue JSON). */
export type AssistantStarterQueueItem = {
  id: string;
  kind: WorkItemKind;
  title: string;
  actionLabel: string;
  action: Record<string, unknown>;
};

export type AssistantStarter = {
  id: string;
  label: string;
  prompt: string;
};

const FALLBACK_STARTERS: AssistantStarter[] = [
  {
    id: 'queue',
    label: 'Work queue',
    prompt: 'What needs attention in my work queue right now?',
  },
  {
    id: 'inbox',
    label: 'PR inbox',
    prompt: 'Summarize my pull request inbox and assigned issues.',
  },
  {
    id: 'fleet',
    label: 'Fleet status',
    prompt: 'Summarize the fleet: running, idle, and blocked agents.',
  },
];

function prRef(action: Record<string, unknown>): string | null {
  const owner = typeof action.owner === 'string' ? action.owner : null;
  const repo = typeof action.repo === 'string' ? action.repo : null;
  const number = typeof action.number === 'number' ? action.number : null;
  if (!owner || !repo || number == null) return null;
  return `${owner}/${repo}#${number}`;
}

function starterFromQueueItem(item: AssistantStarterQueueItem): AssistantStarter | null {
  switch (item.kind) {
    case 'agent_blocked': {
      const agentId = typeof item.action.to === 'string'
        ? item.action.to.replace(/^\/agents\//, '')
        : null;
      return {
        id: item.id,
        label: item.actionLabel.replace(/^Answer /, 'Unblock '),
        prompt: agentId
          ? `An agent needs input. List pending permissions for agent ${agentId} and help me unblock it.`
          : 'An agent is waiting on a permission. List pending permissions and help me unblock it.',
      };
    }
    case 'pr_failing_ci': {
      const ref = prRef(item.action);
      if (!ref) return null;
      return {
        id: item.id,
        label: item.actionLabel,
        prompt: `Fix failing CI on ${ref} using start_agent_session with template fix-ci. Confirm with me before writing.`,
      };
    }
    case 'pr_review': {
      const ref = prRef(item.action);
      if (!ref) return null;
      return {
        id: item.id,
        label: item.actionLabel.startsWith('Review')
          ? `Address review on #${String(item.action.number ?? '')}`
          : item.actionLabel,
        prompt: `Start an address-review session for ${ref} using start_agent_session. Confirm with me before writing.`,
      };
    }
    case 'github_issue': {
      const ref = prRef(item.action);
      if (!ref) return null;
      return {
        id: item.id,
        label: `Start ${ref}`,
        prompt: `Create an agent from GitHub issue ${ref} using create_agent_from_github_issue. Confirm with me before writing.`,
      };
    }
    case 'jira_issue': {
      const key = typeof item.action.key === 'string' ? item.action.key : null;
      if (!key) return null;
      const workspaceId =
        typeof item.action.workspaceId === 'string' ? item.action.workspaceId : null;
      return {
        id: item.id,
        label: `Start ${key}`,
        prompt: workspaceId
          ? `Create an agent from Jira issue ${key} using create_agent_from_jira_issue with workspaceId=${workspaceId} and confirm=true. Confirm with me before writing.`
          : `Create an agent from Jira issue ${key} using create_agent_from_jira_issue with confirm=true. Ask me for a workspace if needed. Confirm with me before writing.`,
      };
    }
    case 'agent_idle':
      return null;
    default:
      return null;
  }
}

function blockedStarter(items: AssistantStarterQueueItem[]): AssistantStarter | null {
  const blocked = items.filter((item) => item.kind === 'agent_blocked');
  if (blocked.length === 0) return null;
  if (blocked.length === 1) return starterFromQueueItem(blocked[0]!);
  return {
    id: 'unblock-many',
    label: `Unblock ${blocked.length} agents`,
    prompt: `${blocked.length} agents are waiting on permissions. List pending permissions and help me unblock them.`,
  };
}

/**
 * Build 2–3 Assistant-first starter chips from the live work queue.
 * Prefers actionable queue items; falls back to generic prompts when empty.
 */
export function buildAssistantStarters(input: {
  items: AssistantStarterQueueItem[];
  runningCount?: number;
  max?: number;
}): AssistantStarter[] {
  const max = input.max ?? 3;
  const starters: AssistantStarter[] = [];
  const seenKinds = new Set<WorkItemKind>();

  const unblock = blockedStarter(input.items);
  if (unblock) {
    starters.push(unblock);
    seenKinds.add('agent_blocked');
  }

  for (const item of input.items) {
    if (starters.length >= max) break;
    if (item.kind === 'agent_blocked') continue;
    if (seenKinds.has(item.kind)) continue;
    const starter = starterFromQueueItem(item);
    if (!starter) continue;
    seenKinds.add(item.kind);
    starters.push(starter);
  }

  if (starters.length < max && (input.runningCount ?? 0) > 0) {
    starters.push({
      id: 'running',
      label: 'Running agents',
      prompt: 'Summarize what the running agents are doing and whether any need me.',
    });
  }

  for (const starter of FALLBACK_STARTERS) {
    if (starters.length >= max) break;
    if (starters.some((item) => item.id === starter.id)) continue;
    starters.push(starter);
  }

  return starters.slice(0, max);
}
