import { useCallback, useEffect, useState } from 'react';
import type { AutomationSettings } from '@agent-orchestrator/shared';
import { DEFAULT_AUTOMATION_SETTINGS } from '@agent-orchestrator/shared';
import {
  getAutomationSettings,
  triggerAutomationPollNow,
  updateAutomationSettings,
} from './settings';

export function useAutomationSettings(): {
  settings: AutomationSettings;
  loading: boolean;
  update: (patch: Partial<AutomationSettings>) => Promise<void>;
  checking: boolean;
  checkError: string | null;
  checkNow: () => Promise<void>;
} {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_AUTOMATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAutomationSettings().then((value) => {
      if (!cancelled) {
        setSettings(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<AutomationSettings>) => {
    const next = await updateAutomationSettings(patch);
    setSettings(next);
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await triggerAutomationPollNow();
      if (!result.triggered) setCheckError('A check is already running. Try again in a moment.');
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  return { settings, loading, update, checking, checkError, checkNow };
}
