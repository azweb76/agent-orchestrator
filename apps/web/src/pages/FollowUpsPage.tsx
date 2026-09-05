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
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaskFollowUpRequest,
  TaskFollowUp,
  UpdateTaskFollowUpRequest,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { TaskFollowUpDialog } from '../components/TaskFollowUpDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageHeader } from '../components/ui/PageHeader';

export function FollowUpsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFollowUp | null>(null);

  const { data: followUps, isLoading, error } = useQuery({
    queryKey: ['task-followups'],
    queryFn: api.listTaskFollowUps,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: CreateTaskFollowUpRequest | UpdateTaskFollowUpRequest) => {
      if (editing) return api.updateTaskFollowUp(editing.id, body);
      return api.createTaskFollowUp(body as CreateTaskFollowUpRequest);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-followups'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTaskFollowUp(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-followups'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (followUp: TaskFollowUp) => {
    setEditing(followUp);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Agents"
        title="Follow-ups"
        description="Manage the catalog of post-session follow-up chips. After a session finishes, AI picks which enabled entries to show using agent state and recent assistant replies."
        actions={
          <ControlTooltip title="Create a new follow-up">
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New follow-up
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
      ) : followUps?.length === 0 ? (
        <EmptyState
          icon={<LightbulbOutlinedIcon />}
          title="No follow-ups"
          description="Create follow-ups with a name, description, and prompt for AI to choose from after sessions."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New follow-up
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {followUps?.map((followUp) => (
            <ListRow
              key={followUp.id}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <ControlTooltip title="Edit follow-up">
                    <IconButton
                      aria-label={`Edit ${followUp.title}`}
                      onClick={() => openEdit(followUp)}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip
                    title={
                      followUp.builtIn
                        ? 'Built-in follow-ups cannot be deleted'
                        : 'Delete follow-up'
                    }
                    disabled={followUp.builtIn || deleteMutation.isPending}
                  >
                    <span>
                      <IconButton
                        aria-label={`Delete ${followUp.title}`}
                        disabled={followUp.builtIn || deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete follow-up “${followUp.title}”?`)) {
                            deleteMutation.mutate(followUp.id);
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
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <ListRowTitle>{followUp.title}</ListRowTitle>
                  <Chip size="small" label={followUp.name} variant="outlined" />
                  {followUp.builtIn ? (
                    <Chip size="small" label="Built-in" color="primary" variant="outlined" />
                  ) : null}
                  {!followUp.enabled ? (
                    <Chip size="small" label="Disabled" variant="outlined" />
                  ) : null}
                  <Chip size="small" label={followUp.kind} variant="outlined" />
                </Stack>
                <ListRowMeta>
                  {followUp.description || followUp.prompt}
                  {followUp.template ? ` · template: ${followUp.template}` : ''}
                </ListRowMeta>
                {followUp.description ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    Prompt: {followUp.prompt}
                  </Typography>
                ) : null}
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <TaskFollowUpDialog
        open={dialogOpen}
        followUp={editing}
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
