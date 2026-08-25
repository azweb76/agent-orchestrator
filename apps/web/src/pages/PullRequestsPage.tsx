import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Link,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboxPullRequest } from '@agent-orchestrator/shared';
import { api } from '../api/client';

type InboxTab = 'authored' | 'review';

export function PullRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<InboxTab>('authored');
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const inboxQuery = useQuery({
    queryKey: ['pulls-inbox'],
    queryFn: api.getPullRequestInbox,
    enabled: Boolean(status?.githubTokenConfigured),
  });

  const createMutation = useMutation({
    mutationFn: (pr: InboxPullRequest) =>
      api.createAgentFromPr({
        owner: pr.owner,
        repo: pr.repo,
        prNumber: pr.number,
      }),
    onMutate: (pr) => {
      setCreatingKey(`${pr.owner}/${pr.repo}#${pr.number}`);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      navigate(`/agents/${result.agent.id}`);
    },
    onSettled: () => {
      setCreatingKey(null);
    },
  });

  const items =
    tab === 'authored' ? (inboxQuery.data?.authored ?? []) : (inboxQuery.data?.reviewRequested ?? []);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Pull requests
        </Typography>
        <Typography color="text.secondary">
          Your open PRs and review requests. Create a workspace worktree and Claude agent from any PR.
        </Typography>
      </Box>

      {!status?.githubTokenConfigured ? (
        <Alert severity="warning">
          Set <code>GITHUB_TOKEN</code> to load your pull requests.
        </Alert>
      ) : null}

      {createMutation.error && (
        <Alert severity="error">{(createMutation.error as Error).message}</Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, value: InboxTab) => setTab(value)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          value="authored"
          icon={<MergeTypeIcon />}
          iconPosition="start"
          label={`My open PRs (${inboxQuery.data?.authored.length ?? 0})`}
        />
        <Tab
          value="review"
          icon={<RateReviewOutlinedIcon />}
          iconPosition="start"
          label={`Waiting for review (${inboxQuery.data?.reviewRequested.length ?? 0})`}
        />
      </Tabs>

      {status?.githubTokenConfigured && inboxQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : inboxQuery.error ? (
        <Alert severity="error">{(inboxQuery.error as Error).message}</Alert>
      ) : !status?.githubTokenConfigured ? null : items.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {tab === 'authored' ? 'No open pull requests' : 'No review requests'}
          </Typography>
          <Typography color="text.secondary">
            {tab === 'authored'
              ? 'Pull requests you author will show up here.'
              : 'PRs that request your review will show up here.'}
          </Typography>
        </Card>
      ) : (
        <Stack spacing={2}>
          {items.map((pr) => {
            const key = `${pr.owner}/${pr.repo}#${pr.number}`;
            const isCreating = creatingKey === key && createMutation.isPending;

            return (
              <Card key={key}>
                <CardContent>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="h6" noWrap>
                          #{pr.number} {pr.title}
                        </Typography>
                        {pr.draft ? <Chip size="small" label="Draft" variant="outlined" /> : null}
                        {pr.workspaceId ? (
                          <Chip size="small" label="Workspace ready" color="success" variant="outlined" />
                        ) : (
                          <Chip size="small" label="Will clone repo" color="info" variant="outlined" />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {pr.owner}/{pr.repo} • by {pr.authorLogin} • updated{' '}
                        {new Date(pr.updatedAt).toLocaleString()}
                      </Typography>
                      <Link
                        href={pr.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                      >
                        View on GitHub <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </Link>
                    </Box>

                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {pr.workspaceId ? (
                        <Button
                          component={RouterLink}
                          to={`/workspaces/${pr.workspaceId}`}
                          variant="outlined"
                        >
                          Open workspace
                        </Button>
                      ) : null}
                      {pr.agentId ? (
                        <Button
                          component={RouterLink}
                          to={`/agents/${pr.agentId}`}
                          variant="contained"
                          startIcon={<SmartToyOutlinedIcon />}
                        >
                          Open agent
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          startIcon={
                            isCreating ? <CircularProgress size={16} color="inherit" /> : <SmartToyOutlinedIcon />
                          }
                          disabled={createMutation.isPending}
                          onClick={() => createMutation.mutate(pr)}
                        >
                          {pr.workspaceId ? 'Create agent' : 'Create workspace & agent'}
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
