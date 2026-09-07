/** PR identity for fleet triage prompts (Assistant-mediated bulk actions). */
export type FleetTriagePrRef = {
  owner: string;
  repo: string;
  number: number;
  agentId?: string | null;
};

export type FleetTriageAgentRef = {
  agentId: string;
  name: string;
};

export type FleetTriageKind =
  | 'fix-ci'
  | 'address-review'
  | 'archive-merged'
  | 'needs-input';

export type FleetTriageStarter = {
  id: string;
  label: string;
  prompt: string;
};

function prList(refs: FleetTriagePrRef[]): string {
  return refs.map((pr) => `${pr.owner}/${pr.repo}#${pr.number}`).join(', ');
}

function agentList(refs: FleetTriageAgentRef[]): string {
  return refs.map((a) => `${a.name} (${a.agentId})`).join(', ');
}

/**
 * Build an Assistant-first prompt for a fleet bulk triage action.
 * Writes stay confirm-gated inside Assistant tools — the UI only asks.
 */
export function buildFleetTriagePrompt(input: {
  kind: FleetTriageKind;
  fixCi?: FleetTriagePrRef[];
  addressReview?: FleetTriagePrRef[];
  archiveMerged?: FleetTriageAgentRef[];
  needsInput?: FleetTriageAgentRef[];
}): FleetTriageStarter | null {
  switch (input.kind) {
    case 'fix-ci': {
      const refs = input.fixCi ?? [];
      if (refs.length === 0) return null;
      const n = refs.length;
      return {
        id: 'fleet-fix-ci',
        label: `Fix CI on ${n} PR${n === 1 ? '' : 's'}`,
        prompt:
          n === 1
            ? `Fix failing CI on ${prList(refs)} using start_agent_session with template fix-ci (reuse the existing agent when agentId is known). Confirm with me before writing.`
            : `Fix failing CI on these ${n} PRs using start_agent_session with template fix-ci for each (reuse existing agents when agentId is known). Confirm with me before each write: ${prList(refs)}.`,
      };
    }
    case 'address-review': {
      const refs = input.addressReview ?? [];
      if (refs.length === 0) return null;
      const n = refs.length;
      return {
        id: 'fleet-address-review',
        label: `Address review on ${n} PR${n === 1 ? '' : 's'}`,
        prompt:
          n === 1
            ? `Start an address-review session for ${prList(refs)} using start_agent_session. Confirm with me before writing.`
            : `Start address-review sessions for these ${n} PRs using start_agent_session for each. Confirm with me before each write: ${prList(refs)}.`,
      };
    }
    case 'archive-merged': {
      const refs = input.archiveMerged ?? [];
      if (refs.length === 0) return null;
      const n = refs.length;
      return {
        id: 'fleet-archive-merged',
        label: `Archive ${n} merged agent${n === 1 ? '' : 's'}`,
        prompt:
          n === 1
            ? `Archive merged agent ${agentList(refs)} using archive_agent with confirm=true and deleteWorktree=false.`
            : `Archive these ${n} merged agents using archive_agent with confirm=true and deleteWorktree=false for each: ${agentList(refs)}.`,
      };
    }
    case 'needs-input': {
      const refs = input.needsInput ?? [];
      if (refs.length === 0) return null;
      const n = refs.length;
      return {
        id: 'fleet-needs-input',
        label: `Unblock ${n} agent${n === 1 ? '' : 's'}`,
        prompt:
          n === 1
            ? `Agent ${agentList(refs)} is waiting on a permission. List pending permissions for that agent and help me unblock it.`
            : `${n} agents are waiting on permissions (${agentList(refs)}). List pending permissions and help me unblock them.`,
      };
    }
    default:
      return null;
  }
}

/** Single blocked-agent triage prompt (Needs attention row). */
export function buildBlockedAgentPrompt(agent: FleetTriageAgentRef): FleetTriageStarter {
  return {
    id: `blocked:${agent.agentId}`,
    label: `Unblock ${agent.name}`,
    prompt: `Agent ${agent.name} (${agent.agentId}) needs input. List pending permissions for agent ${agent.agentId} and help me unblock it.`,
  };
}
