import {
  Alert,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import type { BrainChangeFile, BrainChangeSet, BrainMarkdownDraft } from '@agent-orchestrator/shared';
import {
  brainChangeSetCanAccept,
  brainLibraryFileCanAccept,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../../components/ui/ListPanel';
import { MarkdownFields } from './BrainDraftEditor';

export function BrainLibraryChangePanel({
  changeSet,
  accepting,
  error,
  onSelect,
  onUndo,
  onChangeFile,
  onDirty,
  onAccept,
}: {
  changeSet: BrainChangeSet;
  accepting: boolean;
  error: string | null;
  onSelect: (fileId: string) => void;
  onUndo: (fileId: string) => void;
  onChangeFile: (fileId: string, next: BrainMarkdownDraft) => void;
  onDirty: (fileId: string, key: string) => void;
  onAccept: () => void;
}) {
  const selected = changeSet.files.find((file) => file.id === changeSet.selectedId) ?? changeSet.files[0];
  const canAccept = brainChangeSetCanAccept(changeSet);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Pending library files
        </Typography>
        <ControlTooltip title={canAccept ? 'Write remaining files to ~/.claude' : 'Need name and content on at least one file'}>
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
          Ask the copilot to improve skills or personal agents, or pick one from the list. Edit here, undo a
          file to drop it, then Accept to write your user library.
        </Typography>
      ) : (
        <ListPanel>
          {changeSet.files.map((file) => (
            <ListRow
              key={file.id}
              selected={file.id === selected?.id}
              onClick={() => onSelect(file.id)}
              secondaryAction={
                <ControlTooltip title="Undo this file change">
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
                <ListRowTitle>{file.name.trim() || 'Untitled'}</ListRowTitle>
                <ListRowMeta>
                  <Chip size="small" label={file.kind} />
                  <Chip size="small" variant="outlined" label={file.action} />
                  {brainLibraryFileCanAccept(file) ? null : (
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
          {selected.rationale ? <Alert severity="info">{selected.rationale}</Alert> : null}
          <MarkdownFields
            draft={changeFileToDraft(selected)}
            lockedSlug={selected.slug}
            contentLabel={selected.kind === 'agent' ? 'System prompt' : 'Skill markdown'}
            onChange={(next) => onChangeFile(selected.id, next)}
            onDirty={(key) => onDirty(selected.id, key)}
          />
        </>
      ) : null}
    </Stack>
  );
}

function changeFileToDraft(file: BrainChangeFile): BrainMarkdownDraft {
  return {
    kind: file.kind,
    slug: file.slug,
    name: file.name,
    description: file.description,
    content: file.content,
    rationale: file.rationale,
  };
}
