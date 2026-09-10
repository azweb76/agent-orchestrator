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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useQuery } from '@tanstack/react-query';
import type {
  AgentTask,
  CreateAgentTaskRequest,
  UpdateAgentTaskRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { AgentTaskDialog } from '../../components/AgentTaskDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { useBrainCrud } from './useBrainCrud';

export function BrainTasksPanel({
  onDraftWithAi,
  onImprove,
}: {
  onDraftWithAi: () => void;
  onImprove: (task: AgentTask) => void;
}) {
  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
  });

  const crud = useBrainCrud<AgentTask, CreateAgentTaskRequest, UpdateAgentTaskRequest>({
    queryKey: ['agent-tasks'],
    identify: (task) => task.id,
    create: api.createAgentTask,
    update: api.updateAgentTask,
    remove: api.deleteAgentTask,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Ask the copilot to draft one or more tasks">
          <Button variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />} onClick={onDraftWithAi}>
            Draft with AI
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a kickoff task">
          <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
            New task
          </Button>
        </ControlTooltip>
      </Stack>

      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {crud.deleteError ? <Alert severity="error">{crud.deleteError}</Alert> : null}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tasks?.length === 0 ? (
        <EmptyState
          icon={<TuneOutlinedIcon />}
          title="No agent tasks"
          description="Tasks define the prompt, model, effort, permissions, and tools a new agent session starts with."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
              New task
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {tasks?.map((task) => (
            <ListRow
              key={task.id}
              onClick={() => crud.openEdit(task)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Edit task">
                    <IconButton aria-label={`Edit ${task.title}`} onClick={() => crud.openEdit(task)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${task.title}`} onClick={() => onImprove(task)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip
                    title={task.builtIn ? 'Built-in tasks cannot be deleted' : 'Delete task'}
                    disabled={task.builtIn || crud.deleting}
                  >
                    <span>
                      <IconButton
                        aria-label={`Delete ${task.title}`}
                        disabled={task.builtIn || crud.deleting}
                        onClick={() => crud.askDelete(task)}
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
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <AgentTaskDialog
        open={crud.formOpen}
        task={crud.editing}
        saving={crud.saving}
        error={crud.saveError}
        onClose={crud.closeForm}
        onSave={crud.save}
      />

      <ConfirmDialog
        open={Boolean(crud.deleteTarget)}
        title="Delete task?"
        description={`This deletes the "${crud.deleteTarget?.title ?? ''}" kickoff task and cannot be undone.`}
        confirmLabel="Delete"
        loading={crud.deleting}
        onCancel={crud.cancelDelete}
        onConfirm={crud.confirmDelete}
      />
    </Stack>
  );
}
