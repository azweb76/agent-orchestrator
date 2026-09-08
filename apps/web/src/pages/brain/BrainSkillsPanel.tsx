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
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePersonalSkillRequest,
  PersonalSkill,
  UpdatePersonalSkillRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { PersonalSkillDialog } from './PersonalSkillDialog';
import { InstallSkillsFromRepoDialog } from './InstallSkillsFromRepoDialog';

export function BrainSkillsPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalSkill | null>(null);

  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['personal-skills'],
    queryFn: api.listPersonalSkills,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: CreatePersonalSkillRequest | UpdatePersonalSkillRequest) => {
      if (editing) return api.updatePersonalSkill(editing.slug, body);
      return api.createPersonalSkill(body as CreatePersonalSkillRequest);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deletePersonalSkill(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy SKILL.md folders from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen(true)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal skill">
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New skill
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
      ) : skills?.length === 0 ? (
        <EmptyState
          icon={<PsychologyOutlinedIcon />}
          title="No personal skills"
          description="Skills in your user library (~/.claude/skills) apply across every workspace. New session lessons default here unless they are repo-specific."
          action={
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen(true)}>
                Install from repo
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New skill
              </Button>
            </Stack>
          }
        />
      ) : (
        <ListPanel>
          {skills?.map((skill) => (
            <ListRow
              key={skill.slug}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <ControlTooltip title="Edit skill">
                    <IconButton
                      aria-label={`Edit ${skill.name}`}
                      onClick={() => {
                        setEditing(skill);
                        setDialogOpen(true);
                      }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Delete skill" disabled={deleteMutation.isPending}>
                    <span>
                      <IconButton
                        aria-label={`Delete ${skill.name}`}
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete personal skill “${skill.name}”?`)) {
                            deleteMutation.mutate(skill.slug);
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
                <ListRowTitle>{skill.name}</ListRowTitle>
                <ListRowMeta>
                  {skill.slug}
                  {skill.description ? ` · ${skill.description}` : ''}
                </ListRowMeta>
              </Box>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <PersonalSkillDialog
        open={dialogOpen}
        skill={editing}
        saving={saveMutation.isPending}
        error={saveMutation.error ? (saveMutation.error as Error).message : null}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          saveMutation.reset();
        }}
        onSave={(body) => saveMutation.mutate(body)}
      />
      <InstallSkillsFromRepoDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={() => {
          void queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
        }}
      />
    </Stack>
  );
}
