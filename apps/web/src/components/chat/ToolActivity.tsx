import type { ToolActivityItem } from '@agent-orchestrator/shared';
import {
  SubagentActivityList as KitSubagentActivityList,
  ThinkingIndicator,
  ToolProgressBar as KitToolProgressBar,
} from '../claude-chat/ToolActivity';
import type { ChatBlock } from '../claude-chat/types';

export { ThinkingIndicator };

function toToolUse(item: ToolActivityItem): Extract<ChatBlock, { type: 'tool_use' }> {
  return {
    type: 'tool_use',
    id: item.id,
    name: item.name,
    detail: item.detail,
    status: item.status,
    input: item.input,
    result: item.result,
    task: item.task,
  };
}

export function ToolProgressBar({ items }: { items: ToolActivityItem[] }) {
  return <KitToolProgressBar items={items.map(toToolUse)} />;
}

export function SubagentActivityList({ items }: { items: ToolActivityItem[] }) {
  return <KitSubagentActivityList items={items.map(toToolUse)} />;
}
