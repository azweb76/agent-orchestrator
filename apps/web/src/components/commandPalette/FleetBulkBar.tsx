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
            ? 'Ask Assistant to archive agents whose PRs have merged'
            : action === 'open-needs-input-all'
              ? 'Ask Assistant to list and clear pending permissions'
              : 'Ask Assistant to start the matching session template'
        }
        disabled={false}
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
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {buttons}
    </Stack>
  );
}
