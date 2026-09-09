import { Box, Button, Typography } from '@mui/material';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import { ControlTooltip } from '../../ui/ControlTooltip';
import { MarkdownContent } from '../MarkdownContent';
import { ChatPromptCard } from './ChatPromptCard';

interface ExitPlanModeCardProps {
  plan: string;
  submitting?: boolean;
  onApprove: () => void;
  onKeepPlanning: () => void;
  onDeny?: () => void;
}

export function ExitPlanModeCard({
  plan,
  submitting,
  onApprove,
  onKeepPlanning,
  onDeny,
}: ExitPlanModeCardProps) {
  return (
    <ChatPromptCard
      accent="success"
      icon={<AssignmentTurnedInOutlinedIcon />}
      title="Ready to leave plan mode?"
      description="Review the plan below. Approve to continue, or keep planning to refine it."
      actions={
        <>
          <ControlTooltip title="Approve this plan and continue" disabled={submitting}>
            <Button variant="contained" color="success" disabled={submitting} onClick={onApprove}>
              Approve
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Stay in plan mode and refine" disabled={submitting}>
            <Button variant="outlined" disabled={submitting} onClick={onKeepPlanning}>
              Keep planning
            </Button>
          </ControlTooltip>
          {onDeny ? (
            <ControlTooltip title="Reject this plan" disabled={submitting}>
              <Button variant="text" color="inherit" disabled={submitting} onClick={onDeny}>
                Deny
              </Button>
            </ControlTooltip>
          ) : null}
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
