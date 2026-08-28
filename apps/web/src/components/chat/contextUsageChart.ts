import type { SessionContextTurn } from '@agent-orchestrator/shared';
import { formatTokenCount } from '../../utils/format';

export const CHART_HEIGHT = 168;
export const Y_TICKS = [0, 0.5, 1] as const;

export function formatPercent(percent: number | null): string {
  if (percent == null) return '—';
  if (percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

export function share(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.min(100, (part / whole) * 100);
}

/** Round up to 1 / 2 / 2.5 / 4 / 5 / 8 / 10 × 10^n so axis labels stay compact. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = 10 ** exp;
  const n = value / mag;
  const nice =
    n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
  return nice * mag;
}

export function historyAxisMax(history: SessionContextTurn[], windowTokens: number): number {
  const peak = Math.max(0, ...history.map((turn) => turn.contextTokens));
  if (peak <= 0) return windowTokens;
  if (peak >= windowTokens * 0.35) return windowTokens;
  return Math.min(windowTokens, niceCeiling(peak));
}

export function barSlotWidth(count: number): number {
  if (count <= 8) return 32;
  if (count <= 20) return 22;
  if (count <= 40) return 16;
  return 12;
}

export function shouldLabelTurn(turn: number, total: number): boolean {
  if (total <= 14) return true;
  if (turn === 1 || turn === total) return true;
  const step = total <= 28 ? 2 : total <= 56 ? 4 : Math.ceil(total / 12);
  return turn % step === 0;
}

export function toolsLabel(tools: string[]): string {
  if (tools.length === 0) return '';
  return tools.length > 3 ? `${tools.slice(0, 3).join(', ')} +${tools.length - 3}` : tools.join(', ');
}

export { formatTokenCount };
