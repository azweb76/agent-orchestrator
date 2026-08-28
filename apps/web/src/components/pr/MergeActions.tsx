import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MergeReadiness,
  PullRequestDetail,
  PullRequestMergeMethod,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

const ALL_METHODS: PullRequestMergeMethod[] = ['merge', 'squash', 'rebase'];

const METHOD_LABELS: Record<PullRequestMergeMethod, string> = {
  merge: 'Create a merge commit',
  squash: 'Squash and merge',
  rebase: 'Rebase and merge',
};

const METHOD_BUTTONS: Record<PullRequestMergeMethod, string> = {
  merge: 'Merge pull request',
  squash: 'Squash and merge',
  rebase: 'Rebase and merge',
};

function methodDisabledReason(
  method: PullRequestMergeMethod,
  pr: PullRequestDetail,
): string | null {
  if (!pr.allowedMergeMethods.includes(method)) {
    return `${METHOD_LABELS[method]} is disabled in the repository settings.`;
  }
  if (method === 'rebase' && pr.rebaseable === false) {
    return 'This branch cannot be rebased cleanly onto the base branch.';
  }
  return null;
}

export function MergeActions({ pr, readiness }: { pr: PullRequestDetail; readiness: MergeReadiness }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PullRequestMergeMethod>(readiness.allowedMethods[0] ?? 'merge');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [commitTitle, setCommitTitle] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [confirming, setConfirming] = useState<'open' | 'closed' | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  // Repo settings and rebaseability can change under us, so never keep an invalid selection.
  const activeMethod = readiness.allowedMethods.includes(method)
    ? method
    : (readiness.allowedMethods[0] ?? 'merge');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pr', pr.owner, pr.repo, pr.number] });
    queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
  };

  const mergeMutation = useMutation({
    mutationFn: () =>
      api.mergePullRequest(pr.owner, pr.repo, pr.number, {
        method: activeMethod,
        // GitHub ignores the commit fields for a rebase merge.
        ...(activeMethod === 'rebase'
          ? {}
          : {
              commitTitle: commitTitle.trim() || undefined,
              commitMessage: commitMessage.trim() || undefined,
            }),
        expectedHeadSha: pr.headSha,
      }),
    onSuccess: () => {
      setMergeOpen(false);
      invalidate();
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: () =>
      api.updatePullRequestBranch(pr.owner, pr.repo, pr.number, { expectedHeadSha: pr.headSha }),
    onSuccess: () => {
      invalidate();
      // The update is queued on GitHub's side, so the immediate refetch still
      // reports the old head sha. One delayed refetch picks up the new one.
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(invalidate, 2000);
    },
  });

  const stateMutation = useMutation({
    mutationFn: (state: 'open' | 'closed') =>
      api.setPullRequestState(pr.owner, pr.repo, pr.number, state),
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
  });

  const readyMutation = useMutation({
    mutationFn: () => api.markPullRequestReady(pr.owner, pr.repo, pr.number),
    onSuccess: invalidate,
  });

  const busy =
    mergeMutation.isPending ||
    updateBranchMutation.isPending ||
    stateMutation.isPending ||
    readyMutation.isPending;
  const error =
    (mergeMutation.error as Error | null)?.message ??
    (updateBranchMutation.error as Error | null)?.message ??
    (stateMutation.error as Error | null)?.message ??
    (readyMutation.error as Error | null)?.message;

  const openMergeDialog = () => {
    setCommitTitle(`${pr.title} (#${pr.number})`);
    setCommitMessage('');
    mergeMutation.reset();
    setMergeOpen(true);
  };

  return (
    <Stack spacing={1}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' } }}
      >
        {pr.draft && pr.state === 'open' && !pr.merged ? (
          <Button
            variant="contained"
            startIcon={<RateReviewOutlinedIcon />}
            disabled={busy}
            onClick={() => readyMutation.mutate()}
            fullWidth={false}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {readyMutation.isPending ? 'Marking ready…' : 'Ready for review'}
          </Button>
        ) : null}

        {readiness.allowedMethods.length > 0 ? (
          <ButtonGroup
            variant="contained"
            disabled={!readiness.canMerge || busy}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            <Button
              startIcon={<MergeTypeIcon />}
              onClick={openMergeDialog}
              sx={{ flex: { xs: 1, sm: 'none' } }}
            >
              {METHOD_BUTTONS[activeMethod]}
            </Button>
            <Button
              size="small"
              aria-label="Select merge method"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <ArrowDropDownIcon />
            </Button>
          </ButtonGroup>
        ) : null}

        {readiness.canUpdateBranch ? (
          <Button
            variant="outlined"
            startIcon={<SyncOutlinedIcon />}
            disabled={busy}
            onClick={() => updateBranchMutation.mutate()}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {updateBranchMutation.isPending ? 'Updating…' : 'Update branch'}
          </Button>
        ) : null}

        {pr.state === 'open' ? (
          <Button
            variant="outlined"
            color="error"
            disabled={busy}
            onClick={() => setConfirming('closed')}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Close pull request
          </Button>
        ) : null}

        {pr.state === 'closed' && !pr.merged ? (
          <Button
            variant="outlined"
            startIcon={<LockOpenOutlinedIcon />}
            disabled={busy}
            onClick={() => setConfirming('open')}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Reopen pull request
          </Button>
        ) : null}
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {ALL_METHODS.map((option) => {
          const disabledReason = methodDisabledReason(option, pr);
          const item = (
            <MenuItem
              key={option}
              selected={option === activeMethod}
              disabled={Boolean(disabledReason)}
              onClick={() => {
                setMethod(option);
                setMenuAnchor(null);
              }}
            >
              <ListItemText primary={METHOD_LABELS[option]} />
            </MenuItem>
          );
          // A disabled MenuItem swallows pointer events, so the tooltip needs a live wrapper.
          return disabledReason ? (
            <Tooltip key={option} title={disabledReason} placement="left">
              <span>{item}</span>
            </Tooltip>
          ) : (
            item
          );
        })}
      </Menu>

      <ResponsiveDialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{METHOD_LABELS[activeMethod]}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Merging <strong>{pr.headRef}</strong> into <strong>{pr.baseRef}</strong> at{' '}
              {pr.headSha.slice(0, 7)}.
            </Typography>
            {activeMethod === 'rebase' ? (
              <Alert severity="info">
                A rebase replays each commit onto {pr.baseRef} and keeps the original commit
                messages.
              </Alert>
            ) : (
              <>
                <TextField
                  label="Commit title"
                  value={commitTitle}
                  onChange={(event) => setCommitTitle(event.target.value)}
                  fullWidth
                  autoFocus
                />
                <TextField
                  label="Commit message"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  fullWidth
                  multiline
                  minRows={3}
                />
              </>
            )}
            {mergeMutation.error ? (
              <Alert severity="error">{(mergeMutation.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<MergeTypeIcon />}
            disabled={mergeMutation.isPending}
            onClick={() => mergeMutation.mutate()}
          >
            {mergeMutation.isPending ? 'Merging…' : 'Confirm merge'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'open' ? 'Reopen pull request?' : 'Close pull request?'}
        description={
          confirming === 'open'
            ? `This reopens #${pr.number} on GitHub without pushing any commits.`
            : `This closes #${pr.number} on GitHub without merging it. You can reopen it later.`
        }
        confirmLabel={confirming === 'open' ? 'Reopen' : 'Close PR'}
        confirmColor={confirming === 'open' ? 'primary' : 'error'}
        loading={stateMutation.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) stateMutation.mutate(confirming);
        }}
      />
    </Stack>
  );
}
