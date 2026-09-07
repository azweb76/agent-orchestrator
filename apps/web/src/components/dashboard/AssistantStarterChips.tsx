import { Button, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  buildAssistantStarters,
  type AssistantStarter,
  type AssistantStarterQueueItem,
  type WorkItemKind,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';

export type { AssistantStarter };

function asQueueItems(raw: unknown): AssistantStarterQueueItem[] {
  if (!Array.isArray(raw)) return [];
  const items: AssistantStarterQueueItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.kind !== 'string') continue;
    if (typeof row.title !== 'string' || typeof row.actionLabel !== 'string') continue;
    if (!row.action || typeof row.action !== 'object') continue;
    items.push({
      id: row.id,
      kind: row.kind as WorkItemKind,
      title: row.title,
      actionLabel: row.actionLabel,
      action: row.action as Record<string, unknown>,
    });
  }
  return items;
}

export function AssistantStarterChips({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  const queueQuery = useQuery({
    queryKey: ['assistant', 'work-queue'],
    queryFn: () => api.getAssistantWorkQueue(12),
    staleTime: 15_000,
  });

  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    staleTime: 15_000,
  });

  const agents = sidebarQuery.data?.flatMap((ws) => ws.agents) ?? [];
  const runningCount = agents.filter((agent) => agent.status === 'running').length;
  const items = asQueueItems(queueQuery.data?.items);
  const starters = buildAssistantStarters({ items, runningCount });

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', pt: 0.5 }}>
      {starters.map((starter) => (
        <Button
          key={starter.id}
          size="small"
          variant="outlined"
          color="secondary"
          disabled={disabled}
          onClick={() => onPick(starter.prompt)}
          sx={{ textTransform: 'none' }}
        >
          {starter.label}
        </Button>
      ))}
    </Stack>
  );
}
