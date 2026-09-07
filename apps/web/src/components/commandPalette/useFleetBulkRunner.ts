import { useCallback } from 'react';
import { buildFleetTriagePrompt } from '@agent-orchestrator/shared';
import type {
  InboxPullRequest,
  MergedFleetAgent,
  PullRequestChecks,
  PullRequestInbox,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import { useSendAssistantPrompt } from '../dashboard/useSendAssistantPrompt';
import {
  fleetBulkActionKind,
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
  const assistant = useSendAssistantPrompt();

  const buildPrompt = useCallback(
    (action: FleetBulkActionId) => {
      const kind = fleetBulkActionKind(action);
      if (kind === 'fix-ci') {
        return buildFleetTriagePrompt({
          kind,
          fixCi: selectFixCiBulkTargets(input.inbox, input.checksForPr).map(({ pr }) => ({
            owner: pr.owner,
            repo: pr.repo,
            number: pr.number,
            agentId: pr.agentId,
          })),
        });
      }
      if (kind === 'address-review') {
        return buildFleetTriagePrompt({
          kind,
          addressReview: selectAddressReviewBulkTargets(input.inbox).map((pr) => ({
            owner: pr.owner,
            repo: pr.repo,
            number: pr.number,
            agentId: pr.agentId,
          })),
        });
      }
      if (kind === 'needs-input') {
        return buildFleetTriagePrompt({
          kind,
          needsInput: selectNeedsInputBulkTargets(input.sidebar),
        });
      }
      return buildFleetTriagePrompt({
        kind: 'archive-merged',
        archiveMerged: selectArchiveMergedBulkTargets(input.mergedAgents).map((agent) => ({
          agentId: agent.agentId,
          name: agent.agentName,
        })),
      });
    },
    [input.checksForPr, input.inbox, input.mergedAgents, input.sidebar],
  );

  const requestAction = useCallback(
    (action: FleetBulkActionId) => {
      const starter = buildPrompt(action);
      if (!starter) return;
      void (async () => {
        await assistant.sendPrompt(starter.prompt);
        input.onAfterRun?.();
      })();
    },
    [assistant, buildPrompt, input],
  );

  return {
    requestAction,
    pendingConfirm: null as FleetBulkActionId | null,
    confirmPending: () => undefined,
    cancelPending: () => undefined,
    confirmLabel: '',
    loading: assistant.sending,
    error: assistant.error,
    clearError: assistant.clearError,
  };
}
