import { Typography } from '@mui/material';
import type { DiffFile, DiffFileStatus } from '../../utils/parseUnifiedDiff';

const STATUS_COLOR: Record<DiffFileStatus, string> = {
  added: 'success.main',
  deleted: 'error.main',
  modified: 'warning.main',
  renamed: 'info.main',
};

const STATUS_LETTER: Record<DiffFileStatus, string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
};

/** Trailing `+adds −dels A/D/M/R` badges for a diff file tree row. */
export function DiffFileMeta({ file }: { file: DiffFile }) {
  return (
    <>
      <Typography
        component="span"
        variant="caption"
        sx={{ color: 'success.main', fontSize: 10.5, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        +{file.additions}
      </Typography>
      <Typography
        component="span"
        variant="caption"
        sx={{ color: 'error.main', fontSize: 10.5, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        −{file.deletions}
      </Typography>
      <Typography
        component="span"
        variant="caption"
        sx={{ color: STATUS_COLOR[file.status], fontWeight: 700, fontSize: 11, flexShrink: 0 }}
      >
        {STATUS_LETTER[file.status]}
      </Typography>
    </>
  );
}
