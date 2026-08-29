import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyStreamEvent,
  adoptParentClaudeSessionId,
  claudeResultErrorMessage,
  completeRunningTools,
  isNestedSubagentEvent,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
  runningSubagentItems,
  visibleAssistantContent,
  visibleSubagentItems,
  type StreamPart,
} from '@agent-orchestrator/shared';

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

  it('only completes the matching ordinary tool when one of several results arrives', () => {
    let parts: StreamPart[] = [
      { type: 'tool', id: 'read_1', name: 'Read', status: 'running' },
      { type: 'tool', id: 'read_2', name: 'Read', status: 'running' },
    ];
    parts = applyStreamEvent(parts, {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'read_1', content: 'ok' }],
      },
    });
    assert.equal(parts[0]?.type === 'tool' && parts[0].status, 'done');
    assert.equal(parts[1]?.type === 'tool' && parts[1].status, 'running');
  });

  it('keeps a backgrounded agent running when its launch ack arrives', () => {
    // Backgrounded Agent/Task calls get an immediate `tool_result` ("Async agent
    // launched successfully") long before the subagent finishes. Completing the
    // row there would let the parent `result` end the run mid-flight.
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      session_id: 'sess-parent',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Agent',
            input: { description: 'Explore light theme', subagent_type: 'Explore' },
          },
        ],
      },
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task_1',
      tool_use_id: 'toolu_1',
      task_type: 'local_agent',
      subagent_type: 'Explore',
      description: 'Explore light theme',
      is_backgrounded: true,
      session_id: 'sess-parent',
    }, 'sess-parent');
    parts = applyStreamEvent(parts, {
      type: 'user',
      session_id: 'sess-parent',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'Async agent launched successfully.' },
        ],
      },
    }, 'sess-parent');

    assert.equal(runningSubagentItems(parts).length, 1);

    parts = applyStreamEvent(parts, {
      type: 'result',
      result: "I've kicked off an exploration.",
      session_id: 'sess-parent',
    }, 'sess-parent');
    assert.equal(runningSubagentItems(parts).length, 1);

    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task_1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'found the theme bug',
      session_id: 'sess-parent',
    }, 'sess-parent');
    assert.equal(runningSubagentItems(parts).length, 0);
  });

  it('keeps background Bash running after its launch tool_result', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'bash_1',
            name: 'Bash',
            input: { command: 'sleep 30', run_in_background: true, description: 'Wait' },
          },
        ],
      },
    });
    parts = applyStreamEvent(parts, {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'bash_1', content: 'Background bash started' }],
      },
    });
    assert.equal(runningSubagentItems(parts).length, 1);
    assert.equal(parts[0]?.type === 'tool' && parts[0].task?.taskType, 'local_bash');
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
    assert.equal(visibleSubagentItems(bashTimeline).length, 0);
  });

  it('shows only the running Explore card, hiding done siblings', () => {
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
    const visible = visibleSubagentItems(parts);
    assert.equal(visible.length, 1);
    assert.equal(visible[0]?.status, 'running');
  });

  it('hides every subagent card once all rows finish', () => {
    const parts: StreamPart[] = [
      {
        type: 'tool',
        id: 'task_1',
        name: 'Task',
        status: 'done',
        task: { taskType: 'local_agent', subagentType: 'Explore', description: 'Explore auth' },
      },
    ];
    assert.equal(visibleSubagentItems(parts).length, 0);
  });

  it('shows a backgrounded agent as running through its launch ack, then hides it on real completion', () => {
    let parts: StreamPart[] = [];
    parts = applyStreamEvent(parts, {
      type: 'assistant',
      session_id: 'sess-parent',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Agent',
            input: { description: 'Explore light theme', subagent_type: 'Explore' },
          },
        ],
      },
    });
    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task_1',
      tool_use_id: 'toolu_1',
      task_type: 'local_agent',
      subagent_type: 'Explore',
      description: 'Explore light theme',
      is_backgrounded: true,
      session_id: 'sess-parent',
    }, 'sess-parent');
    parts = applyStreamEvent(parts, {
      type: 'user',
      session_id: 'sess-parent',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'Async agent launched successfully.' },
        ],
      },
    }, 'sess-parent');

    let visible = visibleSubagentItems(parts);
    assert.equal(visible.length, 1);
    assert.equal(visible[0]?.status, 'running');

    parts = applyStreamEvent(parts, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task_1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'found the theme bug',
      session_id: 'sess-parent',
    }, 'sess-parent');
    visible = visibleSubagentItems(parts);
    assert.equal(visible.length, 0);
  });
});
