import { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import type { AgentDetail, ChatSession, TaskSuggestion } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';

interface TaskSuggestionsBannerProps {
  agent: Pick<AgentDetail, 'taskSuggestions'>;
  session: Pick<ChatSession, 'id' | 'status'> | undefined;
  isStreaming: boolean;
  onSelect: (suggestion: TaskSuggestion) => void;
}

/**
 * After any session finishes, offers LLM-suggested follow-up prompts that
 * send into the current chat when selected.
 */
export function TaskSuggestionsBanner({
  agent,
  session,
  isStreaming,
  onSelect,
}: TaskSuggestionsBannerProps) {
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const offer = agent.taskSuggestions;
  if (!offer || isStreaming) return null;
  if (!session || session.id !== offer.sessionId) return null;
  if (session.status !== 'idle') return null;
  if (dismissedSessionId === offer.sessionId) return null;
  if (!offer.suggestions.length) return null;

  return (
    <Alert
      severity="info"
      icon={<LightbulbOutlinedIcon />}
      sx={{ mb: 1 }}
      action={
        <ControlTooltip title="Dismiss these suggestions for now">
          <Button color="inherit" size="small" onClick={() => setDismissedSessionId(offer.sessionId)}>
            Dismiss
          </Button>
        </ControlTooltip>
      }
    >
      <Stack spacing={1}>
        <span>Suggested follow-ups for this session:</span>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {offer.suggestions.map((suggestion) => (
            <ControlTooltip key={suggestion.id} title={suggestion.prompt}>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={() => {
                  setDismissedSessionId(offer.sessionId);
                  onSelect(suggestion);
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
