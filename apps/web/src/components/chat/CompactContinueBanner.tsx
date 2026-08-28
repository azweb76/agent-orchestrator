import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { hasCrossedCompactThreshold, isContextUsageHot } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';

interface CompactContinueBannerProps {
  agentId: string;
  sessionId: string;
  isStreaming: boolean;
  /** True when the user stopped this session's last run (offers compact while merely hot). */
  stopped: boolean;
  compacting: boolean;
  onCompact: () => void;
}

/**
 * Offers compact-and-continue when context usage crosses the auto-compact
 * threshold, or after Stop while the meter is hot. Compacting always requires
 * explicit confirmation; the stashed transcript is never cleared.
 */
export function CompactContinueBanner({
  agentId,
  sessionId,
  isStreaming,
  stopped,
  compacting,
  onCompact,
}: CompactContinueBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Shares the query key (and cache) with the composer's context meter.
  const query = useQuery({
    queryKey: ['session-context', agentId, sessionId],
    queryFn: () => api.getSessionContext(agentId, sessionId),
    enabled: Boolean(agentId && sessionId),
    refetchInterval: isStreaming ? 2000 : false,
    staleTime: 4_000,
  });

  const usage = query.data;
  if (!usage) return null;
  const crossed = hasCrossedCompactThreshold(usage);
  const offer = crossed || (stopped && isContextUsageHot(usage));
  if (!offer && !compacting) return null;

  return (
    <>
      <Alert
        severity="warning"
        sx={{ mb: 1 }}
        action={
          <Button
            color="inherit"
            size="small"
            disabled={compacting}
            onClick={() => setConfirmOpen(true)}
          >
            {compacting ? 'Compacting…' : 'Compact & continue'}
          </Button>
        }
      >
        {crossed
          ? 'Context reached the auto-compact threshold.'
          : `Context is at ${Math.round(usage.percent ?? 0)}% of the auto-compact threshold.`}{' '}
        Summarize this session and continue in a fresh one.
      </Alert>

      <ConfirmDialog
        open={confirmOpen}
        title="Compact & continue?"
        description="This summarizes the session and starts a new session seeded with the summary and the files in play, keeping the current permission mode, model, and effort. This transcript is kept — nothing is cleared. Any running reply is stopped first."
        confirmLabel="Compact & continue"
        confirmColor="warning"
        loading={compacting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onCompact();
        }}
      />
    </>
  );
}
