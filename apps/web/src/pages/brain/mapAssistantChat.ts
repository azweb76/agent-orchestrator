import type { AssistantMessage } from '@agent-orchestrator/shared';
import { latestAskUserQuestionsFromMessages } from '@agent-orchestrator/shared';
import type { ChatTurn, PermissionPrompt } from '../../components/claude-chat/types';

function toolStatus(isError?: boolean): 'running' | 'done' | 'error' {
  if (isError) return 'error';
  return 'done';
}

/** Map fleet Assistant messages into ClaudeChat turns and an ask_user permission. */
export function mapAssistantMessagesToChatTurns(
  messages: AssistantMessage[],
  streamingIds: ReadonlySet<string>,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({
        id: message.id,
        role: 'user',
        createdAt: message.createdAt,
        content: message.content,
      });
      continue;
    }
    if (message.role === 'assistant') {
      const blocks = [];
      if (message.content.trim()) {
        blocks.push({ type: 'text' as const, id: `${message.id}-text`, text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use' as const,
          id: call.id,
          name: call.name,
          status: 'running' as const,
          input: call.input,
        });
      }
      turns.push({
        id: message.id,
        role: 'assistant',
        createdAt: message.createdAt,
        content: message.content,
        streaming: streamingIds.has(message.id),
        blocks,
      });
      continue;
    }
    const last = [...turns].reverse().find((turn) => turn.role === 'assistant');
    const name = message.toolResult?.toolName ?? 'tool';
    const block = {
      type: 'tool_use' as const,
      id: message.id,
      name,
      status: toolStatus(message.toolResult?.isError),
      result: message.content,
    };
    if (last) {
      last.blocks = [...(last.blocks ?? []), block];
    } else {
      turns.push({
        id: message.id,
        role: 'assistant',
        createdAt: message.createdAt,
        content: '',
        blocks: [block],
      });
    }
  }
  return turns;
}

export function assistantAskUserPermission(messages: AssistantMessage[]): PermissionPrompt | null {
  const questions = latestAskUserQuestionsFromMessages(messages);
  if (!questions || questions.length === 0) return null;
  const pending = [...messages].reverse().find(
    (msg) => msg.role === 'tool' && msg.toolResult?.toolName === 'ask_user' && !msg.toolResult.isError,
  );
  if (!pending) return null;
  return {
    id: pending.id,
    toolName: 'AskUserQuestion',
    input: { questions },
    createdAt: pending.createdAt,
  };
}
