import { Button, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export type AssistantStarter = {
  id: string;
  label: string;
  prompt: string;
};

const FALLBACK_STARTERS: AssistantStarter[] = [
  {
    id: 'queue',
    label: 'Work queue',
    prompt: 'What needs attention in my work queue right now?',
  },
  {
    id: 'inbox',
    label: 'PR inbox',
    prompt: 'Summarize my pull request inbox and assigned issues.',
  },
  {
    id: 'fleet',
    label: 'Fleet status',
    prompt: 'Summarize the fleet: running, idle, and blocked agents.',
  },
];

export function buildAssistantStarters(input: {
  blockedCount: number;
  runningCount: number;
}): AssistantStarter[] {
  const starters: AssistantStarter[] = [];
  if (input.blockedCount > 0) {
    starters.push({
      id: 'unblock',
      label:
        input.blockedCount === 1
          ? 'Unblock 1 agent'
          : `Unblock ${input.blockedCount} agents`,
      prompt:
        input.blockedCount === 1
          ? 'An agent is waiting on a permission. List pending permissions and help me unblock it.'
          : `${input.blockedCount} agents are waiting on permissions. List pending permissions and help me unblock them.`,
    });
  }
  if (input.runningCount > 0) {
    starters.push({
      id: 'running',
      label: 'Running agents',
      prompt: 'Summarize what the running agents are doing and whether any need me.',
    });
  }
  for (const starter of FALLBACK_STARTERS) {
    if (starters.length >= 3) break;
    if (starters.some((item) => item.id === starter.id)) continue;
    starters.push(starter);
  }
  return starters.slice(0, 3);
}

export function AssistantStarterChips({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    staleTime: 15_000,
  });

  const agents = sidebarQuery.data?.flatMap((ws) => ws.agents) ?? [];
  const blockedCount = agents.filter((agent) => (agent.pendingPermissionCount ?? 0) > 0).length;
  const runningCount = agents.filter((agent) => agent.status === 'running').length;
  const starters = buildAssistantStarters({ blockedCount, runningCount });

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
