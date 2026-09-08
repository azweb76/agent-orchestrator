import { useMemo, useState } from 'react';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentDetail, ChatSession, TaskSuggestion } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { paletteShortcutLabel } from '../commandPalette/paletteCommands';
import { ControlTooltip } from '../ui/ControlTooltip';
import { isOpenInNewChatClick } from './taskSuggestionActions';

const FOLLOWUP_MOD = paletteShortcutLabel().startsWith('⌘') ? '⌘' : 'Ctrl';
const FOLLOWUP_CLICK_HINT = `Click to send in this chat · ${FOLLOWUP_MOD}-click for a new chat`;

interface TaskSuggestionsBannerProps {
  agentId: string;
  agent: Pick<AgentDetail, 'taskSuggestions'>;
  session: Pick<ChatSession, 'id' | 'status'> | undefined;
  isStreaming: boolean;
  archived?: boolean;
  onSelect: (suggestion: TaskSuggestion, options?: { openInNewChat?: boolean }) => void;
}

/**
 * AI-selected follow-ups from the user-managed catalog. The banner renders
 * whatever the server stored — no status-driven extra chips.
 */
export function TaskSuggestionsBanner({
  agentId,
  agent,
  session,
  isStreaming,
  archived,
  onSelect,
}: TaskSuggestionsBannerProps) {
  const queryClient = useQueryClient();
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshMutation = useMutation({
    mutationFn: (sessionId: string) => api.refreshTaskSuggestions(agentId, sessionId),
    onSuccess: async () => {
      setRefreshError(null);
      setDismissedSessionId(null);
      await queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
    onError: (error: Error) => {
      setRefreshError(error.message || 'Failed to refresh follow-ups');
    },
  });

  const suggestions = useMemo(() => {
    if (!session) return [] as TaskSuggestion[];
    const offer = agent.taskSuggestions;
    if (!offer || offer.sessionId !== session.id) return [] as TaskSuggestion[];
    return offer.suggestions;
  }, [agent.taskSuggestions, session]);

  if (!session || isStreaming || archived) return null;
  if (session.status !== 'idle') return null;

  const dismissed = dismissedSessionId === session.id;
  const refreshing = refreshMutation.isPending;
  const hasOffer = Boolean(
    agent.taskSuggestions && agent.taskSuggestions.sessionId === session.id,
  );
  const showChips = !dismissed && suggestions.length > 0;

  const refresh = () => {
    if (refreshing) return;
    setRefreshError(null);
    refreshMutation.mutate(session.id);
  };

  if (!showChips) {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        <ControlTooltip title="Ask AI which follow-ups fit this session">
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={
              refreshing ? (
                <CircularProgress color="inherit" size={14} />
              ) : (
                <LightbulbOutlinedIcon fontSize="small" />
              )
            }
            disabled={refreshing}
            onClick={refresh}
          >
            {hasOffer || dismissed ? 'Refresh follow-ups' : 'Suggest follow-ups'}
          </Button>
        </ControlTooltip>
        {refreshError ? (
          <span style={{ fontSize: 13, opacity: 0.85 }}>{refreshError}</span>
        ) : null}
      </Stack>
    );
  }

  return (
    <Alert
      severity="info"
      icon={<LightbulbOutlinedIcon />}
      sx={{ mb: 1 }}
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <ControlTooltip title="Regenerate follow-up suggestions">
            <Button
              color="inherit"
              size="small"
              startIcon={
                refreshing ? <CircularProgress color="inherit" size={14} /> : <RefreshIcon />
              }
              disabled={refreshing}
              onClick={refresh}
            >
              Refresh
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Dismiss these suggestions for now">
            <Button
              color="inherit"
              size="small"
              disabled={refreshing}
              onClick={() => setDismissedSessionId(session.id)}
            >
              Dismiss
            </Button>
          </ControlTooltip>
        </Stack>
      }
    >
      <Stack spacing={1}>
        <span>Suggested follow-ups for this session:</span>
        {refreshError ? <span style={{ opacity: 0.85 }}>{refreshError}</span> : null}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {suggestions.map((suggestion) => (
            <ControlTooltip
              key={suggestion.id}
              title={`${suggestion.description?.trim() || suggestion.prompt} · ${FOLLOWUP_CLICK_HINT}`}
            >
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                disabled={refreshing}
                onClick={(event) => {
                  setDismissedSessionId(session.id);
                  onSelect(suggestion, { openInNewChat: isOpenInNewChatClick(event) });
                }}
              >
                {suggestion.title}
              </Button>
            </ControlTooltip>
          ))}
        </Stack>
      </Stack>
    </Alert>
  );
}
