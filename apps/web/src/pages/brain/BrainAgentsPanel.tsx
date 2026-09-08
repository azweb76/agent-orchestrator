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
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonalAgent } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { InstallAgentsFromRepoDialog } from './InstallAgentsFromRepoDialog';

export function BrainAgentsPanel({
  selectedKey,
  onNew,
  onSelect,
  onImprove,
}: {
  selectedKey: string | null;
  onNew: () => void;
  onSelect: (agent: PersonalAgent) => void;
  onImprove: (agent: PersonalAgent) => void;
}) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['personal-agents'],
    queryFn: api.listPersonalAgents,
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deletePersonalAgent(slug),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
    },
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy agent markdown from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen((open) => !open)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal subagent with AI">
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
              New agent
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {agents?.map((agent) => (
            <ListRow
              key={agent.slug}
              selected={selectedKey === agent.slug}
              onClick={() => onSelect(agent)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${agent.name}`} onClick={() => onImprove(agent)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  {pendingDelete === agent.slug ? (
                    <>
                      <Button size="small" color="error" onClick={() => deleteMutation.mutate(agent.slug)}>
                        Confirm
                      </Button>
                      <Button size="small" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <ControlTooltip title="Delete agent" disabled={deleteMutation.isPending}>
                      <span>
                        <IconButton
                          aria-label={`Delete ${agent.name}`}
                          disabled={deleteMutation.isPending}
                          onClick={() => setPendingDelete(agent.slug)}
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
    </Stack>
  );
}
