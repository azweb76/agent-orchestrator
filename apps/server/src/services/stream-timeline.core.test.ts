import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  isSubagentItem,
  parentStreamTextDelta,
  runningSubagentItems,
  type StreamPart,
} from '@agent-orchestrator/shared';

describe('stream timeline ordering', () => {
  it('interleaves text and tools in arrival order', () => {
    let parts: StreamPart[] = [];
    parts = appendStreamText(parts, 'Looking at the file. ');
    parts = applyStreamEvent(parts, {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'tool_1', name: 'Read' },
      },
    });
    parts = appendStreamText(parts, 'Now editing. ');
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool_2',
            name: 'Edit',
            input: { file_path: 'src/app.ts' },
          },
        ],
      },
    });
    parts = appendStreamText(parts, 'Done.');

    assert.deepEqual(
      parts.map((part) =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'tool', name: part.name, detail: part.detail, status: part.status },
      ),
      [
        { type: 'text', text: 'Looking at the file. ' },
        { type: 'tool', name: 'Read', detail: undefined, status: 'running' },
        { type: 'text', text: 'Now editing. ' },
        { type: 'tool', name: 'Edit', detail: 'src/app.ts', status: 'running' },
        { type: 'text', text: 'Done.' },
      ],
    );
  });

  it('marks tools done on tool_result events', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'tool_1', name: 'Bash', status: 'running' },
    ];
    parts = applyStreamEvent(parts, {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'ok' }],
      },
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
  });

  it('coalesces split text parts into one string', () => {
    const parts: StreamPart[] = [
      { type: 'text', id: 't1', text: 'to sc' },
      { type: 'tool', id: 'tool_1', name: 'AskUserQuestion', status: 'done' },
      { type: 'text', id: 't2', text: 'ope this properly.' },
    ];
    assert.equal(coalesceTimelineText(parts), 'to scope this properly.');
  });

  it('picks the running tool for the progress label', () => {
    const parts: StreamPart[] = [
      { type: 'tool', id: 'a', name: 'Read', detail: 'a.ts', status: 'done' },
      { type: 'tool', id: 'b', name: 'Bash', detail: 'ls', status: 'running' },
      { type: 'tool', id: 'c', name: 'Grep', detail: 'foo', status: 'done' },
    ];
    assert.deepEqual(activeToolItem(parts), {
      id: 'b',
      name: 'Bash',
      detail: 'ls',
      status: 'running',
    });
  });

  it('falls back to the latest tool when none are running', () => {
    const parts: StreamPart[] = [
      { type: 'tool', id: 'a', name: 'Read', status: 'done' },
      { type: 'tool', id: 'b', name: 'Bash', status: 'done' },
    ];
    assert.equal(activeToolItem(parts)?.id, 'b');
  });

  it('keeps nested Explore text off the parent bubble and on the Task tool', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool_explore',
            name: 'Task',
            input: { subagent_type: 'Explore', description: 'Analyze merge conflicts' },
          },
        ],
      },
    });
    assert.equal(parts[0]?.type, 'tool');
    if (parts[0]?.type !== 'tool') throw new Error('expected tool');
    assert.equal(parts[0].status, 'running');
    assert.equal(parts[0].detail, 'Explore: Analyze merge conflicts');

    parts = applyStreamEvent(parts, {
      type: 'assistant',
      parent_tool_use_id: 'tool_explore',
      message: {
        content: [
          {
            type: 'text',
            text: 'No nested guidance for release-manager/. Waiting on the Explore agent.',
          },
        ],
      },
    });

    assert.equal(coalesceTimelineText(parts), '');
    assert.equal(parts[0]?.type, 'tool');
    if (parts[0]?.type !== 'tool') throw new Error('expected tool');
    assert.equal(parts[0].status, 'running');
    assert.match(parts[0].detail ?? '', /No nested guidance for release-manager/);
  });

  it('does not treat a nested subagent result as the end of the parent turn', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'tool_explore', name: 'Task', detail: 'Explore', status: 'running' },
      { type: 'tool', id: 'tool_other', name: 'Task', detail: 'Plan', status: 'running' },
    ];
    parts = applyStreamEvent(parts, {
      type: 'result',
      parent_tool_use_id: 'tool_explore',
      result: 'Conflicts are in src/merge.ts',
    });

    const explore = parts.find((part) => part.type === 'tool' && part.id === 'tool_explore');
    const other = parts.find((part) => part.type === 'tool' && part.id === 'tool_other');
    assert.equal(explore?.type === 'tool' && explore.status, 'done');
    assert.equal(other?.type === 'tool' && other.status, 'running');
    assert.equal(coalesceTimelineText(parts), '');
  });
});

