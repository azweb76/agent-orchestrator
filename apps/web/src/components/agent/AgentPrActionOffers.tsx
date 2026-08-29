import { useMemo, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluateMergeReadiness, type AgentDetail } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { ControlTooltip } from '../ui/ControlTooltip';
import {
  buildAgentPrActionOffers,
  type AgentPrActionKind,
  type AgentPrActionOffer,
} from './agentPrStatusModel';
import { MergedPrCompletionBanner } from './MergedPrCompletionBanner';
import { useAgentLinkedPr } from './useAgentLinkedPr';

const DISMISS_PREFIX = 'ao.pr-action-dismiss:';

function readDismissed(agentId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(`${DISMISS_PREFIX}${agentId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissed(agentId: string, fingerprints: Set<string>): void {
  try {
    sessionStorage.setItem(`${DISMISS_PREFIX}${agentId}`, JSON.stringify([...fingerprints]));
  } catch {
    // ignore quota / private mode
  }
}

function actionIcon(kind: AgentPrActionKind) {
  switch (kind) {
    case 'fix_ci':
      return <BugReportOutlinedIcon />;
    case 'address_review':
      return <ReplyOutlinedIcon />;
    case 'mark_ready':
      return <RateReviewOutlinedIcon />;
    case 'merge':
      return <MergeTypeIcon />;
  }
}

function primaryLabel(kind: AgentPrActionKind, pending: boolean): string {
  if (pending) return 'Working…';
  switch (kind) {
    case 'fix_ci':
      return 'Fix CI';
    case 'address_review':
      return 'Address review';
    case 'mark_ready':
      return 'Mark ready';
    case 'merge':
      return 'Merge';
  }
}

export interface AgentPrActionOffersProps {
  agent: AgentDetail;
  archived: boolean;
  archivePending?: boolean;
  onArchive?: () => void;
  onSessionStarted?: (sessionId: string) => void;
}

/**
 * Dismissible PR action cards (Fix CI, Address review, Mark ready, Merge).
 * Shares PR/checks queries with the status strip via React Query cache.
 */
export function AgentPrActionOffers({
  agent,
  archived,
  archivePending,
  onArchive,
  onSessionStarted,
}: AgentPrActionOffersProps) {
  const queryClient = useQueryClient();
  const { enabled, owner, repo, prNumber, prKey, pr, checks } = useAgentLinkedPr(agent);
  const [dismissed, setDismissed] = useState(() => readDismissed(agent.id));
  const [mergeOffer, setMergeOffer] = useState<AgentPrActionOffer | null>(null);
  const [mergeCompleteDismissed, setMergeCompleteDismissed] = useState(false);

  const offers = useMemo(() => {
    if (!pr) return [];
    return buildAgentPrActionOffers({
      pr,
      checks,
      archived,
      sessions: agent.sessions,
    }).filter((offer) => !dismissed.has(offer.fingerprint));
  }, [pr, checks, archived, agent.sessions, dismissed]);

  const dismiss = (fingerprint: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(fingerprint);
      writeDismissed(agent.id, next);
      return next;
    });
  };

  const startTemplate = useMutation({
    mutationFn: async (template: 'fix-ci' | 'address-review') => {
      const result = await api.createAgentFromPr({
        owner,
        repo,
        prNumber: prNumber!,
        template,
      });
      return { sessionId: result.sessionId, agentId: result.agent.id };
    },
    onSuccess: ({ sessionId, agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: prKey });
      if (sessionId) onSessionStarted?.(sessionId);
    },
  });

  const markReady = useMutation({
    mutationFn: () => api.markPullRequestReady(owner, repo, prNumber!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prKey });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!pr) throw new Error('Pull request not loaded');
      const readiness = evaluateMergeReadiness(pr);
      const method = readiness.allowedMethods[0] ?? 'squash';
      return api.mergePullRequest(owner, repo, pr.number, {
        method,
        expectedHeadSha: pr.headSha,
      });
    },
    onSuccess: () => {
      setMergeOffer(null);
      setMergeCompleteDismissed(false);
      queryClient.invalidateQueries({ queryKey: prKey });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
    },
  });

  const offer = offers[0];
  const pending =
    Boolean(offer) &&
    (((offer.kind === 'fix_ci' || offer.kind === 'address_review') && startTemplate.isPending) ||
      (offer.kind === 'mark_ready' && markReady.isPending));

  const actionError =
    offer == null
      ? null
      : offer.kind === 'fix_ci' || offer.kind === 'address_review'
        ? (startTemplate.error as Error | null)
        : offer.kind === 'mark_ready'
          ? (markReady.error as Error | null)
          : (mergeMutation.error as Error | null);

  if (!enabled || !pr) return null;

  if (pr.merged && !mergeCompleteDismissed) {
    return (
      <MergedPrCompletionBanner
        archived={archived}
        archivePending={archivePending}
        onArchive={onArchive}
        onDismiss={() => setMergeCompleteDismissed(true)}
      />
    );
  }

  return (
    <>
      {offer ? (
        <Alert
          severity={offer.severity}
          icon={actionIcon(offer.kind)}
          sx={{ '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
          action={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <ControlTooltip title={primaryLabel(offer.kind, false)} disabled={pending}>
                <Button
                  color="inherit"
                  size="small"
                  disabled={pending}
                  onClick={() => {
                    if (offer.kind === 'fix_ci') startTemplate.mutate('fix-ci');
                    else if (offer.kind === 'address_review') startTemplate.mutate('address-review');
                    else if (offer.kind === 'mark_ready') markReady.mutate();
                    else setMergeOffer(offer);
                  }}
                >
                  {primaryLabel(offer.kind, pending)}
                </Button>
              </ControlTooltip>
              <ControlTooltip title="Dismiss this offer for now">
                <Button color="inherit" size="small" onClick={() => dismiss(offer.fingerprint)}>
                  Dismiss
                </Button>
              </ControlTooltip>
            </Stack>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {offer.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {offer.body}
          </Typography>
          {actionError ? (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
              {actionError.message}
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      <ConfirmDialog
        open={Boolean(mergeOffer)}
        title={`Merge PR #${prNumber}?`}
        description={
          mergeMutation.error
            ? (mergeMutation.error as Error).message
            : 'Merges with the repository’s preferred method. This cannot be undone from the app.'
        }
        confirmLabel="Merge pull request"
        confirmColor="primary"
        loading={mergeMutation.isPending}
        onCancel={() => {
          setMergeOffer(null);
          mergeMutation.reset();
        }}
        onConfirm={() => mergeMutation.mutate()}
      />
    </>
  );
}
