/** Server-persisted GitHub automation preferences (all default off). */
export interface AutomationSettings {
  /** Master switch: poll GitHub for linked/authored PRs. */
  enabled: boolean;
  /** Base poll interval in seconds (rate-limit backoff may increase it). */
  pollIntervalSeconds: number;
  /** Auto-start Fix CI when checks fail on a linked PR. */
  autoFixCi: boolean;
  /** Auto-start Address review when new review feedback arrives. */
  autoAddressReview: boolean;
  /** Archive the agent when its linked PR merges. */
  autoArchiveOnMerge: boolean;
  /** Also delete the worktree when auto-archiving (like dashboard prune). */
  autoArchiveDeleteWorktree: boolean;
  /** Allow auto-archive when the worktree has uncommitted changes. */
  autoArchiveAllowDirty: boolean;
  /** After plan approval, auto-start Build then Create draft PR (opt-in). */
  autopilot: boolean;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  pollIntervalSeconds: 60,
  autoFixCi: false,
  autoAddressReview: false,
  autoArchiveOnMerge: false,
  autoArchiveDeleteWorktree: false,
  autoArchiveAllowDirty: false,
  autopilot: false,
};

/** Browser localStorage keys mirroring automation settings (see Settings page). */
export const AUTOMATION_STORAGE_KEYS = {
  enabled: 'ao.automation.enabled',
  pollIntervalSeconds: 'ao.automation.pollIntervalSeconds',
  autoFixCi: 'ao.automation.autoFixCi',
  autoAddressReview: 'ao.automation.autoAddressReview',
  autoArchiveOnMerge: 'ao.automation.autoArchiveOnMerge',
  autoArchiveDeleteWorktree: 'ao.automation.autoArchiveDeleteWorktree',
  autoArchiveAllowDirty: 'ao.automation.autoArchiveAllowDirty',
  autopilot: 'ao.automation.autopilot',
} as const;

/** Max Fix CI auto-retries per commit SHA before giving up. */
export const FIX_CI_RETRY_CAP = 2;

/** Minimum poll interval (seconds). */
export const AUTOMATION_POLL_MIN_SECONDS = 30;

/** Maximum backoff interval after rate limits (seconds). */
export const AUTOMATION_POLL_MAX_SECONDS = 900;
