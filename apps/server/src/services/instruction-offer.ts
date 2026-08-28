import { v4 as uuidv4 } from 'uuid';
import type { AgentEvent, ChatSession } from '@agent-orchestrator/shared';
import {
  instructionGradeFindings,
  isInstructionOfferSessionTemplate,
  shouldOfferInstructionDraft,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app.js';

function makeEvent(agentId: string, type: string, data: Record<string, unknown>): AgentEvent {
  return {
    id: uuidv4(),
    agentId,
    type,
    data,
    createdAt: new Date().toISOString(),
  };
}

export interface InstructionOfferRunOutcome {
  stopped?: boolean;
  error?: string;
}

/**
 * After a Build / Fix CI run completes cleanly, grade the session and — when
 * the findings flag instruction files or skills — emit an
 * `instruction_draft_offer` app event so the UI can prompt the user to review
 * and apply a draft. Grading failures are logged and swallowed; this never
 * writes instruction files itself (applying stays behind explicit user
 * confirmation in the Improve-instructions dialog).
 */
export async function offerInstructionDraftAfterRun(
  ctx: AppContext,
  session: Pick<ChatSession, 'id' | 'agentId' | 'template'>,
  outcome: InstructionOfferRunOutcome,
  gradeSession: () => Promise<ChatSession>,
): Promise<boolean> {
  if (outcome.stopped || outcome.error) return false;
  if (!isInstructionOfferSessionTemplate(session.template)) return false;

  let graded: ChatSession;
  try {
    graded = await gradeSession();
  } catch (error) {
    console.warn(`[instruction-offer] grading session ${session.id} failed:`, error);
    return false;
  }

  if (!shouldOfferInstructionDraft(graded)) return false;

  const categories = [
    ...new Set(instructionGradeFindings(graded.grade).map((finding) => finding.category)),
  ];
  ctx.repos.events.create(
    makeEvent(session.agentId, 'instruction_draft_offered', {
      sessionId: session.id,
      categories,
    }),
  );
  ctx.notifier?.emit('instruction_draft_offer', {
    agentId: session.agentId,
    sessionId: session.id,
    data: { categories },
  });
  return true;
}
