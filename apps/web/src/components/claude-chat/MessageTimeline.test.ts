import { describe, expect, it } from 'vitest';
import { filterRunningSubagents } from './MessageTimeline';
import type { ChatBlock, ChatTurn } from './types';

function subagentBlock(
  id: string,
  status: 'running' | 'done' | 'error',
): Extract<ChatBlock, { type: 'tool_use' }> {
  return {
    type: 'tool_use',
    id,
    name: 'Task',
    status,
    task: { taskType: 'local_agent', subagentType: 'Explore' },
  };
}

describe('filterRunningSubagents', () => {
  it('only includes the running subagent from a turn with a running and a done subagent', () => {
    const turn: ChatTurn = {
      id: 't1',
      role: 'assistant',
      createdAt: '2026-01-01T00:00:00.000Z',
      blocks: [
        subagentBlock('running-task', 'running'),
        subagentBlock('done-task', 'done'),
      ],
    };
    const tools = (turn.blocks ?? []).filter(
      (block): block is Extract<ChatBlock, { type: 'tool_use' }> => block.type === 'tool_use',
    );

    const result = filterRunningSubagents(tools);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('running-task');
  });

  it('excludes error subagents as well', () => {
    const tools: Extract<ChatBlock, { type: 'tool_use' }>[] = [
      subagentBlock('running-task', 'running'),
      subagentBlock('error-task', 'error'),
    ];

    const result = filterRunningSubagents(tools);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('running-task');
  });

  it('excludes non-subagent tool_use blocks regardless of status', () => {
    const tools: Extract<ChatBlock, { type: 'tool_use' }>[] = [
      { type: 'tool_use', id: 'read-1', name: 'Read', status: 'running' },
      subagentBlock('done-task', 'done'),
    ];

    const result = filterRunningSubagents(tools);

    expect(result).toHaveLength(0);
  });
});
