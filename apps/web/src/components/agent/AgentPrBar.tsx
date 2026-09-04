import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluateMergeReadiness, type AgentDetail } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { PullRequestStatusChip } from '../pr/PullRequestStatusChip';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import { ControlTooltip } from '../ui/ControlTooltip';
import { pullRequestPath } from '../../utils/paths';
import {
  buildAgentPrActionOffers,
  buildAgentPrStripModel,
  type AgentPrActionKind,
  type AgentPrActionOffer,
} from './agentPrStatusModel';
import {
  isPrKickoffKind,
  prActionIcon,
  prActionLabel,
  prKickoffTemplate,
  readPrActionDismissed,
  writePrActionDismissed,
  type PrKickoffTemplate,
} from './agentPrBarActions';
import { MergedPrCompletionBanner } from './MergedPrCompletionBanner';
import { useAgentLinkedPr } from './useAgentLinkedPr';

export interface AgentPrBarProps {
  agent: AgentDetail;
  archived: boolean;
  archivePending?: boolean;
  onArchive?: () => void;
  onSessionStarted?: (sessionId: string) => void;
}

/**
 * Compact PR health + next-action bar. Replaces the old status strip + stacked
 * offer alerts so the agent page chrome stays short.
 */
export function AgentPrBar({
  agent,
  archived,
  archivePending,
  onArchive,
  onSessionStarted,
}: AgentPrBarProps) {
  const queryClient = useQueryClient();
  const { enabled, owner, repo, prNumber, prKey, prQuery, checksQuery, pr, checks } =
    useAgentLinkedPr(agent);
  const [dismissed, setDismissed] = useState(() => readPrActionDismissed(agent.id));
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
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
      writePrActionDismissed(agent.id, next);
      return next;
    });
  };

  const startTemplate = useMutation({
    mutationFn: async (template: PrKickoffTemplate) => {
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

  if (!enabled) return null;

  if (prQuery.isLoading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.25, py: 0.25 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading PR #{prNumber}…
        </Typography>
      </Stack>
    );
  }

  if (prQuery.error || !pr) {
    return (
      <Typography variant="caption" color="warning.main" sx={{ px: 0.25 }}>
        PR #{prNumber} unavailable: {(prQuery.error as Error)?.message ?? 'unknown error'}
      </Typography>
    );
  }

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

  const model = buildAgentPrStripModel({ pr, checks, archived });
  const inAppPath = pullRequestPath(owner, repo, pr.number);
  const offer = offers[0] ?? null;
  const pending =
    Boolean(offer) &&
    ((isPrKickoffKind(offer.kind) && startTemplate.isPending) ||
      (offer.kind === 'mark_ready' && markReady.isPending));
  const actionError =
    offer == null
      ? null
      : isPrKickoffKind(offer.kind)
        ? (startTemplate.error as Error | null)
        : offer.kind === 'mark_ready'
          ? (markReady.error as Error | null)
          : (mergeMutation.error as Error | null);

  const runOffer = (item: AgentPrActionOffer) => {
    setMenuAnchor(null);
    if (isPrKickoffKind(item.kind)) startTemplate.mutate(prKickoffTemplate(item.kind));
    else if (item.kind === 'mark_ready') markReady.mutate();
    else setMergeOffer(item);
  };

  const menuActions = (
    [
      { kind: 'resolve_conflicts' as const, enabled: model.showResolveConflicts },
      { kind: 'fix_ci' as const, enabled: model.showFixCi },
      { kind: 'address_review' as const, enabled: model.showAddressReview },
      { kind: 'mark_ready' as const, enabled: model.showMarkReady },
      {
        kind: 'merge' as const,
        enabled: Boolean(model.open && !archived && !pr.draft && evaluateMergeReadiness(pr).canMerge),
      },
    ] satisfies { kind: AgentPrActionKind; enabled: boolean }[]
  ).filter((item) => item.enabled && item.kind !== offer?.kind);

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          px: 1,
          py: 0.75,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          minWidth: 0,
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
          <PullRequestStatusIcon status={model.prStatus} sx={{ fontSize: 18, flexShrink: 0 }} />
          <Typography
            component={RouterLink}
            to={inAppPath}
            variant="body2"
            noWrap
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              textDecoration: 'none',
              minWidth: 0,
              '&:hover': { color: 'secondary.main' },
            }}
          >
            {pr.title}
          </Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
            <PullRequestStatusChip status={model.prStatus} />
            {model.conflicted ? (
              <Chip size="small" color="error" variant="outlined" label="Conflicts" />
            ) : null}
            {model.checksLabel ? (
              <Chip
                size="small"
                variant="outlined"
                color={model.checksTone === 'default' || model.conflicted ? undefined : model.checksTone}
                label={model.checksLabel}
              />
            ) : checksQuery.isLoading ? (
              <Chip size="small" variant="outlined" label="Checks…" />
            ) : null}
            {model.reviewLabel ? (
              <Chip size="small" variant="outlined" label={model.reviewLabel} />
            ) : null}
          </Stack>
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0, ml: 'auto' }}>
          {offer ? (
            <ControlTooltip title={offer.body} disabled={pending}>
              <Button
                size="small"
                variant="outlined"
                color={
                  offer.severity === 'error'
                    ? 'error'
                    : offer.severity === 'success'
                      ? 'success'
                      : 'primary'
                }
                startIcon={prActionIcon(offer.kind)}
                disabled={pending}
                onClick={() => runOffer(offer)}
              >
                {prActionLabel(offer.kind, pending)}
              </Button>
            </ControlTooltip>
          ) : null}
          <ControlTooltip title="PR actions">
            <IconButton
              size="small"
              aria-label="PR actions"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>

        {actionError ? (
          <Typography variant="caption" color="error" sx={{ width: '100%' }}>
            {actionError.message}
          </Typography>
        ) : null}
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem component={RouterLink} to={inAppPath} onClick={() => setMenuAnchor(null)}>
          <ListItemIcon>
            <OpenInNewOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Open pull request
        </MenuItem>
        {menuActions.map((item) => (
          <MenuItem
            key={item.kind}
            disabled={startTemplate.isPending || markReady.isPending}
            onClick={() =>
              runOffer({
                kind: item.kind,
                fingerprint: `${item.kind}:menu`,
                title: prActionLabel(item.kind, false),
                body: '',
                severity: 'info',
              })
            }
          >
            <ListItemIcon>{prActionIcon(item.kind)}</ListItemIcon>
            {prActionLabel(item.kind, false)}
          </MenuItem>
        ))}
        {offer ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              dismiss(offer.fingerprint);
            }}
          >
            Dismiss “{prActionLabel(offer.kind, false)}”
          </MenuItem>
        ) : null}
      </Menu>

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
