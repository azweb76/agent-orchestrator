export const REPO_CACHE_TTL_MS = 5 * 60 * 1000;
export const PR_BY_BRANCH_CACHE_TTL_MS = 60 * 1000;
/** GitHub only allows path segments matching this in owner/repo/sha positions. */
export const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
/** `/commits/{sha}/check-runs` pages at 100; cap the fan-out for huge suites. */
export const MAX_CHECK_RUN_PAGES = 3;
export const MERGEABILITY_RETRIES = 2;
export const DEFAULT_MERGEABILITY_RETRY_DELAY_MS = 800;
/** Conclusions that make a suite red. */
export const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);
