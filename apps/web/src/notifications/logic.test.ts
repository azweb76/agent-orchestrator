import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@agent-orchestrator/shared';
import {
  describeNotificationEvent,
  isNotifiableEvent,
  isViewingAgent,
  navigationStateForEvent,
  shouldShowInAppAttention,
  shouldShowOsNotification,
} from './logic';

function makeEvent(partial: Partial<AppEvent> & Pick<AppEvent, 'type'>): AppEvent {
  return {
    id: partial.id ?? 'evt-1',
    type: partial.type,
    agentId: partial.agentId ?? 'agent-1',
    sessionId: partial.sessionId ?? 'session-1',
    data: partial.data ?? {},
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('describeNotificationEvent', () => {
  it('describes successful run completion', () => {
    expect(describeNotificationEvent(makeEvent({ type: 'run_finished' }), 'Alpha')).toEqual({
      title: 'Alpha finished',
      body: 'The reply is ready to review.',
    });
  });

  it('describes failed and stopped runs', () => {
    expect(
      describeNotificationEvent(
        makeEvent({ type: 'run_finished', data: { error: 'boom' } }),
        'Alpha',
      ),
    ).toEqual({ title: 'Alpha failed', body: 'boom' });
    expect(
      describeNotificationEvent(makeEvent({ type: 'run_finished', data: { stopped: true } }), 'Alpha'),
    ).toEqual({ title: 'Alpha stopped', body: 'The run was interrupted.' });
  });

  it('describes permission prompts', () => {
    expect(
      describeNotificationEvent(
        makeEvent({ type: 'permission_request', data: { toolName: 'AskUserQuestion' } }),
        'Alpha',
      ),
    ).toEqual({
      title: 'Alpha needs your input',
      body: 'Claude has a question for you.',
    });
  });

  it('returns null for unrelated events', () => {
    expect(describeNotificationEvent(makeEvent({ type: 'agent_changed' }), 'Alpha')).toBeNull();
  });
});

describe('isViewingAgent', () => {
  it('matches only a visible agent detail route', () => {
    expect(isViewingAgent('agent-1', '/agents/agent-1', 'visible')).toBe(true);
    expect(isViewingAgent('agent-1', '/agents/agent-2', 'visible')).toBe(false);
    expect(isViewingAgent('agent-1', '/agents/agent-1', 'hidden')).toBe(false);
    expect(isViewingAgent('agent-1', '/', 'visible')).toBe(false);
  });
});

describe('shouldShowOsNotification', () => {
  const runFinished = makeEvent({ type: 'run_finished' });

  it('shows in background tabs when enabled and granted', () => {
    expect(
      shouldShowOsNotification({
        event: runFinished,
        enabled: true,
        permission: 'granted',
        pathname: '/',
        visibilityState: 'hidden',
      }),
    ).toBe(true);
  });

  it('skips when viewing the agent or the tab is visible', () => {
    expect(
      shouldShowOsNotification({
        event: runFinished,
        enabled: true,
        permission: 'granted',
        pathname: '/agents/agent-1',
        visibilityState: 'visible',
      }),
    ).toBe(false);
    expect(
      shouldShowOsNotification({
        event: runFinished,
        enabled: true,
        permission: 'granted',
        pathname: '/',
        visibilityState: 'visible',
      }),
    ).toBe(false);
  });

  it('skips when disabled or permission is not granted', () => {
    expect(
      shouldShowOsNotification({
        event: runFinished,
        enabled: false,
        permission: 'granted',
        pathname: '/',
        visibilityState: 'hidden',
      }),
    ).toBe(false);
    expect(
      shouldShowOsNotification({
        event: runFinished,
        enabled: true,
        permission: 'denied',
        pathname: '/',
        visibilityState: 'hidden',
      }),
    ).toBe(false);
  });
});

describe('shouldShowInAppAttention', () => {
  const permissionRequest = makeEvent({ type: 'permission_request' });

  it('shows while the app is visible on another route', () => {
    expect(
      shouldShowInAppAttention({
        event: permissionRequest,
        pathname: '/',
        visibilityState: 'visible',
      }),
    ).toBe(true);
  });

  it('skips when already viewing the agent or the tab is hidden', () => {
    expect(
      shouldShowInAppAttention({
        event: permissionRequest,
        pathname: '/agents/agent-1',
        visibilityState: 'visible',
      }),
    ).toBe(false);
    expect(
      shouldShowInAppAttention({
        event: permissionRequest,
        pathname: '/',
        visibilityState: 'hidden',
      }),
    ).toBe(false);
  });

  it('ignores non-notifiable events', () => {
    expect(
      shouldShowInAppAttention({
        event: makeEvent({ type: 'queue_changed' }),
        pathname: '/',
        visibilityState: 'visible',
      }),
    ).toBe(false);
    expect(isNotifiableEvent(makeEvent({ type: 'queue_changed' }))).toBe(false);
  });
});

describe('navigationStateForEvent', () => {
  it('routes permission requests to needs-input focus', () => {
    expect(
      navigationStateForEvent(makeEvent({ type: 'permission_request', sessionId: 's-9' })),
    ).toEqual({ focusAttention: 'needs-input', sessionId: 's-9' });
  });

  it('routes finished runs to run-finished focus', () => {
    expect(navigationStateForEvent(makeEvent({ type: 'run_finished' }))).toEqual({
      focusAttention: 'run-finished',
      sessionId: 'session-1',
    });
  });
});
