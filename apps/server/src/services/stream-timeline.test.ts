import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  adoptParentClaudeSessionId,
  claudeResultErrorMessage,
  coalesceTimelineText,
  completeRunningTools,
  isNestedSubagentEvent,
  isSubagentItem,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
  runningSubagentItems,
  visibleAssistantContent,
  visibleSubagentItems,
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

  it('treats a result with a different session_id as nested even without parent_tool_use_id', () => {
    const parentId = 'sess-parent';
    const nestedResult = {
      type: 'result',
      session_id: 'sess-explore',
      result: '',
      total_cost_usd: 0,
    };
    assert.equal(isNestedSubagentEvent(nestedResult, parentId), true);
    assert.equal(isTopLevelClaudeResult(nestedResult, parentId), false);
    assert.equal(
      isTopLevelClaudeResult({ type: 'result', session_id: parentId, result: 'done' }, parentId),
      true,
    );
  });

  it('does not adopt a nested result session id as the parent', () => {
    let parentId = adoptParentClaudeSessionId(null, {
      type: 'system',
      session_id: 'sess-parent',
    });
    assert.equal(parentId, 'sess-parent');
    parentId = adoptParentClaudeSessionId(parentId, {
      type: 'result',
      session_id: 'sess-explore',
      result: '',
    });
    assert.equal(parentId, 'sess-parent');
    parentId = adoptParentClaudeSessionId(parentId, {
      type: 'assistant',
      session_id: 'sess-explore',
      message: { content: [{ type: 'text', text: 'nested' }] },
    });
    assert.equal(parentId, 'sess-parent');
  });

  it('does not complete sibling tools on a foreign-session result', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'task_1', name: 'Task', status: 'running' },
      { type: 'tool', id: 'task_2', name: 'Task', status: 'running' },
    ];
    parts = applyStreamEvent(
      parts,
      { type: 'result', session_id: 'sess-explore', result: '' },
      'sess-parent',
    );
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'running');
    assert.equal(parts[1]?.type === 'tool' && parts[1].status, 'running');
  });

  it('does not mark subagents done on parent result so progress can continue', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      description: 'Explore',
    });
    parts = applyStreamEvent(parts, { type: 'result', result: 'done' });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'running');
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      description: 'Still reading',
      last_tool_name: 'Read',
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'running');
    assert.equal(parts[0]?.type === 'tool' && parts[0].detail, 'Still reading');
  });

  it('does not revive a tool completed by task_notification from later task_progress', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      description: 'Explore',
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'Found the buttons',
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      description: 'Stale progress',
      last_tool_name: 'Read',
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
    assert.equal(parts[0]?.type === 'tool' && parts[0].detail, 'Stale progress');
  });

  it('hides synthetic assistant placeholders', () => {
    assert.equal(visibleAssistantContent('[no output]'), '');
    assert.equal(visibleAssistantContent('[stopped]'), '');
    assert.equal(visibleAssistantContent(''), '');
    assert.equal(visibleAssistantContent('Here is the plan.'), 'Here is the plan.');
    const finished = completeRunningTools([
      { type: 'tool', id: 'task_1', name: 'Task', status: 'running' },
    ]);
    assert.equal(finished[0]?.type === 'tool' && finished[0].status, 'done');
  });

  it('reads error text from failed Claude result events', () => {
    assert.equal(claudeResultErrorMessage({ type: 'result', result: 'ok' }), undefined);
    assert.equal(
      claudeResultErrorMessage({
        type: 'result',
        is_error: true,
        result: 'Session not found',
      }),
      'Session not found',
    );
    assert.equal(
      claudeResultErrorMessage({ type: 'result', subtype: 'error_during_execution', result: '' }),
      'Claude ended this turn (error_during_execution).',
    );
  });
});

describe('parallel tools and subagents', () => {
  it('keeps distinct Task tool uses instead of collapsing by name', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'task_1',
            name: 'Task',
            input: { description: 'Explore auth', subagent_type: 'Explore' },
          },
          {
            type: 'tool_use',
            id: 'task_2',
            name: 'Task',
            input: { description: 'Explore billing', subagent_type: 'Explore' },
          },
        ],
      },
    });

    const tools = parts.filter((part) => part.type === 'tool');
    assert.equal(tools.length, 2);
    assert.deepEqual(
      tools.map((part) =>
        part.type === 'tool'
          ? {
              id: part.id,
              detail: part.detail,
              status: part.status,
              description: part.task?.description,
            }
          : part,
      ),
      [
        { id: 'task_1', detail: 'Explore: Explore auth', status: 'running', description: 'Explore auth' },
        { id: 'task_2', detail: 'Explore: Explore billing', status: 'running', description: 'Explore billing' },
      ],
    );
    assert.equal(runningSubagentItems(parts).length, 2);
  });

  it('only completes the matching tool when one of several results arrives', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'task_1', name: 'Task', status: 'running' },
      { type: 'tool', id: 'task_2', name: 'Task', status: 'running' },
    ];
    parts = applyStreamEvent(parts, {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'task_1', content: 'ok' }],
      },
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
    assert.equal(parts[1]?.type === 'tool' && parts[1].status, 'running');
  });

  it('keeps running subagents on the final result; completes ordinary tools', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'task_1', name: 'Task', status: 'running' },
      { type: 'tool', id: 'read_1', name: 'Read', status: 'running' },
      { type: 'tool', id: 'task_2', name: 'Task', status: 'done' },
    ];
    parts = applyStreamEvent(parts, { type: 'result', result: 'done' });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'running');
    assert.equal(parts[1]?.type === 'tool' && parts[1].status, 'done');
    assert.equal(parts[2]?.type === 'tool' && parts[2].status, 'done');
  });
});

describe('visible subagent cards', () => {
  const bashTimeline: StreamPart[] = [
    {
      type: 'tool',
      id: 'bash_1',
      name: 'Bash',
      status: 'done',
      task: { taskType: 'local_bash', description: 'Install dependencies with pnpm' },
    },
    {
      type: 'tool',
      id: 'bash_2',
      name: 'Bash',
      status: 'done',
      task: { taskType: 'local_bash', description: 'Run web app typecheck via pnpm' },
    },
    {
      type: 'tool',
      id: 'bash_3',
      name: 'Bash',
      status: 'done',
      task: { taskType: 'local_bash', description: 'Re-run web app typecheck' },
    },
  ];

  it('hides finished Bash/Task cards after the turn completes', () => {
    assert.equal(visibleSubagentItems(bashTimeline, false).length, 0);
  });

  it('shows finished subagents while the turn is still streaming', () => {
    assert.equal(visibleSubagentItems(bashTimeline, true).length, 3);
  });

  it('keeps a live Explore card after parent Ready, including done siblings', () => {
    const parts: StreamPart[] = [
      ...bashTimeline,
      {
        type: 'tool',
        id: 'task_1',
        name: 'Task',
        status: 'running',
        task: { taskType: 'local_agent', subagentType: 'Explore', description: 'Explore auth' },
      },
    ];
    const visible = visibleSubagentItems(parts, false);
    assert.equal(visible.length, 4);
    assert.equal(visible.some((item) => item.status === 'running'), true);
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
