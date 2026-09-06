/**
 * Minimal 5-field cron matcher / next-occurrence helper (no deps).
 * Fields: minute hour day-of-month month day-of-week (0-6 or 7 = Sunday).
 */

type Field = { kind: 'any' } | { kind: 'list'; values: number[] };

function parsePart(part: string, min: number, max: number): Field {
  const trimmed = part.trim();
  if (trimmed === '*') return { kind: 'any' };

  const values = new Set<number>();
  for (const chunk of trimmed.split(',')) {
    const stepMatch = /^(\*|\d+)(?:-(\d+))?\/(\d+)$/.exec(chunk);
    if (stepMatch) {
      const start = stepMatch[1] === '*' ? min : Number(stepMatch[1]);
      const end = stepMatch[2] != null ? Number(stepMatch[2]) : max;
      const step = Number(stepMatch[3]);
      if (![start, end, step].every((n) => Number.isFinite(n)) || step < 1) {
        throw new Error(`Invalid cron step: ${chunk}`);
      }
      for (let n = start; n <= end; n += step) {
        if (n >= min && n <= max) values.add(n);
      }
      continue;
    }
    const rangeMatch = /^(\d+)-(\d+)$/.exec(chunk);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (![start, end].every((n) => Number.isFinite(n)) || start > end) {
        throw new Error(`Invalid cron range: ${chunk}`);
      }
      for (let n = start; n <= end; n += 1) {
        if (n >= min && n <= max) values.add(n);
      }
      continue;
    }
    const n = Number(chunk);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`Invalid cron value: ${chunk}`);
    }
    values.add(n);
  }
  return { kind: 'list', values: [...values].sort((a, b) => a - b) };
}

export type ParsedCron = {
  minute: Field;
  hour: Field;
  dayOfMonth: Field;
  month: Field;
  dayOfWeek: Field;
};

export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('Cron must have 5 fields: minute hour day-of-month month day-of-week');
  }
  const dayOfWeek = parsePart(parts[4]!, 0, 7);
  // Normalize Sunday 7 → 0
  if (dayOfWeek.kind === 'list') {
    dayOfWeek.values = [...new Set(dayOfWeek.values.map((d) => (d === 7 ? 0 : d)))].sort(
      (a, b) => a - b,
    );
  }
  return {
    minute: parsePart(parts[0]!, 0, 59),
    hour: parsePart(parts[1]!, 0, 23),
    dayOfMonth: parsePart(parts[2]!, 1, 31),
    month: parsePart(parts[3]!, 1, 12),
    dayOfWeek,
  };
}

function fieldMatches(field: Field, value: number): boolean {
  return field.kind === 'any' || field.values.includes(value);
}

export function zonedParts(
  date: Date,
  timeZone: string,
): { minute: number; hour: number; day: number; month: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour),
    day: Number(parts.day),
    month: Number(parts.month),
    weekday: weekdayMap[parts.weekday ?? ''] ?? 0,
  };
}

export function cronMatches(expression: string, date: Date, timeZone = 'UTC'): boolean {
  const cron = parseCron(expression);
  const z = zonedParts(date, timeZone);
  return (
    fieldMatches(cron.minute, z.minute) &&
    fieldMatches(cron.hour, z.hour) &&
    fieldMatches(cron.dayOfMonth, z.day) &&
    fieldMatches(cron.month, z.month) &&
    fieldMatches(cron.dayOfWeek, z.weekday)
  );
}

/** Next minute (inclusive of `after` if it already matches) within `maxDays`. */
export function nextCronOccurrence(
  expression: string,
  after: Date,
  timeZone = 'UTC',
  maxDays = 366,
): Date | null {
  parseCron(expression); // validate early
  const cursor = new Date(after);
  cursor.setUTCSeconds(0, 0);
  const limit = after.getTime() + maxDays * 24 * 60 * 60 * 1000;
  // Start at current minute; if it matches and equals `after` truncated, accept it
  for (let t = cursor.getTime(); t <= limit; t += 60_000) {
    const candidate = new Date(t);
    if (candidate < after) continue;
    if (cronMatches(expression, candidate, timeZone)) return candidate;
  }
  return null;
}
