import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { BrainDraft, BrainMarkdownDraft } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { BrainFollowUpFields, BrainTaskFields } from './BrainCatalogFields';

export function MarkdownFields({
  draft,
  lockedSlug,
  contentLabel,
  onChange,
  onDirty,
}: {
  draft: BrainMarkdownDraft;
  lockedSlug?: string;
  contentLabel: string;
  onChange: (next: BrainMarkdownDraft) => void;
  onDirty: (key: string) => void;
}) {
  return (
    <>
      <TextField
        label={lockedSlug ? 'Name' : 'Name (slug)'}
        value={draft.name}
        onChange={(event) => {
          onDirty('name');
          onChange({ ...draft, name: event.target.value });
        }}
        helperText={
          lockedSlug
            ? `Folder/file stays ${lockedSlug}.`
            : draft.kind === 'agent'
              ? 'Saved as ~/.claude/agents/<slug>.md'
              : 'Saved under ~/.claude/skills/<slug>/'
        }
        required
        fullWidth
      />
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => {
          onDirty('description');
          onChange({ ...draft, description: event.target.value });
        }}
        helperText={draft.kind === 'agent' ? 'When Claude should spawn this subagent.' : 'When Claude should load this skill.'}
        fullWidth
        multiline
        minRows={2}
      />
      <TextField
        label={contentLabel}
        value={draft.content}
        onChange={(event) => {
          onDirty('content');
          onChange({ ...draft, content: event.target.value });
        }}
        required
        fullWidth
        multiline
        minRows={10}
        slotProps={{ htmlInput: { sx: { fontFamily: '"IBM Plex Mono", monospace' } } }}
      />
    </>
  );
}

export function brainDraftCanSave(draft: BrainDraft, builtInFollowUp?: boolean): boolean {
  if (draft.kind === 'skill' || draft.kind === 'agent') {
    return draft.name.trim().length > 0 && draft.content.trim().length > 0;
  }
  if (draft.kind === 'task') {
    return Boolean(draft.title.trim() && (draft.id || draft.name.trim()));
  }
  if (draft.kind !== 'follow-up') return false;
  return (
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    (Boolean(draft.id) || draft.name.trim().length > 0 || Boolean(builtInFollowUp)) &&
    (draft.kindValue !== 'start-template' || Boolean(draft.template))
  );
}

export function BrainDraftEditor({
  draft,
  lockedSlug,
  lockedTaskName,
  builtInFollowUp,
  saving,
  error,
  onChange,
  onDirty,
  onSave,
}: {
  draft: BrainDraft;
  lockedSlug?: string;
  lockedTaskName?: boolean;
  builtInFollowUp?: boolean;
  saving: boolean;
  error: string | null;
  onChange: (draft: BrainDraft) => void;
  onDirty: (key: string) => void;
  onSave: () => void;
}) {
  const canSave = brainDraftCanSave(draft, builtInFollowUp);
  const title =
    draft.kind === 'skill'
      ? lockedSlug
        ? 'Edit skill'
        : 'New skill'
      : draft.kind === 'agent'
        ? lockedSlug
          ? 'Edit agent'
          : 'New agent'
        : draft.kind === 'task'
          ? draft.id
            ? 'Edit task'
            : 'New task'
          : draft.kind === 'follow-up' && draft.id
            ? 'Edit follow-up'
            : 'New follow-up';

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {draft.rationale ? <Alert severity="info">{draft.rationale}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {draft.kind === 'skill' || draft.kind === 'agent' ? (
        <MarkdownFields
          draft={draft}
          lockedSlug={lockedSlug}
          contentLabel={draft.kind === 'agent' ? 'System prompt' : 'Skill markdown'}
          onChange={onChange}
          onDirty={onDirty}
        />
      ) : null}
      {draft.kind === 'task' ? (
        <BrainTaskFields draft={draft} lockedName={lockedTaskName} onChange={onChange} onDirty={onDirty} />
      ) : null}
      {draft.kind === 'follow-up' ? (
        <BrainFollowUpFields
          draft={draft}
          builtIn={builtInFollowUp}
          onChange={onChange}
          onDirty={onDirty}
        />
      ) : null}
      <ControlTooltip title={canSave ? 'Save to your Brain library' : 'Fill the required fields'}>
        <span>
          <Button variant="contained" disabled={!canSave || saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </span>
      </ControlTooltip>
    </Stack>
  );
}
