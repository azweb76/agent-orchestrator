import {
  Alert,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import type { BrainChangeFile, BrainChangeSet, BrainDraft } from '@agent-orchestrator/shared';
import { brainChangeSetCanAccept, brainLibraryFileCanAccept } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { BrainFollowUpFields, BrainTaskFields } from './BrainCatalogFields';
import { MarkdownFields } from './BrainDraftEditor';

export function BrainLibraryChangePanel({
  changeSet,
  accepting,
  error,
  lockedTaskName,
  builtInFollowUp,
  onSelect,
  onUndo,
  onChangeFile,
  onDirty,
  onAccept,
}: {
  changeSet: BrainChangeSet;
  accepting: boolean;
  error: string | null;
  lockedTaskName: (file: BrainChangeFile) => boolean;
  builtInFollowUp: (file: BrainChangeFile) => boolean;
  onSelect: (fileId: string) => void;
  onUndo: (fileId: string) => void;
  onChangeFile: (fileId: string, next: BrainDraft) => void;
  onDirty: (fileId: string, key: string) => void;
  onAccept: () => void;
}) {
  const selected = changeSet.files.find((file) => file.id === changeSet.selectedId) ?? changeSet.files[0];
  const canAccept = brainChangeSetCanAccept(changeSet);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Pending changes
        </Typography>
        <ControlTooltip title={canAccept ? 'Save remaining drafts' : 'Need required fields on at least one item'}>
          <span>
            <Button variant="contained" disabled={!canAccept || accepting} onClick={onAccept}>
              {accepting ? 'Accepting…' : 'Accept'}
            </Button>
          </span>
        </ControlTooltip>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {changeSet.files.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
          Ask the copilot to draft skills, agents, tasks, or follow-ups, or pick one from the list. Edit here,
          undo an item to drop it, then Accept.
        </Typography>
      ) : (
        <ListPanel>
          {changeSet.files.map((file) => (
            <ListRow
              key={file.id}
              selected={file.id === selected?.id}
              onClick={() => onSelect(file.id)}
              secondaryAction={
                <ControlTooltip title="Undo this change">
                  <span>
                    <Button
                      size="small"
                      startIcon={<UndoOutlinedIcon fontSize="small" />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUndo(file.id);
                      }}
                    >
                      Undo
                    </Button>
                  </span>
                </ControlTooltip>
              }
            >
              <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                <ListRowTitle>{changeFileTitle(file)}</ListRowTitle>
                <ListRowMeta>
                  <Chip size="small" label={file.kind} />
                  <Chip size="small" variant="outlined" label={file.action} />
                  {brainLibraryFileCanAccept(file, builtInFollowUp(file)) ? null : (
                    <Chip size="small" color="warning" label="incomplete" />
                  )}
                </ListRowMeta>
              </Stack>
            </ListRow>
          ))}
        </ListPanel>
      )}
      {selected ? (
        <>
          {selected.draft.rationale ? <Alert severity="info">{selected.draft.rationale}</Alert> : null}
          <ChangeFileFields
            file={selected}
            lockedTaskName={lockedTaskName(selected)}
            builtInFollowUp={builtInFollowUp(selected)}
            onChange={(next) => onChangeFile(selected.id, next)}
            onDirty={(key) => onDirty(selected.id, key)}
          />
        </>
      ) : null}
    </Stack>
  );
}

function changeFileTitle(file: BrainChangeFile): string {
  const draft = file.draft;
  if (draft.kind === 'task' || draft.kind === 'follow-up') {
    return draft.title.trim() || draft.name.trim() || 'Untitled';
  }
  return draft.name.trim() || 'Untitled';
}

function ChangeFileFields({
  file,
  lockedTaskName,
  builtInFollowUp,
  onChange,
  onDirty,
}: {
  file: BrainChangeFile;
  lockedTaskName: boolean;
  builtInFollowUp: boolean;
  onChange: (next: BrainDraft) => void;
  onDirty: (key: string) => void;
}) {
  const draft = file.draft;
  if (draft.kind === 'skill' || draft.kind === 'agent') {
    return (
      <MarkdownFields
        draft={draft}
        lockedSlug={draft.slug}
        contentLabel={draft.kind === 'agent' ? 'System prompt' : 'Skill markdown'}
        onChange={onChange}
        onDirty={onDirty}
      />
    );
  }
  if (draft.kind === 'task') {
    return (
      <BrainTaskFields draft={draft} lockedName={lockedTaskName} onChange={onChange} onDirty={onDirty} />
    );
  }
  if (draft.kind !== 'follow-up') return null;
  return (
    <BrainFollowUpFields draft={draft} builtIn={builtInFollowUp} onChange={onChange} onDirty={onDirty} />
  );
}
