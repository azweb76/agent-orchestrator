/** Estimated sources of tokens occupying the current context window. */
export const CONTEXT_ATTRIBUTION_KEYS = [
  'conversation',
  'tool_results',
  'skills',
  'instruction_files',
  'memory',
  'other',
] as const;

export type ContextAttributionKey = (typeof CONTEXT_ATTRIBUTION_KEYS)[number];

export const CONTEXT_ATTRIBUTION_LABELS: Record<ContextAttributionKey, string> = {
  conversation: 'Conversation',
  tool_results: 'Tool results',
  skills: 'Skills',
  instruction_files: 'CLAUDE.md / AGENTS.md',
  memory: 'Memory',
  other: 'Other',
};

export const CONTEXT_ATTRIBUTION_CUT_HINTS: Record<ContextAttributionKey, string> = {
  conversation: 'Compact earlier — conversation is the largest slice of the window.',
  tool_results: 'Stop re-reading files; prefer Explore or a tighter grep.',
  skills: 'Trim or split a bloated skill so it costs less on every turn.',
  instruction_files: 'Slim CLAUDE.md / AGENTS.md; keep only standing repo conventions.',
  memory: 'Prune stale memories so the system prompt stays small.',
  other:
    'Most of the window is unparsed system prompt — trim skills, CLAUDE.md, and memory first.',
};

export interface ContextAttributionChars {
  conversation: number;
  tool_results: number;
  skills: number;
  instruction_files: number;
  memory: number;
  other: number;
}

export interface ContextAttributionBucket {
  key: ContextAttributionKey;
  tokens: number;
  share: number;
}

export interface SessionContextAttribution {
  /** Token estimates scaled to the latest reported occupancy. */
  buckets: ContextAttributionBucket[];
  largest: ContextAttributionKey | null;
  cutHint: string | null;
}

export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function emptyAttributionChars(): ContextAttributionChars {
  return {
    conversation: 0,
    tool_results: 0,
    skills: 0,
    instruction_files: 0,
    memory: 0,
    other: 0,
  };
}

export function addAttributionChars(
  base: ContextAttributionChars,
  extra: Partial<ContextAttributionChars>,
): ContextAttributionChars {
  const next = { ...base };
  for (const key of CONTEXT_ATTRIBUTION_KEYS) {
    const add = extra[key] ?? 0;
    if (add > 0) next[key] += add;
  }
  return next;
}

export function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

function sumChars(chars: ContextAttributionChars): number {
  let total = 0;
  for (const key of CONTEXT_ATTRIBUTION_KEYS) total += Math.max(0, chars[key]);
  return total;
}

function largestKey(tokens: ContextAttributionChars): ContextAttributionKey | null {
  let best: ContextAttributionKey | null = null;
  let bestTokens = 0;
  for (const key of CONTEXT_ATTRIBUTION_KEYS) {
    const value = tokens[key];
    if (value > bestTokens) {
      best = key;
      bestTokens = value;
    }
  }
  return bestTokens > 0 ? best : null;
}

/** Distribute rounding error so bucket tokens sum to `target`. */
function fixTokenSum(tokens: ContextAttributionChars, target: number): ContextAttributionChars {
  const next = { ...tokens };
  let sum = 0;
  for (const key of CONTEXT_ATTRIBUTION_KEYS) {
    next[key] = Math.max(0, Math.round(next[key]));
    sum += next[key];
  }
  const delta = target - sum;
  if (delta === 0) return next;
  const adjust = largestKey(next) ?? 'other';
  next[adjust] = Math.max(0, next[adjust] + delta);
  return next;
}

/**
 * Scale classified character counts to the latest occupancy so the stacked
 * bar matches the context meter. Remainder (system prompt not in the JSONL)
 * lands in `other`.
 */
export function buildContextAttribution(
  chars: ContextAttributionChars,
  contextTokens: number,
): SessionContextAttribution | null {
  const occupancy = Math.max(0, Math.floor(contextTokens));
  const estimated: ContextAttributionChars = emptyAttributionChars();
  for (const key of CONTEXT_ATTRIBUTION_KEYS) {
    estimated[key] = estimateTokensFromChars(chars[key]);
  }
  const estimatedTotal = sumChars(estimated);
  if (occupancy <= 0 && estimatedTotal <= 0) return null;

  let tokens = { ...estimated };
  if (occupancy > 0) {
    if (estimatedTotal <= 0) {
      tokens = emptyAttributionChars();
      tokens.other = occupancy;
    } else if (estimatedTotal < occupancy) {
      tokens.other += occupancy - estimatedTotal;
    } else if (estimatedTotal > occupancy) {
      const scaled = emptyAttributionChars();
      for (const key of CONTEXT_ATTRIBUTION_KEYS) {
        scaled[key] = (estimated[key] / estimatedTotal) * occupancy;
      }
      tokens = fixTokenSum(scaled, occupancy);
    }
  }

  const total = occupancy > 0 ? occupancy : sumChars(tokens);
  const largest = largestKey(tokens);
  const buckets: ContextAttributionBucket[] = CONTEXT_ATTRIBUTION_KEYS.map((key) => ({
    key,
    tokens: tokens[key],
    share: total > 0 && tokens[key] > 0 ? Math.min(100, (tokens[key] / total) * 100) : 0,
  }));

  return {
    buckets,
    largest,
    cutHint: largest ? CONTEXT_ATTRIBUTION_CUT_HINTS[largest] : null,
  };
}
