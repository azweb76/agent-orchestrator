import type {
  InboxPullRequest,
  MergedFleetAgent,
  PullRequestChecks,
  PullRequestInbox,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';

export type FleetBulkActionId =
  | 'fix-ci-all'
  | 'address-review-all'
  | 'archive-merged-all'
  | 'open-needs-input-all';

export interface FleetBulkCounts {
  fixCi: number;
  addressReview: number;
  archiveMerged: number;
  needsInput: number;
}

export interface FleetBulkFixCiTarget {
  pr: InboxPullRequest;
  failing: number;
}

export interface FleetBulkNeedsInputTarget {
  agentId: string;
  name: string;
}

export function selectFixCiBulkTargets(
  inbox: PullRequestInbox | null | undefined,
  checksForPr: (pr: InboxPullRequest) => PullRequestChecks | undefined,
): FleetBulkFixCiTarget[] {
  if (!inbox) return [];
  const targets: FleetBulkFixCiTarget[] = [];
  for (const pr of inbox.authored) {
    if (!pr.agentId) continue;
    const checks = checksForPr(pr);
    if (checks && checks.failing > 0) {
      targets.push({ pr, failing: checks.failing });
    }
  }
  return targets;
}

export function selectAddressReviewBulkTargets(
  inbox: PullRequestInbox | null | undefined,
): InboxPullRequest[] {
  if (!inbox) return [];
  return inbox.reviewRequested.filter((pr) => Boolean(pr.agentId));
}

export function selectNeedsInputBulkTargets(
  tree: SidebarWorkspace[],
): FleetBulkNeedsInputTarget[] {
  return tree
    .flatMap((workspace) => workspace.agents)
    .filter((agent) => agent.status !== 'archived' && (agent.pendingPermissionCount ?? 0) > 0)
    .map((agent) => ({ agentId: agent.id, name: agent.name }));
}

export function selectArchiveMergedBulkTargets(
  mergedAgents: MergedFleetAgent[] | undefined,
): MergedFleetAgent[] {
  return mergedAgents ?? [];
}

export function buildFleetBulkCounts(input: {
  inbox: PullRequestInbox | null | undefined;
  checksForPr: (pr: InboxPullRequest) => PullRequestChecks | undefined;
  sidebar: SidebarWorkspace[];
  mergedAgents: MergedFleetAgent[] | undefined;
}): FleetBulkCounts {
  return {
    fixCi: selectFixCiBulkTargets(input.inbox, input.checksForPr).length,
    addressReview: selectAddressReviewBulkTargets(input.inbox).length,
    archiveMerged: selectArchiveMergedBulkTargets(input.mergedAgents).length,
    needsInput: selectNeedsInputBulkTargets(input.sidebar).length,
  };
}

/** Bulk fleet actions are Assistant-mediated; confirm happens in chat tools. */
export function fleetBulkActionNeedsConfirm(_action: FleetBulkActionId): boolean {
  return false;
}

export function fleetBulkActionLabel(action: FleetBulkActionId, count: number): string {
  switch (action) {
    case 'fix-ci-all':
      return `Fix CI on ${count} PR${count === 1 ? '' : 's'}`;
    case 'address-review-all':
      return `Address review on ${count} PR${count === 1 ? '' : 's'}`;
    case 'archive-merged-all':
      return `Archive ${count} merged agent${count === 1 ? '' : 's'}`;
    case 'open-needs-input-all':
      return `Unblock ${count} agent${count === 1 ? '' : 's'}`;
  }
}

export function fleetBulkActionKind(
  action: FleetBulkActionId,
): 'fix-ci' | 'address-review' | 'archive-merged' | 'needs-input' {
  switch (action) {
    case 'fix-ci-all':
      return 'fix-ci';
    case 'address-review-all':
      return 'address-review';
    case 'archive-merged-all':
      return 'archive-merged';
    case 'open-needs-input-all':
      return 'needs-input';
  }
}
