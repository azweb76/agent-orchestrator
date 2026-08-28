import { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import type { AgentDetail, ChatSession } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';

interface DraftPrOfferBannerProps {
  agent: Pick<AgentDetail, 'draftPrOffer'>;
  session: Pick<ChatSession, 'id' | 'template' | 'status'> | undefined;
  isStreaming: boolean;
  onCreateDraftPr: () => void;
  creating?: boolean;
}

/**
 * After a successful Build with a diff and no open PR, offers a one-click
 * handoff to the Create draft PR session (skipped when autopilot is on).
 */
export function DraftPrOfferBanner({
  agent,
  session,
  isStreaming,
  onCreateDraftPr,
  creating,
}: DraftPrOfferBannerProps) {
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const offer = agent.draftPrOffer;
  if (!offer || isStreaming || creating) return null;
  if (!session || session.id !== offer.sessionId || session.template !== 'build') return null;
  if (session.status !== 'idle') return null;
  if (dismissedSessionId === offer.sessionId) return null;

  return (
    <Alert
      severity="success"
      icon={<MergeTypeIcon />}
      sx={{ mb: 1 }}
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <ControlTooltip title="Start a Create draft PR session for this branch">
            <Button color="inherit" size="small" onClick={onCreateDraftPr}>
              Create draft PR
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Dismiss this offer for now">
            <Button color="inherit" size="small" onClick={() => setDismissedSessionId(offer.sessionId)}>
              Dismiss
            </Button>
          </ControlTooltip>
        </Stack>
      }
    >
      Build finished with local changes and no pull request yet. Start a Create draft PR session
      to summarize, commit if needed, push, and open a draft PR?
    </Alert>
  );
}
