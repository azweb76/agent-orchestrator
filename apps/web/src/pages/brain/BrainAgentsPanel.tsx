import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePersonalAgentRequest,
  PersonalAgent,
  UpdatePersonalAgentRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { InstallAgentsFromRepoDialog } from './InstallAgentsFromRepoDialog';
import { PersonalAgentDialog } from './PersonalAgentDialog';
import { useBrainCrud } from './useBrainCrud';

export function BrainAgentsPanel({
  onDraftWithAi,
  onImprove,
}: {
  onDraftWithAi: () => void;
  onImprove: (agent: PersonalAgent) => void;
}) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['personal-agents'],
    queryFn: api.listPersonalAgents,
  });

  const crud = useBrainCrud<PersonalAgent, CreatePersonalAgentRequest, UpdatePersonalAgentRequest>({
    queryKey: ['personal-agents'],
    identify: (agent) => agent.slug,
    create: api.createPersonalAgent,
    update: api.updatePersonalAgent,
    remove: api.deletePersonalAgent,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy agent markdown from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen((open) => !open)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Ask the copilot to draft one or more subagents">
          <Button variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />} onClick={onDraftWithAi}>
            Draft with AI
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal subagent">
          <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
            New agent
          </Button>
        </ControlTooltip>
      </Stack>

      {installOpen ? (
        <InstallAgentsFromRepoDialog
          open
          embedded
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            void queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
            setInstallOpen(false);
          }}
        />
      ) : null}

      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {crud.deleteError ? <Alert severity="error">{crud.deleteError}</Alert> : null}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : agents?.length === 0 ? (
        <EmptyState
          icon={<SmartToyOutlinedIcon />}
          title="No personal agents"
          description="Subagents in your user library (~/.claude/agents) are available to Claude across every workspace."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
              New agent
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {agents?.map((agent) => (
            <ListRow
              key={agent.slug}
              onClick={() => crud.openEdit(agent)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Edit agent">
                    <IconButton aria-label={`Edit ${agent.name}`} onClick={() => crud.openEdit(agent)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${agent.name}`} onClick={() => onImprove(agent)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Delete agent" disabled={crud.deleting}>
                    <span>
                      <IconButton
                        aria-label={`Delete ${agent.name}`}
                        disabled={crud.deleting}
                        onClick={() => crud.askDelete(agent)}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </ControlTooltip>
                </Stack>
              }
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <ListRowTitle>{agent.name}</ListRowTitle>
                <ListRowMeta>
                  {agent.slug}
                  {agent.description ? ` · ${agent.description}` : ''}
                </ListRowMeta>
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <PersonalAgentDialog
        open={crud.formOpen}
        agent={crud.editing}
        saving={crud.saving}
        error={crud.saveError}
        onClose={crud.closeForm}
        onSave={crud.save}
      />

      <ConfirmDialog
        open={Boolean(crud.deleteTarget)}
        title="Delete agent?"
        description={`This permanently deletes ~/.claude/agents/${crud.deleteTarget?.slug ?? ''}.md and cannot be undone.`}
        confirmLabel="Delete"
        loading={crud.deleting}
        onCancel={crud.cancelDelete}
        onConfirm={crud.confirmDelete}
      />
    </Stack>
  );
}
