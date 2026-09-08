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
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePersonalAgentRequest,
  PersonalAgent,
  UpdatePersonalAgentRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { PersonalAgentDialog } from './PersonalAgentDialog';
import { InstallAgentsFromRepoDialog } from './InstallAgentsFromRepoDialog';

export function BrainAgentsPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalAgent | null>(null);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['personal-agents'],
    queryFn: api.listPersonalAgents,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: CreatePersonalAgentRequest | UpdatePersonalAgentRequest) => {
      if (editing) return api.updatePersonalAgent(editing.slug, body);
      return api.createPersonalAgent(body as CreatePersonalAgentRequest);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deletePersonalAgent(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy agent markdown from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen(true)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal subagent">
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New agent
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
      ) : agents?.length === 0 ? (
        <EmptyState
          icon={<SmartToyOutlinedIcon />}
          title="No personal agents"
          description="Subagents in your user library (~/.claude/agents) are available to Claude across every workspace."
          action={
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen(true)}>
                Install from repo
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New agent
              </Button>
            </Stack>
          }
        />
      ) : (
        <ListPanel>
          {agents?.map((agent) => (
            <ListRow
              key={agent.slug}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <ControlTooltip title="Edit agent">
                    <IconButton
                      aria-label={`Edit ${agent.name}`}
                      onClick={() => {
                        setEditing(agent);
                        setDialogOpen(true);
                      }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Delete agent" disabled={deleteMutation.isPending}>
                    <span>
                      <IconButton
                        aria-label={`Delete ${agent.name}`}
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete personal agent “${agent.name}”?`)) {
                            deleteMutation.mutate(agent.slug);
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
        open={dialogOpen}
        agent={editing}
        saving={saveMutation.isPending}
        error={saveMutation.error ? (saveMutation.error as Error).message : null}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          saveMutation.reset();
        }}
        onSave={(body) => saveMutation.mutate(body)}
      />
      <InstallAgentsFromRepoDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={() => {
          void queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
        }}
      />
    </Stack>
  );
}
