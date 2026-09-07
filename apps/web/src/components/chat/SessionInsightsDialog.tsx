import { useEffect, useRef } from 'react';
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
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionGrade, SessionGradeFinding } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';
import { ContextUsageBody } from './ContextUsageBody';
import { SessionAnalysisPanel } from './GradeSessionDialog';
import type { SessionInsightsTab } from './sessionAnalysis';

interface SessionInsightsDialogProps {
  open: boolean;
  tab: SessionInsightsTab;
  onTabChange: (tab: SessionInsightsTab) => void;
  agentId: string;
  sessionId: string;
  isStreaming?: boolean;
  sessionTitle: string;
  sessionFilePath?: string | null;
  current?: SessionGrade | null;
  analyzing?: boolean;
  analyzeError?: string | null;
  onClose: () => void;
  onAnalyze: (notes: string) => void;
  onImplementFinding?: (finding: SessionGradeFinding) => void;
  onImproveFinding?: (finding: SessionGradeFinding) => void;
}

export function SessionInsightsDialog({
  open,
  tab,
  onTabChange,
  agentId,
  sessionId,
  isStreaming,
  sessionTitle,
  sessionFilePath,
  current,
  analyzing,
  analyzeError,
  onClose,
  onAnalyze,
  onImplementFinding,
  onImproveFinding,
}: SessionInsightsDialogProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const query = useQuery({
    queryKey: ['session-context', agentId, sessionId],
    queryFn: () => api.getSessionContext(agentId, sessionId),
    enabled: open && Boolean(agentId && sessionId),
    refetchInterval: open && isStreaming ? 2000 : false,
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
  const showAnalysis = Boolean(settings?.analyzeSessionEnabled);
  const activeTab: SessionInsightsTab = showAnalysis ? tab : 'context';

  return (
    <ResponsiveDialog open={open} onClose={analyzing ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Session insights</DialogTitle>
      {query.isFetching || analyzing ? <LinearProgress sx={{ mt: -1 }} /> : null}
      {showAnalysis ? (
        <Tabs
          value={activeTab}
          onChange={(_event, value: SessionInsightsTab) => onTabChange(value)}
          sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="context" label="Context" />
          <Tab value="analysis" label={current ? `Analysis · ${current.score}/5` : 'Analysis'} />
        </Tabs>
      ) : null}
      <DialogContent>
        {activeTab === 'context' ? (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
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
          </Stack>
        ) : (
          <Box sx={{ mt: 1 }}>
            <SessionAnalysisPanel
              sessionTitle={sessionTitle}
              sessionFilePath={sessionFilePath}
              current={current}
              loading={analyzing}
              error={analyzeError}
              onAnalyze={onAnalyze}
              onImplementFinding={onImplementFinding}
              onImproveFinding={onImproveFinding}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={analyzing}>
          Close
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
