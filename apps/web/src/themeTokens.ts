import { alpha, type PaletteMode } from '@mui/material/styles';

/** Semantic surfaces, accents, and diff colors shared across light and dark. */
export interface AoPalette {
  surface: {
    sidebar: string;
    header: string;
    panel: string;
    panelMuted: string;
    elevated: string;
    overlay: string;
    inset: string;
    code: string;
    codeInline: string;
    empty: string;
    hover: string;
    hoverStrong: string;
    selected: string;
    selectedStrong: string;
  };
  accent: {
    primaryTint: string;
    primaryTintStrong: string;
    primaryBorder: string;
    secondaryTint: string;
    secondaryTintStrong: string;
    secondaryBorder: string;
    secondaryRing: string;
    warningTint: string;
    warningTintStrong: string;
    warningBorder: string;
    errorTint: string;
    errorTintStrong: string;
    errorBorder: string;
    infoTint: string;
    infoTintStrong: string;
    infoGlow: string;
  };
  diff: {
    add: string;
    remove: string;
    hunk: string;
    backdrop: string;
  };
  action: {
    onAccent: string;
  };
  chart: {
    muted: string;
    cacheRead: string;
    cacheWrite: string;
    freshInput: string;
  };
  gradient: {
    body: string;
    panelSheen: string;
    hero: string;
  };
}

const DARK = {
  primary: '#8ba4ff',
  secondary: '#5eead4',
  warning: '#ffb74d',
  error: '#f87171',
  info: '#7c9cff',
  bg: '#0b0f17',
  paper: '#141c2e',
  sidebar: '#121826',
  onAccent: '#0b0f17',
} as const;

const LIGHT = {
  primary: '#3f5fd6',
  secondary: '#0d9488',
  warning: '#d97706',
  error: '#dc2626',
  info: '#4f6fd6',
  bg: '#f6f8fc',
  paper: '#ffffff',
  sidebar: '#ffffff',
  onAccent: '#ffffff',
} as const;

export function buildAoPalette(mode: PaletteMode): AoPalette {
  const isDark = mode === 'dark';
  const c = isDark ? DARK : LIGHT;

  return {
    surface: {
      sidebar: isDark ? alpha(c.sidebar, 0.94) : alpha(c.paper, 0.96),
      header: isDark ? alpha(c.bg, 0.9) : alpha(c.paper, 0.88),
      panel: isDark ? alpha('#182030', 0.78) : alpha(c.paper, 0.92),
      panelMuted: isDark ? alpha('#182030', 0.58) : alpha('#e8edf5', 0.72),
      elevated: isDark ? alpha('#1a2233', 0.98) : alpha(c.paper, 0.98),
      overlay: isDark ? alpha(c.bg, 0.58) : alpha('#e2e8f0', 0.72),
      inset: isDark ? alpha(c.bg, 0.42) : alpha('#f1f5f9', 0.9),
      code: isDark ? alpha('#000', 0.38) : alpha('#0f172a', 0.05),
      codeInline: isDark ? alpha('#fff', 0.09) : alpha('#0f172a', 0.06),
      empty: isDark ? alpha('#182030', 0.45) : alpha('#e8edf5', 0.55),
      hover: isDark ? alpha('#fff', 0.05) : alpha('#0f172a', 0.04),
      hoverStrong: isDark ? alpha('#fff', 0.08) : alpha('#0f172a', 0.07),
      selected: isDark ? alpha(c.secondary, 0.12) : alpha(c.secondary, 0.1),
      selectedStrong: isDark ? alpha(c.secondary, 0.18) : alpha(c.secondary, 0.14),
    },
    accent: {
      primaryTint: alpha(c.primary, isDark ? 0.14 : 0.1),
      primaryTintStrong: alpha(c.primary, isDark ? 0.2 : 0.14),
      primaryBorder: alpha(c.primary, isDark ? 0.38 : 0.32),
      secondaryTint: alpha(c.secondary, isDark ? 0.1 : 0.08),
      secondaryTintStrong: alpha(c.secondary, isDark ? 0.16 : 0.12),
      secondaryBorder: alpha(c.secondary, isDark ? 0.38 : 0.34),
      secondaryRing: alpha(c.secondary, isDark ? 0.28 : 0.22),
      warningTint: alpha(c.warning, isDark ? 0.08 : 0.07),
      warningTintStrong: alpha(c.warning, isDark ? 0.12 : 0.1),
      warningBorder: alpha(c.warning, isDark ? 0.42 : 0.38),
      errorTint: alpha(c.error, isDark ? 0.08 : 0.07),
      errorTintStrong: alpha(c.error, isDark ? 0.12 : 0.1),
      errorBorder: alpha(c.error, isDark ? 0.42 : 0.38),
      infoTint: alpha(c.info, isDark ? 0.12 : 0.08),
      infoTintStrong: alpha(c.info, 0.18),
      infoGlow: alpha(c.info, isDark ? 0.38 : 0.22),
    },
    diff: {
      add: isDark ? alpha('#4ade80', 0.12) : alpha('#16a34a', 0.12),
      remove: isDark ? alpha('#f87171', 0.12) : alpha('#dc2626', 0.12),
      hunk: alpha(c.secondary, isDark ? 0.1 : 0.08),
      backdrop: isDark ? alpha('#000', 0.35) : alpha('#0f172a', 0.04),
    },
    action: {
      onAccent: c.onAccent,
    },
    chart: {
      muted: isDark ? alpha('#fff', 0.45) : alpha('#0f172a', 0.42),
      cacheRead: c.secondary,
      cacheWrite: c.primary,
      freshInput: c.warning,
    },
    gradient: {
      body: isDark
        ? `radial-gradient(ellipse 70% 50% at 8% 0%, ${alpha(c.secondary, 0.1)}, transparent 50%), radial-gradient(ellipse 55% 45% at 100% 0%, ${alpha(c.primary, 0.09)}, transparent 45%)`
        : `radial-gradient(ellipse 70% 50% at 8% 0%, ${alpha(c.secondary, 0.09)}, transparent 50%), radial-gradient(ellipse 55% 45% at 100% 0%, ${alpha(c.primary, 0.08)}, transparent 45%)`,
      panelSheen: isDark
        ? `linear-gradient(135deg, ${alpha(c.secondary, 0.06)} 0%, transparent 42%, ${alpha(c.primary, 0.05)} 100%)`
        : `linear-gradient(135deg, ${alpha(c.secondary, 0.05)} 0%, transparent 42%, ${alpha(c.primary, 0.04)} 100%)`,
      hero: isDark
        ? `radial-gradient(ellipse 80% 70% at 15% 20%, ${alpha(c.secondary, 0.14)}, transparent 55%), radial-gradient(ellipse 60% 80% at 90% 10%, ${alpha(c.primary, 0.12)}, transparent 50%), linear-gradient(180deg, ${alpha('#182030', 0.96)}, ${alpha(c.bg, 0.9)})`
        : `radial-gradient(ellipse 80% 70% at 15% 20%, ${alpha(c.secondary, 0.1)}, transparent 55%), radial-gradient(ellipse 60% 80% at 90% 10%, ${alpha(c.primary, 0.08)}, transparent 50%), linear-gradient(180deg, ${alpha(c.paper, 0.98)}, ${alpha(c.bg, 0.92)})`,
    },
  };
}

declare module '@mui/material/styles' {
  interface Palette {
    ao: AoPalette;
  }
  interface PaletteOptions {
    ao?: AoPalette;
  }
}
