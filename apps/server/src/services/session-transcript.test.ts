import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Message } from '@agent-orchestrator/shared';
import { buildSessionTranscript } from './session-transcript.js';

function msg(
  role: Message['role'],
  content: string,
  extras?: Partial<Message>,
): Message {
  return {
    id: extras?.id ?? `${role}-${content.slice(0, 8)}`,
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role,
    content,
    attachments: [],
    metadata: extras?.metadata ?? {},
    createdAt: extras?.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

test('buildSessionTranscript formats user and assistant turns', () => {
  const text = buildSessionTranscript([
    msg('user', 'Add dark mode'),
    msg('assistant', 'I will add a theme toggle.'),
  ]);
  assert.match(text, /user: Add dark mode/);
  assert.match(text, /assistant: I will add a theme toggle\./);
});

test('buildSessionTranscript skips empty and system messages', () => {
  const text = buildSessionTranscript([
    msg('system', 'hidden'),
    msg('user', '   '),
    msg('user', 'hello'),
  ]);
  assert.equal(text, 'user: hello');
});

test('buildSessionTranscript falls back to timeline text', () => {
  const text = buildSessionTranscript([
    msg('assistant', '', {
      metadata: { timeline: [{ type: 'text', id: 't1', text: 'From timeline' }] },
    }),
  ]);
  assert.equal(text, 'assistant: From timeline');
});

test('buildSessionTranscript truncates very long messages', () => {
  const huge = 'x'.repeat(5000);
  const text = buildSessionTranscript([msg('user', huge)]);
  assert.ok(text.length < 5000);
  assert.match(text, /…/);
});
