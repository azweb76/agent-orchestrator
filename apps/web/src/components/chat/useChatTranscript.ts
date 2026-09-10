import { useMemo } from 'react';
import type { ChatSession, Message } from '@agent-orchestrator/shared';
import {
  buildChatTranscriptItems,
  flattenSessionMessages,
  priorUserByMessageId,
  type ChatTranscriptItem,
} from './buildChatTranscriptItems';
import { useAgentSessionMessages } from './useAgentSessionMessages';

export function useChatTranscript(options: {
  agentId: string;
  sessions: ChatSession[];
  activeSessionId: string;
  active: boolean;
  sendingSessionsRef: React.MutableRefObject<Set<string>>;
  followingRef: React.MutableRefObject<Set<string>>;
}): {
  messagesBySession: Record<string, Message[]>;
  activeMessages: Message[];
  allMessages: Message[];
  transcriptItems: ChatTranscriptItem[];
  priorUserByIndex: Map<number, Message | undefined>;
  priorUserById: Map<string, Message | undefined>;
  isLoading: boolean;
  error: Error | null;
} {
  const { agentId, sessions, activeSessionId, active, sendingSessionsRef, followingRef } = options;
  const messagesQuery = useAgentSessionMessages({
    agentId,
    sessions,
    active,
    sendingSessionsRef,
    followingRef,
  });
  const activeMessages = messagesQuery.messagesBySession[activeSessionId] ?? [];
  const allMessages = useMemo(
    () => flattenSessionMessages(sessions, messagesQuery.messagesBySession),
    [sessions, messagesQuery.messagesBySession],
  );
  const transcriptItems = useMemo(
    () => buildChatTranscriptItems(sessions, messagesQuery.messagesBySession),
    [sessions, messagesQuery.messagesBySession],
  );
  const priorUserById = useMemo(() => priorUserByMessageId(allMessages), [allMessages]);
  const priorUserByIndex = useMemo(() => {
    const map = new Map<number, Message | undefined>();
    allMessages.forEach((message, index) => map.set(index, priorUserById.get(message.id)));
    return map;
  }, [allMessages, priorUserById]);

  return {
    messagesBySession: messagesQuery.messagesBySession,
    activeMessages,
    allMessages,
    transcriptItems,
    priorUserByIndex,
    priorUserById,
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
  };
}
