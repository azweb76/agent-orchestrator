import type { ReactElement } from 'react';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import type { AgentPrActionKind } from './agentPrStatusModel';

export const PR_ACTION_DISMISS_PREFIX = 'ao.pr-action-dismiss:';

export type PrKickoffTemplate = 'resolve-conflicts' | 'fix-ci' | 'address-review';

export function readPrActionDismissed(agentId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(`${PR_ACTION_DISMISS_PREFIX}${agentId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function writePrActionDismissed(agentId: string, fingerprints: Set<string>): void {
  try {
    sessionStorage.setItem(`${PR_ACTION_DISMISS_PREFIX}${agentId}`, JSON.stringify([...fingerprints]));
  } catch {
    // ignore quota / private mode
  }
}

export function prActionIcon(kind: AgentPrActionKind): ReactElement {
  switch (kind) {
    case 'resolve_conflicts':
      return <CallMergeOutlinedIcon fontSize="small" />;
    case 'fix_ci':
      return <BugReportOutlinedIcon fontSize="small" />;
    case 'address_review':
      return <ReplyOutlinedIcon fontSize="small" />;
    case 'mark_ready':
      return <RateReviewOutlinedIcon fontSize="small" />;
    case 'merge':
      return <MergeTypeIcon fontSize="small" />;
  }
}

export function prActionLabel(kind: AgentPrActionKind, pending: boolean): string {
  if (pending) return 'Working…';
  switch (kind) {
    case 'resolve_conflicts':
      return 'Resolve conflicts';
    case 'fix_ci':
      return 'Fix CI';
    case 'address_review':
      return 'Address review';
    case 'mark_ready':
      return 'Mark ready';
    case 'merge':
      return 'Merge';
  }
}

export function isPrKickoffKind(
  kind: AgentPrActionKind,
): kind is 'resolve_conflicts' | 'fix_ci' | 'address_review' {
  return kind === 'resolve_conflicts' || kind === 'fix_ci' || kind === 'address_review';
}

export function prKickoffTemplate(
  kind: 'resolve_conflicts' | 'fix_ci' | 'address_review',
): PrKickoffTemplate {
  if (kind === 'resolve_conflicts') return 'resolve-conflicts';
  if (kind === 'fix_ci') return 'fix-ci';
  return 'address-review';
}
