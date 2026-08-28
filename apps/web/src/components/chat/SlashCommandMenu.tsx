import { Box, Typography } from '@mui/material';
import type { SlashCommand } from '@agent-orchestrator/shared';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  highlight: number;
  onHighlight: (index: number) => void;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu({
  commands,
  highlight,
  onHighlight,
  onSelect,
}: SlashCommandMenuProps) {
  if (commands.length === 0) return null;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        maxHeight: 260,
        overflowY: 'auto',
      }}
      role="listbox"
      aria-label="Slash commands"
    >
      {commands.map((item, index) => (
        <Box
          key={`${item.command}-${item.source ?? 'app'}`}
          role="option"
          aria-selected={index === highlight}
          onMouseEnter={() => onHighlight(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
          sx={{
            px: 1.5,
            py: 0.85,
            cursor: 'pointer',
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'baseline' },
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            gap: { xs: 0.25, sm: 2 },
            bgcolor: index === highlight ? 'ao.surface.selected' : 'transparent',
            '&:hover': { bgcolor: 'ao.surface.selected' },
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, flexShrink: 0 }}
          >
            {item.command}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {item.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
