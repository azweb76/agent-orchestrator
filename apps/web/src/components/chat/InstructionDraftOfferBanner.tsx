import { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import type { AgentDetail, ChatSession, InstructionDraftOffer } from '@agent-orchestrator/shared';
import {
  SESSION_GRADE_FINDING_LABELS,
  chatSessionTemplateById,
  instructionGradeFindings,
  shouldOfferInstructionDraft,
} from '@agent-orchestrator/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';

interface InstructionDraftOfferBannerProps {
  agentId: string;
  agent?: Pick<AgentDetail, 'instructionDraftOffer'>;
  session: Pick<ChatSession, 'id' | 'title' | 'template' | 'grade'>;
  isStreaming: boolean;
  /** Opens the Improve-instructions dialog for this session. */
  onReview: (offer?: InstructionDraftOffer | null) => void;
}

/**
 * After a Build / Fix CI run is graded with instruction-file or skill
 * findings, offers to review and apply an instruction draft. Prefer the
 * server-persisted offer (with optional pre-generated draft); fall back to
 * deriving an offer from the graded session. Nothing is written until apply.
 */
export function InstructionDraftOfferBanner({
  agentId,
  agent,
  session,
  isStreaming,
  onReview,
}: InstructionDraftOfferBannerProps) {
  const queryClient = useQueryClient();
  const [localDismissed, setLocalDismissed] = useState(false);

  const serverOffer =
    agent?.instructionDraftOffer?.sessionId === session.id
      ? agent.instructionDraftOffer
      : null;
  const derived = !serverOffer && shouldOfferInstructionDraft(session);
  const visible = Boolean(serverOffer || derived);

  const dismissMutation = useMutation({
    mutationFn: () => api.dismissInstructionDraftOffer(agentId),
    onSuccess: () => {
      setLocalDismissed(true);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  if (isStreaming || !visible || localDismissed) return null;

  const findings = instructionGradeFindings(session.grade);
  const labels = [
    ...new Set(
      (serverOffer?.findingTitles?.length
        ? serverOffer.findingTitles
        : findings.map((finding) => SESSION_GRADE_FINDING_LABELS[finding.category])
      ).map((label) => label.toLowerCase()),
    ),
  ].join(' and ');
  const templateTitle = chatSessionTemplateById(session.template)?.title ?? 'This';

  return (
    <Alert
      severity="info"
      sx={{ mb: 1 }}
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <ControlTooltip title="Review and apply an instruction draft">
            <Button color="inherit" size="small" onClick={() => onReview(serverOffer)}>
              {serverOffer?.draft ? 'Review draft' : 'Improve instructions'}
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Dismiss this offer">
            <Button
              color="inherit"
              size="small"
              disabled={dismissMutation.isPending}
              onClick={() => {
                if (serverOffer) dismissMutation.mutate();
                else setLocalDismissed(true);
              }}
            >
              Dismiss
            </Button>
          </ControlTooltip>
        </Stack>
      }
    >
      The {templateTitle} session grade flagged {labels || 'instruction gaps'}. Review and apply
      an instruction draft to fold the lessons into this repo
      {serverOffer?.draft ? ' (draft ready)' : ''}?
    </Alert>
  );
}
