import type { ChatSession, Message } from '@agent-orchestrator/shared';
import type { ChatTranscriptItem } from '../claude-chat/types';
import { mapMessageToChatTurn } from './mapAgentChatToClaudeChat';

export type { ChatTranscriptItem };

export function buildChatTranscriptItems(
  sessions: ChatSession[],
  messagesBySession: Record<string, Message[] | undefined>,
): ChatTranscriptItem[] {
  const items: ChatTranscriptItem[] = [];
  for (const session of sessions) {
    items.push({ kind: 'session', id: `session:${session.id}`, sessionId: session.id });
    for (const message of messagesBySession[session.id] ?? []) {
      items.push({
        kind: 'turn',
        id: message.id,
        turn: mapMessageToChatTurn(message),
        sessionId: session.id,
      });
    }
  }
  return items;
}

export function transcriptIndexForSession(
  items: ChatTranscriptItem[],
  sessionId: string,
): number {
  return items.findIndex((item) => item.kind === 'session' && item.sessionId === sessionId);
}

/** Last user message in the same session that appears before each message. */
export function priorUserByMessageId(messages: Message[]): Map<string, Message | undefined> {
  const map = new Map<string, Message | undefined>();
  const lastUserBySession = new Map<string, Message>();
  for (const message of messages) {
    map.set(message.id, lastUserBySession.get(message.sessionId));
    if (message.role === 'user') lastUserBySession.set(message.sessionId, message);
  }
  return map;
}

export function flattenSessionMessages(
  sessions: ChatSession[],
  messagesBySession: Record<string, Message[] | undefined>,
): Message[] {
  return sessions.flatMap((session) => messagesBySession[session.id] ?? []);
}
