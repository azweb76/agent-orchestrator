/**
 * Heuristics for when a finished chat looks expensive enough that the
 * operator should manually grade it (auto-grade stays off by default).
 */

/** User turns at or above this count are considered excessive. */
export const EXCESSIVE_USER_TURNS = 6;

/** Assistant turns at or above this count are considered excessive. */
export const EXCESSIVE_ASSISTANT_TURNS = 8;

/** Approximate transcript tokens at or above this are considered excessive. */
export const EXCESSIVE_ESTIMATED_TOKENS = 40_000;

/** Session cost (USD) at or above this is considered excessive. */
export const EXCESSIVE_COST_USD = 0.4;

const CHARS_PER_TOKEN = 4;

export interface SessionUsageSignals {
  userTurns: number;
  assistantTurns: number;
  estimatedTokens: number;
  costUsd: number | null;
}

export interface SessionUsageMessage {
  role: string;
  content: string;
  metadata?: {
    costUsd?: number;
    timeline?: ReadonlyArray<{ type: string; text?: string }>;
  } | null;
}

/** Lightweight usage snapshot from stored chat messages (no instruction files). */
export function measureSessionUsage(messages: readonly SessionUsageMessage[]): SessionUsageSignals {
  let userTurns = 0;
  let assistantTurns = 0;
  let chars = 0;
  let costUsd = 0;
  let hasCost = false;

  for (const message of messages) {
    if (message.role === 'user') userTurns += 1;
    if (message.role === 'assistant') assistantTurns += 1;
    chars += message.content.length;
    for (const part of message.metadata?.timeline ?? []) {
      if (part.type === 'text' && typeof part.text === 'string') chars += part.text.length;
    }
    const cost = message.metadata?.costUsd;
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      costUsd += cost;
      hasCost = true;
    }
  }

  return {
    userTurns,
    assistantTurns,
    estimatedTokens: chars > 0 ? Math.ceil(chars / CHARS_PER_TOKEN) : 0,
    costUsd: hasCost ? Number(costUsd.toFixed(4)) : null,
  };
}

/** True when turns, tokens, or spend look high enough to warrant a manual grade. */
export function isSessionUsageExcessive(usage: SessionUsageSignals): boolean {
  if (usage.userTurns >= EXCESSIVE_USER_TURNS) return true;
  if (usage.assistantTurns >= EXCESSIVE_ASSISTANT_TURNS) return true;
  if (usage.estimatedTokens >= EXCESSIVE_ESTIMATED_TOKENS) return true;
  if (usage.costUsd != null && usage.costUsd >= EXCESSIVE_COST_USD) return true;
  return false;
}

/** Short reason string for chip subtitle / selection context. */
export function describeExcessiveSessionUsage(usage: SessionUsageSignals): string | null {
  if (!isSessionUsageExcessive(usage)) return null;
  const parts: string[] = [];
  if (usage.userTurns >= EXCESSIVE_USER_TURNS || usage.assistantTurns >= EXCESSIVE_ASSISTANT_TURNS) {
    parts.push(`${usage.userTurns} user / ${usage.assistantTurns} assistant turns`);
  }
  if (usage.estimatedTokens >= EXCESSIVE_ESTIMATED_TOKENS) {
    parts.push(`~${usage.estimatedTokens.toLocaleString()} tokens`);
  }
  if (usage.costUsd != null && usage.costUsd >= EXCESSIVE_COST_USD) {
    parts.push(`$${usage.costUsd.toFixed(2)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
