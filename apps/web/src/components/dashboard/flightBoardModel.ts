import {
  AGENT_DELIVERY_PHASE_LABELS,
  AGENT_FLIGHT_LEG_LABELS,
  isFlightActivityActive,
  resolveAgentFlightLeg,
  type AgentDeliveryPhase,
  type AgentFlightLeg,
  type AgentStatus,
} from '@agent-orchestrator/shared';
import type { DashboardAgent } from './dashboardAgents';

export interface FlightBoardFlight {
  id: string;
  name: string;
  workspaceName: string;
  workspaceId: string;
  status: AgentStatus;
  phase: AgentDeliveryPhase;
  leg: AgentFlightLeg;
  active: boolean;
  awaitingClearance: boolean;
  stalled: boolean;
  callsign: string;
}

export interface FlightBoardLanes {
  boarding: FlightBoardFlight[];
  en_route: FlightBoardFlight[];
  approach: FlightBoardFlight[];
  landed: FlightBoardFlight[];
}

/**
 * When automation poll is cold, sidebar may still say "planning" for merged PRs.
 * Overlay live `/fleet/merged-agents` ids onto delivery phase before lane grouping.
 */
export function withMergedFlightPhases(
  agents: DashboardAgent[],
  mergedAgentIds: ReadonlySet<string> | readonly string[],
): DashboardAgent[] {
  const ids = mergedAgentIds instanceof Set ? mergedAgentIds : new Set(mergedAgentIds);
  if (ids.size === 0) return agents;
  return agents.map((agent) => {
    if (!ids.has(agent.id)) return agent;
    if (agent.deliveryPhase === 'merged' || agent.deliveryPhase === 'archived') return agent;
    return {
      ...agent,
      deliveryPhase: 'merged',
      prStatus: agent.prStatus
        ? { ...agent.prStatus, merged: true, state: 'closed' as const }
        : {
            state: 'closed' as const,
            draft: false,
            merged: true,
            checksRollup: 'none' as const,
            updatedAt: new Date().toISOString(),
          },
    };
  });
}

export function toFlightBoardFlight(agent: DashboardAgent): FlightBoardFlight {
  const phase = agent.deliveryPhase;
  const leg = resolveAgentFlightLeg(phase);
  return {
    id: agent.id,
    name: agent.name,
    workspaceName: agent.workspaceName,
    workspaceId: agent.workspaceId,
    status: agent.status,
    phase,
    leg,
    active: isFlightActivityActive(agent.status),
    awaitingClearance: (agent.pendingPermissionCount ?? 0) > 0,
    stalled: Boolean(agent.stalled),
    callsign: shortCallsign(agent.name),
  };
}

export function groupFlightsByLane(agents: DashboardAgent[]): FlightBoardLanes {
  const lanes: FlightBoardLanes = {
    boarding: [],
    en_route: [],
    approach: [],
    landed: [],
  };
  for (const agent of agents) {
    if (agent.status === 'archived') continue;
    const flight = toFlightBoardFlight(agent);
    if (flight.leg === 'hangared') continue;
    lanes[flight.leg].push(flight);
  }
  const rank = (f: FlightBoardFlight) => {
    if (f.awaitingClearance) return 0;
    if (f.active) return 1;
    return 2;
  };
  for (const key of Object.keys(lanes) as (keyof FlightBoardLanes)[]) {
    lanes[key].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  return lanes;
}

export function flightTooltip(flight: FlightBoardFlight): string {
  const parts = [
    AGENT_FLIGHT_LEG_LABELS[flight.leg],
    AGENT_DELIVERY_PHASE_LABELS[flight.phase],
    flight.workspaceName,
  ];
  if (flight.awaitingClearance) parts.push('Awaiting clearance');
  if (!flight.active && flight.leg === 'boarding') parts.push('Luggage paused');
  if (flight.leg === 'landed') parts.push('Unloading');
  return parts.join(' · ');
}

function shortCallsign(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FLT';
  if (parts.length === 1) return parts[0].slice(0, 8).toUpperCase();
  return `${parts[0].slice(0, 3)}${parts[1].slice(0, 3)}`.toUpperCase();
}
