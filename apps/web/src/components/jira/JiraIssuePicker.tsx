import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Radio,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { parseJiraIssueKey, type InboxJiraIssue } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { formatRelativeTime } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../ui/ListPanel';
import { filterJiraInboxIssues, sortJiraInboxIssuesForWorkspace } from './jiraIssuePickerModel';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface JiraIssuePickerProps {
  workspaceId: string;
  selectedKey: string;
  onSelect: (issueKey: string) => void;
  enabled?: boolean;
}

export function JiraIssuePicker({
  workspaceId,
  selectedKey,
  onSelect,
  enabled = true,
}: JiraIssuePickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const searching = Boolean(debouncedSearch.trim());

  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    enabled,
    staleTime: 30_000,
  });
  const jiraConfigured = Boolean(statusQuery.data?.jiraConfigured);

  const inboxQuery = useQuery({
    queryKey: ['jira-issues-inbox'],
    queryFn: api.getJiraIssueInbox,
    enabled: enabled && jiraConfigured,
    staleTime: 30_000,
  });

  const filtered = filterJiraInboxIssues(inboxQuery.data?.assigned ?? [], debouncedSearch);
  const { suggested, other } = sortJiraInboxIssuesForWorkspace(filtered, workspaceId);
  const pastedKey = parseJiraIssueKey(search);
  const showPasteHint = Boolean(pastedKey) && !filtered.some((i) => i.key === pastedKey);

  if (statusQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!jiraConfigured) {
    return (
      <EmptyState
        compact
        icon={<BugReportOutlinedIcon />}
        title="Jira is not configured"
        description={
          <>
            Set <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code>, and <code>JIRA_API_TOKEN</code>{' '}
            then restart the server to create agents from assigned issues.
          </>
        }
      />
    );
  }

  return (
    <Stack spacing={1.5}>
      <ControlTooltip title="Search assigned Jira issues or paste a key / browse URL">
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assigned issues or paste PROJ-123"
          fullWidth
          autoFocus
          size="small"
          helperText={
            showPasteHint && pastedKey
              ? `Press Create to use ${pastedKey} even if it is not in your assigned inbox.`
              : 'Assigned unresolved issues are listed first when they match this workspace.'
          }
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: inboxQuery.isFetching ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : null,
            },
            htmlInput: { 'aria-label': 'Search Jira issues' },
          }}
        />
      </ControlTooltip>

      {showPasteHint && pastedKey ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => onSelect(pastedKey)}>
              Use {pastedKey}
            </Button>
          }
        >
          {pastedKey} is not in your assigned inbox.
        </Alert>
      ) : null}

      {inboxQuery.error ? (
        <Alert severity="error">{(inboxQuery.error as Error).message}</Alert>
      ) : inboxQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<BugReportOutlinedIcon />}
          title={searching ? 'No matching Jira issues' : 'No assigned Jira issues'}
          description={
            searching
              ? 'Try another key or summary, or paste a browse URL and select Use.'
              : 'Unresolved issues assigned to you in Jira will show up here.'
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
          <Stack spacing={1.25}>
            {suggested.length > 0 ? (
              <IssueGroup
                title={searching ? 'Matching for this workspace' : 'Suggested for this workspace'}
                items={suggested}
                selectedKey={selectedKey}
                onSelect={onSelect}
              />
            ) : null}
            {other.length > 0 ? (
              <IssueGroup
                title={
                  suggested.length > 0
                    ? searching
                      ? 'Other matches'
                      : 'Other assigned issues'
                    : searching
                      ? 'Matching issues'
                      : 'Assigned issues'
                }
                items={other}
                selectedKey={selectedKey}
                onSelect={onSelect}
              />
            ) : null}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function IssueGroup({
  title,
  items,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: InboxJiraIssue[];
  selectedKey: string;
  onSelect: (issueKey: string) => void;
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
          px: { xs: 0.5, sm: 0 },
        }}
      >
        {title}
      </Typography>
      <ListPanel>
        {items.map((issue) => {
          const selected = selectedKey === issue.key;
          return (
            <ListRow
              key={issue.key}
              selected={selected}
              onClick={() => onSelect(issue.key)}
              secondaryAction={
                <Radio
                  size="small"
                  checked={selected}
                  value={issue.key}
                  slotProps={{ input: { 'aria-label': `Select ${issue.key}` } }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onSelect(issue.key)}
                />
              }
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <ListRowTitle>
                  {issue.key} {issue.summary}
                </ListRowTitle>
                <ListRowMeta>
                  {issue.projectKey} · {issue.issueType} · {issue.status} ·{' '}
                  {formatRelativeTime(issue.updatedAt)}
                </ListRowMeta>
              </Box>
            </ListRow>
          );
        })}
      </ListPanel>
    </Stack>
  );
}
