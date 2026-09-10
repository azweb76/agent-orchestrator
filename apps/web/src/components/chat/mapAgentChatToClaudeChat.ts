import type { Message, PermissionRequest, StreamPart } from '@agent-orchestrator/shared';
import type { ChatBlock, ChatTurn, PermissionPrompt } from '../claude-chat/types';

function blocksFromTimeline(timeline: StreamPart[] | undefined, message: Message): ChatBlock[] {
  const parts = timeline ?? [];
  const blocks: ChatBlock[] = parts.map((part) => {
    if (part.type === 'text') return { type: 'text', id: part.id, text: part.text };
    if (part.type === 'thinking') {
      return { type: 'thinking', id: part.id, text: part.text, redacted: part.redacted };
    }
    if (part.type === 'tool') {
      return {
        type: 'tool_use',
        id: part.id,
        name: part.name,
        detail: part.detail,
        status: part.status,
        input: part.input,
        result: part.result,
        task: part.task,
      };
    }
    if (part.type === 'tool_result') {
      return {
        type: 'tool_result',
        id: part.id,
        toolUseId: part.toolUseId,
        content: part.content,
        isError: part.isError,
      };
    }
    if (part.type === 'diff') {
      return { type: 'diff', id: part.id, path: part.path, diff: part.diff };
    }
    if (part.type === 'todo_list') {
      return { type: 'todo_list', id: part.id, items: part.items };
    }
    return {
      type: 'image',
      id: part.id,
      mimeType: part.mimeType,
      url: part.url,
      alt: part.alt,
      data: part.data,
    };
  });
  if (message.metadata?.costUsd != null || message.metadata?.durationMs != null || message.metadata?.stopped) {
    blocks.push({
      type: 'result',
      id: `${message.id}-result`,
      costUsd: message.metadata?.costUsd,
      durationMs: message.metadata?.durationMs,
      error: message.metadata?.error,
      stopped: message.metadata?.stopped,
    });
  }
  return blocks;
}

export function mapMessageToChatTurn(message: Message): ChatTurn {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    sessionId: message.sessionId,
    content: message.content,
    attachments: message.attachments?.map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      url: item.url,
    })),
    blocks: blocksFromTimeline(message.metadata?.timeline, message),
    streaming: message.metadata?.streaming,
    error: message.metadata?.error,
    stopped: message.metadata?.stopped,
    costUsd: message.metadata?.costUsd,
    durationMs: message.metadata?.durationMs,
  };
}

export function mapPermissionPrompt(request: PermissionRequest): PermissionPrompt {
  return {
    id: request.requestId,
    toolName: request.toolName,
    input: request.input,
    toolUseId: request.toolUseId,
    createdAt: request.createdAt,
  };
}
