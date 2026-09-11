import { useEffect, useState } from 'react';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { EmptyState } from '../ui/EmptyState';

interface AgentGoalPanelProps {
  agentId: string;
  goal: string;
  goalPath: string | null;
  archived: boolean;
  enabled: boolean;
}

export function AgentGoalPanel({
  agentId,
  goal,
  goalPath,
  archived,
  enabled,
}: AgentGoalPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(goal);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(goal);
  }, [goal]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateAgent(agentId, { goal: draft.trim() }),
    onSuccess: (detail) => {
      setDraft(detail.goal);
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const copyPath = async () => {
    if (!goalPath) return;
    try {
      await navigator.clipboard.writeText(goalPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const dirty = draft.trim() !== goal.trim();
  const canSave = Boolean(draft.trim()) && dirty && !archived;

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2 }, height: '100%', overflow: 'auto' }}>
      <Stack spacing={0.5}>
        <Typography variant="h6">Goal</Typography>
        <Typography variant="body2" color="text.secondary">
          Every agent needs a goal before Chat can start. Save it here, then attach{' '}
          <Box component="span" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
            @goal
          </Box>{' '}
          in a prompt so Claude reads the goal file by path.
        </Typography>
      </Stack>

      {!goal.trim() && !dirty ? (
        <EmptyState
          compact
          icon={<FlagOutlinedIcon />}
          title="No goal yet"
          description="Describe what this agent should accomplish. Work stays blocked until you save a goal."
        />
      ) : null}

      {saveMutation.error ? (
        <Alert severity="error">{(saveMutation.error as Error).message}</Alert>
      ) : null}

      <TextField
        label="Agent goal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        multiline
        minRows={6}
        disabled={archived || !enabled}
        placeholder="Ship dark mode on the settings page, including tests and a draft PR."
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <Button
          variant="contained"
          disabled={!canSave || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save goal'}
        </Button>
        {goalPath ? (
          <Button variant="outlined" onClick={() => void copyPath()} disabled={!enabled}>
            {copied ? 'Copied path' : 'Copy path'}
          </Button>
        ) : null}
      </Stack>

      {goalPath ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: '"IBM Plex Mono", monospace', overflowWrap: 'anywhere' }}
        >
          {goalPath}
        </Typography>
      ) : null}
    </Stack>
  );
}
