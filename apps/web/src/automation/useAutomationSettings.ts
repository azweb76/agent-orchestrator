import { useCallback, useEffect, useState } from 'react';
import type { AutomationSettings } from '@agent-orchestrator/shared';
import { DEFAULT_AUTOMATION_SETTINGS } from '@agent-orchestrator/shared';
import {
  getAutomationSettings,
  updateAutomationSettings,
} from './settings';

export function useAutomationSettings(): {
  settings: AutomationSettings;
  loading: boolean;
  update: (patch: Partial<AutomationSettings>) => Promise<void>;
} {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_AUTOMATION_SETTINGS);
  const [loading, setLoading] = useState(true);

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

  return { settings, loading, update };
}
