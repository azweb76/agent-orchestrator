import { Box, Button, Stack, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import type { PermissionRequest } from '@agent-orchestrator/shared';
import { MarkdownContent } from './MarkdownContent';

interface ExitPlanModeCardProps {
  request: PermissionRequest;
  plan: string;
  submitting?: boolean;
  onBuild: () => void;
  onKeepPlanning: () => void;
}

export function ExitPlanModeCard({
  request,
  plan,
  submitting,
  onBuild,
  onKeepPlanning,
}: ExitPlanModeCardProps) {
  return (
    <Box
      sx={{
        mb: 1.5,
        p: 2,
        border: 1,
        borderColor: 'success.main',
        borderRadius: 2,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Ready to build?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Review the plan below. Build clears this session and implements it in auto mode.
      </Typography>

      <Box
        sx={{
          maxHeight: 360,
          overflowY: 'auto',
          mb: 2,
          p: 1.5,
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {plan.trim() ? (
          <MarkdownContent content={plan} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Plan content was not included in the ExitPlanMode request. Building will use the latest
            assistant message as the plan.
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Request {request.requestId.slice(0, 8)}…
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<ConstructionIcon />}
          disabled={submitting}
          onClick={onBuild}
        >
          Build
        </Button>
        <Button variant="outlined" disabled={submitting} onClick={onKeepPlanning}>
          Keep planning
        </Button>
      </Stack>
    </Box>
  );
}
