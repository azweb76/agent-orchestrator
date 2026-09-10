import { CHAT_TITLE_MAX_LENGTH } from '@agent-orchestrator/shared';

/** Returns the title to persist, or null when the draft is empty or unchanged. */
export function nextCommittedSessionTitle(
  draft: string,
  currentTitle: string,
  maxLength = CHAT_TITLE_MAX_LENGTH,
): string | null {
  const next = draft.trim();
  if (!next || next === currentTitle) return null;
  return next.slice(0, maxLength);
}

/** Heading click activates the session unless rename is in progress. */
export function shouldActivateSessionBreak(editing: boolean): boolean {
  return !editing;
}
