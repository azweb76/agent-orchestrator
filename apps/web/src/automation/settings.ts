import type { AutomationSettings } from '@agent-orchestrator/shared';
import { AUTOMATION_STORAGE_KEYS, DEFAULT_AUTOMATION_SETTINGS } from '@agent-orchestrator/shared';
import { request } from '../api/request';

function readBool(key: string): boolean | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return undefined;
  } catch {
    return undefined;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore
  }
}

export function readAutomationSettingsLocal(): Partial<AutomationSettings> {
  const pollRaw = localStorage.getItem(AUTOMATION_STORAGE_KEYS.pollIntervalSeconds);
  const pollIntervalSeconds = pollRaw ? Number(pollRaw) : undefined;
  return {
    enabled: readBool(AUTOMATION_STORAGE_KEYS.enabled),
    pollIntervalSeconds: Number.isFinite(pollIntervalSeconds) ? pollIntervalSeconds : undefined,
    autoFixCi: readBool(AUTOMATION_STORAGE_KEYS.autoFixCi),
    autoAddressReview: readBool(AUTOMATION_STORAGE_KEYS.autoAddressReview),
    autoArchiveOnMerge: readBool(AUTOMATION_STORAGE_KEYS.autoArchiveOnMerge),
    autoArchiveDeleteWorktree: readBool(AUTOMATION_STORAGE_KEYS.autoArchiveDeleteWorktree),
    autoArchiveAllowDirty: readBool(AUTOMATION_STORAGE_KEYS.autoArchiveAllowDirty),
    autopilot: readBool(AUTOMATION_STORAGE_KEYS.autopilot),
  };
}

export function writeAutomationSettingsLocal(settings: AutomationSettings): void {
  writeBool(AUTOMATION_STORAGE_KEYS.enabled, settings.enabled);
  writeBool(AUTOMATION_STORAGE_KEYS.autoFixCi, settings.autoFixCi);
  writeBool(AUTOMATION_STORAGE_KEYS.autoAddressReview, settings.autoAddressReview);
  writeBool(AUTOMATION_STORAGE_KEYS.autoArchiveOnMerge, settings.autoArchiveOnMerge);
  writeBool(AUTOMATION_STORAGE_KEYS.autoArchiveDeleteWorktree, settings.autoArchiveDeleteWorktree);
  writeBool(AUTOMATION_STORAGE_KEYS.autoArchiveAllowDirty, settings.autoArchiveAllowDirty);
  writeBool(AUTOMATION_STORAGE_KEYS.autopilot, settings.autopilot);
  try {
    localStorage.setItem(
      AUTOMATION_STORAGE_KEYS.pollIntervalSeconds,
      String(settings.pollIntervalSeconds),
    );
  } catch {
    // ignore
  }
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  try {
    const remote = await request<AutomationSettings>('/settings/automation');
    writeAutomationSettingsLocal(remote);
    return remote;
  } catch {
    const local = readAutomationSettingsLocal();
    return { ...DEFAULT_AUTOMATION_SETTINGS, ...local };
  }
}

export async function updateAutomationSettings(
  patch: Partial<AutomationSettings>,
): Promise<AutomationSettings> {
  const current = await getAutomationSettings();
  const next = { ...current, ...patch };
  const saved = await request<AutomationSettings>('/settings/automation', {
    method: 'PUT',
    body: JSON.stringify(next),
  });
  writeAutomationSettingsLocal(saved);
  return saved;
}
