import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { InboxIssue, InboxJiraIssue } from '@agent-orchestrator/shared';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';

export function DashboardGithubIssuesPanel({
  githubConfigured,
  issuesLoading,
  recentIssues,
}: {
  githubConfigured: boolean;
  issuesLoading: boolean;
  recentIssues: InboxIssue[];
}) {
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
          {recentIssues.map((issue) => (
            <Box
              key={`${issue.owner}/${issue.repo}#${issue.number}`}
              sx={{
                py: 0.9,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                #{issue.number} {issue.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {issue.owner}/{issue.repo}
                {issue.workspaceId ? ' · workspace ready' : ' · clone on start'}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </HudPanel>
  );
}

export function DashboardJiraIssuesPanel({
  jiraConfigured,
  jiraIssuesLoading,
  recentJiraIssues,
}: {
  jiraConfigured: boolean;
  jiraIssuesLoading: boolean;
  recentJiraIssues: InboxJiraIssue[];
}) {
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
              component="a"
              href={issue.htmlUrl}
              target="_blank"
              rel="noreferrer"
              sx={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                py: 0.9,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
                '&:hover .jira-title': { color: 'secondary.main' },
              }}
            >
              <Typography className="jira-title" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {issue.key} {issue.summary}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {issue.projectKey} · {issue.status} · {issue.issueType}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </HudPanel>
  );
}
