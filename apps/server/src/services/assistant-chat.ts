import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import {
  ASSISTANT_SYSTEM_PROMPT,
  type AssistantChatResponse,
  type AssistantMessage,
  type AssistantSchedulePolicy,
  type AssistantStreamEvent,
} from '@agent-orchestrator/shared';
import { createAnthropicClient, resolveAnthropicAuth } from './anthropic-credentials.js';
import { type AppContext, nowIso } from './app-context.js';
import { anthropicToolsFromCatalog, executeAssistantTool } from './assistant-tools.js';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 8;

type ApiMessage = Anthropic.MessageParam;

export type AssistantModelRoundResult = {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
};

/** Injectable model round for tests — streams tokens then returns the final message. */
export type AssistantModelRound = (args: {
  messages: ApiMessage[];
  tools: Anthropic.Tool[];
  signal?: AbortSignal;
  onToken: (delta: string) => void;
}) => Promise<AssistantModelRoundResult>;

export type AssistantChatOptions = {
  schedulePolicy?: AssistantSchedulePolicy;
  source?: 'chat' | 'schedule';
  onEvent?: (event: AssistantStreamEvent) => void;
  signal?: AbortSignal;
  runModelRound?: AssistantModelRound;
};

function textFromContent(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function toApiMessages(history: AssistantMessage[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
      continue;
    }
    if (msg.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content.trim()) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const call of msg.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        });
      }
      if (content.length > 0) {
        messages.push({ role: 'assistant', content });
      }
      continue;
    }
    if (msg.role === 'tool' && msg.toolResult) {
      const last = messages[messages.length - 1];
      const toolResult: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolResult.toolUseId,
        content: msg.content,
        is_error: msg.toolResult.isError,
      };
      if (last?.role === 'user' && Array.isArray(last.content)) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(toolResult);
      } else {
        messages.push({ role: 'user', content: [toolResult] });
      }
    }
  }
  return messages;
}

function persist(
  ctx: AppContext,
  partial: Omit<AssistantMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): AssistantMessage {
  const message: AssistantMessage = {
    id: partial.id ?? uuidv4(),
    role: partial.role,
    content: partial.content,
    toolCalls: partial.toolCalls,
    toolResult: partial.toolResult,
    createdAt: partial.createdAt ?? nowIso(),
  };
  ctx.repos.assistantMessages.create(message);
  return message;
}

function emit(options: AssistantChatOptions, event: AssistantStreamEvent): void {
  options.onEvent?.(event);
}

export function listAssistantMessages(ctx: AppContext): AssistantMessage[] {
  return ctx.repos.assistantMessages.list();
}

export function clearAssistantMessages(ctx: AppContext): void {
  ctx.repos.assistantMessages.clear();
}

async function defaultModelRound(
  anthropic: Anthropic,
  args: {
    messages: ApiMessage[];
    tools: Anthropic.Tool[];
    signal?: AbortSignal;
    onToken: (delta: string) => void;
  },
): Promise<AssistantModelRoundResult> {
  const stream = anthropic.messages.stream(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: args.messages,
      tools: args.tools,
    },
    { signal: args.signal },
  );
  stream.on('text', (delta) => {
    args.onToken(delta);
  });
  const message = await stream.finalMessage();
  return { content: message.content, stop_reason: message.stop_reason };
}

export async function runAssistantChat(
  ctx: AppContext,
  content: string,
  options: AssistantChatOptions = {},
): Promise<AssistantChatResponse> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message is required');

  const created: AssistantMessage[] = [];
  const userMsg = persist(ctx, { role: 'user', content: trimmed });
  created.push(userMsg);
  emit(options, { type: 'user_message', message: userMsg });

  const history = ctx.repos.assistantMessages.list();
  const apiMessages = toApiMessages(history);
  const tools = anthropicToolsFromCatalog() as Anthropic.Tool[];

  let cachedClient: Anthropic | null = null;
  const resolveRound: AssistantModelRound =
    options.runModelRound ??
    (async (args) => {
      if (!cachedClient) {
        cachedClient = await createAnthropicClient(await resolveAnthropicAuth());
      }
      return defaultModelRound(cachedClient, args);
    });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (options.signal?.aborted) {
      throw new Error('Assistant chat aborted');
    }

    const assistantId = uuidv4();
    const createdAt = nowIso();
    emit(options, { type: 'assistant_start', messageId: assistantId, createdAt });

    const response = await resolveRound({
      messages: apiMessages,
      tools,
      signal: options.signal,
      onToken: (delta) => {
        emit(options, { type: 'token', messageId: assistantId, text: delta });
      },
    });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    const text = textFromContent(response.content);

    const assistantMsg = persist(ctx, {
      id: assistantId,
      createdAt,
      role: 'assistant',
      content: text,
      toolCalls: toolUses.map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      })),
    });
    created.push(assistantMsg);
    emit(options, { type: 'assistant_message', message: assistantMsg });

    apiMessages.push({
      role: 'assistant',
      content: response.content as Anthropic.ContentBlockParam[],
    });

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const execution = await executeAssistantTool(
        ctx,
        block.name,
        block.input as Record<string, unknown>,
        { schedulePolicy: options.schedulePolicy },
      );
      const toolMsg = persist(ctx, {
        role: 'tool',
        content: execution.content,
        toolResult: {
          toolUseId: block.id,
          toolName: block.name,
          isError: execution.isError,
          navigateTo: execution.navigateTo,
          agentId: execution.agentId,
        },
      });
      created.push(toolMsg);
      emit(options, { type: 'tool_message', message: toolMsg });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: execution.content,
        is_error: execution.isError,
      });
    }
    apiMessages.push({ role: 'user', content: toolResults });
  }

  emit(options, { type: 'done', messages: created });
  return { messages: created };
}
