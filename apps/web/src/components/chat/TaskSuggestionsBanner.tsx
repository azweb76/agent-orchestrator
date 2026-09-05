import { useMemo, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useQuery } from '@tanstack/react-query';
import {
  filterApplicableTaskFollowUps,
  type AgentDetail,
  type ChatSession,
  type TaskSuggestion,
  type TaskSuggestionChangeStatus,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';

interface TaskSuggestionsBannerProps {
  agentId: string;
  agent: Pick<AgentDetail, 'taskSuggestions' | 'worktree' | 'prStatus'>;
  session: Pick<ChatSession, 'id' | 'status'> | undefined;
  isStreaming: boolean;
  archived?: boolean;
  onSelect: (suggestion: TaskSuggestion) => void;
}

/**
 * AI-selected follow-ups from the user-managed catalog. Live diffs only drop
 * status chips that are no longer applicable (never re-add AI-omitted ones).
 */
export function TaskSuggestionsBanner({
  agentId,
  agent,
  session,
  isStreaming,
  archived,
  onSelect,
}: TaskSuggestionsBannerProps) {
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ['diff', agentId, 'pending'],
    queryFn: () => api.getDiff(agentId, 'pending'),
    enabled: Boolean(agentId) && !archived,
    staleTime: 10_000,
  });
  const prDiffQuery = useQuery({
    queryKey: ['diff', agentId, 'pr'],
    queryFn: () => api.getDiff(agentId, 'pr'),
    enabled: Boolean(agentId) && !archived,
    staleTime: 10_000,
  });

  const suggestions = useMemo(() => {
    if (!session) return [] as TaskSuggestion[];
    const offer = agent.taskSuggestions;
    if (!offer || offer.sessionId !== session.id) return [] as TaskSuggestion[];

    const hasPendingChanges = Boolean(
      pendingQuery.data?.patch?.trim() || pendingQuery.data?.stat?.trim(),
    );
    const hasBranchDiff =
      hasPendingChanges ||
      Boolean(prDiffQuery.data?.patch?.trim() || prDiffQuery.data?.stat?.trim());
    const changeStatus: TaskSuggestionChangeStatus = {
      hasPendingChanges,
      hasBranchDiff,
      hasOpenPr: agent.worktree.prNumber != null,
      pr: agent.prStatus,
    };

    return filterApplicableTaskFollowUps(
      offer.suggestions.map((s) => ({
        ...s,
        kind: s.kind ?? 'prompt',
        template: s.template ?? null,
      })),
      changeStatus,
    ).map(({ template, ...rest }) => ({
      ...rest,
      template: template ?? undefined,
    }));
  }, [
    agent.prStatus,
    agent.taskSuggestions,
    agent.worktree.prNumber,
    pendingQuery.data?.patch,
    pendingQuery.data?.stat,
    prDiffQuery.data?.patch,
    prDiffQuery.data?.stat,
    session,
  ]);

  if (!session || isStreaming) return null;
  if (session.status !== 'idle') return null;
  if (dismissedSessionId === session.id) return null;
  if (!suggestions.length) return null;

  return (
    <Alert
      severity="info"
      icon={<LightbulbOutlinedIcon />}
      sx={{ mb: 1 }}
      action={
        <ControlTooltip title="Dismiss these suggestions for now">
          <Button color="inherit" size="small" onClick={() => setDismissedSessionId(session.id)}>
            Dismiss
          </Button>
        </ControlTooltip>
      }
    >
      <Stack spacing={1}>
        <span>Suggested follow-ups for this session:</span>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {suggestions.map((suggestion) => (
            <ControlTooltip
              key={suggestion.id}
              title={suggestion.description?.trim() || suggestion.prompt}
            >
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={() => {
                  setDismissedSessionId(session.id);
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
