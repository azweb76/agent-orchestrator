import type { AppSettings } from '@agent-orchestrator/shared';
import { DEFAULT_APP_SETTINGS } from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';

const SETTINGS_KEYS = {
  dailySpendCapUsd: 'daily_spend_cap_usd',
  perAgentSpendCapUsd: 'per_agent_spend_cap_usd',
  watchdogEnabled: 'watchdog_enabled',
  watchdogPermissionMinutes: 'watchdog_permission_minutes',
  watchdogStreamIdleMinutes: 'watchdog_stream_idle_minutes',
  watchdogStaleRunEnabled: 'watchdog_stale_run_enabled',
  analyzeSessionEnabled: 'analyze_session_enabled',
  autoGradeBuildSessionsEnabled: 'auto_grade_build_sessions_enabled',
} as const;

function parseNullableUsd(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw === 'true';
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

export function getAppSettings(repos: AppRepositories): AppSettings {
  const get = (key: string) => repos.settings.get(key);
  return {
    dailySpendCapUsd: parseNullableUsd(get(SETTINGS_KEYS.dailySpendCapUsd)),
    perAgentSpendCapUsd: parseNullableUsd(get(SETTINGS_KEYS.perAgentSpendCapUsd)),
    watchdogEnabled: parseBool(get(SETTINGS_KEYS.watchdogEnabled), DEFAULT_APP_SETTINGS.watchdogEnabled),
    watchdogPermissionMinutes: parsePositiveInt(
      get(SETTINGS_KEYS.watchdogPermissionMinutes),
      DEFAULT_APP_SETTINGS.watchdogPermissionMinutes,
    ),
    watchdogStreamIdleMinutes: parsePositiveInt(
      get(SETTINGS_KEYS.watchdogStreamIdleMinutes),
      DEFAULT_APP_SETTINGS.watchdogStreamIdleMinutes,
    ),
    watchdogStaleRunEnabled: parseBool(
      get(SETTINGS_KEYS.watchdogStaleRunEnabled),
      DEFAULT_APP_SETTINGS.watchdogStaleRunEnabled,
    ),
    analyzeSessionEnabled: parseBool(
      get(SETTINGS_KEYS.analyzeSessionEnabled),
      DEFAULT_APP_SETTINGS.analyzeSessionEnabled,
    ),
    autoGradeBuildSessionsEnabled: parseBool(
      get(SETTINGS_KEYS.autoGradeBuildSessionsEnabled),
      DEFAULT_APP_SETTINGS.autoGradeBuildSessionsEnabled,
    ),
  };
}

export type UpdateAppSettingsRequest = Partial<AppSettings>;

export function updateAppSettings(
  repos: AppRepositories,
  body: UpdateAppSettingsRequest,
): AppSettings {
  const set = (key: string, value: string | null) => {
    if (value == null) repos.settings.delete(key);
    else repos.settings.set(key, value);
  };

  if ('dailySpendCapUsd' in body) {
    const cap = body.dailySpendCapUsd;
    set(
      SETTINGS_KEYS.dailySpendCapUsd,
      cap == null || cap <= 0 ? null : String(cap),
    );
  }
  if ('perAgentSpendCapUsd' in body) {
    const cap = body.perAgentSpendCapUsd;
    set(
      SETTINGS_KEYS.perAgentSpendCapUsd,
      cap == null || cap <= 0 ? null : String(cap),
    );
  }
  if ('watchdogEnabled' in body) {
    set(SETTINGS_KEYS.watchdogEnabled, body.watchdogEnabled ? '1' : '0');
  }
  if ('watchdogPermissionMinutes' in body) {
    const minutes = body.watchdogPermissionMinutes;
    set(
      SETTINGS_KEYS.watchdogPermissionMinutes,
      minutes != null && minutes >= 1 ? String(Math.floor(minutes)) : null,
    );
  }
  if ('watchdogStreamIdleMinutes' in body) {
    const minutes = body.watchdogStreamIdleMinutes;
    set(
      SETTINGS_KEYS.watchdogStreamIdleMinutes,
      minutes != null && minutes >= 1 ? String(Math.floor(minutes)) : null,
    );
  }
  if ('watchdogStaleRunEnabled' in body) {
    set(SETTINGS_KEYS.watchdogStaleRunEnabled, body.watchdogStaleRunEnabled ? '1' : '0');
  }
  if ('analyzeSessionEnabled' in body) {
    set(SETTINGS_KEYS.analyzeSessionEnabled, body.analyzeSessionEnabled ? '1' : '0');
  }
  if ('autoGradeBuildSessionsEnabled' in body) {
    set(
      SETTINGS_KEYS.autoGradeBuildSessionsEnabled,
      body.autoGradeBuildSessionsEnabled ? '1' : '0',
    );
  }

  return getAppSettings(repos);
}
