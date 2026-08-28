import { useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'ao.theme.preference';
const DEFAULT_PREFERENCE: ThemePreference = 'dark';

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_PREFERENCE;
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore storage errors
  }
}

export function resolveThemeMode(
  preference: ThemePreference,
  prefersDark = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches,
): ResolvedThemeMode {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

function applyDocumentColorScheme(mode: ResolvedThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.colorScheme = mode;
}

if (typeof window !== 'undefined') {
  applyDocumentColorScheme(resolveThemeMode(loadThemePreference()));
}

/** Persisted dark/light/system preference with live system resolution. */
export function useThemePreference(): {
  preference: ThemePreference;
  resolvedMode: ResolvedThemeMode;
  setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadThemePreference);
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedMode = useMemo(
    () => resolveThemeMode(preference, prefersDark),
    [preference, prefersDark],
  );

  useEffect(() => {
    applyDocumentColorScheme(resolvedMode);
  }, [resolvedMode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persistThemePreference(next);
  }, []);

  return { preference, resolvedMode, setPreference };
}
