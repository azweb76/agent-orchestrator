import { Chip, Stack, Typography } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

export interface ToolActivityItem {
  id: string;
  name: string;
  detail?: string;
  status: 'running' | 'done';
}

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

export function ToolActivity({ items }: { items: ToolActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <Stack spacing={0.75} sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        Tool activity
      </Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {items.map((item) => (
          <Chip
            key={item.id}
            size="small"
            icon={iconForTool(item.name)}
            label={item.detail ? `${item.name}: ${item.detail}` : item.name}
            color={item.status === 'running' ? 'info' : 'default'}
            variant={item.status === 'running' ? 'filled' : 'outlined'}
            sx={{ maxWidth: 360 }}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export function extractToolActivity(
  event: Record<string, unknown>,
  prev: ToolActivityItem[],
): ToolActivityItem[] {
  const type = String(event.type ?? '');
  const nested = (event.event as Record<string, unknown> | undefined) ?? undefined;
  const content =
    (event.message as { content?: unknown } | undefined)?.content ??
    nested?.content ??
    (event.content as unknown);

  let next = [...prev];

  const pushTool = (name: string, detail?: string) => {
    const id = `${name}-${detail ?? ''}-${next.length}`;
    next = [
      ...next.filter((item) => !(item.name === name && item.status === 'running')),
      { id, name, detail, status: 'running' as const },
    ].slice(-8);
  };

  const completeTools = () => {
    next = next.map((item) => (item.status === 'running' ? { ...item, status: 'done' as const } : item));
  };

  if (type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const name = String(b.name ?? 'tool');
        const input = b.input as Record<string, unknown> | undefined;
        const detail =
          (typeof input?.file_path === 'string' && input.file_path) ||
          (typeof input?.path === 'string' && input.path) ||
          (typeof input?.command === 'string' && String(input.command).slice(0, 60)) ||
          (typeof input?.pattern === 'string' && input.pattern) ||
          undefined;
        pushTool(name, detail);
      }
    }
  }

  if (type === 'stream_event' && nested) {
    const delta = nested.delta as Record<string, unknown> | undefined;
    if (nested.type === 'content_block_start') {
      const block = nested.content_block as Record<string, unknown> | undefined;
      if (block?.type === 'tool_use') {
        pushTool(String(block.name ?? 'tool'));
      }
    }
    if (delta?.type === 'input_json_delta') {
      // keep running chip as-is
    }
  }

  if (type === 'user' || type === 'result') {
    completeTools();
  }

  if (type === 'tool_result' || (Array.isArray(content) && content.some((c) => (c as { type?: string })?.type === 'tool_result'))) {
    completeTools();
  }

  return next;
}
