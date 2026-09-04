import { describe, expect, it } from 'vitest';
import {
  isFlightActivityActive,
  resolveAgentDeliveryPhaseFromPrStatus,
  resolveAgentFlightLeg,
} from '@agent-orchestrator/shared';
import { groupFlightsByLane, toFlightBoardFlight, withMergedFlightPhases } from './flightBoardModel';
import { positionFlights, radarPolar } from './flightMapLayout';
import type { DashboardAgent } from './dashboardAgents';

function makeAgent(overrides: Partial<DashboardAgent> = {}): DashboardAgent {
  return {
    id: 'agent-1',
    worktreeId: 'wt-1',
    name: 'Fix login bug',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    worktree: { id: 'wt-1', name: 'feat', branch: 'feat/x', prNumber: null },
    pendingPermissionCount: 0,
    prStatus: null,
    deliveryPhase: 'planning',
    workspaceName: 'demo',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('agent flight legs', () => {
  it('maps delivery phases onto boarding / en route / approach / landed', () => {
    expect(resolveAgentFlightLeg('planning')).toBe('boarding');
    expect(resolveAgentFlightLeg('building')).toBe('en_route');
    expect(resolveAgentFlightLeg('needs_pr')).toBe('en_route');
    expect(resolveAgentFlightLeg('pr_draft')).toBe('approach');
    expect(resolveAgentFlightLeg('checks_failing')).toBe('approach');
    expect(resolveAgentFlightLeg('merged')).toBe('landed');
    expect(resolveAgentFlightLeg('archived')).toBe('hangared');
  });

  it('treats idle boarding as inactive (paused luggage)', () => {
    expect(isFlightActivityActive('idle')).toBe(false);
    expect(isFlightActivityActive('running')).toBe(true);
    expect(isFlightActivityActive('queued')).toBe(true);
  });

  it('resolves phase from PR snapshot + sessions', () => {
    expect(
      resolveAgentDeliveryPhaseFromPrStatus({
        sessions: [{ template: 'chat', status: 'running', permissionMode: 'plan' }],
      }),
    ).toBe('planning');

    expect(
      resolveAgentDeliveryPhaseFromPrStatus({
        agentStatus: 'running',
        sessions: [{ template: 'build', status: 'running', permissionMode: 'auto' }],
      }),
    ).toBe('building');

    expect(
      resolveAgentDeliveryPhaseFromPrStatus({
        prStatus: {
          state: 'open',
          draft: false,
          merged: false,
          checksRollup: 'failure',
          updatedAt: '2026-01-01T00:00:00.000Z',
          checksFailing: 2,
        },
      }),
    ).toBe('checks_failing');

    expect(
      resolveAgentDeliveryPhaseFromPrStatus({
        prStatus: {
          state: 'closed',
          draft: false,
          merged: true,
          checksRollup: 'none',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).toBe('merged');

    expect(
      resolveAgentDeliveryPhaseFromPrStatus({
        hasLinkedPr: true,
      }),
    ).toBe('awaiting_review');
  });
});

describe('withMergedFlightPhases', () => {
  it('overrides cold planning phase when the fleet reports a merged PR', () => {
    const agents = [
      makeAgent({ id: 'a1', deliveryPhase: 'planning', worktree: { id: 'wt-1', name: 'feat', branch: 'feat/x', prNumber: 9 } }),
      makeAgent({ id: 'a2', deliveryPhase: 'building', status: 'running' }),
    ];
    const next = withMergedFlightPhases(agents, ['a1']);
    expect(next[0]?.deliveryPhase).toBe('merged');
    expect(next[0]?.prStatus?.merged).toBe(true);
    expect(next[1]?.deliveryPhase).toBe('building');
  });
});

describe('groupFlightsByLane', () => {
  it('groups agents and skips archived / hangared', () => {
    const lanes = groupFlightsByLane([
      makeAgent({ id: 'a1', deliveryPhase: 'planning', status: 'idle' }),
      makeAgent({ id: 'a2', name: 'Build feature', deliveryPhase: 'building', status: 'running' }),
      makeAgent({ id: 'a3', name: 'Review PR', deliveryPhase: 'checks_failing', status: 'idle' }),
      makeAgent({ id: 'a4', name: 'Shipped', deliveryPhase: 'merged', status: 'idle' }),
      makeAgent({ id: 'a5', name: 'Old', deliveryPhase: 'archived', status: 'archived' }),
    ]);

    expect(lanes.boarding).toHaveLength(1);
    expect(lanes.en_route).toHaveLength(1);
    expect(lanes.approach).toHaveLength(1);
    expect(lanes.landed).toHaveLength(1);
    expect(toFlightBoardFlight(makeAgent({ status: 'idle', deliveryPhase: 'planning' })).active).toBe(
      false,
    );
  });

  it('positions boarding near origin and landed near destination', () => {
    const lanes = groupFlightsByLane([
      makeAgent({ id: 'a1', deliveryPhase: 'planning' }),
      makeAgent({ id: 'a2', name: 'Build', deliveryPhase: 'building', status: 'running' }),
      makeAgent({ id: 'a3', name: 'Done', deliveryPhase: 'merged' }),
    ]);
    const placed = positionFlights(lanes);
    const boarding = placed.find((p) => p.flight.leg === 'boarding');
    const landed = placed.find((p) => p.flight.leg === 'landed');
    const enRoute = placed.find((p) => p.flight.leg === 'en_route');
    expect(boarding!.point.x).toBeLessThan(30);
    expect(landed!.point.x).toBeGreaterThan(80);
    expect(enRoute!.point.x).toBeGreaterThan(30);
    expect(enRoute!.point.x).toBeLessThan(80);
    const polar = radarPolar(enRoute!.point);
    expect(polar.radius).toBeGreaterThan(0);
    expect(polar.radius).toBeLessThanOrEqual(0.92);
  });
});
