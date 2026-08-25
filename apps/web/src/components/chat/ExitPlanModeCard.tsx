import { Box, Button, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import type { PermissionRequest } from '@agent-orchestrator/shared';
import { ChatPromptCard } from './ChatPromptCard';
import { MarkdownContent } from './MarkdownContent';

interface ExitPlanModeCardProps {
  request: PermissionRequest;
  plan: string;
  submitting?: boolean;
  onBuild: () => void;
  onKeepPlanning: () => void;
}

export function ExitPlanModeCard({
  plan,
  submitting,
  onBuild,
  onKeepPlanning,
}: ExitPlanModeCardProps) {
  return (
    <ChatPromptCard
      accent="success"
      icon={<ConstructionIcon />}
      title="Ready to build?"
      description="Review the plan below. Build clears this session and implements it in auto mode. Keep planning stops this prompt so you can refine it."
      actions={
        <>
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
        </>
      }
    >
      <Box
        sx={{
          maxHeight: 360,
          overflowY: 'auto',
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'rgba(11,15,23,0.55)',
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
    </ChatPromptCard>
  );
}
