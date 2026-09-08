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
  CreatePersonalAgentRequest,
  PersonalAgent,
  UpdatePersonalAgentRequest,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../../components/ui/ResponsiveDialog';

function bodyWithoutFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, '');
}

export function PersonalAgentDialog({
  open,
  agent,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  agent: PersonalAgent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: CreatePersonalAgentRequest | UpdatePersonalAgentRequest) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(agent?.name ?? '');
    setDescription(agent?.description ?? '');
    setContent(agent ? bodyWithoutFrontmatter(agent.content) : '');
  }, [open, agent]);

  const canSave = name.trim().length > 0 && content.trim().length > 0;

  return (
    <ResponsiveDialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{agent ? 'Edit agent' : 'New personal agent'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label={agent ? 'Name' : 'Name (file slug)'}
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText={
              agent
                ? `File stays ${agent.slug}.md. Display name is stored in frontmatter.`
                : 'Lowercase letters, numbers, and hyphens. Saved as ~/.claude/agents/<slug>.md.'
            }
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            helperText="When Claude should spawn this subagent."
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label="System prompt"
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
        <ControlTooltip title={canSave ? 'Save this personal agent' : 'Name and prompt are required'}>
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
