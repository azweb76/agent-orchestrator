import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  type StreamPart,
} from '@agent-orchestrator/shared';
import { appendAssistantText } from './chat-run-lifecycle.js';

/**
 * Characterization test for the quadratic assistant-text recompute fix.
 *
 * The server no longer calls `coalesceTimelineText` (an O(total response
 * length) join of every text part) once per streamed token. Instead it
 * maintains `assistantText` incrementally via `appendAssistantText`. This
 * test replays a scripted sequence that interleaves text tokens with
 * non-text (tool) timeline events and asserts, at every step, that the
 * incrementally maintained text stays byte-identical to a full
 * `coalesceTimelineText` recompute of the timeline at that point.
 */
test('appendAssistantText stays byte-identical to coalesceTimelineText across interleaved text and tool parts', () => {
  let timeline: StreamPart[] = [];
  let assistantText = '';

  const applyToken = (token: string) => {
    // Mirrors the onEvent token branch in chat-stream.ts / chat-run-lifecycle.ts / chat-follow.ts:
    // compute the incremental update from the timeline *before* the token is applied.
    assistantText = appendAssistantText(assistantText, timeline, token);
    timeline = appendStreamText(timeline, token);
    assert.equal(
      assistantText,
      coalesceTimelineText(timeline),
      `incremental text diverged after token ${JSON.stringify(token)}`,
    );
  };

  const applyToolEvent = (event: Record<string, unknown>) => {
    // Mirrors the onEvent non-text branch: a full recompute is fine here
    // since it only runs once per tool event, not once per token.
    timeline = applyStreamEvent(timeline, event, null);
    assistantText = coalesceTimelineText(timeline);
    assert.equal(assistantText, coalesceTimelineText(timeline));
  };

  applyToken('Hello');
  applyToken(', ');
  applyToken('world.');

  applyToolEvent({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
      ],
    },
  });
  applyToolEvent({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'file.txt' },
      ],
    },
  });

  applyToken('More ');
  applyToken('text ');
  applyToken('after the tool call.');

  applyToolEvent({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'tool-2', name: 'Bash', input: { command: 'pwd' } },
      ],
    },
  });
  applyToolEvent({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'tool-2', content: '/repo' },
      ],
    },
  });

  applyToken('Final');
  applyToken(' answer.');

  assert.equal(assistantText, coalesceTimelineText(timeline));
  assert.equal(
    assistantText,
    'Hello, world.\n\nMore text after the tool call.\n\nFinal answer.',
  );
});

test('appendAssistantText returns the accumulator unchanged for an empty token', () => {
  const timeline: StreamPart[] = [{ type: 'text', id: 'text-0', text: 'existing' }];
  assert.equal(appendAssistantText('existing', timeline, ''), 'existing');
});

test('appendAssistantText starts the first text segment with no leading separator', () => {
  const timeline: StreamPart[] = [];
  assert.equal(appendAssistantText('', timeline, 'Hi'), 'Hi');
});
