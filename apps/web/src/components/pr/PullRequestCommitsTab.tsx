import { Link, Stack, Typography } from '@mui/material';
import type { PullRequestCommit } from '@agent-orchestrator/shared';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../ui/ListPanel';
import { formatRelativeTime } from '../../utils/format';
import { TabState } from './TabState';

export interface PullRequestCommitsTabProps {
  commits?: PullRequestCommit[];
  loading: boolean;
  error: unknown;
}

export function PullRequestCommitsTab({ commits, loading, error }: PullRequestCommitsTabProps) {
  return (
    <TabState
      loading={loading}
      error={error}
      isEmpty={!commits || commits.length === 0}
      empty={<EmptyState compact title="No commits" description="This branch has no commits ahead of the base." />}
    >
      <ListPanel>
        {commits?.map((commit) => (
          <ListRow key={commit.sha}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <ListRowTitle>{commit.message.split('\n')[0]}</ListRowTitle>
              {commit.htmlUrl ? (
                <Link
                  href={commit.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  variant="body2"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                >
                  {commit.sha.slice(0, 7)}
                </Link>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                >
                  {commit.sha.slice(0, 7)}
                </Typography>
              )}
            </Stack>
            <ListRowMeta>
              {commit.authorLogin ?? commit.authorName ?? 'Unknown author'}
              {commit.authoredAt ? ` · ${formatRelativeTime(commit.authoredAt)}` : ''}
            </ListRowMeta>
            {commit.message.includes('\n') ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {commit.message.split('\n').slice(1).join('\n').trim()}
              </Typography>
            ) : null}
          </ListRow>
        ))}
      </ListPanel>
    </TabState>
  );
}
