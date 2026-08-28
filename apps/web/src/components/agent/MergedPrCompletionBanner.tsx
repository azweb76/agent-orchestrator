import { Alert, Button, Stack, Typography } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { ControlTooltip } from '../ui/ControlTooltip';
import { pullRequestPath } from '../../utils/paths';

export interface MergedPrCompletionBannerProps {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle?: string;
  archived: boolean;
  archivePending?: boolean;
  onArchive?: () => void;
  onDismiss?: () => void;
}

/** Shown after a successful merge from the agent page when the agent is still active. */
export function MergedPrCompletionBanner({
  owner,
  repo,
  prNumber,
  prTitle,
  archived,
  archivePending,
  onArchive,
  onDismiss,
}: MergedPrCompletionBannerProps) {
  if (archived) return null;

  return (
    <Alert
      severity="success"
      icon={<CelebrationOutlinedIcon />}
      sx={{ '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {onArchive ? (
            <ControlTooltip title="Archive this agent now that the PR is merged" disabled={archivePending}>
              <Button
                color="inherit"
                size="small"
                startIcon={<ArchiveOutlinedIcon />}
                disabled={archivePending}
                onClick={onArchive}
              >
                Archive
              </Button>
            </ControlTooltip>
          ) : null}
          <ControlTooltip title="Open the merged pull request">
            <Button
              color="inherit"
              size="small"
              component={RouterLink}
              to={pullRequestPath(owner, repo, prNumber)}
            >
              View PR
            </Button>
          </ControlTooltip>
          {onDismiss ? (
            <ControlTooltip title="Dismiss">
              <Button color="inherit" size="small" onClick={onDismiss}>
                Dismiss
              </Button>
            </ControlTooltip>
          ) : null}
        </Stack>
      }
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Pull request merged
      </Typography>
      <Typography variant="body2" color="text.secondary">
        #{prNumber}
        {prTitle ? ` ${prTitle}` : ''} is merged. Archive this agent when you are done, or keep it
        for follow-up.
      </Typography>
    </Alert>
  );
}
