import type { ReactNode } from 'react';
import { memo } from 'react';
import { Box } from '@mui/material';
import {
  DiffBlock,
  ImageBlock,
  ThinkingBlock,
  TodoListBlock,
} from './blocks/ChatBlocks';
import { ChatBubble } from './ChatBubble';
import { SubagentActivityList, ThinkingIndicator, ToolProgressBar } from './ToolActivity';
import type { ChatBlock, ChatTurn } from './types';

function isSubagentBlock(block: Extract<ChatBlock, { type: 'tool_use' }>): boolean {
  return (
    block.task?.taskType === 'local_agent' ||
    block.name === 'Task' ||
    block.name === 'Agent'
  );
}

function textFromBlocks(blocks: ChatBlock[] | undefined, fallback?: string): string {
  const texts = (blocks ?? [])
    .filter((block): block is Extract<ChatBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text);
  if (texts.length > 0) return texts.join('\n\n');
  return fallback ?? '';
}

export const MessageTimeline = memo(function MessageTimeline({
  turn,
  onRetry,
  renderBlock,
}: {
  turn: ChatTurn;
  onRetry?: () => void;
  renderBlock?: (block: ChatBlock, turn: ChatTurn) => ReactNode | undefined;
}) {
  const blocks = turn.blocks ?? [];
  const textContent = textFromBlocks(blocks, turn.content);
  const tools = blocks.filter(
    (block): block is Extract<ChatBlock, { type: 'tool_use' }> => block.type === 'tool_use',
  );
  const subagents = tools.filter((item) => isSubagentBlock(item));
  const otherTools = tools.filter((item) => !isSubagentBlock(item));
  const thinking = blocks.filter(
    (block): block is Extract<ChatBlock, { type: 'thinking' }> => block.type === 'thinking',
  );
  const streaming = Boolean(turn.streaming);
  const showText = Boolean(textContent);
  const showToolProgress = streaming && otherTools.length > 0;
  const showThinkingSpinner =
    streaming && !showText && !showToolProgress && subagents.length === 0 && thinking.length === 0;

  return (
    <Box sx={{ mb: 2 }}>
      <ChatBubble
        gutter={false}
        hideBody={!showText && streaming}
        streaming={streaming}
        cursor={streaming && showText && !showToolProgress && subagents.length === 0}
        turn={turn}
        body={textContent}
        onCopy={() => void navigator.clipboard.writeText(textContent)}
        onRetry={onRetry}
      />
      {thinking.map((block) =>
        renderBlock?.(block, turn) ?? <ThinkingBlock key={block.id} block={block} />,
      )}
      {showThinkingSpinner ? <ThinkingIndicator /> : null}
      {subagents.length > 0 ? <SubagentActivityList items={subagents} /> : null}
      {showToolProgress ? <ToolProgressBar items={otherTools} /> : null}
      {blocks.map((block) => {
        const custom = renderBlock?.(block, turn);
        if (custom !== undefined) return <Box key={block.id}>{custom}</Box>;
        if (block.type === 'todo_list') return <TodoListBlock key={block.id} block={block} />;
        if (block.type === 'diff') return <DiffBlock key={block.id} block={block} />;
        if (block.type === 'image') return <ImageBlock key={block.id} block={block} />;
        return null;
      })}
    </Box>
  );
});
