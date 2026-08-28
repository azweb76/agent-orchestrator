import { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import type { ChatSession } from '@agent-orchestrator/shared';
import {
  SESSION_GRADE_FINDING_LABELS,
  chatSessionTemplateById,
  instructionGradeFindings,
  shouldOfferInstructionDraft,
} from '@agent-orchestrator/shared';

interface InstructionDraftOfferBannerProps {
  session: Pick<ChatSession, 'id' | 'title' | 'template' | 'grade'>;
  isStreaming: boolean;
  /** Opens the Improve-instructions dialog for this session. */
  onReview: () => void;
}

/**
 * After a Build / Fix CI run is graded with instruction-file or skill
 * findings, offers to review and apply an instruction draft. Nothing is
 * written until the user applies a draft in the Improve-instructions dialog.
 */
export function InstructionDraftOfferBanner({
  session,
  isStreaming,
  onReview,
}: InstructionDraftOfferBannerProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (isStreaming || !shouldOfferInstructionDraft(session)) return null;
  const offerKey = `${session.id}:${session.grade?.gradedAt ?? ''}`;
  if (dismissedKey === offerKey) return null;

  const findings = instructionGradeFindings(session.grade);
  const labels = [
    ...new Set(findings.map((finding) => SESSION_GRADE_FINDING_LABELS[finding.category])),
  ]
    .join(' and ')
    .toLowerCase();
  const templateTitle = chatSessionTemplateById(session.template)?.title ?? 'This';

  return (
    <Alert
      severity="info"
      sx={{ mb: 1 }}
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Button color="inherit" size="small" onClick={onReview}>
            Review draft
          </Button>
          <Button color="inherit" size="small" onClick={() => setDismissedKey(offerKey)}>
            Dismiss
          </Button>
        </Stack>
      }
    >
      The {templateTitle} session grade flagged {labels}. Review and apply an instruction
      draft to fold the lessons into this repo?
    </Alert>
  );
}
