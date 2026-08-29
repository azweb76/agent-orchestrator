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
  CreateSessionProfileRequest,
  SessionProfile,
  UpdateSessionProfileRequest,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { SessionProfileDialog } from '../components/SessionProfileDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageHeader } from '../components/ui/PageHeader';

export function SessionProfilesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SessionProfile | null>(null);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ['session-profiles'],
    queryFn: api.listSessionProfiles,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: CreateSessionProfileRequest | UpdateSessionProfileRequest) => {
      if (editing) return api.updateSessionProfile(editing.id, body);
      return api.createSessionProfile(body as CreateSessionProfileRequest);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session-profiles'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSessionProfile(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session-profiles'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (profile: SessionProfile) => {
    setEditing(profile);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Agents"
        title="Session profiles"
        description="Define prompt templates, system prompts, models, effort, permissions, and allowed tools for agent sessions. Create agent → From goal uses the built-in from-goal profile."
        actions={
          <ControlTooltip title="Create a new session profile">
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New profile
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
      ) : profiles?.length === 0 ? (
        <EmptyState
          icon={<TuneOutlinedIcon />}
          title="No session profiles"
          description="Create a profile to reuse kickoff settings across agents."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New profile
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {profiles?.map((profile) => (
            <ListRow
              key={profile.id}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <ControlTooltip title="Edit profile">
                    <IconButton aria-label={`Edit ${profile.title}`} onClick={() => openEdit(profile)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip
                    title={profile.builtIn ? 'Built-in profiles cannot be deleted' : 'Delete profile'}
                    disabled={profile.builtIn || deleteMutation.isPending}
                  >
                    <span>
                      <IconButton
                        aria-label={`Delete ${profile.title}`}
                        disabled={profile.builtIn || deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete profile “${profile.title}”?`)) {
                            deleteMutation.mutate(profile.id);
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
                  <ListRowTitle>{profile.title}</ListRowTitle>
                  <Chip size="small" label={profile.name} variant="outlined" />
                  {profile.builtIn ? (
                    <Chip size="small" label="Built-in" color="primary" variant="outlined" />
                  ) : null}
                  {profile.listed ? <Chip size="small" label="Listed" variant="outlined" /> : null}
                </Stack>
                <ListRowMeta>
                  {profile.model} · {profile.effort} · {profile.permissionMode}
                  {profile.description ? ` · ${profile.description}` : ''}
                </ListRowMeta>
                {profile.promptTemplate || profile.systemPrompt || profile.allowedTools ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {[
                      profile.promptTemplate ? 'prompt template' : null,
                      profile.systemPrompt ? 'system prompt' : null,
                      profile.allowedTools ? 'allowed tools' : null,
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

      <SessionProfileDialog
        open={dialogOpen}
        profile={editing}
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
