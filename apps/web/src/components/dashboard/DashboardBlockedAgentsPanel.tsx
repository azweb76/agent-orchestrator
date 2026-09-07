import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import NotificationImportantOutlinedIcon from '@mui/icons-material/NotificationImportantOutlined';
import { buildBlockedAgentPrompt } from '@agent-orchestrator/shared';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import { useSendAssistantPrompt } from './useSendAssistantPrompt';
import type { DashboardAgent } from './dashboardAgents';

interface DashboardBlockedAgentsPanelProps {
  agents: DashboardAgent[];
}

export function DashboardBlockedAgentsPanel({ agents }: DashboardBlockedAgentsPanelProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const assistant = useSendAssistantPrompt();

  if (agents.length === 0) return null;

  return (
    <HudPanel
      sx={{
        borderColor: 'ao.accent.warningBorder',
        '&::before': {
          background: `linear-gradient(135deg, ${ao.accent.warningTintStrong} 0%, transparent 45%, ${ao.accent.warningTint} 100%)`,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <NotificationImportantOutlinedIcon sx={{ color: 'warning.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Needs attention</SectionLabel>
          <Typography variant="h6">
            {agents.length === 1
              ? '1 agent is waiting on you'
              : `${agents.length} agents are waiting on you`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Ask Assistant to unblock — permissions still need your confirm in chat.
          </Typography>
        </Box>
        {agents.length > 1 ? (
          <Button
            size="small"
            variant="contained"
            color="warning"
            disabled={assistant.sending}
            onClick={() => {
              const prompt =
                `${agents.length} agents are waiting on permissions (` +
                `${agents.map((a) => `${a.name} (${a.id})`).join(', ')}). ` +
                'List pending permissions and help me unblock them.';
              void assistant.sendPrompt(prompt);
            }}
            sx={{ flexShrink: 0, textTransform: 'none' }}
          >
            Unblock all
          </Button>
        ) : null}
      </Stack>
      <Stack spacing={0.75}>
        {agents.map((agent) => {
          const starter = buildBlockedAgentPrompt({ agentId: agent.id, name: agent.name });
          return (
            <Box
              key={agent.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                border: '1px solid',
                borderColor: 'ao.accent.warningBorder',
                borderRadius: 1.5,
                px: 1.75,
                py: 1,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {agent.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {agent.workspaceName} · {agent.worktree.branch}
                </Typography>
              </Box>
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={
                  agent.pendingPermissionCount === 1
                    ? '1 pending prompt'
                    : `${agent.pendingPermissionCount} pending prompts`
                }
                sx={{ flexShrink: 0 }}
              />
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={assistant.sending}
                onClick={() => void assistant.sendPrompt(starter.prompt)}
                sx={{ flexShrink: 0, textTransform: 'none' }}
              >
                Ask Assistant
              </Button>
              <Button
                size="small"
                component={RouterLink}
                to={`/agents/${agent.id}`}
                sx={{ flexShrink: 0, textTransform: 'none' }}
              >
                Open
              </Button>
            </Box>
          );
        })}
      </Stack>
      {assistant.sending ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
          <CircularProgress size={14} color="warning" />
          <Typography variant="caption" color="text.secondary">
            Sending to Assistant…
          </Typography>
        </Stack>
      ) : null}
      {assistant.error ? (
        <Alert severity="error" sx={{ mt: 1 }} onClose={assistant.clearError}>
          {assistant.error}
        </Alert>
      ) : null}
    </HudPanel>
  );
}
