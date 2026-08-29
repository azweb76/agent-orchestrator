import {
  applyStreamEvent,
  coalesceTimelineText,
  completeRunningTools,
  isSubagentItem,
  isTopLevelClaudeResult,
  visibleAssistantContent,
  visibleSubagentItems,
  type Message,
  type PermissionRequest,
  type StreamPart,
  type ToolActivityItem,
} from '@agent-orchestrator/shared';

/** USD cost from a parent Claude `result` event, when present. */
export function claudeResultCostUsd(
  event: Record<string, unknown>,
  parentSessionId: string | null,
): number | undefined {
  if (!isTopLevelClaudeResult(event, parentSessionId)) return undefined;
  const cost = event.total_cost_usd;
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined;
}

/**
 * Fold a live stream event into the streaming assistant message. A top-level
 * `result` ends the visual stream (Ready + cost) but timeline patches continue
 * while the backend run is active so Task/Explore cards stay live.
 */
export function applyEventToAssistant(
  message: Message,
  event: Record<string, unknown>,
  parentSessionId: string | null,
): Message {
  const timeline = applyStreamEvent(message.metadata?.timeline ?? [], event, parentSessionId);
  const parentResult = isTopLevelClaudeResult(event, parentSessionId);
  const streaming = parentResult ? false : (message.metadata?.streaming ?? true);
  const costUsd = claudeResultCostUsd(event, parentSessionId) ?? message.metadata?.costUsd;

  return {
    ...message,
    metadata: {
      ...message.metadata,
      streaming,
      timeline,
      ...(costUsd != null ? { costUsd } : {}),
    },
  };
}

/** Hide in-progress tool bubbles once the interactive card is on screen. */
export function shouldHideInteractiveToolProgress(
  item: ToolActivityItem,
  requests: PermissionRequest[],
): boolean {
  if (item.name !== 'AskUserQuestion' && item.name !== 'ExitPlanMode') return false;
  return requests.some(
    (request) =>
      request.toolName === item.name && (!request.toolUseId || request.toolUseId === item.id),
  );
}

export interface MessageTimelineView {
  streaming: boolean;
  subagents: ToolActivityItem[];
  showSubagents: boolean;
  otherTools: ToolActivityItem[];
  showToolProgress: boolean;
  showThinking: boolean;
  showText: boolean;
  textContent: string;
}

export function buildMessageTimelineView(
  message: Message,
  permissionRequests: PermissionRequest[],
): MessageTimelineView {
  const streaming = Boolean(message.metadata?.streaming);
  const timeline = (message.metadata?.timeline ?? []) as StreamPart[];
  const parts = streaming ? timeline : completeRunningTools(timeline);
  const toolItems = parts.filter(
    (part): part is Extract<(typeof parts)[number], { type: 'tool' }> => part.type === 'tool',
  );
  const subagents = visibleSubagentItems(timeline);
  const otherTools = toolItems.filter(
    (item) => !isSubagentItem(item) && !shouldHideInteractiveToolProgress(item, permissionRequests),
  );
  const otherRunning = otherTools.some((item) => item.status === 'running');
  const lastPart = parts[parts.length - 1];
  const showSubagents = subagents.length > 0;
  const lastVisibleTool =
    lastPart?.type === 'tool' &&
    !isSubagentItem(lastPart) &&
    !shouldHideInteractiveToolProgress(lastPart, permissionRequests);
  const showToolProgress =
    streaming &&
    otherTools.length > 0 &&
    (otherRunning || lastVisibleTool);
  // Prefer timeline segments so tool-separated replies stay on separate lines
  // even when persisted `content` was historically concatenated.
  const fromTimeline = coalesceTimelineText(parts);
  const textContent = fromTimeline || visibleAssistantContent(message.content);
  const showText = Boolean(textContent);
  const showThinking = streaming && !showText && !showToolProgress && !showSubagents;

  return {
    streaming,
    subagents,
    showSubagents,
    otherTools,
    showToolProgress,
    showThinking,
    showText,
    textContent,
  };
}
