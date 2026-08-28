import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InboxPullRequest, PullRequestChecks, PullRequestInbox } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import {
  buildJarvisBriefing,
  type JarvisAction,
  type JarvisAgent,
} from './jarvisBriefingModel';

type JarvisBriefingProps = {
  systemsOk: boolean;
  systemsPartial: boolean;
  githubConfigured: boolean;
  agents: JarvisAgent[];
  inbox: PullRequestInbox | null | undefined;
};

function collectCachedFailingPrs(
  queryClient: ReturnType<typeof useQueryClient>,
  inbox: PullRequestInbox | null | undefined,
) {
  if (!inbox) return [];
  const failing: Array<{ pr: InboxPullRequest; failing: number }> = [];
  for (const pr of inbox.authored) {
    const data = queryClient.getQueryData<PullRequestChecks>([
      'pr',
      pr.owner,
      pr.repo,
      pr.number,
      'checks',
    ]);
    if (data && data.failing > 0) {
      failing.push({ pr, failing: data.failing });
    }
  }
  return failing;
}

export function JarvisBriefing({
  systemsOk,
  systemsPartial,
  githubConfigured,
  agents,
  inbox,
}: JarvisBriefingProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cachedFailingPrs = useMemo(
    () => collectCachedFailingPrs(queryClient, inbox),
    [queryClient, inbox],
  );

  const briefing = useMemo(
    () =>
      buildJarvisBriefing({
        systemsOk,
        systemsPartial,
        githubConfigured,
        agents,
        inbox: inbox ?? null,
        cachedFailingPrs,
      }),
    [systemsOk, systemsPartial, githubConfigured, agents, inbox, cachedFailingPrs],
  );

  const startTemplate = useMutation({
    mutationFn: async (action: Extract<JarvisAction, { type: 'start-pr-template' }>) => {
      const result = await api.createAgentFromPr({
        owner: action.pr.owner,
        repo: action.pr.repo,
        prNumber: action.pr.number,
        template: action.template as 'fix-ci' | 'address-review',
      });
      return { agentId: result.agent.id, template: action.template, sessionId: result.sessionId };
    },
    onSuccess: ({ agentId, template, sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
      navigate(`/agents/${agentId}`, {
        state: sessionId ? { sessionId } : { sessionTemplate: template },
      });
    },
  });

  const runAction = (action: JarvisAction) => {
    if (action.type === 'navigate') {
      navigate(action.to, action.state ? { state: action.state } : undefined);
      return;
    }
    startTemplate.mutate(action);
  };

  return (
    <Stack spacing={1.5} sx={{ mt: 0.5, maxWidth: 720 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <AutoAwesomeOutlinedIcon sx={{ color: 'secondary.main', mt: 0.35, flexShrink: 0 }} />
        <Typography color="text.secondary" sx={{ lineHeight: 1.55, overflowWrap: 'anywhere' }}>
          {briefing.summary}
        </Typography>
      </Stack>

      {briefing.actions.length > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', pl: { xs: 0, sm: 4 } }}>
          {briefing.actions.map((action) => (
            <ControlTooltip
              key={action.id}
              title={
                action.type === 'start-pr-template'
                  ? `Start a ${action.template === 'fix-ci' ? 'Fix CI' : 'review'} session for this pull request`
                  : undefined
              }
              disabled={action.type !== 'start-pr-template'}
            >
              <Button
                size="small"
                variant={action.id.startsWith('blocked:') ? 'contained' : 'outlined'}
                color={action.id.startsWith('blocked:') ? 'warning' : 'secondary'}
                disabled={startTemplate.isPending}
                onClick={() => runAction(action)}
                startIcon={
                  startTemplate.isPending && startTemplate.variables?.id === action.id ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : undefined
                }
              >
                {action.label}
              </Button>
            </ControlTooltip>
          ))}
        </Stack>
      ) : null}

      {startTemplate.error ? (
        <Alert severity="error" sx={{ ml: { xs: 0, sm: 4 } }}>
          {(startTemplate.error as Error).message}
        </Alert>
      ) : null}
    </Stack>
  );
}
