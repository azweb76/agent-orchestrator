import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AppEvent, AppEventType } from '@agent-orchestrator/shared';
import { invalidateForEvent } from './events';

function testEvent(
  type: AppEventType,
  overrides: Partial<AppEvent> = {},
): AppEvent {
  return {
    id: 'evt-1',
    type,
    agentId: null,
    sessionId: null,
    data: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function collectInvalidatedKeys(queryClient: QueryClient, event: AppEvent): string[][] {
  const keys: string[][] = [];
  const invalidate = vi
    .spyOn(queryClient, 'invalidateQueries')
    .mockImplementation((filters) => {
      if (filters?.queryKey) keys.push(filters.queryKey as string[]);
      return Promise.resolve();
    });
  invalidateForEvent(queryClient, event);
  invalidate.mockRestore();
  return keys;
}

describe('invalidateForEvent', () => {
  it('agent_changed invalidates sidebar and agent only, not message prefixes', () => {
    const queryClient = new QueryClient();
    const keys = collectInvalidatedKeys(
      queryClient,
      testEvent('agent_changed', { agentId: 'ag-1' }),
    );

    expect(keys).toEqual([['sidebar'], ['agent', 'ag-1']]);
    expect(keys.some((key) => key[0] === 'messages')).toBe(false);
    expect(keys.some((key) => key[0] === 'permissions')).toBe(false);
    expect(keys.some((key) => key[0] === 'queue')).toBe(false);
    expect(keys.some((key) => key[0] === 'status')).toBe(false);
  });

  it('permission_request invalidates only the session permissions query', () => {
    const queryClient = new QueryClient();
    const keys = collectInvalidatedKeys(
      queryClient,
      testEvent('permission_request', { agentId: 'ag-1', sessionId: 'sess-1' }),
    );

    expect(keys).toEqual([['permissions', 'ag-1', 'sess-1']]);
    expect(keys.some((key) => key[0] === 'sidebar')).toBe(false);
  });

  it('run_finished scopes messages to the session when sessionId is present', () => {
    const queryClient = new QueryClient();
    const keys = collectInvalidatedKeys(
      queryClient,
      testEvent('run_finished', { agentId: 'ag-1', sessionId: 'sess-1' }),
    );

    expect(keys).toContainEqual(['messages', 'ag-1', 'sess-1']);
    expect(keys.filter((key) => key[0] === 'messages')).toHaveLength(1);
  });

  it('queue_changed invalidates only the session queue query', () => {
    const queryClient = new QueryClient();
    const keys = collectInvalidatedKeys(
      queryClient,
      testEvent('queue_changed', { agentId: 'ag-1', sessionId: 'sess-1' }),
    );

    expect(keys).toEqual([['queue', 'ag-1', 'sess-1']]);
  });

  it('github_pr_changed invalidates inbox, agent, and the matching PR queries', () => {
    const queryClient = new QueryClient();
    const keys = collectInvalidatedKeys(
      queryClient,
      testEvent('github_pr_changed', {
        agentId: 'ag-1',
        data: { owner: 'acme', repo: 'app', number: 7, kind: 'checks' },
      }),
    );

    expect(keys).toEqual([
      ['pulls-inbox'],
      ['agent', 'ag-1'],
      ['pr', 'acme', 'app', 7],
    ]);
  });
});
