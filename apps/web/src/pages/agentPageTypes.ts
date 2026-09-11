import type { ChatSessionTemplateId } from '@agent-orchestrator/shared';
import type { AgentAttentionFocus } from '../notifications';
import type { PendingImage } from '../components/chat/composerTypes';
import type { PendingMention } from '../components/chat/mentionComposer';

export type AgentLocationState = {
  initialPrompt?: string;
  initialImages?: PendingImage[];
  initialMentions?: PendingMention[];
  sessionTemplate?: ChatSessionTemplateId;
  focusAttention?: AgentAttentionFocus;
  sessionId?: string;
};

export const AGENT_PAGE_TAB = {
  goal: 0,
  chat: 1,
  files: 2,
  pr: 3,
  memory: 4,
} as const;

export function defaultAgentPageTab(hasGoal: boolean): number {
  return hasGoal ? AGENT_PAGE_TAB.chat : AGENT_PAGE_TAB.goal;
}

export function agentHasGoal(goal: string | undefined | null): boolean {
  return Boolean(goal?.trim());
}
