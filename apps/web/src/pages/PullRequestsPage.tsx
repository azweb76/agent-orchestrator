import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pullRequestMatchesQuery, type InboxPullRequest } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { formatRelativeTime } from '../utils/format';
import { pullRequestPath } from '../utils/paths';

type InboxTab = 'authored' | 'review';

export function PullRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<InboxTab>('authored');
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  const authoredCount = inboxQuery.data?.authored.length ?? 0;
  const reviewCount = inboxQuery.data?.reviewRequested.length ?? 0;
  const tabItems =
    tab === 'authored' ? (inboxQuery.data?.authored ?? []) : (inboxQuery.data?.reviewRequested ?? []);
  const items = tabItems.filter((pr) => pullRequestMatchesQuery(pr, search));
  const searching = Boolean(search.trim());

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Inbox"
        title="Pull requests"
        description="Open PRs you authored and review requests. Create a workspace worktree and Claude agent from any PR."
      />

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
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 44, maxWidth: '100%' }}
      >
        <Tab
          value="authored"
          icon={<MergeTypeIcon />}
          iconPosition="start"
          disabled={!status?.githubTokenConfigured}
          label={`My PRs (${authoredCount})`}
        />
        <Tab
          value="review"
          icon={<RateReviewOutlinedIcon />}
          iconPosition="start"
          disabled={!status?.githubTokenConfigured}
          label={`Reviews (${reviewCount})`}
        />
      </Tabs>

      {status?.githubTokenConfigured && !inboxQuery.isLoading && !inboxQuery.error ? (
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, number, repo, or author"
          fullWidth
          size="small"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': 'Search pull requests' },
          }}
        />
      ) : null}

      {status?.githubTokenConfigured && inboxQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : inboxQuery.error ? (
        <Alert severity="error">{(inboxQuery.error as Error).message}</Alert>
      ) : !status?.githubTokenConfigured ? (
        <EmptyState
          icon={<MergeTypeIcon />}
          title="GitHub not connected"
          description="Add a personal access token with repo scope to browse your PR inbox."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'authored' ? <MergeTypeIcon /> : <RateReviewOutlinedIcon />}
          title={
            searching
              ? 'No matching pull requests'
              : tab === 'authored'
                ? 'No open pull requests'
                : 'No review requests'
          }
          description={
            searching
              ? 'Try a different title, number, repository, or author.'
              : tab === 'authored'
                ? 'Pull requests you author will show up here.'
                : 'PRs that request your review will show up here.'
          }
        />
      ) : (
        <ListPanel>
          {items.map((pr) => {
            const key = `${pr.owner}/${pr.repo}#${pr.number}`;
            const isCreating = creatingKey === key && createMutation.isPending;

            return (
              <ListRow
                key={key}
                component={RouterLink}
                to={pullRequestPath(pr.owner, pr.repo, pr.number)}
                secondaryAction={
                  <>
                    {pr.workspaceId ? (
                      <Button
                        component={RouterLink}
                        to={`/workspaces/${pr.workspaceId}`}
                        variant="outlined"
                        size="small"
                      >
                        Workspace
                      </Button>
                    ) : null}
                    {pr.agentId ? (
                      <Button
                        component={RouterLink}
                        to={`/agents/${pr.agentId}`}
                        variant="contained"
                        size="small"
                        startIcon={<SmartToyOutlinedIcon />}
                      >
                        Open agent
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={
                          isCreating ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <SmartToyOutlinedIcon />
                          )
                        }
                        disabled={createMutation.isPending}
                        onClick={() => createMutation.mutate(pr)}
                      >
                        {pr.workspaceId ? 'Create agent' : 'Start agent'}
                      </Button>
                    )}
                  </>
                }
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.25 }}>
                  <ListRowTitle>
                    #{pr.number} {pr.title}
                  </ListRowTitle>
                  {pr.draft ? <Chip size="small" label="Draft" variant="outlined" /> : null}
                  {pr.workspaceId ? (
                    <Chip size="small" label="Workspace ready" color="success" variant="outlined" />
                  ) : (
                    <Chip size="small" label="Will clone repo" color="info" variant="outlined" />
                  )}
                </Stack>
                <ListRowMeta>
                  {pr.owner}/{pr.repo} · by {pr.authorLogin} · updated {formatRelativeTime(pr.updatedAt)}
                </ListRowMeta>
                <Link
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  variant="body2"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View on GitHub <OpenInNewIcon sx={{ fontSize: 14 }} />
                </Link>
              </ListRow>
            );
          })}
        </ListPanel>
      )}
    </Stack>
  );
}
