import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flushReplayedPermissions,
  handleControlEvent,
  monitorClaudeRun,
  stashPermissionRequest,
} from './claude-run-monitor.js';
import {
  appendLogLines,
  collectPermissionRequests,
  createRunLog,
  FakeMonitorHost,
  killPidOnCloseStdin,
  makeTrackedRun,
  spawnDummyProcess,
  waitFor,
} from './claude-run-monitor.test-helpers.js';
import { isPidAlive } from './claude-process.js';

// ---------------------------------------------------------------------------
// stashPermissionRequest / handleControlEvent — Bug 1 (concurrent requests)
// ---------------------------------------------------------------------------

test('stashPermissionRequest accumulates concurrent requests instead of evicting earlier ones', () => {
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log' });
  stashPermissionRequest(tracked, { requestId: 'req-a', toolName: 'Bash', input: {} });
  stashPermissionRequest(tracked, { requestId: 'req-b', toolName: 'Write', input: {} });

  assert.equal(tracked.pendingPermissions.size, 2);
  assert.equal(tracked.pendingPermissions.get('req-a')?.toolName, 'Bash');
  assert.equal(tracked.pendingPermissions.get('req-b')?.toolName, 'Write');
});

test('handleControlEvent surfaces each of several parallel tool_use permission requests', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log', permissionMode: 'plan' });
  host.track('agent-1', tracked);
  const { requests, onPermissionRequest } = collectPermissionRequests();

  handleControlEvent(
    host,
    'agent-1',
    1,
    {
      type: 'control_request',
      request_id: 'req-a',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {}, tool_use_id: 'toolu_a' },
    },
    { onPermissionRequest },
    { replay: false },
  );
  handleControlEvent(
    host,
    'agent-1',
    1,
    {
      type: 'control_request',
      request_id: 'req-b',
      request: { subtype: 'can_use_tool', tool_name: 'Write', input: {}, tool_use_id: 'toolu_b' },
    },
    { onPermissionRequest },
    { replay: false },
  );

  assert.deepEqual(requests.map((r) => r.requestId).sort(), ['req-a', 'req-b']);
  assert.equal(tracked.pendingPermissions.size, 2);
});

// ---------------------------------------------------------------------------
// flushReplayedPermissions
// ---------------------------------------------------------------------------

test('flushReplayedPermissions notifies for every still-pending request after catch-up', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log', permissionMode: 'plan' });
  stashPermissionRequest(tracked, { requestId: 'req-a', toolName: 'Bash', input: {} });
  stashPermissionRequest(tracked, { requestId: 'req-b', toolName: 'AskUserQuestion', input: {} });
  host.track('agent-1', tracked);
  const { requests, onPermissionRequest } = collectPermissionRequests();

  flushReplayedPermissions(host, 'agent-1', 1, { onPermissionRequest });

  assert.deepEqual(requests.map((r) => r.requestId).sort(), ['req-a', 'req-b']);
  assert.equal(tracked.pendingPermissions.size, 2);
});

test('flushReplayedPermissions auto-allows a request the current mode no longer needs to ask about', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({
    pid: 1,
    logPath: '/tmp/x.log',
    permissionMode: 'auto',
    canRespondToPermissions: true,
  });
  stashPermissionRequest(tracked, { requestId: 'req-a', toolName: 'Bash', input: {} });
  host.track('agent-1', tracked);
  const { requests, onPermissionRequest } = collectPermissionRequests();

  flushReplayedPermissions(host, 'agent-1', 1, { onPermissionRequest });

  assert.deepEqual(requests, []);
  assert.equal(host.respondCalls.length, 1);
  assert.equal(host.respondCalls[0]?.decision.behavior, 'allow');
  assert.equal(tracked.pendingPermissions.size, 0);
});

// ---------------------------------------------------------------------------
// handleControlEvent replay clearing — Bug 2 (evidence-based, not "any line")
// ---------------------------------------------------------------------------

test('handleControlEvent keeps a pending request across unrelated replay traffic', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log' });
  stashPermissionRequest(tracked, {
    requestId: 'req-a',
    toolName: 'AskUserQuestion',
    input: {},
    toolUseId: 'toolu_a',
  });
  host.track('agent-1', tracked);

  // A sibling tool's stream_event delta, and background task_progress — neither
  // proves req-a was answered.
  handleControlEvent(
    host,
    'agent-1',
    1,
    { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'still going' } } },
    {},
    { replay: true },
  );
  handleControlEvent(
    host,
    'agent-1',
    1,
    { type: 'task_progress', task_id: 't1', tool_use_id: 'toolu_other' },
    {},
    { replay: true },
  );

  assert.equal(tracked.pendingPermissions.has('req-a'), true);
});

test('handleControlEvent clears a pending request once its tool_result appears during replay', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log' });
  stashPermissionRequest(tracked, {
    requestId: 'req-a',
    toolName: 'Bash',
    input: {},
    toolUseId: 'toolu_a',
  });
  host.track('agent-1', tracked);

  handleControlEvent(
    host,
    'agent-1',
    1,
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_a', content: 'ok' }] },
    },
    {},
    { replay: true },
  );

  assert.equal(tracked.pendingPermissions.has('req-a'), false);
});

