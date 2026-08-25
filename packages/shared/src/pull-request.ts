import type {
  PullRequestCheck,
  PullRequestChecksRollup,
  PullRequestDetail,
  PullRequestMergeMethod,
} from './index.js';

/**
 * Collapse individual checks into a single rollup.
 *
 * Failure deliberately beats pending: a suite with one red check reads red
 * immediately instead of waiting for the remaining jobs to settle.
 */
export function rollupChecks(checks: PullRequestCheck[]): PullRequestChecksRollup {
  if (checks.length === 0) return 'none';

  const failed = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);
  if (checks.some((check) => check.conclusion && failed.has(check.conclusion))) return 'failure';
  if (checks.some((check) => check.status !== 'completed')) return 'pending';
  if (checks.some((check) => check.conclusion === 'success')) return 'success';
  return 'neutral';
}

export interface MergeReadiness {
  /** GitHub is still computing mergeability; the client should keep polling. */
  computing: boolean;
  canMerge: boolean;
  canUpdateBranch: boolean;
  conflicted: boolean;
  behind: boolean;
  /** Why merging is blocked, or a short confirmation when it is allowed. */
  reason: string;
  /** Extra caveat shown alongside an allowed merge (e.g. failing checks). */
  warning: string | null;
  severity: 'success' | 'info' | 'warning' | 'error';
  allowedMethods: PullRequestMergeMethod[];
}

/** Merge methods the repo allows, minus rebase when GitHub says rebase would conflict. */
function allowedMethods(pr: PullRequestDetail): PullRequestMergeMethod[] {
  return pr.allowedMergeMethods.filter((method) => method !== 'rebase' || pr.rebaseable === true);
}

/**
 * Single source of truth for what the merge UI may offer.
 *
 * Order matters: merged/closed short-circuit before any mergeability state is
 * consulted, and an unresolved `mergeable` is reported honestly rather than
 * optimistically treated as clean.
 */
export function evaluateMergeReadiness(pr: PullRequestDetail): MergeReadiness {
  const base: MergeReadiness = {
    computing: false,
    canMerge: false,
    canUpdateBranch: false,
    conflicted: false,
    behind: false,
    reason: '',
    warning: null,
    severity: 'info',
    allowedMethods: allowedMethods(pr),
  };

  if (pr.merged) {
    return { ...base, reason: 'This pull request has been merged.', severity: 'success', allowedMethods: [] };
  }

  if (pr.state !== 'open') {
    return { ...base, reason: 'This pull request is closed.', severity: 'info', allowedMethods: [] };
  }

  if (pr.draft) {
    return {
      ...base,
      canUpdateBranch: true,
      reason: 'Draft pull requests cannot be merged. Mark it ready for review first.',
      severity: 'info',
    };
  }

  if (pr.mergeable === null || pr.mergeableState === 'unknown') {
    return {
      ...base,
      computing: true,
      reason: 'GitHub is still computing whether this pull request can be merged.',
      severity: 'info',
    };
  }

  switch (pr.mergeableState) {
    case 'dirty':
      return {
        ...base,
        conflicted: true,
        reason: 'This branch has conflicts with the base branch. Resolve them locally, then push.',
        severity: 'error',
      };
    case 'blocked':
      return {
        ...base,
        canUpdateBranch: true,
        reason: 'Merging is blocked by branch protection (required reviews or checks).',
        severity: 'warning',
      };
    case 'behind':
      return {
        ...base,
        behind: true,
        canUpdateBranch: true,
        reason: 'This branch is out of date with the base branch. Update it before merging.',
        severity: 'warning',
      };
    case 'unstable':
    case 'has_hooks':
      return {
        ...base,
        canMerge: true,
        reason: 'This branch can be merged.',
        warning: 'Some checks have not succeeded.',
        severity: 'warning',
      };
    case 'clean':
      return { ...base, canMerge: true, reason: 'This branch has no conflicts and can be merged.', severity: 'success' };
    default:
      return {
        ...base,
        reason: `Unexpected merge state "${pr.mergeableState}".`,
        severity: 'warning',
      };
  }
}
