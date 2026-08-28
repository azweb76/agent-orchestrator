import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme } from '../theme';
import {
  useThemePreference,
  type ResolvedThemeMode,
  type ThemePreference,
} from '../themePrefs';

interface ThemePreferenceContextValue {
  preference: ThemePreference;
  resolvedMode: ResolvedThemeMode;
  setPreference: (preference: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const themeState = useThemePreference();
  const theme = useMemo(() => createAppTheme(themeState.resolvedMode), [themeState.resolvedMode]);

  return (
    <ThemePreferenceContext.Provider value={themeState}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreferenceContext(): ThemePreferenceContextValue {
  const value = useContext(ThemePreferenceContext);
  if (!value) {
    throw new Error('useThemePreferenceContext must be used within ThemePreferenceProvider');
  }
  return value;
}
