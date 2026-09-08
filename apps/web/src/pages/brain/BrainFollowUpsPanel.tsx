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
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskFollowUp } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';

export function BrainFollowUpsPanel({
  selectedKey,
  onNew,
  onSelect,
  onImprove,
}: {
  selectedKey: string | null;
  onNew: () => void;
  onSelect: (followUp: TaskFollowUp) => void;
  onImprove: (followUp: TaskFollowUp) => void;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: followUps, isLoading, error } = useQuery({
    queryKey: ['task-followups'],
    queryFn: api.listTaskFollowUps,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTaskFollowUp(id),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['task-followups'] });
    },
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <ControlTooltip title="Create a follow-up with AI">
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
            New follow-up
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
      ) : followUps?.length === 0 ? (
        <EmptyState
          icon={<LightbulbOutlinedIcon />}
          title="No follow-ups"
          description="Create follow-ups with a name, description, and prompt for AI to choose from after sessions."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
              New follow-up
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {followUps?.map((followUp) => (
            <ListRow
              key={followUp.id}
              selected={selectedKey === followUp.id}
              onClick={() => onSelect(followUp)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${followUp.title}`} onClick={() => onImprove(followUp)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  {pendingDelete === followUp.id ? (
                    <>
                      <Button size="small" color="error" onClick={() => deleteMutation.mutate(followUp.id)}>
                        Confirm
                      </Button>
                      <Button size="small" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
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
                          onClick={() => setPendingDelete(followUp.id)}
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
    </Stack>
  );
}
