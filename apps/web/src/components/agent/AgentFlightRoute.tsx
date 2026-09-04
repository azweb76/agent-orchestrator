import { Box, Stack, Typography, keyframes, useTheme } from '@mui/material';
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined';
import {
  AGENT_DELIVERY_PHASE_LABELS,
  AGENT_FLIGHT_LEG_LABELS,
  AGENT_FLIGHT_LEG_VERBS,
  isFlightActivityActive,
  isFlightTurbulence,
  resolveAgentDeliveryPhase,
  resolveAgentFlightLeg,
  type AgentDetail,
  type AgentFlightLeg,
} from '@agent-orchestrator/shared';
import { useAgentLinkedPr } from './useAgentLinkedPr';
import { ControlTooltip } from '../ui/ControlTooltip';

const luggageLoad = keyframes`
  0% { transform: translateY(4px); opacity: 0.3; }
  50% { transform: translateY(-2px); opacity: 1; }
  100% { transform: translateY(-8px); opacity: 0; }
`;

const cruiseBob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
`;

const approachNudge = keyframes`
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(3px); }
`;

const turbulenceShake = keyframes`
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(-2px); }
  60% { transform: translateX(2px); }
`;

const LEG_ORDER: AgentFlightLeg[] = ['boarding', 'en_route', 'approach', 'landed'];

export interface AgentFlightRouteProps {
  agent: AgentDetail;
  archived: boolean;
}

export function AgentFlightRoute({ agent, archived }: AgentFlightRouteProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const { pr, checks } = useAgentLinkedPr(agent);
  const phase = resolveAgentDeliveryPhase({
    archived,
    agentStatus: agent.status,
    sessions: agent.sessions,
    needsDraftPr: Boolean(agent.draftPrOffer),
    pr: pr ?? null,
    checks: checks ?? null,
  });
  const leg = resolveAgentFlightLeg(phase);
  const turbulence = isFlightTurbulence(phase);
  const active = isFlightActivityActive(agent.status);
  const currentIndex = Math.max(0, LEG_ORDER.indexOf(leg === 'hangared' ? 'landed' : leg));

  const planeAnimation = turbulence
    ? `${turbulenceShake} 0.5s ease-in-out infinite`
    : leg === 'boarding' && active
      ? `${luggageLoad} 1.6s ease-in-out infinite`
      : leg === 'en_route'
        ? `${cruiseBob} 2s ease-in-out infinite`
        : leg === 'approach'
          ? `${approachNudge} 1.8s ease-in-out infinite`
          : undefined;

  return (
    <ControlTooltip
      title={`${AGENT_FLIGHT_LEG_LABELS[leg]} · ${AGENT_DELIVERY_PHASE_LABELS[phase]}${
        turbulence ? ' · Turbulence' : ''
      }${!active && leg === 'boarding' ? ' · Luggage paused' : ''}`}
    >
      <Box
        sx={{
          mt: 1,
          px: 1.25,
          py: 1,
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: turbulence ? ao.accent.errorBorder : 'divider',
          bgcolor: ao.surface.panelMuted,
          maxWidth: 420,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
          <Box
            sx={{
              color: turbulence ? 'error.main' : 'info.main',
              display: 'inline-flex',
              animation: planeAnimation,
              animationPlayState: active || turbulence || leg === 'approach' || leg === 'en_route'
                ? 'running'
                : 'paused',
            }}
          >
            <FlightTakeoffOutlinedIcon sx={{ fontSize: 16 }} />
          </Box>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              fontWeight: 700,
            }}
          >
            {AGENT_FLIGHT_LEG_VERBS[leg]}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {AGENT_DELIVERY_PHASE_LABELS[phase]}
          </Typography>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0.5,
            position: 'relative',
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '12%',
              right: '12%',
              top: 7,
              height: 2,
              bgcolor: 'divider',
              borderRadius: 1,
            }}
          />
          {LEG_ORDER.map((step, index) => {
            const reached = index <= currentIndex;
            const current = index === currentIndex && leg !== 'hangared';
            return (
              <Stack key={step} spacing={0.35} sx={{ alignItems: 'center', position: 'relative' }}>
                <Box
                  sx={{
                    width: current ? 12 : 8,
                    height: current ? 12 : 8,
                    borderRadius: '50%',
                    bgcolor: reached
                      ? turbulence && current
                        ? 'error.main'
                        : index === 3
                          ? 'success.main'
                          : 'info.main'
                      : 'action.disabledBackground',
                    boxShadow: current
                      ? `0 0 10px ${turbulence ? theme.palette.error.main : theme.palette.info.main}`
                      : 'none',
                    zIndex: 1,
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.58rem',
                    fontFamily: 'IBM Plex Mono, monospace',
                    color: current ? 'text.primary' : 'text.secondary',
                    textAlign: 'center',
                    lineHeight: 1.1,
                  }}
                >
                  {AGENT_FLIGHT_LEG_LABELS[step]}
                </Typography>
              </Stack>
            );
          })}
        </Box>

        {leg === 'boarding' && (
          <Box
            aria-hidden
            sx={{
              mt: 0.75,
              width: 8,
              height: 6,
              borderRadius: 0.4,
              bgcolor: 'warning.main',
              animation: `${luggageLoad} 1.6s ease-in-out infinite`,
              animationPlayState: active ? 'running' : 'paused',
              opacity: active ? 1 : 0.4,
            }}
          />
        )}
      </Box>
    </ControlTooltip>
  );
}
