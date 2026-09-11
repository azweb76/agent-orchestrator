import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { Chip, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { AgentTask } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../ui/EmptyState';
import { CHAT_EMPTY_STATE_DESCRIPTION, listedTasksForEmptyState } from './chatEmptyState';
import { CONTEXT_SLASH_CHIP_COMMANDS } from './slashComposer';

export function ChatPanelEmptyState({
  archived,
  onSlashCommand,
  onCreateTask,
}: {
  archived?: boolean;
  onSlashCommand: (command: string) => void;
  onCreateTask?: (task: AgentTask) => void;
}) {
  const listedTasksQuery = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
    select: listedTasksForEmptyState,
    enabled: Boolean(onCreateTask) && !archived,
  });
  const listedTasks = listedTasksQuery.data ?? [];

  return (
    <EmptyState
      compact
      icon={<ChatOutlinedIcon />}
      title="Start a conversation"
      description={CHAT_EMPTY_STATE_DESCRIPTION}
      action={
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {listedTasks.map((task) => (
            <Chip
              key={task.id}
              size="small"
              label={task.title}
              variant="outlined"
              clickable
              disabled={archived}
              onClick={() => onCreateTask?.(task)}
            />
          ))}
          {CONTEXT_SLASH_CHIP_COMMANDS.map((command) => (
            <Chip
              key={command}
              size="small"
              label={command}
              variant="outlined"
              clickable
              disabled={archived}
              onClick={() => onSlashCommand(command)}
              sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
            />
          ))}
        </Stack>
      }
    />
  );
}
