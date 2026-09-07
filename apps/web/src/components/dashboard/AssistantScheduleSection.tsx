import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildScheduleStarters,
  type AssistantScheduleListItem,
  type AssistantSchedulePlaybook,
  type AssistantScheduleStatus,
} from '@agent-orchestrator/shared';
import { api, streamAssistantChat } from '../../api/client';
import { SectionLabel } from './SectionLabel';
import { applyAssistantStreamEvent } from './assistantStreamReducer';
import type { AssistantMessage } from '@agent-orchestrator/shared';

function asScheduleItems(raw: unknown): AssistantScheduleListItem[] {
  if (!Array.isArray(raw)) return [];
  const items: AssistantScheduleListItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    if (typeof row.playbook !== 'string' || typeof row.status !== 'string') continue;
    if (row.kind !== 'cron' && row.kind !== 'once') continue;
    items.push({
      id: row.id,
      name: row.name,
      kind: row.kind,
      playbook: row.playbook as AssistantSchedulePlaybook,
      status: row.status as AssistantScheduleStatus,
      policy: typeof row.policy === 'string' ? row.policy : '',
      cron: typeof row.cron === 'string' ? row.cron : null,
      nextRunAt: typeof row.nextRunAt === 'string' ? row.nextRunAt : null,
      lastRunAt: typeof row.lastRunAt === 'string' ? row.lastRunAt : null,
    });
  }
  return items;
}

function playbookLabel(playbook: AssistantSchedulePlaybook): string {
  switch (playbook) {
    case 'morning_fleet_briefing':
      return 'Morning briefing';
    case 'ci_sweep':
      return 'CI sweep';
    case 'review_sweep':
      return 'Review sweep';
    default:
      return 'Custom';
  }
}

function formatNextRun(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function AssistantScheduleSection() {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ['assistant', 'schedules'],
    queryFn: () => api.getAssistantSchedules({ includePaused: true }),
    staleTime: 15_000,
  });

  const schedules = asScheduleItems(schedulesQuery.data?.schedules);
  const starters = buildScheduleStarters({ schedules });

  const sendPrompt = async (prompt: string) => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    try {
      await streamAssistantChat(prompt, (event) => {
        queryClient.setQueryData(
          ['assistant', 'messages'],
          (old: { messages: AssistantMessage[] } | undefined) => ({
            messages: applyAssistantStreamEvent(old?.messages ?? [], event),
          }),
        );
      });
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'schedules'] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'ao.surface.panel',
        px: { xs: 1.75, md: 2.25 },
        py: 1.75,
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ScheduleOutlinedIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
          <SectionLabel>Assistant schedules</SectionLabel>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            Ask Assistant to enable or pause — nothing writes until you confirm.
          </Typography>
        </Stack>

        {schedules.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No schedules yet. Seed morning briefing or CI/review sweeps from the chips below.
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {schedules.slice(0, 6).map((schedule) => (
              <Stack
                key={schedule.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {schedule.name}
                  <Typography component="span" variant="body2" color="text.secondary">
                    {` · ${playbookLabel(schedule.playbook)} · next ${formatNextRun(schedule.nextRunAt)}`}
                  </Typography>
                </Typography>
                <Chip
                  size="small"
                  label={schedule.status}
                  color={schedule.status === 'active' ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {starters.map((starter) => (
            <Button
              key={starter.id}
              size="small"
              variant="outlined"
              color="secondary"
              disabled={sending}
              onClick={() => void sendPrompt(starter.prompt)}
              sx={{ textTransform: 'none' }}
            >
              {starter.label}
            </Button>
          ))}
          {sending ? <CircularProgress size={16} color="secondary" /> : null}
        </Stack>

        {sendError ? <Alert severity="error">{sendError}</Alert> : null}
      </Stack>
    </Box>
  );
}
