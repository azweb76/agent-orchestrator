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
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useQuery } from '@tanstack/react-query';
import type {
  CreateTaskFollowUpRequest,
  TaskFollowUp,
  UpdateTaskFollowUpRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskFollowUpDialog } from '../../components/TaskFollowUpDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { useBrainCrud } from './useBrainCrud';

export function BrainFollowUpsPanel({
  onDraftWithAi,
  onImprove,
}: {
  onDraftWithAi: () => void;
  onImprove: (followUp: TaskFollowUp) => void;
}) {
  const { data: followUps, isLoading, error } = useQuery({
    queryKey: ['task-followups'],
    queryFn: api.listTaskFollowUps,
  });

  const crud = useBrainCrud<TaskFollowUp, CreateTaskFollowUpRequest, UpdateTaskFollowUpRequest>({
    queryKey: ['task-followups'],
    identify: (followUp) => followUp.id,
    create: api.createTaskFollowUp,
    update: api.updateTaskFollowUp,
    remove: api.deleteTaskFollowUp,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Ask the copilot to draft one or more follow-ups">
          <Button variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />} onClick={onDraftWithAi}>
            Draft with AI
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a follow-up chip">
          <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
            New follow-up
          </Button>
        </ControlTooltip>
      </Stack>

      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {crud.deleteError ? <Alert severity="error">{crud.deleteError}</Alert> : null}

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
            <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
              New follow-up
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {followUps?.map((followUp) => (
            <ListRow
              key={followUp.id}
              onClick={() => crud.openEdit(followUp)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Edit follow-up">
                    <IconButton aria-label={`Edit ${followUp.title}`} onClick={() => crud.openEdit(followUp)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${followUp.title}`} onClick={() => onImprove(followUp)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip
                    title={
                      followUp.builtIn ? 'Built-in follow-ups cannot be deleted' : 'Delete follow-up'
                    }
                    disabled={followUp.builtIn || crud.deleting}
                  >
                    <span>
                      <IconButton
                        aria-label={`Delete ${followUp.title}`}
                        disabled={followUp.builtIn || crud.deleting}
                        onClick={() => crud.askDelete(followUp)}
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
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Prompt: {followUp.prompt}
                  </Typography>
                ) : null}
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <TaskFollowUpDialog
        open={crud.formOpen}
        followUp={crud.editing}
        saving={crud.saving}
        error={crud.saveError}
        onClose={crud.closeForm}
        onSave={crud.save}
      />

      <ConfirmDialog
        open={Boolean(crud.deleteTarget)}
        title="Delete follow-up?"
        description={`This deletes the "${crud.deleteTarget?.title ?? ''}" follow-up chip and cannot be undone.`}
        confirmLabel="Delete"
        loading={crud.deleting}
        onCancel={crud.cancelDelete}
        onConfirm={crud.confirmDelete}
      />
    </Stack>
  );
}