describe('task events', () => {
  it('creates and updates subagents from system task events', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      task_type: 'local_agent',
      tool_use_id: 'toolu_1',
      description: 'Explore Scene duplication',
      subagent_type: 'Explore',
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      description: 'Reading src/jplephem/chebyshev.rs',
      last_tool_name: 'Read',
      usage: { duration_ms: 13996, tool_uses: 9, total_tokens: 38779 },
    });

    const item = parts[0];
    assert.equal(item?.type, 'tool');
    if (item?.type !== 'tool') return;
    assert.equal(item.status, 'running');
    assert.equal(item.detail, 'Reading src/jplephem/chebyshev.rs');
    assert.equal(item.task?.description, 'Explore Scene duplication');
    assert.equal(item.task?.lastToolName, 'Read');
    assert.equal(item.task?.toolUses, 9);
    assert.equal(item.task?.durationMs, 13996);
    assert.equal(item.task?.subagentType, 'Explore');
    assert.ok(isSubagentItem(item));
  });

  it('merges task_started onto an existing Task tool use', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Task',
            input: { description: 'Write docs', subagent_type: 'general-purpose' },
          },
        ],
      },
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 'abc',
      task_type: 'local_agent',
      tool_use_id: 'toolu_1',
      description: 'Write docs',
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.type === 'tool' && parts[0].task?.taskId, 'abc');
  });

  it('completes a task on task_notification without finishing siblings', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      task_type: 'local_agent',
      tool_use_id: 'toolu_1',
      description: 'Agent A',
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't2',
      task_type: 'local_agent',
      tool_use_id: 'toolu_2',
      description: 'Agent B',
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'Agent "Agent A" completed',
      usage: { duration_ms: 1200, tool_uses: 3, total_tokens: 800 },
    });

    const first = parts[0];
    const second = parts[1];
    assert.equal(first?.type === 'tool' && first.status, 'done');
    assert.equal(first?.type === 'tool' && first.task?.outcome, 'completed');
    assert.equal(second?.type === 'tool' && second.status, 'running');
    assert.equal(runningSubagentItems(parts).length, 1);
  });

  it('marks a task done from task_updated patches', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'task_started',
      task_id: 't1',
      task_type: 'local_bash',
      tool_use_id: 'toolu_bash',
      description: 'Wait for CI',
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_updated',
      task_id: 't1',
      patch: { status: 'failed' },
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
    assert.equal(parts[0]?.type === 'tool' && parts[0].task?.outcome, 'failed');
    assert.equal(parts[0]?.type === 'tool' && parts[0].name, 'Bash');
  });

  it('does not add nested subagent tools as top-level timeline rows', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'parent_task',
            name: 'Task',
            input: { description: 'Explore repo' },
          },
        ],
      },
    });
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      parent_tool_use_id: 'parent_task',
      message: {
        content: [
          { type: 'text', text: 'I will search now.' },
          { type: 'tool_use', id: 'nested_read', name: 'Read', input: { file_path: 'src/a.ts' } },
        ],
      },
    });

    assert.equal(parts.filter((part) => part.type === 'tool').length, 1);
    assert.equal(parts.some((part) => part.type === 'text'), false);
    const parent = parts[0];
    assert.equal(parent?.type === 'tool' && parent.task?.lastToolName, 'Read');
    assert.equal(parent?.type === 'tool' && parent.detail, 'src/a.ts');
  });

  it('reads task fields from a nested data payload', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      data: {
        task_id: 'nested',
        task_type: 'local_agent',
        tool_use_id: 'toolu_n',
        description: 'From data wrapper',
      },
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].task?.taskId, 'nested');
    assert.equal(parts[0]?.type === 'tool' && parts[0].detail, 'From data wrapper');
  });

  it('ignores nested text_delta tokens for the parent transcript', () => {
    assert.equal(
      parentStreamTextDelta({
        type: 'stream_event',
        event: { delta: { type: 'text_delta', text: 'hello' } },
      }),
      'hello',
    );
    assert.equal(
      parentStreamTextDelta({
        type: 'stream_event',
        parent_tool_use_id: 'parent_task',
        event: { delta: { type: 'text_delta', text: 'nested' } },
      }),
      undefined,
    );
  });
});
