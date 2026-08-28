import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppEvent } from '@agent-orchestrator/shared';
import { Notifier } from './notifier.js';

test('notifier delivers events to subscribers and supports unsubscribe', () => {
  const notifier = new Notifier();
  const seen: AppEvent[] = [];
  const unsubscribe = notifier.subscribe((event) => seen.push(event));

  const emitted = notifier.emit('agent_changed', { agentId: 'ag-1', data: { status: 'idle' } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.type, 'agent_changed');
  assert.equal(seen[0]?.agentId, 'ag-1');
  assert.equal(seen[0]?.sessionId, null);
  assert.deepEqual(seen[0]?.data, { status: 'idle' });
  assert.equal(emitted.id.length > 0, true);

  unsubscribe();
  notifier.emit('workspaces_changed');
  assert.equal(seen.length, 1);
  assert.equal(notifier.listenerCount, 0);
});

test('a throwing subscriber does not break other subscribers', () => {
  const notifier = new Notifier();
  const seen: string[] = [];
  notifier.subscribe(() => {
    throw new Error('boom');
  });
  notifier.subscribe((event) => seen.push(event.type));

  notifier.emit('run_finished', { agentId: 'ag-1', sessionId: 'sess-1' });
  assert.deepEqual(seen, ['run_finished']);
});

test('replaySince returns events after the last seen id', () => {
  const notifier = new Notifier();
  const first = notifier.emit('agent_changed', { agentId: 'ag-1' });
  const second = notifier.emit('run_finished', { agentId: 'ag-1', sessionId: 's-1' });
  notifier.emit('queue_changed', { agentId: 'ag-1', sessionId: 's-1' });

  assert.deepEqual(
    notifier.replaySince(first.id).map((event) => event.type),
    ['run_finished', 'queue_changed'],
  );
  assert.deepEqual(notifier.replaySince(second.id).map((event) => event.type), ['queue_changed']);
  assert.equal(notifier.replaySince('unknown-id').length, 3);
  assert.deepEqual(notifier.replaySince(undefined), []);
});
