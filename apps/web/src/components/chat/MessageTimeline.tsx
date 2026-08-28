import { memo } from 'react';
import { Box } from '@mui/material';
import type { Message, PermissionRequest } from '@agent-orchestrator/shared';
import { ChatBubble } from './ChatBubble';
import { buildMessageTimelineView } from './messageTimelineItems';
import { SubagentActivityList, ThinkingIndicator, ToolProgressBar } from './ToolActivity';

export const MessageTimeline = memo(function MessageTimeline({
  message,
  permissionRequests,
  onRetry,
}: {
  message: Message;
  permissionRequests: PermissionRequest[];
  onRetry?: () => void;
}) {
  const {
    streaming,
    subagents,
    showSubagents,
    showToolProgress,
    showThinking,
    showText,
    textContent,
    otherTools,
  } = buildMessageTimelineView(message, permissionRequests);

  return (
    <Box sx={{ mb: 2 }}>
      <ChatBubble
        gutter={false}
        hideBody={!showText && streaming}
        streaming={streaming}
        cursor={streaming && showText && !showToolProgress && !showSubagents}
        message={{
          ...message,
          content: textContent,
          metadata: {
            costUsd: message.metadata?.costUsd,
            durationMs: message.metadata?.durationMs,
            stopped: message.metadata?.stopped,
            error: message.metadata?.error,
          },
        }}
        onCopy={() => void navigator.clipboard.writeText(textContent)}
        onRetry={onRetry}
      />
      {showThinking ? <ThinkingIndicator /> : null}
      {showSubagents ? <SubagentActivityList items={subagents} /> : null}
      {showToolProgress ? <ToolProgressBar items={otherTools} /> : null}
    </Box>
  );
});
