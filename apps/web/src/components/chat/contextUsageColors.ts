export const CACHE_READ = '#5eead4';
export const CACHE_WRITE = '#8ba4ff';
export const FRESH_INPUT = '#ffb74d';

/** Fill color stops as usage approaches the auto-compact max. */
export const USAGE_COLOR_STOPS: Array<{ at: number; color: string }> = [
  { at: 0, color: '#5eead4' },
  { at: 50, color: '#5eead4' },
  { at: 70, color: '#ffb74d' },
  { at: 85, color: '#ff8a50' },
  { at: 100, color: '#ef5350' },
];

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
export function percentFillColor(percent: number | null): string {
  if (percent == null || percent <= 0) return USAGE_COLOR_STOPS[0]!.color;
  const p = Math.min(100, percent);
  for (let i = 1; i < USAGE_COLOR_STOPS.length; i++) {
    const prev = USAGE_COLOR_STOPS[i - 1]!;
    const next = USAGE_COLOR_STOPS[i]!;
    if (p <= next.at) {
      const span = next.at - prev.at || 1;
      return mixHex(prev.color, next.color, (p - prev.at) / span);
    }
  }
  return USAGE_COLOR_STOPS[USAGE_COLOR_STOPS.length - 1]!.color;
}

export function percentChipColor(percent: number | null): 'secondary' | 'warning' | 'error' {
  if (percent == null) return 'secondary';
  if (percent >= 85) return 'error';
  if (percent >= 70) return 'warning';
  return 'secondary';
}
