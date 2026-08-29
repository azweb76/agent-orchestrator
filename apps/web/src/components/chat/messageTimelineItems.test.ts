import { describe, expect, it } from 'vitest';
import type { Message, PermissionRequest, StreamPart } from '@agent-orchestrator/shared';
import { visibleSubagentItems } from '@agent-orchestrator/shared';
import {
  applyEventToAssistant,
  buildMessageTimelineView,
  shouldHideInteractiveToolProgress,
} from './messageTimelineItems';

function assistantMessage(timeline: StreamPart[], streaming = true): Message {
  return {
    id: 'a1',
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role: 'assistant',
    content: 'Starting exploration.',
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: { streaming, timeline },
  };
}

describe('applyEventToAssistant', () => {
  it('keeps parent Ready while still patching timeline during an active run', () => {
    const parentResult = {
      type: 'result',
      subtype: 'success',
      result: 'Done for now.',
      total_cost_usd: 0.0123,
      session_id: 'claude-parent',
    };
    const next = applyEventToAssistant(
      assistantMessage([]),
      parentResult,
      'claude-parent',
    );
    expect(next.metadata.streaming).toBe(false);
    expect(next.metadata.costUsd).toBe(0.0123);
  });

  it('applies task rows after parent Ready when the session is still running', () => {
    let message = applyEventToAssistant(
      assistantMessage([]),
      { type: 'result', result: 'Done.', session_id: 'claude-parent' },
      'claude-parent',
    );
    message = applyEventToAssistant(
      message,
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 't1',
        task_type: 'local_agent',
        tool_use_id: 'toolu_1',
        description: 'Explore auth',
        subagent_type: 'Explore',
      },
      'claude-parent',
    );

    const subagents = visibleSubagentItems(message.metadata?.timeline ?? []);
    expect(subagents).toHaveLength(1);
    expect(subagents[0]?.status).toBe('running');
    expect(subagents[0]?.task?.subagentType).toBe('Explore');
  });
});

describe('buildMessageTimelineView', () => {
  const exploreTimeline: StreamPart[] = [
    {
      type: 'tool',
      id: 'task_1',
      name: 'Task',
      status: 'running',
      task: { taskType: 'local_agent', subagentType: 'Explore', description: 'Explore auth' },
    },
  ];

  it('shows running Explore cards after parent Ready', () => {
    const view = buildMessageTimelineView(assistantMessage(exploreTimeline, false), []);
    expect(view.showSubagents).toBe(true);
    expect(view.subagents).toHaveLength(1);
  });

  it('hides finished subagent cards once every row is done', () => {
    const doneTimeline: StreamPart[] = [
      {
        type: 'tool',
        id: 'task_1',
        name: 'Task',
        status: 'done',
        task: { taskType: 'local_agent', subagentType: 'Explore', description: 'Explore auth' },
      },
    ];
    const view = buildMessageTimelineView(assistantMessage(doneTimeline, false), []);
    expect(view.showSubagents).toBe(false);
    expect(view.subagents).toHaveLength(0);
  });

  it('hides AskUserQuestion progress when the question card is pending', () => {
    const timeline: StreamPart[] = [
      {
        type: 'tool',
        id: 'toolu_q',
        name: 'AskUserQuestion',
        status: 'running',
        detail: 'Pick one',
      },
    ];
    const requests: PermissionRequest[] = [
      {
        requestId: 'req-1',
        toolName: 'AskUserQuestion',
        toolUseId: 'toolu_q',
        input: { questions: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const view = buildMessageTimelineView(assistantMessage(timeline, true), requests);
    expect(view.showToolProgress).toBe(false);
    expect(view.otherTools).toHaveLength(0);
    expect(shouldHideInteractiveToolProgress(timeline[0] as Extract<StreamPart, { type: 'tool' }>, requests)).toBe(
      true,
    );
  });

  it('renders tool-separated assistant text as separate paragraphs', () => {
    const timeline: StreamPart[] = [
      { type: 'text', id: 't1', text: 'First reply.' },
      { type: 'tool', id: 'tool_1', name: 'Read', status: 'done' },
      { type: 'text', id: 't2', text: 'Second reply.' },
    ];
    const message = {
      ...assistantMessage(timeline, false),
      content: 'First reply.Second reply.',
    };
    const view = buildMessageTimelineView(message, []);
    expect(view.textContent).toBe('First reply.\n\nSecond reply.');
    expect(view.showText).toBe(true);
  });
});
