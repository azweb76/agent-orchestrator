import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  isNestedSubagentEvent,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
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

describe('nested subagent event helpers', () => {
  it('detects nested events and top-level results', () => {
    assert.equal(isNestedSubagentEvent({ type: 'result', parent_tool_use_id: 'tool_1' }), true);
    assert.equal(isTopLevelClaudeResult({ type: 'result', parent_tool_use_id: 'tool_1' }), false);
    assert.equal(isTopLevelClaudeResult({ type: 'result' }), true);
    assert.equal(parentStreamTextDelta({
      type: 'stream_event',
      parent_tool_use_id: 'tool_1',
      event: { delta: { type: 'text_delta', text: 'nested' } },
    }), undefined);
    assert.equal(parentStreamTextDelta({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'parent' } },
    }), 'parent');
  });
});
