/** Token buckets reported by Claude on an assistant message or result event. */
export interface TokenUsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/** One model API call in the session, in arrival order. */
export interface SessionContextTurn {
  turn: number;
  createdAt: string | null;
  model: string | null;
  usage: TokenUsageBreakdown;
  /** Prompt tokens occupying the context window for this call. */
  contextTokens: number;
  /** True when a compact ran before this call. */
  compacted: boolean;
  tools: string[];
}

/** Live context window occupancy plus per-turn history for a chat session. */
export interface SessionContextUsage {
  model: string | null;
  contextWindowTokens: number;
  currentContextTokens: number;
  /** 0–100, or null when Claude has not reported usage yet. */
  percent: number | null;
  usage: TokenUsageBreakdown | null;
  /** Sum of API-call usage across the session (not unique tokens). */
  billed: TokenUsageBreakdown;
  costUsd: number | null;
  history: SessionContextTurn[];
  sessionFilePath: string | null;
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;
export const EXTENDED_CONTEXT_WINDOW_TOKENS = 1_000_000;

export function emptyTokenUsage(): TokenUsageBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

export function addTokenUsage(
  a: TokenUsageBreakdown,
  b: TokenUsageBreakdown,
): TokenUsageBreakdown {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}

/** Tokens sent as the model prompt (uncached + cache write + cache read). */
export function contextTokensFromUsage(usage: TokenUsageBreakdown): number {
  return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}

export function totalTokensFromUsage(usage: TokenUsageBreakdown): number {
  return contextTokensFromUsage(usage) + usage.outputTokens;
}

/**
 * Context window size for a Claude model alias or API model id.
 * Observed occupancy above 200k means the run is on the 1M window.
 */
export function contextWindowTokensForModel(
  model: string | null | undefined,
  observedContextTokens = 0,
): number {
  if (observedContextTokens > DEFAULT_CONTEXT_WINDOW_TOKENS) {
    return EXTENDED_CONTEXT_WINDOW_TOKENS;
  }
  const id = (model ?? '').toLowerCase();
  if (
    id.includes('fable') ||
    id.includes('1m') ||
    /sonnet[-_\s]?5/.test(id) ||
    /opus[-_\s]?5/.test(id)
  ) {
    return EXTENDED_CONTEXT_WINDOW_TOKENS;
  }
  return DEFAULT_CONTEXT_WINDOW_TOKENS;
}

export function buildSessionContextUsage(input: {
  model?: string | null;
  fallbackModel?: string | null;
  history?: SessionContextTurn[];
  billed?: TokenUsageBreakdown;
  costUsd?: number | null;
  sessionFilePath?: string | null;
}): SessionContextUsage {
  const history = input.history ?? [];
  const last = history[history.length - 1];
  const model = last?.model || input.model || input.fallbackModel || null;
  const currentContextTokens = last?.contextTokens ?? 0;
  const contextWindowTokens = contextWindowTokensForModel(model, currentContextTokens);
  const billed = input.billed ?? history.reduce((sum, turn) => addTokenUsage(sum, turn.usage), emptyTokenUsage());
  return {
    model,
    contextWindowTokens,
    currentContextTokens,
    percent:
      currentContextTokens > 0
        ? Math.min(100, (currentContextTokens / contextWindowTokens) * 100)
        : null,
    usage: last?.usage ?? null,
    billed,
    costUsd: input.costUsd ?? null,
    history,
    sessionFilePath: input.sessionFilePath?.trim() || null,
  };
}
