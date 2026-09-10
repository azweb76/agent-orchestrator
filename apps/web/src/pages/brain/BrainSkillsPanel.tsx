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
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePersonalSkillRequest,
  PersonalSkill,
  UpdatePersonalSkillRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { InstallSkillsFromRepoDialog } from './InstallSkillsFromRepoDialog';
import { PersonalSkillDialog } from './PersonalSkillDialog';
import { useBrainCrud } from './useBrainCrud';

export function BrainSkillsPanel({
  onDraftWithAi,
  onImprove,
}: {
  onDraftWithAi: () => void;
  onImprove: (skill: PersonalSkill) => void;
}) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);

  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['personal-skills'],
    queryFn: api.listPersonalSkills,
  });

  const crud = useBrainCrud<PersonalSkill, CreatePersonalSkillRequest, UpdatePersonalSkillRequest>({
    queryKey: ['personal-skills'],
    identify: (skill) => skill.slug,
    create: api.createPersonalSkill,
    update: api.updatePersonalSkill,
    remove: api.deletePersonalSkill,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ControlTooltip title="Copy SKILL.md folders from a GitHub or workspace repo">
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => setInstallOpen((open) => !open)}>
            Install from repo
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Ask the copilot to draft one or more skills">
          <Button variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />} onClick={onDraftWithAi}>
            Draft with AI
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Create a personal skill">
          <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
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
      {crud.deleteError ? <Alert severity="error">{crud.deleteError}</Alert> : null}

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
            <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
              New skill
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {skills?.map((skill) => (
            <ListRow
              key={skill.slug}
              onClick={() => crud.openEdit(skill)}
              secondaryAction={
                <Stack direction="row" spacing={0.5} onClick={(event) => event.stopPropagation()}>
                  <ControlTooltip title="Edit skill">
                    <IconButton aria-label={`Edit ${skill.name}`} onClick={() => crud.openEdit(skill)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Improve with AI">
                    <IconButton aria-label={`Improve ${skill.name}`} onClick={() => onImprove(skill)}>
                      <AutoAwesomeOutlinedIcon fontSize="small" />
                    </IconButton>
                  </ControlTooltip>
                  <ControlTooltip title="Delete skill" disabled={crud.deleting}>
                    <span>
                      <IconButton
                        aria-label={`Delete ${skill.name}`}
                        disabled={crud.deleting}
                        onClick={() => crud.askDelete(skill)}
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
        open={crud.formOpen}
        skill={crud.editing}
        saving={crud.saving}
        error={crud.saveError}
        onClose={crud.closeForm}
        onSave={crud.save}
      />

      <ConfirmDialog
        open={Boolean(crud.deleteTarget)}
        title="Delete skill?"
        description={`This permanently deletes ~/.claude/skills/${crud.deleteTarget?.slug ?? ''} and cannot be undone.`}
        confirmLabel="Delete"
        loading={crud.deleting}
        onCancel={crud.cancelDelete}
        onConfirm={crud.confirmDelete}
      />
    </Stack>
  );
}
