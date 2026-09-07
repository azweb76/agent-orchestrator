import { useEffect, useMemo } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InboxPullRequest,
  PullRequestChecks,
  PullRequestInbox,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { SectionLabel } from '../dashboard/SectionLabel';
import { buildFleetBulkCounts } from './fleetBulkActions';
import { FleetBulkBar } from './FleetBulkBar';
import { useFleetBulkRunner } from './useFleetBulkRunner';

function checksFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  pr: InboxPullRequest,
): PullRequestChecks | undefined {
  return queryClient.getQueryData<PullRequestChecks>([
    'pr',
    pr.owner,
    pr.repo,
    pr.number,
    'checks',
  ]);
}

interface FleetBulkSectionProps {
  inbox?: PullRequestInbox;
  sidebar: SidebarWorkspace[];
  githubConfigured: boolean;
}

export function FleetBulkSection({ inbox, sidebar, githubConfigured }: FleetBulkSectionProps) {
  const queryClient = useQueryClient();
  const { data: mergedAgents } = useQuery({
    queryKey: ['fleet-merged-agents'],
    queryFn: api.listMergedFleetAgents,
    enabled: githubConfigured,
  });

  useEffect(() => {
    if (!inbox || !githubConfigured) return;
    for (const pr of inbox.authored) {
      if (!pr.agentId) continue;
      void queryClient.prefetchQuery({
        queryKey: ['pr', pr.owner, pr.repo, pr.number, 'checks'],
        queryFn: () => api.getPullRequestChecks(pr.owner, pr.repo, pr.number),
        staleTime: 60_000,
      });
    }
  }, [inbox, githubConfigured, queryClient]);

  const counts = useMemo(
    () =>
      buildFleetBulkCounts({
        inbox,
        sidebar,
        mergedAgents,
        checksForPr: (pr) => checksFromCache(queryClient, pr),
      }),
    [inbox, sidebar, mergedAgents, queryClient],
  );

  const bulkRunner = useFleetBulkRunner({
    inbox,
    sidebar,
    mergedAgents,
    checksForPr: (pr) => checksFromCache(queryClient, pr),
  });

  const hasActions =
    counts.fixCi + counts.addressReview + counts.archiveMerged + counts.needsInput > 0;
  if (!hasActions && !bulkRunner.error) return null;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'ao.surface.panel',
        px: { xs: 1.75, md: 2.25 },
        py: 1.75,
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <BoltOutlinedIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
          <SectionLabel>Fleet triage</SectionLabel>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            Ask Assistant — nothing writes until you confirm in chat.
          </Typography>
        </Stack>
        <FleetBulkBar counts={counts} loading={bulkRunner.loading} onAction={bulkRunner.requestAction} />
        {bulkRunner.error ? (
          <Alert severity="error" onClose={bulkRunner.clearError}>
            {bulkRunner.error}
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
