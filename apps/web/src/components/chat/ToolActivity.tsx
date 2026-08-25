import { Chip, Stack, Typography } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import type { ToolActivityItem } from '@agent-orchestrator/shared';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  appendStreamText,
  applyStreamEvent,
  extractToolActivity,
} from '@agent-orchestrator/shared';

function iconForTool(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('bash') || lower.includes('shell')) return <TerminalIcon fontSize="small" />;
  if (lower.includes('edit') || lower.includes('write')) return <EditOutlinedIcon fontSize="small" />;
  if (lower.includes('grep') || lower.includes('glob') || lower.includes('search')) {
    return <SearchIcon fontSize="small" />;
  }
  if (lower.includes('read')) return <DescriptionOutlinedIcon fontSize="small" />;
  return <BuildOutlinedIcon fontSize="small" />;
}

export function ToolChip({ item }: { item: ToolActivityItem }) {
  return (
    <Chip
      size="small"
      icon={iconForTool(item.name)}
      label={item.detail ? `${item.name}: ${item.detail}` : item.name}
      color={item.status === 'running' ? 'info' : 'default'}
      variant={item.status === 'running' ? 'filled' : 'outlined'}
      sx={{ maxWidth: 420 }}
    />
  );
}

export function ToolActivity({ items }: { items: ToolActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <Stack spacing={0.75} sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        Tool activity
      </Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {items.map((item) => (
          <ToolChip key={item.id} item={item} />
        ))}
      </Stack>
    </Stack>
  );
}
