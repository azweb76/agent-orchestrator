/** Why a queued message cannot be sent yet (spend cap). */
export type SpendCapBlockReason = 'daily_cap' | 'per_agent_cap';

/** Persisted safety settings (opt-in caps and watchdog). */
export interface AppSettings {
  /** Fleet-wide daily USD cap; null disables. */
  dailySpendCapUsd: number | null;
  /** Per-agent daily USD cap; null disables. */
  perAgentSpendCapUsd: number | null;
  /** When true, background watchdog checks running sessions. */
  watchdogEnabled: boolean;
  /** Alert when a permission prompt is pending longer than this (minutes). */
  watchdogPermissionMinutes: number;
  /** Alert when a live run emits no stream tokens longer than this (minutes). */
  watchdogStreamIdleMinutes: number;
  /** Correct DB status when pid is dead but session still marked running. */
  watchdogStaleRunEnabled: boolean;
  /** When true, the "Analyze this session" chat action is available. */
  analyzeSessionEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  dailySpendCapUsd: null,
  perAgentSpendCapUsd: null,
  watchdogEnabled: false,
  watchdogPermissionMinutes: 30,
  watchdogStreamIdleMinutes: 15,
  watchdogStaleRunEnabled: true,
  analyzeSessionEnabled: false,
};

/** Spend cap snapshot for dashboard / gating. */
export interface SpendBudgetStatus {
  dailyCapUsd: number | null;
  perAgentCapUsd: number | null;
  todayCostUsd: number;
  /** Remaining fleet budget today; null when no daily cap is set. */
  remainingDailyUsd: number | null;
  /** Agent ids that hit the per-agent cap today. */
  agentsAtCap: string[];
}

export type WatchdogAlertKind =
  | 'permission_stale'
  | 'stream_idle'
  | 'stale_run';
