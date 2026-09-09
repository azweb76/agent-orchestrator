import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { SessionGradeListItem } from '@agent-orchestrator/shared';
import { api } from '../../api/client';

export function BrainSessionPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: SessionGradeListItem[];
  onChange: (sessions: SessionGradeListItem[]) => void;
  disabled?: boolean;
}) {
  const gradesQuery = useQuery({
    queryKey: ['session-grades'],
    queryFn: () => api.listSessionGrades(40),
  });

  return (
    <Autocomplete
      multiple
      disabled={disabled}
      options={gradesQuery.data ?? []}
      value={selected}
      loading={gradesQuery.isFetching}
      onChange={(_, value) => onChange(value)}
      getOptionLabel={(option) => option.title || option.id}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label="Analyzed sessions"
          placeholder="Reference graded sessions"
        />
      )}
    />
  );
}
