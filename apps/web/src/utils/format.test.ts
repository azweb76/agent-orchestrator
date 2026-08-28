import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, formatRelativeTime, formatTokenCount, formatUsd, statusLabel } from './format';

describe('statusLabel', () => {
  it('maps known statuses to labels', () => {
    expect(statusLabel('running')).toBe('Running');
    expect(statusLabel('idle')).toBe('Ready');
    expect(statusLabel('stopped')).toBe('Stopped');
    expect(statusLabel('archived')).toBe('Archived');
  });

  it('passes unknown statuses through', () => {
    expect(statusLabel('mystery')).toBe('mystery');
  });
});

describe('formatUsd', () => {
  it('formats dollar amounts with two decimals', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.42)).toBe('$0.42');
    expect(formatUsd(12.3)).toBe('$12.30');
  });

  it('collapses tiny positive amounts', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
  });
});

describe('formatBytes', () => {
  it('scales through B, KB, MB, and GB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
  });

  it('returns a dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('formatTokenCount', () => {
  it('keeps small counts as-is', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(25_000)).toBe('25k');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
    expect(formatTokenCount(12_000_000)).toBe('12M');
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats past and future offsets relative to now', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatRelativeTime(new Date(now.getTime() - 30_000))).toBe('30 seconds ago');
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60_000))).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(now.getTime() + 3 * 3_600_000))).toBe('in 3 hours');
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 86_400_000))).toBe('3 days ago');
  });

  it('falls back to a calendar date beyond two weeks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));

    const result = formatRelativeTime(new Date('2026-06-01T12:00:00Z'));
    expect(result).not.toMatch(/ago$/);
    expect(result).toMatch(/\d/);
  });
});
