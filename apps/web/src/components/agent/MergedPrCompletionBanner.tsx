import { Alert, Button, Stack, Typography } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';

export interface MergedPrCompletionBannerProps {
  archived: boolean;
  archivePending?: boolean;
  onArchive?: () => void;
  onDismiss?: () => void;
}

/** Shown after a successful merge from the agent page when the agent is still active. */
export function MergedPrCompletionBanner({
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
        Archive this agent when you are done, or keep it for follow-up.
      </Typography>
    </Alert>
  );
}
