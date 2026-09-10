import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import ConstructionIcon from '@mui/icons-material/Construction';
import { ControlTooltip } from '../../ui/ControlTooltip';
import { MarkdownContent } from '../MarkdownContent';
import { ChatPromptCard } from './ChatPromptCard';
import type { PlanFollowUp } from '../types';

interface ExitPlanModeCardProps {
  plan: string;
  submitting?: boolean;
  followUps: PlanFollowUp[];
  followUpsLoading?: boolean;
  onSelectFollowUp: (followUp: PlanFollowUp) => void;
  /** Approve the plan via Build. Never wire this to a raw permission allow. */
  onApprove: () => void;
  onKeepPlanning: () => void;
}

export function ExitPlanModeCard({
  plan,
  submitting,
  followUps,
  followUpsLoading,
  onSelectFollowUp,
  onApprove,
  onKeepPlanning,
}: ExitPlanModeCardProps) {
  return (
    <ChatPromptCard
      accent="success"
      icon={<AssignmentTurnedInOutlinedIcon />}
      title="Ready to leave plan mode?"
      description="Review the plan below, then choose how to proceed."
      actions={
        <>
          <ControlTooltip title="Start a new auto-mode session to implement this plan" disabled={submitting}>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<ConstructionIcon />}
              disabled={submitting}
              onClick={onApprove}
            >
              Build
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Dismiss and keep refining the plan in this session" disabled={submitting}>
            <Button variant="outlined" size="small" disabled={submitting} onClick={onKeepPlanning}>
              Keep planning
            </Button>
          </ControlTooltip>
          {followUpsLoading ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Preparing next steps…
              </Typography>
            </Stack>
          ) : (
            followUps.map((followUp) => (
              <ControlTooltip key={followUp.id} title={followUp.description ?? followUp.label} disabled={submitting}>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  disabled={submitting}
                  onClick={() => onSelectFollowUp(followUp)}
                >
                  {followUp.label}
                </Button>
              </ControlTooltip>
            ))
          )}
        </>
      }
    >
      <Box
        sx={{
          maxHeight: 360,
          overflowY: 'auto',
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'ao.surface.overlay',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {plan.trim() ? (
          <MarkdownContent content={plan} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Plan content was not included in the ExitPlanMode request.
          </Typography>
        )}
      </Box>
    </ChatPromptCard>
  );
}
