import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { Chip, Stack } from '@mui/material';
import { EmptyState } from '../ui/EmptyState';
import { CONTEXT_SLASH_CHIP_COMMANDS } from './slashComposer';

export function ChatPanelEmptyState({ onSlashCommand }: { onSlashCommand: (command: string) => void }) {
  return (
    <EmptyState
      compact
      icon={<ChatOutlinedIcon />}
      title="Start a conversation"
      description="Sessions begin in plan mode. Describe what you want; Claude will explore, ask clarifying questions, and present a plan. Use + to start another session in this window (it appears as a page break). Type / for commands, /clear to reset this session, or /rewind to restore the last prompt."
      action={
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {CONTEXT_SLASH_CHIP_COMMANDS.map((command) => (
            <Chip
              key={command}
              size="small"
              label={command}
              variant="outlined"
              clickable
              onClick={() => onSlashCommand(command)}
              sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
            />
          ))}
        </Stack>
      }
    />
  );
}
