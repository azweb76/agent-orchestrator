import type { AgentStatus } from './types/entities.js';
import type { ChatSessionTemplateId } from './chat-session.js';

/** Build session finished cleanly and may qualify for a draft-PR offer. */
export function isBuildReadyForDraftPrStep(input: {
  template: ChatSessionTemplateId | string | undefined;
  status: AgentStatus;
  stopped?: boolean;
  error?: string | null;
}): boolean {
  if (input.template !== 'build') return false;
  if (input.status !== 'idle') return false;
  if (input.stopped || input.error) return false;
  return true;
}

/** UI/server gate before checking worktree diff and open PR state. */
export function shouldOfferDraftPr(input: {
  template: ChatSessionTemplateId | string | undefined;
  status: AgentStatus;
  stopped?: boolean;
  error?: string | null;
  hasDiff: boolean;
  hasOpenPr: boolean;
}): boolean {
  if (!isBuildReadyForDraftPrStep(input)) return false;
  if (!input.hasDiff) return false;
  if (input.hasOpenPr) return false;
  return true;
}
