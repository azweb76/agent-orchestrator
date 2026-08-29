import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';
import { ContextUsageBody } from './ContextUsageBody';
import { formatPercent, formatTokenCount } from './contextUsageChart';
import { percentChipColor, percentFillColor } from './contextUsageColors';

interface ContextUsageButtonProps {
  agentId: string;
  sessionId: string;
  isStreaming?: boolean;
}

export function ContextUsageButton({ agentId, sessionId, isStreaming }: ContextUsageButtonProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['session-context', agentId, sessionId],
    queryFn: () => api.getSessionContext(agentId, sessionId),
    enabled: Boolean(agentId && sessionId),
    refetchInterval: isStreaming || open ? 2000 : false,
    staleTime: 4_000,
  });

  const wasStreamingRef = useRef(Boolean(isStreaming));
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = Boolean(isStreaming);
    if (wasStreaming && !isStreaming && agentId && sessionId) {
      void queryClient.invalidateQueries({ queryKey: ['session-context', agentId, sessionId] });
    }
  }, [agentId, sessionId, isStreaming, queryClient]);

  const data = query.data;
  const percent = data?.percent ?? null;
  const color = percentChipColor(percent);
  const fill = percentFillColor(percent, theme.palette.mode);
  const remaining =
    data && data.currentContextTokens > 0
      ? Math.max(0, data.compactThresholdTokens - data.currentContextTokens)
      : null;
  const label =
    data && data.currentContextTokens > 0
      ? `${formatTokenCount(data.currentContextTokens)} · ${formatPercent(percent)}`
      : 'Context';
  const tooltip =
    remaining == null
      ? 'Context usage'
      : remaining === 0
        ? 'Context usage · at auto-compact threshold'
        : `Context usage · ${formatTokenCount(remaining)} until auto-compact`;

  return (
    <>
      <ControlTooltip title={tooltip} disabled={!sessionId}>
        <Button
          size="small"
          color={color}
          variant="text"
          disabled={!sessionId}
          onClick={() => setOpen(true)}
          aria-label={`Context usage ${label}`}
          sx={{
            minWidth: 0,
            px: 0.75,
            py: 0.25,
            fontSize: 12,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: percent == null ? 'text.secondary' : fill,
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 22,
                height: 4,
                borderRadius: 1,
                bgcolor: 'ao.surface.codeInline',
                overflow: 'hidden',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              <Box sx={{ width: `${percent ?? 0}%`, height: '100%', bgcolor: fill }} />
            </Box>
            {label}
          </Stack>
        </Button>
      </ControlTooltip>

      <ResponsiveDialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Context usage</DialogTitle>
        {query.isFetching ? <LinearProgress sx={{ mt: -1 }} /> : null}
        <DialogContent>
          {query.isPending && !data ? (
            <Stack spacing={1.25} sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Reading session usage…
              </Typography>
            </Stack>
          ) : null}
          {query.error ? <Alert severity="error">{(query.error as Error).message}</Alert> : null}
          {data ? <ContextUsageBody data={data} /> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </ResponsiveDialog>
    </>
  );
}
