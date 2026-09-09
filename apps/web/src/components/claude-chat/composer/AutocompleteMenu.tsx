import { Box, Typography } from '@mui/material';
import type { AutocompleteOption } from '../types';

export function AutocompleteMenu({
  options,
  highlight,
  onHighlight,
  onSelect,
  label,
}: {
  options: AutocompleteOption[];
  highlight: number;
  onHighlight: (index: number) => void;
  onSelect: (option: AutocompleteOption) => void;
  label: string;
}) {
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
      aria-label={label}
    >
      {options.map((option, index) => (
        <Box
          key={option.id}
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
            bgcolor: index === highlight ? 'ao.surface.selected' : 'transparent',
            '&:hover': { bgcolor: 'ao.surface.selected' },
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {option.label}
          </Typography>
          {option.description ? (
            <Typography variant="caption" color="text.secondary">
              {option.description}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
