import type { ChatSessionTemplateId } from '@agent-orchestrator/shared';
import type { AgentAttentionFocus } from '../notifications';

export type AgentLocationState = {
  initialPrompt?: string;
  sessionTemplate?: ChatSessionTemplateId;
  focusAttention?: AgentAttentionFocus;
  sessionId?: string;
};