test('handleControlEvent clears a pending request on a matching control_response during replay', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log' });
  stashPermissionRequest(tracked, { requestId: 'req-a', toolName: 'Bash', input: {} });
  host.track('agent-1', tracked);

  handleControlEvent(
    host,
    'agent-1',
    1,
    { type: 'control_response', response: { request_id: 'req-a' } },
    {},
    { replay: true },
  );

  assert.equal(tracked.pendingPermissions.has('req-a'), false);
});

test('handleControlEvent does not clear an unrelated request when a different tool_use_id resolves', () => {
  const host = new FakeMonitorHost();
  const tracked = makeTrackedRun({ pid: 1, logPath: '/tmp/x.log' });
  stashPermissionRequest(tracked, {
    requestId: 'req-a',
    toolName: 'Bash',
    input: {},
    toolUseId: 'toolu_a',
  });
  host.track('agent-1', tracked);

  handleControlEvent(
    host,
    'agent-1',
    1,
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_other', content: 'ok' }] },
    },
    {},
    { replay: true },
  );

  assert.equal(tracked.pendingPermissions.has('req-a'), true);
});

// ---------------------------------------------------------------------------
// monitorClaudeRun lifecycle — deferred result / wake timer / hard ceiling
// ---------------------------------------------------------------------------

test('monitorClaudeRun defers the top-level result while a background subagent is running, then reaps once it settles', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();
  const host = new FakeMonitorHost(60);
  host.track('agent-1', makeTrackedRun({ pid, logPath }));
  killPidOnCloseStdin(host, pid);

  const seenTypes: string[] = [];
  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {
    onEvent: (event) => seenTypes.push(event.type),
  });

  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    { type: 'system', subtype: 'task_started', task_id: 't1', task_type: 'local_agent', tool_use_id: 'toolu_1', session_id: 'sess-1' },
    { type: 'result', result: 'launched', session_id: 'sess-1' },
  ]);

  await waitFor(() => seenTypes.includes('result'));
  assert.equal(host.reapCalls.length, 0, 'must not reap while the subagent is still running');

  await appendLogLines(logPath, [
    {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      session_id: 'sess-1',
    },
  ]);

  await waitFor(() => host.reapCalls.length === 1, 3000);
  const result = await promise;

  assert.equal(result.result, 'launched');
  assert.equal(result.stopped, false);
  assert.equal(host.removedRuns.length, 1);
  assert.equal(isPidAlive(pid), false);
});

test('monitorClaudeRun keeps the run open when the CLI wakes the parent turn after a deferred result', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();
  const host = new FakeMonitorHost(50);
  host.track('agent-1', makeTrackedRun({ pid, logPath }));
  killPidOnCloseStdin(host, pid);

  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {});

  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    { type: 'system', subtype: 'task_started', task_id: 't1', task_type: 'local_agent', tool_use_id: 'toolu_1', session_id: 'sess-1' },
    { type: 'result', result: 'launched', session_id: 'sess-1' },
    {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      session_id: 'sess-1',
    },
    // The wake turn's own parent activity arrives before the wake-grace timer
    // fires; it must cancel the pending close.
    {
      type: 'assistant',
      session_id: 'sess-1',
      message: { content: [{ type: 'text', text: 'here is the plan' }] },
    },
  ]);

  // Wait well past the wake-grace window: the run must still be open.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(host.reapCalls.length, 0, 'wake timer must have been cancelled by the wake turn');

  await appendLogLines(logPath, [
    { type: 'result', result: 'here is the plan', session_id: 'sess-1' },
  ]);

  await waitFor(() => host.reapCalls.length === 1, 3000);
  const result = await promise;

  assert.equal(result.result, 'launched\n\nhere is the plan');
  assert.equal(result.stopped, false);
});

test('monitorClaudeRun forces a permanently-deferred result closed once the hard ceiling elapses (Bug 3)', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();
  const wakeGraceMs = 20;
  const host = new FakeMonitorHost(wakeGraceMs);
  host.track('agent-1', makeTrackedRun({ pid, logPath }));
  killPidOnCloseStdin(host, pid);

  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {});

  // The subagent row never settles (no task_notification/task_updated ever
  // arrives), so tasksRunning stays true forever and the normal wake timer's
  // `!tasksRunning` guard never fires.
  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    { type: 'system', subtype: 'task_started', task_id: 't1', task_type: 'local_agent', tool_use_id: 'toolu_stuck', session_id: 'sess-1' },
    { type: 'result', result: 'launched', session_id: 'sess-1' },
  ]);

  await new Promise((r) => setTimeout(r, wakeGraceMs * 2));
  assert.equal(host.reapCalls.length, 0, 'the normal wake path must not fire while tasksRunning stays true');

  // The hard ceiling (~10x wakeGraceMs) must close the run anyway.
  await waitFor(() => host.reapCalls.length === 1, 3000);
  const result = await promise;

  assert.equal(result.result, 'launched');
  assert.equal(result.stopped, false);
});

