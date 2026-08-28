import type { PaletteMode } from '@mui/material/styles';

const DARK = {
  cacheRead: '#5eead4',
  cacheWrite: '#8ba4ff',
  freshInput: '#ffb74d',
  stops: [
    { at: 0, color: '#5eead4' },
    { at: 50, color: '#5eead4' },
    { at: 70, color: '#ffb74d' },
    { at: 85, color: '#ff8a50' },
    { at: 100, color: '#ef5350' },
  ],
} as const;

const LIGHT = {
  cacheRead: '#0d9488',
  cacheWrite: '#3f5fd6',
  freshInput: '#d97706',
  stops: [
    { at: 0, color: '#0d9488' },
    { at: 50, color: '#0d9488' },
    { at: 70, color: '#d97706' },
    { at: 85, color: '#ea580c' },
    { at: 100, color: '#dc2626' },
  ],
} as const;

/** @deprecated Prefer theme.palette.ao.chart — kept for tests/defaults. */
export const CACHE_READ = DARK.cacheRead;
/** @deprecated Prefer theme.palette.ao.chart */
export const CACHE_WRITE = DARK.cacheWrite;
/** @deprecated Prefer theme.palette.ao.chart */
export const FRESH_INPUT = DARK.freshInput;

/** Fill color stops as usage approaches the auto-compact max. */
export const USAGE_COLOR_STOPS: Array<{ at: number; color: string }> = [...DARK.stops];

export function usageColorsForMode(mode: PaletteMode) {
  return mode === 'light' ? LIGHT : DARK;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `#${[mix(0), mix(1), mix(2)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Interpolated bar/label color: teal while there is room, red at the compact max. */
export function percentFillColor(percent: number | null, mode: PaletteMode = 'dark'): string {
  const stops = usageColorsForMode(mode).stops;
  if (percent == null || percent <= 0) return stops[0]!.color;
  const p = Math.min(100, percent);
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const next = stops[i]!;
    if (p <= next.at) {
      const span = next.at - prev.at || 1;
      return mixHex(prev.color, next.color, (p - prev.at) / span);
    }
  }
  return stops[stops.length - 1]!.color;
}

export function percentChipColor(percent: number | null): 'secondary' | 'warning' | 'error' {
  if (percent == null) return 'secondary';
  if (percent >= 85) return 'error';
  if (percent >= 70) return 'warning';
  return 'secondary';
}
