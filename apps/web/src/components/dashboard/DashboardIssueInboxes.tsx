import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InboxIssue, InboxJiraIssue, WorkspaceWithCounts } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import { JiraWorkspacePickerDialog } from './JiraWorkspacePickerDialog';

export function DashboardGithubIssuesPanel({
  githubConfigured,
  issuesLoading,
  recentIssues,
}: {
  githubConfigured: boolean;
  issuesLoading: boolean;
  recentIssues: InboxIssue[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: async (issue: InboxIssue) => {
      const result = await api.createAgentFromIssue({
        owner: issue.owner,
        repo: issue.repo,
        issueNumber: issue.number,
      });
      return result.agent.id;
    },
    onMutate: (issue) => setPendingKey(`${issue.owner}/${issue.repo}#${issue.number}`),
    onSettled: () => setPendingKey(null),
    onSuccess: (agentId) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['issues-inbox'] });
      navigate(`/agents/${agentId}`);
    },
  });

  return (
    <HudPanel>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box>
          <SectionLabel>Inbox</SectionLabel>
          <Typography variant="h6">Assigned issues</Typography>
        </Box>
      </Stack>

      {!githubConfigured ? (
        <Typography color="text.secondary" variant="body2">
          Set <code>GITHUB_TOKEN</code> to load issues assigned to you.
        </Typography>
      ) : issuesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : recentIssues.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No open issues assigned to you.
        </Typography>
      ) : (
        <Stack spacing={0}>
          {recentIssues.map((issue) => {
            const key = `${issue.owner}/${issue.repo}#${issue.number}`;
            return (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.9,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    #{issue.number} {issue.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {issue.owner}/{issue.repo}
                    {issue.workspaceId ? ' · workspace ready' : ' · clone on start'}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  disabled={startMutation.isPending}
                  onClick={() => startMutation.mutate(issue)}
                  startIcon={
                    pendingKey === key ? <CircularProgress size={14} color="inherit" /> : undefined
                  }
                >
                  Start
                </Button>
              </Box>
            );
          })}
          {startMutation.error ? (
            <Typography color="error" variant="caption" sx={{ pt: 1 }}>
              {(startMutation.error as Error).message}
            </Typography>
          ) : null}
        </Stack>
      )}
    </HudPanel>
  );
}

export function DashboardJiraIssuesPanel({
  jiraConfigured,
  jiraIssuesLoading,
  recentJiraIssues,
  workspaces = [],
}: {
  jiraConfigured: boolean;
  jiraIssuesLoading: boolean;
  recentJiraIssues: InboxJiraIssue[];
  workspaces?: WorkspaceWithCounts[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pickIssue, setPickIssue] = useState<InboxJiraIssue | null>(null);

  const startMutation = useMutation({
    mutationFn: async (input: { issue: InboxJiraIssue; workspaceId?: string }) => {
      const result = await api.createAgentFromJiraIssue({
        workspaceId: input.workspaceId ?? input.issue.suggestedWorkspaceId ?? undefined,
        issueKey: input.issue.key,
      });
      return result.agent.id;
    },
    onMutate: (input) => setPendingKey(input.issue.key),
    onSettled: () => setPendingKey(null),
    onSuccess: (agentId) => {
      setPickIssue(null);
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['jira-issues-inbox'] });
      navigate(`/agents/${agentId}`);
    },
  });

  const onStart = (issue: InboxJiraIssue) => {
    if (issue.suggestedWorkspaceId) {
      startMutation.mutate({ issue, workspaceId: issue.suggestedWorkspaceId });
      return;
    }
    setPickIssue(issue);
  };

  return (
    <HudPanel>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box>
          <SectionLabel>Inbox</SectionLabel>
          <Typography variant="h6">Assigned Jira</Typography>
        </Box>
      </Stack>

      {!jiraConfigured ? (
        <Typography color="text.secondary" variant="body2">
          Set <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code>, and <code>JIRA_API_TOKEN</code> to
          load issues assigned to you.
        </Typography>
      ) : jiraIssuesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : recentJiraIssues.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No unresolved Jira issues assigned to you.
        </Typography>
      ) : (
        <Stack spacing={0}>
          {recentJiraIssues.map((issue) => (
            <Box
              key={issue.key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.9,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Box
                component="a"
                href={issue.htmlUrl}
                target="_blank"
                rel="noreferrer"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover .jira-title': { color: 'secondary.main' },
                }}
              >
                <Typography className="jira-title" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {issue.key} {issue.summary}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {issue.projectKey} · {issue.status} · {issue.issueType}
                  {issue.suggestedWorkspaceId ? ' · workspace matched' : ''}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                disabled={startMutation.isPending}
                onClick={() => onStart(issue)}
                startIcon={
                  pendingKey === issue.key ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : undefined
                }
              >
                {issue.suggestedWorkspaceId ? 'Start' : 'Choose…'}
              </Button>
            </Box>
          ))}
          {startMutation.error ? (
            <Typography color="error" variant="caption" sx={{ pt: 1 }}>
              {(startMutation.error as Error).message}
            </Typography>
          ) : null}
        </Stack>
      )}

      <JiraWorkspacePickerDialog
        open={Boolean(pickIssue)}
        issue={pickIssue}
        workspaces={workspaces}
        loading={startMutation.isPending}
        onCancel={() => setPickIssue(null)}
        onConfirm={(workspaceId) => {
          if (!pickIssue) return;
          startMutation.mutate({ issue: pickIssue, workspaceId });
        }}
      />
    </HudPanel>
  );
}
