import { Box, Typography } from '@mui/material';
import type { PendingMention } from './mentionComposer';

export interface MentionMenuOption {
  kind: PendingMention['kind'];
  path?: string;
  label: string;
  description: string;
}

interface MentionMenuProps {
  options: MentionMenuOption[];
  highlight: number;
  onHighlight: (index: number) => void;
  onSelect: (option: MentionMenuOption) => void;
}

export function MentionMenu({ options, highlight, onHighlight, onSelect }: MentionMenuProps) {
  if (options.length === 0) return null;

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
      aria-label="File mentions"
    >
      {options.map((option, index) => (
        <Box
          key={`${option.kind}:${option.path ?? 'diff'}`}
          role="option"
          aria-selected={index === highlight}
          onMouseEnter={() => onHighlight(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(option);
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
            bgcolor: index === highlight ? 'rgba(94,234,212,0.1)' : 'transparent',
            '&:hover': { bgcolor: 'rgba(94,234,212,0.1)' },
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, flexShrink: 0 }}
          >
            {option.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {option.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
