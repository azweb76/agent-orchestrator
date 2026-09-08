import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentTask } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';

export function BrainTasksPanel({
  selectedKey,
  onNew,
  onSelect,
  onImprove,
}: {
  selectedKey: string | null;
  onNew: () => void;
  onSelect: (task: AgentTask) => void;
  onImprove: (task: AgentTask) => void;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAgentTask(id),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
    },
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <ControlTooltip title="Create a task with AI">
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
            New task
          </Button>
        </ControlTooltip>
      </Stack>

      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {deleteMutation.error ? (
        <Alert severity="error">{(deleteMutation.error as Error).message}</Alert>
      ) : null}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tasks?.length === 0 ? (
        <EmptyState
          icon={<TuneOutlinedIcon />}
          title="No tasks"
          description="Create a task to reuse kickoff settings and enable From goal Auto matching."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
              New task
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {tasks?.map((task) => (
            <ListRow
              key={task.id}
              selected={selectedKey === task.id}
              onClick={() => onSelect(task)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${task.title}`} onClick={() => onImprove(task)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  {pendingDelete === task.id ? (
                    <>
                      <Button size="small" color="error" onClick={() => deleteMutation.mutate(task.id)}>
                        Confirm
                      </Button>
                      <Button size="small" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <ControlTooltip
                      title={task.builtIn ? 'Built-in tasks cannot be deleted' : 'Delete task'}
                      disabled={task.builtIn || deleteMutation.isPending}
                    >
                      <span>
                        <IconButton
                          aria-label={`Delete ${task.title}`}
                          disabled={task.builtIn || deleteMutation.isPending}
                          onClick={() => setPendingDelete(task.id)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </ControlTooltip>
                  )}
                </Stack>
              }
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <ListRowTitle>{task.title}</ListRowTitle>
                  <Chip size="small" label={task.name} variant="outlined" />
                  {task.builtIn ? (
                    <Chip size="small" label="Built-in" color="primary" variant="outlined" />
                  ) : null}
                  {task.listed ? <Chip size="small" label="Listed" variant="outlined" /> : null}
                </Stack>
                <ListRowMeta>
                  {task.model} · {task.effort} · {task.permissionMode}
                  {task.description ? ` · ${task.description}` : ''}
                </ListRowMeta>
                {task.purpose ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Purpose: {task.purpose}
                  </Typography>
                ) : null}
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </Stack>
  );
}
