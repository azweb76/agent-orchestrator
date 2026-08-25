import type { ReactNode } from 'react';
import { Avatar, Box, Chip, Divider, Stack, Typography } from '@mui/material';
import type { PullRequestDetail } from '@agent-orchestrator/shared';
import { MarkdownContent } from '../chat/MarkdownContent';
import { EmptyState } from '../ui/EmptyState';
import { formatRelativeTime } from '../../utils/format';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ minWidth: 160 }}>
      <Typography
        variant="caption"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          display: 'block',
        }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

export function PullRequestOverviewTab({ pr }: { pr: PullRequestDetail }) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar src={pr.author?.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
          {pr.author?.login.slice(0, 1).toUpperCase() ?? '?'}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {pr.author?.login ?? 'Unknown author'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            opened {formatRelativeTime(pr.createdAt)} · updated {formatRelativeTime(pr.updatedAt)}
          </Typography>
        </Box>
      </Stack>

      {pr.labels.length > 0 ? (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {pr.labels.map((label) => (
            <Chip
              key={label.name}
              size="small"
              label={label.name}
              variant="outlined"
              sx={label.color ? { borderColor: `#${label.color}`, color: `#${label.color}` } : undefined}
            />
          ))}
        </Stack>
      ) : null}

      {pr.body?.trim() ? (
        <Box sx={{ overflowWrap: 'anywhere' }}>
          <MarkdownContent content={pr.body} />
        </Box>
      ) : (
        <EmptyState compact title="No description" description="This pull request has no body." />
      )}

      <Divider />

      <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Fact
          label="Branches"
          value={
            <Box component="span" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
              {pr.headRef} → {pr.baseRef}
            </Box>
          }
        />
        <Fact
          label="Head"
          value={
            <Box component="span" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
              {pr.headSha.slice(0, 7)}
            </Box>
          }
        />
        <Fact label="Commits" value={pr.commitCount} />
        <Fact label="Changed files" value={`${pr.changedFiles} (+${pr.additions} −${pr.deletions})`} />
        {pr.mergedAt ? <Fact label="Merged" value={formatRelativeTime(pr.mergedAt)} /> : null}
        {!pr.merged && pr.closedAt ? (
          <Fact label="Closed" value={formatRelativeTime(pr.closedAt)} />
        ) : null}
      </Stack>
    </Stack>
  );
}
