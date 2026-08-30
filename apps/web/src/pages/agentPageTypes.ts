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
