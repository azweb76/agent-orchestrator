import { Chip, IconButton, InputAdornment, Stack, TextField } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import type { SidebarStatusFilter } from './sidebarFilter';
import { SIDEBAR_STATUS_FILTERS } from './sidebarFilter';

export function SidebarFilterBar({
  query,
  onQueryChange,
  statuses,
  onStatusesChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  statuses: ReadonlySet<SidebarStatusFilter>;
  onStatusesChange: (statuses: Set<SidebarStatusFilter>) => void;
}) {
  const toggleStatus = (status: SidebarStatusFilter) => {
    const next = new Set(statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onStatusesChange(next);
  };

  return (
    <Stack
      spacing={0.75}
      sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <TextField
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search agents…"
        size="small"
        fullWidth
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.stopPropagation();
            onQueryChange('');
          }
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  edge="end"
                  aria-label="Clear search"
                  onClick={() => onQueryChange('')}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
            sx: { fontSize: 14 },
          },
          htmlInput: { 'aria-label': 'Search workspaces and agents' },
        }}
      />
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {SIDEBAR_STATUS_FILTERS.map(({ id, label }) => {
          const selected = statuses.has(id);
          return (
            <Chip
              key={id}
              label={label}
              size="small"
              clickable
              color={selected ? 'secondary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => toggleStatus(id)}
              aria-pressed={selected}
              sx={{ fontSize: 12 }}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
