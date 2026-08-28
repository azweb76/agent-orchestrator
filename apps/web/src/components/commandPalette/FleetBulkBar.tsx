import { Button, Stack } from '@mui/material';
import type { FleetBulkActionId, FleetBulkCounts } from './fleetBulkActions';
import { fleetBulkActionLabel } from './fleetBulkActions';
import { ControlTooltip } from '../ui/ControlTooltip';

interface FleetBulkBarProps {
  counts: FleetBulkCounts;
  loading: boolean;
  onAction: (action: FleetBulkActionId) => void;
}

const ORDER: FleetBulkActionId[] = [
  'open-needs-input-all',
  'fix-ci-all',
  'address-review-all',
  'archive-merged-all',
];

export function FleetBulkBar({ counts, loading, onAction }: FleetBulkBarProps) {
  const buttons = ORDER.flatMap((action) => {
    const count =
      action === 'fix-ci-all'
        ? counts.fixCi
        : action === 'address-review-all'
          ? counts.addressReview
          : action === 'archive-merged-all'
            ? counts.archiveMerged
            : counts.needsInput;
    if (count <= 0) return [];
    const color =
      action === 'open-needs-input-all'
        ? 'warning'
        : action === 'archive-merged-all'
          ? 'warning'
          : 'secondary';
    return [
      <ControlTooltip
        key={action}
        title={
          action === 'archive-merged-all'
            ? 'Archive agents whose pull requests have merged'
            : undefined
        }
        disabled={action !== 'archive-merged-all'}
      >
        <Button
          size="small"
          variant={action === 'open-needs-input-all' ? 'contained' : 'outlined'}
          color={color}
          disabled={loading}
          onClick={() => onAction(action)}
        >
          {fleetBulkActionLabel(action, count)}
        </Button>
      </ControlTooltip>,
    ];
  });

  if (buttons.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
      {buttons}
    </Stack>
  );
}
