import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InboxPullRequest,
  MergedFleetAgent,
  PullRequestChecks,
  PullRequestInbox,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import {
  fleetBulkActionLabel,
  fleetBulkActionNeedsConfirm,
  selectAddressReviewBulkTargets,
  selectArchiveMergedBulkTargets,
  selectFixCiBulkTargets,
  selectNeedsInputBulkTargets,
  type FleetBulkActionId,
} from './fleetBulkActions';

export function useFleetBulkRunner(input: {
  inbox: PullRequestInbox | null | undefined;
  sidebar: SidebarWorkspace[];
  mergedAgents: MergedFleetAgent[] | undefined;
  checksForPr: (pr: InboxPullRequest) => PullRequestChecks | undefined;
  onAfterRun?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingConfirm, setPendingConfirm] = useState<FleetBulkActionId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: async (action: FleetBulkActionId) => {
      setError(null);
      if (action === 'fix-ci-all') {
        const targets = selectFixCiBulkTargets(input.inbox, input.checksForPr);
        for (const target of targets) {
          await api.createAgentFromPr({
            owner: target.pr.owner,
            repo: target.pr.repo,
            prNumber: target.pr.number,
            template: 'fix-ci',
          });
        }
        return;
      }
      if (action === 'address-review-all') {
        for (const pr of selectAddressReviewBulkTargets(input.inbox)) {
          await api.createAgentFromPr({
            owner: pr.owner,
            repo: pr.repo,
            prNumber: pr.number,
            template: 'address-review',
          });
        }
        return;
      }
      if (action === 'open-needs-input-all') {
        const first = selectNeedsInputBulkTargets(input.sidebar)[0];
        if (first) {
          navigate(`/agents/${first.agentId}`, { state: { focusAttention: 'needs-input' } });
        }
        return;
      }
      for (const agent of selectArchiveMergedBulkTargets(input.mergedAgents)) {
        await api.archiveAgent(agent.agentId, { deleteWorktree: false });
      }
    },
    onSuccess: (_result, action) => {
      if (action === 'archive-merged-all') {
        queryClient.invalidateQueries({ queryKey: ['sidebar'] });
        queryClient.invalidateQueries({ queryKey: ['status'] });
        queryClient.invalidateQueries({ queryKey: ['fleet-merged-agents'] });
      } else if (action !== 'open-needs-input-all') {
        queryClient.invalidateQueries({ queryKey: ['sidebar'] });
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
      }
      setPendingConfirm(null);
      input.onAfterRun?.();
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  const requestAction = useCallback(
    (action: FleetBulkActionId) => {
      if (fleetBulkActionNeedsConfirm(action)) {
        setPendingConfirm(action);
        return;
      }
      runMutation.mutate(action);
    },
    [runMutation],
  );

  const confirmPending = useCallback(() => {
    if (!pendingConfirm) return;
    runMutation.mutate(pendingConfirm);
  }, [pendingConfirm, runMutation]);

  const cancelPending = useCallback(() => {
    setPendingConfirm(null);
    runMutation.reset();
  }, [runMutation]);

  return {
    requestAction,
    pendingConfirm,
    confirmPending,
    cancelPending,
    confirmLabel: pendingConfirm ? fleetBulkActionLabel(pendingConfirm, selectArchiveMergedBulkTargets(input.mergedAgents).length) : '',
    loading: runMutation.isPending,
    error,
    clearError: () => setError(null),
  };
}
