import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { Chip, Stack } from '@mui/material';
import { EmptyState } from '../ui/EmptyState';
import { CHAT_EMPTY_STATE_DESCRIPTION } from './chatEmptyState';
import { CONTEXT_SLASH_CHIP_COMMANDS } from './slashComposer';

export function ChatPanelEmptyState({ onSlashCommand }: { onSlashCommand: (command: string) => void }) {
  return (
    <EmptyState
      compact
      icon={<ChatOutlinedIcon />}
      title="Start a conversation"
      description={CHAT_EMPTY_STATE_DESCRIPTION}
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
