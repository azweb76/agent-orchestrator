import type { AgentStatus } from './types/entities.js';
import type { ChatSessionTemplateId } from './chat-session.js';
import type { AutomationSettings } from './types/automation.js';

/** Resolve whether autopilot is enabled for an agent (per-agent override or global). */
export function resolveAutopilotEnabled(
  globalSettings: Pick<AutomationSettings, 'autopilot'>,
  agentAutopilot: boolean | null | undefined,
): boolean {
  if (agentAutopilot != null) return Boolean(agentAutopilot);
  return Boolean(globalSettings.autopilot);
}

/** Build session finished cleanly and may qualify for a draft-PR prompt or autopilot step. */
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
