import { useState } from 'react';
import {
  Button,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
} from '@mui/material';
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined';
import CommitOutlinedIcon from '@mui/icons-material/CommitOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluateMergeReadiness, type AgentDetail } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { ControlTooltip } from '../ui/ControlTooltip';
import { useAgentLinkedPr } from './useAgentLinkedPr';

export interface AgentShipActionsProps {
  agent: AgentDetail;
  archived: boolean;
  onCommit: (opts: { push: boolean; hasPendingChanges: boolean }) => void;
  onCreateDraftPr: () => void;
}

function githubPrUrl(owner: string, repo: string, prNumber: number, htmlUrl?: string): string {
  return htmlUrl || `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}

/**
 * Simplified agent chrome: open the linked PR on GitHub, plus a single Changes
 * menu for commit / push / draft PR / mark ready / merge.
 */
export function AgentShipActions({
  agent,
  archived,
  onCommit,
  onCreateDraftPr,
}: AgentShipActionsProps) {
  const queryClient = useQueryClient();
  const { enabled, owner, repo, prNumber, prKey, pr } = useAgentLinkedPr(agent);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const pendingQuery = useQuery({
    queryKey: ['diff', agent.id, 'pending'],
    queryFn: () => api.getDiff(agent.id, 'pending'),
    enabled: Boolean(agent.id) && !archived,
    staleTime: 10_000,
  });
  const hasPendingChanges = Boolean(pendingQuery.data?.patch);

  const markReady = useMutation({
    mutationFn: () => api.markPullRequestReady(owner, repo, prNumber!),
    onSuccess: () => {
      setMenuAnchor(null);
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
      setMergeOpen(false);
      setMenuAnchor(null);
      queryClient.invalidateQueries({ queryKey: prKey });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
    },
  });

  const open = Boolean(pr && pr.state === 'open' && !pr.merged);
  const canMarkReady = open && Boolean(pr?.draft) && !archived;
  const canMerge =
    open && !pr?.draft && !archived && Boolean(pr && evaluateMergeReadiness(pr).canMerge);
  const canCreateDraft = !enabled && !archived;
  const showChangesMenu =
    !archived && (hasPendingChanges || canCreateDraft || canMarkReady || canMerge);

  const busy = markReady.isPending || mergeMutation.isPending;
  const actionError = (markReady.error as Error | null) ?? (mergeMutation.error as Error | null);

  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
        {enabled && prNumber != null ? (
          <ControlTooltip title={`Open pull request #${prNumber} on GitHub`}>
            <Button
              size="small"
              variant="contained"
              component="a"
              href={githubPrUrl(owner, repo, prNumber, pr?.htmlUrl)}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<OpenInNewOutlinedIcon />}
            >
              Open PR #{prNumber}
            </Button>
          </ControlTooltip>
        ) : null}

        {showChangesMenu ? (
          <ControlTooltip title="Commit, push, or advance the pull request" disabled={busy}>
            <Button
              size="small"
              variant="outlined"
              endIcon={
                busy ? <CircularProgress size={14} color="inherit" /> : <ExpandMoreIcon />
              }
              disabled={busy}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              Changes
            </Button>
          </ControlTooltip>
        ) : null}
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {hasPendingChanges ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onCommit({ push: false, hasPendingChanges: true });
            }}
          >
            <ListItemIcon>
              <CommitOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Commit</ListItemText>
          </MenuItem>
        ) : null}
        {hasPendingChanges ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onCommit({ push: true, hasPendingChanges: true });
            }}
          >
            <ListItemIcon>
              <UploadOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Commit &amp; push</ListItemText>
          </MenuItem>
        ) : null}
        {canCreateDraft ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onCreateDraftPr();
            }}
          >
            <ListItemIcon>
              <PublishOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Create draft PR</ListItemText>
          </MenuItem>
        ) : null}
        {canMarkReady ? (
          <MenuItem disabled={markReady.isPending} onClick={() => markReady.mutate()}>
            <ListItemIcon>
              <RateReviewOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {markReady.isPending ? 'Marking ready…' : 'Mark ready for review'}
            </ListItemText>
          </MenuItem>
        ) : null}
        {canMerge ? (
          <MenuItem
            disabled={mergeMutation.isPending}
            onClick={() => {
              setMenuAnchor(null);
              setMergeOpen(true);
            }}
          >
            <ListItemIcon>
              <CallMergeOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Merge</ListItemText>
          </MenuItem>
        ) : null}
        {actionError ? (
          <MenuItem disabled sx={{ opacity: 1, whiteSpace: 'normal', maxWidth: 280 }}>
            <ListItemText
              primary={actionError.message}
              slotProps={{ primary: { sx: { color: 'error.main', typography: 'caption' } } }}
            />
          </MenuItem>
        ) : null}
      </Menu>

      <ConfirmDialog
        open={mergeOpen}
        title={prNumber != null ? `Merge PR #${prNumber}?` : 'Merge pull request?'}
        description={
          mergeMutation.error
            ? (mergeMutation.error as Error).message
            : 'Merges with the repository’s preferred method. This cannot be undone from the app.'
        }
        confirmLabel="Merge pull request"
        confirmColor="primary"
        loading={mergeMutation.isPending}
        onCancel={() => {
          setMergeOpen(false);
          mergeMutation.reset();
        }}
        onConfirm={() => mergeMutation.mutate()}
      />
    </>
  );
}
