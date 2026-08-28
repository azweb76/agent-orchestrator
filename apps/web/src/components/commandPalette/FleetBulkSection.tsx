import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboxPullRequest, PullRequestChecks, PullRequestInbox, SidebarWorkspace } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { buildFleetBulkCounts } from './fleetBulkActions';
import { FleetBulkBar } from './FleetBulkBar';
import { useFleetBulkRunner } from './useFleetBulkRunner';
import { ConfirmDialog } from '../ConfirmDialog';

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

  return (
    <>
      <FleetBulkBar counts={counts} loading={bulkRunner.loading} onAction={bulkRunner.requestAction} />
      <ConfirmDialog
        open={bulkRunner.pendingConfirm === 'archive-merged-all'}
        title="Archive merged agents?"
        description={`This archives ${counts.archiveMerged} agent${
          counts.archiveMerged === 1 ? '' : 's'
        } whose pull requests have merged. Worktrees are kept unless you delete them later.`}
        confirmLabel="Archive merged"
        confirmColor="warning"
        loading={bulkRunner.loading}
        onCancel={bulkRunner.cancelPending}
        onConfirm={bulkRunner.confirmPending}
      />
    </>
  );
}
