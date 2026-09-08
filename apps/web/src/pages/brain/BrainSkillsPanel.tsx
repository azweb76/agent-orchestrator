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
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonalSkill } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { InstallSkillsFromRepoDialog } from './InstallSkillsFromRepoDialog';

export function BrainSkillsPanel({
  selectedKey,
  onNew,
  onSelect,
  onImprove,
}: {
  selectedKey: string | null;
  onNew: () => void;
  onSelect: (skill: PersonalSkill) => void;
  onImprove: (skill: PersonalSkill) => void;
}) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['personal-skills'],
    queryFn: api.listPersonalSkills,
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deletePersonalSkill(slug),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
    },
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy SKILL.md folders from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen((open) => !open)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal skill with AI">
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
            New skill
          </Button>
        </ControlTooltip>
      </Stack>

      {installOpen ? (
        <InstallSkillsFromRepoDialog
          open
          embedded
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            void queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
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
      ) : skills?.length === 0 ? (
        <EmptyState
          icon={<PsychologyOutlinedIcon />}
          title="No personal skills"
          description="Skills in your user library (~/.claude/skills) apply across every workspace."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
              New skill
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {skills?.map((skill) => (
            <ListRow
              key={skill.slug}
              selected={selectedKey === skill.slug}
              onClick={() => onSelect(skill)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${skill.name}`} onClick={() => onImprove(skill)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  {pendingDelete === skill.slug ? (
                    <>
                      <Button size="small" color="error" onClick={() => deleteMutation.mutate(skill.slug)}>
                        Confirm
                      </Button>
                      <Button size="small" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <ControlTooltip title="Delete skill" disabled={deleteMutation.isPending}>
                      <span>
                        <IconButton
                          aria-label={`Delete ${skill.name}`}
                          disabled={deleteMutation.isPending}
                          onClick={() => setPendingDelete(skill.slug)}
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
    </Stack>
  );
}
