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
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentTask,
  CreateAgentTaskRequest,
  UpdateAgentTaskRequest,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { AgentTaskDialog } from '../components/AgentTaskDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageHeader } from '../components/ui/PageHeader';

export function TasksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentTask | null>(null);

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: CreateAgentTaskRequest | UpdateAgentTaskRequest) => {
      if (editing) return api.updateAgentTask(editing.id, body);
      return api.createAgentTask(body as CreateAgentTaskRequest);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAgentTask(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (task: AgentTask) => {
    setEditing(task);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Agents"
        title="Tasks"
        description="Define purpose, prompt templates, system prompts, models, effort, permissions, and allowed tools for agent sessions. From goal can Auto-select a task using purpose."
        actions={
          <ControlTooltip title="Create a new task">
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New task
            </Button>
          </ControlTooltip>
        }
      />

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
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New task
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {tasks?.map((task) => (
            <ListRow
              key={task.id}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <ControlTooltip title="Edit task">
                    <IconButton aria-label={`Edit ${task.title}`} onClick={() => openEdit(task)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip
                    title={task.builtIn ? 'Built-in tasks cannot be deleted' : 'Delete task'}
                    disabled={task.builtIn || deleteMutation.isPending}
                  >
                    <span>
                      <IconButton
                        aria-label={`Delete ${task.title}`}
                        disabled={task.builtIn || deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete task “${task.title}”?`)) {
                            deleteMutation.mutate(task.id);
                          }
                        }}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </ControlTooltip>
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
                {task.promptTemplate || task.systemPrompt || task.allowedTools ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {[
                      task.promptTemplate ? 'prompt template' : null,
                      task.systemPrompt ? 'system prompt' : null,
                      task.allowedTools ? 'allowed tools' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                ) : null}
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <AgentTaskDialog
        open={dialogOpen}
        task={editing}
        saving={saveMutation.isPending}
        error={saveMutation.error ? (saveMutation.error as Error).message : null}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          saveMutation.reset();
        }}
        onSave={(body) => saveMutation.mutate(body)}
      />
    </Stack>
  );
}
