/** Parse human delay strings like `5m`, `1h`, `30s`, `2d`. */

/**
 * Parse a relative duration to milliseconds.
 * Accepts: `5m`, `5 min`, `1h`, `1 hour`, `30s`, `2d`, `1h30m`, `1d2h`.
 */
export function parseDurationToMs(input: string): number {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new Error('Duration is required');
  if (/^\d+$/.test(raw.replace(/\s+/g, ''))) {
    throw new Error(`Duration "${input}" needs a unit (s, m, h, d)`);
  }

  // Normalize compact forms (`1h30m` → `1h 30m`) and long unit names.
  const normalized = raw
    .replace(/days?/g, 'd')
    .replace(/hours?/g, 'h')
    .replace(/min(?:ute)?s?/g, 'm')
    .replace(/sec(?:ond)?s?/g, 's')
    .replace(/(\d+)([dhms])/g, '$1$2 ')
    .trim();

  const tokenRe = /(\d+)\s*([dhms])/g;
  let ms = 0;
  let matched = false;
  for (const token of normalized.matchAll(tokenRe)) {
    matched = true;
    const n = Number(token[1]);
    const unit = token[2]!;
    if (unit === 'd') ms += n * 86_400_000;
    else if (unit === 'h') ms += n * 3_600_000;
    else if (unit === 'm') ms += n * 60_000;
    else ms += n * 1_000;
  }

  if (!matched) {
    throw new Error(
      `Invalid duration "${input}". Examples: 5m, 1h, 30s, 2d, 1h30m`,
    );
  }
  if (ms <= 0) throw new Error(`Duration must be positive: ${input}`);
  if (ms > 366 * 86_400_000) {
    throw new Error(`Duration too large (max 366 days): ${input}`);
  }
  return ms;
}

export function resolveOnceRunAt(params: {
  runIn?: string | null;
  runAt?: string | null;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  if (params.runIn && params.runAt) {
    throw new Error('Provide only one of runIn or runAt');
  }
  if (params.runIn) {
    return new Date(now.getTime() + parseDurationToMs(params.runIn));
  }
  if (params.runAt) {
    const at = new Date(params.runAt);
    if (Number.isNaN(at.getTime())) {
      throw new Error(`Invalid runAt timestamp: ${params.runAt}`);
    }
    if (at.getTime() <= now.getTime()) {
      throw new Error('runAt must be in the future');
    }
    return at;
  }
  throw new Error('One-time schedules require runIn (e.g. "5m") or runAt (ISO timestamp)');
}
