import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatSession } from '@agent-orchestrator/shared';
import {
  GIT_MUTATING_SESSION_TEMPLATES,
  isGitMutatingSessionTemplate,
} from '@agent-orchestrator/shared';
import {
  findRunningMutatingPeer,
  isGitMutatingSession,
  nextWaitingMutatingSession,
  shouldQueueMutatingStart,
} from './session-mutex.js';

function session(overrides: Partial<ChatSession> & Pick<ChatSession, 'id' | 'template' | 'status'>): ChatSession {
  return {
    agentId: 'ag-1',
    title: overrides.template,
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'auto',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('mutating templates are build, create-draft-pr, address-review, and fix-ci', () => {
  assert.deepEqual([...GIT_MUTATING_SESSION_TEMPLATES], [
    'build',
    'create-draft-pr',
    'address-review',
    'fix-ci',
  ]);
  assert.equal(isGitMutatingSessionTemplate('chat'), false);
  assert.equal(isGitMutatingSessionTemplate('review'), false);
  assert.equal(isGitMutatingSession(session({ id: 'a', template: 'build', status: 'idle' })), true);
});

test('shouldQueueMutatingStart waits only on a running mutating peer', () => {
  const build = session({ id: 'build-1', template: 'build', status: 'idle' });
  const pr = session({ id: 'pr-1', template: 'create-draft-pr', status: 'running' });
  const review = session({ id: 'rev-1', template: 'review', status: 'running' });

  assert.equal(shouldQueueMutatingStart([build, pr], build), true);
  assert.equal(shouldQueueMutatingStart([build, review], build), false);
  assert.equal(shouldQueueMutatingStart([build], build), false);
  assert.equal(findRunningMutatingPeer([build, pr], build.id)?.id, 'pr-1');
  assert.equal(findRunningMutatingPeer([build, review], build.id), undefined);
});

test('nextWaitingMutatingSession prefers the oldest queued mutating session', () => {
  const running = session({
    id: 'run',
    template: 'build',
    status: 'running',
    updatedAt: '2026-01-01T00:00:01.000Z',
  });
  const later = session({
    id: 'later',
    template: 'fix-ci',
    status: 'queued',
    updatedAt: '2026-01-01T00:00:03.000Z',
  });
  const earlier = session({
    id: 'earlier',
    template: 'address-review',
    status: 'queued',
    updatedAt: '2026-01-01T00:00:02.000Z',
  });
  const idleWithQueue = session({
    id: 'idle-q',
    template: 'create-draft-pr',
    status: 'idle',
    updatedAt: '2026-01-01T00:00:04.000Z',
  });
  const review = session({
    id: 'review',
    template: 'review',
    status: 'queued',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const next = nextWaitingMutatingSession(
    [running, later, earlier, idleWithQueue, review],
    (id) => id === 'idle-q',
  );
  assert.equal(next?.id, 'earlier');
});
