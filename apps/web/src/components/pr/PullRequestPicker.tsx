import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useQuery } from '@tanstack/react-query';
import type { GitHubPullRequest } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { formatRelativeTime } from '../../utils/format';
import { pullRequestPath } from '../../utils/paths';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../ui/ListPanel';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function isViewerPr(pr: GitHubPullRequest, viewerLogin: string | null): boolean {
  return Boolean(viewerLogin && pr.authorLogin.toLowerCase() === viewerLogin.toLowerCase());
}

interface PullRequestPickerProps {
  workspaceId: string;
  owner: string;
  repo: string;
  selectedPr: number | '';
  onSelect: (prNumber: number) => void;
  onView?: () => void;
}

export function PullRequestPicker({
  workspaceId,
  owner,
  repo,
  selectedPr,
  onSelect,
  onView,
}: PullRequestPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const searching = Boolean(debouncedSearch.trim());

  const pullsQuery = useQuery({
    queryKey: ['pulls', workspaceId, debouncedSearch],
    queryFn: () => api.listPullRequests(workspaceId, debouncedSearch),
    enabled: Boolean(workspaceId),
  });

  const pullRequests = pullsQuery.data?.pullRequests ?? [];
  const viewerLogin = pullsQuery.data?.viewerLogin ?? null;
  const mine = pullRequests.filter((pr) => isViewerPr(pr, viewerLogin));
  const others = pullRequests.filter((pr) => !isViewerPr(pr, viewerLogin));
  const showMineGroup = mine.length > 0;

  return (
    <Stack spacing={1.5}>
      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title, number, author, or paste a URL"
        fullWidth
        autoFocus
        size="small"
        helperText="Your open pull requests are listed first. Select a row or view it in the app."
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: pullsQuery.isFetching ? (
              <InputAdornment position="end">
                <CircularProgress size={16} />
              </InputAdornment>
            ) : null,
          },
          htmlInput: { 'aria-label': 'Search pull requests' },
        }}
      />

      {pullsQuery.error ? (
        <Alert severity="error">{(pullsQuery.error as Error).message}</Alert>
      ) : pullsQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : pullRequests.length === 0 ? (
        <EmptyState
          compact
          icon={<MergeTypeIcon />}
          title={searching ? 'No matching pull requests' : 'No open pull requests'}
          description={
            searching
              ? 'Try a different title, author, or pull request number.'
              : 'Open pull requests in this repository will show up here.'
          }
        />
      ) : (
        <Box
          sx={{
            maxHeight: { xs: 'none', sm: 360 },
            overflowY: 'auto',
            mx: { xs: -1, sm: 0 },
          }}
        >
          {showMineGroup ? (
            <Stack spacing={1.25}>
              <PrGroup
                title={searching ? 'Your matching PRs' : 'Your pull requests'}
                items={mine}
                owner={owner}
                repo={repo}
                selectedPr={selectedPr}
                onSelect={onSelect}
                onView={onView}
              />
              {others.length > 0 ? (
                <PrGroup
                  title={searching ? 'Other matching PRs' : 'Other open pull requests'}
                  items={others}
                  owner={owner}
                  repo={repo}
                  selectedPr={selectedPr}
                  onSelect={onSelect}
                  onView={onView}
                />
              ) : null}
            </Stack>
          ) : (
            <PrGroup
              title={searching ? 'Matching pull requests' : 'Open pull requests'}
              items={others}
              owner={owner}
              repo={repo}
              selectedPr={selectedPr}
              onSelect={onSelect}
              onView={onView}
            />
          )}
        </Box>
      )}
    </Stack>
  );
}

function PrGroup({
  title,
  items,
  owner,
  repo,
  selectedPr,
  onSelect,
  onView,
}: {
  title: string;
  items: GitHubPullRequest[];
  owner: string;
  repo: string;
  selectedPr: number | '';
  onSelect: (prNumber: number) => void;
  onView?: () => void;
}) {
  return (
    <Stack spacing={0.75}>
      <Typography
        variant="caption"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          px: 0.5,
        }}
      >
        {title}
      </Typography>
      <ListPanel>
        {items.map((pr) => (
          <PrPickerRow
            key={pr.number}
            pr={pr}
            owner={owner}
            repo={repo}
            selected={selectedPr === pr.number}
            onSelect={onSelect}
            onView={onView}
          />
        ))}
      </ListPanel>
    </Stack>
  );
}

function PrPickerRow({
  pr,
  owner,
  repo,
  selected,
  onSelect,
  onView,
}: {
  pr: GitHubPullRequest;
  owner: string;
  repo: string;
  selected: boolean;
  onSelect: (prNumber: number) => void;
  onView?: () => void;
}) {
  const meta = [
    pr.authorLogin || null,
    pr.headRef && pr.baseRef ? `${pr.headRef} → ${pr.baseRef}` : pr.headRef || null,
    pr.updatedAt ? `updated ${formatRelativeTime(pr.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      selected={selected}
      onClick={() => onSelect(pr.number)}
      secondaryAction={
        owner && repo ? (
          <Tooltip title="View pull request">
            <IconButton
              component={RouterLink}
              to={pullRequestPath(owner, repo, pr.number)}
              size="small"
              aria-label={`View pull request #${pr.number}`}
              onClick={() => onView?.()}
            >
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.25 }}>
        <ListRowTitle>
          #{pr.number} {pr.title}
        </ListRowTitle>
        {pr.draft ? <Chip size="small" label="Draft" variant="outlined" /> : null}
        {pr.state !== 'open' ? (
          <Chip size="small" label={pr.state} color="default" variant="outlined" />
        ) : null}
      </Stack>
      {meta ? <ListRowMeta>{meta}</ListRowMeta> : null}
    </ListRow>
  );
}
