import { Chip, type ChipProps } from '@mui/material';
import { PullRequestStatusIcon } from './PullRequestStatusIcon';
import {
  PULL_REQUEST_STATUS_LABELS,
  resolvePullRequestStatus,
  type PullRequestStatusKind,
} from './pullRequestStatus';

function chipColor(status: PullRequestStatusKind): ChipProps['color'] {
  switch (status) {
    case 'open':
      return 'success';
    case 'merged':
      return 'secondary';
    case 'closed':
      return 'error';
    case 'draft':
    default:
      return 'default';
  }
}

export interface PullRequestStatusChipProps {
  status?: PullRequestStatusKind;
  /** When `status` is omitted, derive it from GitHub PR fields. */
  pr?: { state: string; draft?: boolean; merged?: boolean };
  size?: ChipProps['size'];
  variant?: ChipProps['variant'];
  sx?: ChipProps['sx'];
}

/** Outlined chip with a GitHub-style PR icon (not a colored status dot). */
export function PullRequestStatusChip({
  status: statusProp,
  pr,
  size = 'small',
  variant = 'outlined',
  sx,
}: PullRequestStatusChipProps) {
  const status = statusProp ?? (pr ? resolvePullRequestStatus(pr) : 'open');
  return (
    <Chip
      size={size}
      variant={variant}
      color={chipColor(status)}
      icon={<PullRequestStatusIcon status={status} sx={{ ml: 0.5 }} />}
      label={PULL_REQUEST_STATUS_LABELS[status]}
      sx={sx}
    />
  );
}
