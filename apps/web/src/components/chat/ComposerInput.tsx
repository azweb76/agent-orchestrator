import { TextField } from '@mui/material';
import { ControlTooltip } from '../ui/ControlTooltip';

interface ComposerInputProps {
  archived: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onPaste: (files: File[]) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onDraftInput: () => void;
}

export function ComposerInput({
  archived,
  draft,
  onDraftChange,
  onPaste,
  onKeyDown,
  onDraftInput,
}: ComposerInputProps) {
  return (
    <ControlTooltip title="Message Claude — Enter to send, Shift+Enter for newline">
      <TextField
        fullWidth
        multiline
        minRows={1}
        maxRows={8}
        placeholder={archived ? 'This agent is archived' : 'Message Claude…'}
        value={draft}
        disabled={archived}
        variant="standard"
        slotProps={{
          input: { disableUnderline: true },
        }}
        onChange={(e) => {
          onDraftInput();
          onDraftChange(e.target.value);
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
          if (files.length > 0) {
            e.preventDefault();
            onPaste(files);
          }
        }}
        onKeyDown={onKeyDown}
        sx={{
          '& .MuiInputBase-input': {
            py: 0.75,
            px: 0.5,
            lineHeight: 1.5,
          },
        }}
      />
    </ControlTooltip>
  );
}