// ---------------------------------------------------------------------------
// monitorClaudeRun + permissions — Bug 1 end-to-end, and reattach replay (Bug 2)
// ---------------------------------------------------------------------------

test('monitorClaudeRun answers (denies) every permission request still unanswered when the parent turn ends', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();
  const host = new FakeMonitorHost();
  host.track(
    'agent-1',
    makeTrackedRun({ pid, logPath, permissionMode: 'plan', canRespondToPermissions: true }),
  );
  killPidOnCloseStdin(host, pid);
  const { requests, onPermissionRequest } = collectPermissionRequests();

  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {
    onPermissionRequest,
  });

  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    {
      type: 'assistant',
      session_id: 'sess-1',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_a', name: 'Bash', input: { command: 'ls' } },
          { type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'pwd' } },
        ],
      },
    },
    {
      type: 'control_request',
      request_id: 'req-a',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' }, tool_use_id: 'toolu_a' },
    },
    {
      type: 'control_request',
      request_id: 'req-b',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'pwd' }, tool_use_id: 'toolu_b' },
    },
  ]);

  await waitFor(() => requests.length === 2);
  assert.deepEqual(requests.map((r) => r.requestId).sort(), ['req-a', 'req-b']);
  assert.equal(host.getTrackedRun('agent-1')?.pendingPermissions.size, 2);

  // Neither request is ever answered by the UI; the parent turn ends anyway.
  await appendLogLines(logPath, [{ type: 'result', result: 'done', session_id: 'sess-1' }]);

  await waitFor(() => host.respondCalls.length === 2);
  assert.deepEqual(
    host.respondCalls.map((c) => c.requestId).sort(),
    ['req-a', 'req-b'],
  );
  for (const call of host.respondCalls) {
    assert.equal(call.decision.behavior, 'deny');
  }
  assert.equal(host.getTrackedRun('agent-1')?.pendingPermissions.size, 0);

  await waitFor(() => host.reapCalls.length === 1);
  await promise;
});

test('monitorClaudeRun still empties pendingPermissions at turn end even when stdin cannot deliver the deny', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();
  const host = new FakeMonitorHost();
  // No stdin available to reply on (e.g. reattach found the holder dead) —
  // respondToPermission must fail, but the request still must not linger.
  const tracked = makeTrackedRun({ pid, logPath, permissionMode: 'plan', canRespondToPermissions: false });
  host.track('agent-1', tracked);
  killPidOnCloseStdin(host, pid);

  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {});

  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    {
      type: 'control_request',
      request_id: 'req-a',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {}, tool_use_id: 'toolu_a' },
    },
  ]);

  await waitFor(() => tracked.pendingPermissions.size === 1);

  await appendLogLines(logPath, [{ type: 'result', result: 'done', session_id: 'sess-1' }]);

  await waitFor(() => tracked.pendingPermissions.size === 0, 3000);
  assert.equal(host.respondCalls.length, 0, 'no reply could be delivered without stdin');

  await waitFor(() => host.reapCalls.length === 1, 3000);
  await promise;
});

test('monitorClaudeRun re-surfaces a still-pending permission after reattach, despite intervening log traffic (Bug 2 end-to-end)', async () => {
  const dummy = spawnDummyProcess();
  const pid = dummy.pid!;
  const logPath = await createRunLog();

  // Everything below is already in the log before monitorClaudeRun ever runs —
  // this simulates reattaching to a still-running Claude process after an
  // orchestrator restart, replaying its full history from byte 0.
  await appendLogLines(logPath, [
    { type: 'system', session_id: 'sess-1' },
    {
      type: 'control_request',
      request_id: 'req-old',
      request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: {} },
    },
    { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'unrelated chatter' } } },
    { type: 'system', subtype: 'task_progress', task_id: 't-other', tool_use_id: 'toolu_other' },
  ]);

  const host = new FakeMonitorHost();
  host.track(
    'agent-1',
    makeTrackedRun({ pid, logPath, permissionMode: 'plan', canRespondToPermissions: true }),
  );
  killPidOnCloseStdin(host, pid);
  const { requests, onPermissionRequest } = collectPermissionRequests();
  let caughtUp = false;

  const promise = monitorClaudeRun(host, 'agent-1', { pid, logPath }, null, {
    onPermissionRequest,
    onCatchUp: () => {
      caughtUp = true;
    },
  });

  await waitFor(() => caughtUp);
  assert.deepEqual(requests.map((r) => r.requestId), ['req-old']);
  assert.equal(host.getTrackedRun('agent-1')?.pendingPermissions.has('req-old'), true);

  // The UI answers it now; the run then finishes normally.
  const answered = host.respondToPermission('agent-1', 'req-old', {
    behavior: 'allow',
    updatedInput: { answers: {} },
  });
  assert.equal(answered, true);

  await appendLogLines(logPath, [{ type: 'result', result: 'thanks', session_id: 'sess-1' }]);

  await waitFor(() => host.reapCalls.length === 1, 3000);
  const result = await promise;

  assert.equal(result.result, 'thanks');
  assert.equal(result.stopped, false);
});
