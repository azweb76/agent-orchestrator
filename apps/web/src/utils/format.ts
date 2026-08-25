import type { AgentStatus } from '@agent-orchestrator/shared';

export function statusLabel(status: AgentStatus | string): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'idle':
      return 'Ready';
    case 'stopped':
      return 'Stopped';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

/** Compact relative time for list metadata. */
export function formatRelativeTime(iso: string | number | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), 'second');
  const absMin = Math.round(absSec / 60);
  if (absMin < 60) return rtf.format(Math.sign(diffMs) * absMin, 'minute');
  const absHr = Math.round(absMin / 60);
  if (absHr < 48) return rtf.format(Math.sign(diffMs) * absHr, 'hour');
  const absDay = Math.round(absHr / 24);
  if (absDay < 14) return rtf.format(Math.sign(diffMs) * absDay, 'day');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
