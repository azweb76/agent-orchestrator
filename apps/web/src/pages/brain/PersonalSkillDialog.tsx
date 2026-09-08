import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import type {
  CreatePersonalSkillRequest,
  PersonalSkill,
  UpdatePersonalSkillRequest,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../../components/ui/ResponsiveDialog';

function bodyWithoutFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, '');
}

export function PersonalSkillDialog({
  open,
  skill,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  skill: PersonalSkill | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: CreatePersonalSkillRequest | UpdatePersonalSkillRequest) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    setContent(skill ? bodyWithoutFrontmatter(skill.content) : '');
  }, [open, skill]);

  const canSave = name.trim().length > 0 && content.trim().length > 0;

  return (
    <ResponsiveDialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{skill ? 'Edit skill' : 'New personal skill'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label={skill ? 'Name' : 'Name (folder slug)'}
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText={
              skill
                ? `Folder stays ${skill.slug}. Display name is stored in frontmatter.`
                : 'Lowercase letters, numbers, and hyphens. Applies across every workspace.'
            }
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            helperText="When Claude should load this skill."
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label="Skill markdown"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
            fullWidth
            multiline
            minRows={10}
            slotProps={{ htmlInput: { sx: { fontFamily: '"IBM Plex Mono", monospace' } } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <ControlTooltip title={canSave ? 'Save this personal skill' : 'Name and markdown are required'}>
          <span>
            <Button
              variant="contained"
              disabled={!canSave || saving}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  description: description.trim(),
                  content: content.trim(),
                })
              }
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </span>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
