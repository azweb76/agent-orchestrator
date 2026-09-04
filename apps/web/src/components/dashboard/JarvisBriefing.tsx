import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  buildWorkQueue,
  type InboxIssue,
  type InboxJiraIssue,
  type InboxPullRequest,
  type PullRequestChecks,
  type PullRequestInbox,
  type WorkItem,
  type WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { JiraWorkspacePickerDialog } from './JiraWorkspacePickerDialog';
import { dismissWorkItem, readDismissedWorkItemIds } from './workQueueDismiss';
import type { JarvisAgent } from './jarvisBriefingModel';

type JarvisBriefingProps = {
  systemsOk: boolean;
  systemsPartial: boolean;
  githubConfigured: boolean;
  agents: JarvisAgent[];
  inbox: PullRequestInbox | null | undefined;
  githubIssues?: InboxIssue[];
  jiraIssues?: InboxJiraIssue[];
  workspaces?: WorkspaceWithCounts[];
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
  githubIssues = [],
  jiraIssues = [],
  workspaces = [],
}: JarvisBriefingProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissedVersion, setDismissedVersion] = useState(0);
  const [jiraPick, setJiraPick] = useState<InboxJiraIssue | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const cachedFailingPrs = useMemo(
    () => collectCachedFailingPrs(queryClient, inbox),
    [queryClient, inbox],
  );

  const dismissedIds = useMemo(() => {
    void dismissedVersion;
    return readDismissedWorkItemIds();
  }, [dismissedVersion]);

  const briefing = useMemo(() => {
    const queue = buildWorkQueue({
      agents,
      inbox: inbox ?? null,
      failingPrs: cachedFailingPrs,
      githubIssues,
      jiraIssues,
      dismissedIds,
      limit: 8,
    });

    if (queue.items.length > 0) return queue;

    if (!systemsOk) {
      return {
        ...queue,
        summary: systemsPartial
          ? 'Some systems still need setup — check Claude Code and GitHub connectivity.'
          : 'Configure Claude Code and a GitHub token to get started.',
      };
    }
    if (!githubConfigured) {
      return {
        ...queue,
        summary: 'All systems nominal. Clone a workspace to spin up your first agent.',
      };
    }
    return queue;
  }, [
    agents,
    inbox,
    cachedFailingPrs,
    githubIssues,
    jiraIssues,
    dismissedIds,
    systemsOk,
    systemsPartial,
    githubConfigured,
  ]);

  const invalidateFleet = () => {
    queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['issues-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['jira-issues-inbox'] });
  };

  const startPr = useMutation({
    mutationFn: async (input: {
      id: string;
      pr: InboxPullRequest;
      template: 'fix-ci' | 'address-review' | 'resolve-conflicts';
    }) => {
      const result = await api.createAgentFromPr({
        owner: input.pr.owner,
        repo: input.pr.repo,
        prNumber: input.pr.number,
        template: input.template,
      });
      return {
        agentId: result.agent.id,
        template: input.template,
        sessionId: result.sessionId,
      };
    },
    onMutate: (input) => setPendingActionId(input.id),
    onSettled: () => setPendingActionId(null),
    onSuccess: ({ agentId, template, sessionId }) => {
      invalidateFleet();
      navigate(`/agents/${agentId}`, {
        state: sessionId ? { sessionId } : { sessionTemplate: template },
      });
    },
  });

  const startGithubIssue = useMutation({
    mutationFn: async (issue: InboxIssue) => {
      const result = await api.createAgentFromIssue({
        owner: issue.owner,
        repo: issue.repo,
        issueNumber: issue.number,
      });
      return result.agent.id;
    },
    onMutate: (issue) => setPendingActionId(`gh-issue:${issue.owner}/${issue.repo}#${issue.number}`),
    onSettled: () => setPendingActionId(null),
    onSuccess: (agentId) => {
      invalidateFleet();
      navigate(`/agents/${agentId}`);
    },
  });

  const startJiraIssue = useMutation({
    mutationFn: async (input: { issue: InboxJiraIssue; workspaceId: string }) => {
      const result = await api.createAgentFromJiraIssue({
        workspaceId: input.workspaceId,
        issueKey: input.issue.key,
      });
      return result.agent.id;
    },
    onMutate: (input) => setPendingActionId(`jira:${input.issue.key}`),
    onSettled: () => setPendingActionId(null),
    onSuccess: (agentId) => {
      setJiraPick(null);
      invalidateFleet();
      navigate(`/agents/${agentId}`);
    },
  });

  const actionError =
    startPr.error ?? startGithubIssue.error ?? startJiraIssue.error ?? null;
  const busy = startPr.isPending || startGithubIssue.isPending || startJiraIssue.isPending;

  const runItem = (item: WorkItem) => {
    const { action } = item;
    if (action.type === 'navigate') {
      navigate(action.to, action.state ? { state: action.state } : undefined);
      return;
    }
    if (action.type === 'start_pr_template') {
      startPr.mutate({ id: item.id, pr: action.pr, template: action.template });
      return;
    }
    if (action.type === 'start_github_issue') {
      startGithubIssue.mutate(action.issue);
      return;
    }
    if (action.workspaceId) {
      startJiraIssue.mutate({ issue: action.issue, workspaceId: action.workspaceId });
      return;
    }
    setJiraPick(action.issue);
  };

  const snooze = (id: string) => {
    dismissWorkItem(id);
    setDismissedVersion((value) => value + 1);
  };

  return (
    <Stack spacing={1.5} sx={{ mt: 0.5, maxWidth: 720 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <AutoAwesomeOutlinedIcon sx={{ color: 'secondary.main', mt: 0.35, flexShrink: 0 }} />
        <Typography color="text.secondary" sx={{ lineHeight: 1.55, overflowWrap: 'anywhere' }}>
          {briefing.summary}
        </Typography>
      </Stack>

      {briefing.items.length > 0 ? (
        <Stack spacing={0.75} sx={{ pl: { xs: 0, sm: 4 } }}>
          {briefing.items.map((item) => (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.75,
                px: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'ao.surface.overlay',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {item.subtitle}
                </Typography>
              </Box>
              <ControlTooltip title="Start this task (nothing runs until you click)">
                <Button
                  size="small"
                  variant={item.kind === 'agent_blocked' ? 'contained' : 'outlined'}
                  color={item.kind === 'agent_blocked' ? 'warning' : 'secondary'}
                  disabled={busy}
                  onClick={() => runItem(item)}
                  startIcon={
                    pendingActionId === item.id ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : undefined
                  }
                  sx={{ flexShrink: 0 }}
                >
                  {item.actionLabel}
                </Button>
              </ControlTooltip>
              <ControlTooltip title="Snooze for 24 hours">
                <IconButton
                  size="small"
                  aria-label={`Snooze ${item.title}`}
                  disabled={busy}
                  onClick={() => snooze(item.id)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </ControlTooltip>
            </Box>
          ))}
        </Stack>
      ) : null}

      {actionError ? (
        <Alert severity="error" sx={{ ml: { xs: 0, sm: 4 } }}>
          {(actionError as Error).message}
        </Alert>
      ) : null}

      <JiraWorkspacePickerDialog
        open={Boolean(jiraPick)}
        issue={jiraPick}
        workspaces={workspaces}
        loading={startJiraIssue.isPending}
        onCancel={() => setJiraPick(null)}
        onConfirm={(workspaceId) => {
          if (!jiraPick) return;
          startJiraIssue.mutate({ issue: jiraPick, workspaceId });
        }}
      />
    </Stack>
  );
}
