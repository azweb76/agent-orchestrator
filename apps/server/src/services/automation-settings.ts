import {
  AUTOMATION_POLL_MAX_SECONDS,
  AUTOMATION_POLL_MIN_SECONDS,
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationSettings,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';

function clampPollInterval(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_AUTOMATION_SETTINGS.pollIntervalSeconds;
  return Math.min(AUTOMATION_POLL_MAX_SECONDS, Math.max(AUTOMATION_POLL_MIN_SECONDS, Math.round(seconds)));
}

function normalizeSettings(raw: Partial<AutomationSettings>): AutomationSettings {
  return {
    enabled: Boolean(raw.enabled),
    pollIntervalSeconds: clampPollInterval(
      raw.pollIntervalSeconds ?? DEFAULT_AUTOMATION_SETTINGS.pollIntervalSeconds,
    ),
    autoFixCi: Boolean(raw.autoFixCi),
    autoAddressReview: Boolean(raw.autoAddressReview),
    autoArchiveOnMerge: Boolean(raw.autoArchiveOnMerge),
    autoArchiveDeleteWorktree: Boolean(raw.autoArchiveDeleteWorktree),
    autoArchiveAllowDirty: Boolean(raw.autoArchiveAllowDirty),
  };
}

export function getAutomationSettings(ctx: AppContext): AutomationSettings {
  const raw = ctx.repos.settings.getAutomationJson();
  if (!raw) return { ...DEFAULT_AUTOMATION_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<AutomationSettings>);
  } catch {
    return { ...DEFAULT_AUTOMATION_SETTINGS };
  }
}

export function setAutomationSettings(
  ctx: AppContext,
  patch: Partial<AutomationSettings>,
): AutomationSettings {
  const current = getAutomationSettings(ctx);
  const next = normalizeSettings({ ...current, ...patch });
  ctx.repos.settings.setAutomationJson(JSON.stringify(next));
  return next;
}

export function automationPollShouldRun(settings: AutomationSettings): boolean {
  return settings.enabled;
}
