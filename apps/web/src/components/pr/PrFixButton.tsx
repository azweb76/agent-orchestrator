import { Button } from '@mui/material';
import { ControlTooltip } from '../ui/ControlTooltip';
import { prFixCopy, type PrFixCopySource, type PrKickoffTemplate } from './prFixCopy';

export function PrFixButton({
  template,
  source,
  pending,
  disabled,
  onClick,
}: {
  template: PrKickoffTemplate;
  source: PrFixCopySource;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const copy = prFixCopy(source, template);
  const busy = Boolean(pending || disabled);
  return (
    <ControlTooltip title={copy.tooltip} disabled={busy}>
      <Button color="inherit" size="small" disabled={busy} onClick={onClick}>
        {pending ? copy.busyLabel : copy.label}
      </Button>
    </ControlTooltip>
  );
}
