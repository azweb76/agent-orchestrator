import type { InstructionDraftOffer } from '@agent-orchestrator/shared';
import { type AppContext, makeEvent, notify } from './app-context.js';

const OFFER_KEY = (agentId: string) => `instruction-draft.offer:${agentId}`;

export function getInstructionDraftOffer(
  ctx: AppContext,
  agentId: string,
): InstructionDraftOffer | null {
  const raw = ctx.repos.automationState.get(OFFER_KEY(agentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InstructionDraftOffer;
  } catch {
    return null;
  }
}

export function setInstructionDraftOffer(
  ctx: AppContext,
  agentId: string,
  offer: InstructionDraftOffer,
): void {
  ctx.repos.automationState.set(OFFER_KEY(agentId), JSON.stringify(offer));
}

export function clearInstructionDraftOffer(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(OFFER_KEY(agentId));
}

/** Persist an offer and notify clients (human apply still required). */
export function publishInstructionDraftOffer(
  ctx: AppContext,
  agentId: string,
  offer: InstructionDraftOffer,
): void {
  setInstructionDraftOffer(ctx, agentId, offer);
  ctx.repos.events.create(
    makeEvent(agentId, 'instruction_draft_offered', {
      sessionId: offer.sessionId,
      hasDraft: Boolean(offer.draft),
      kind: offer.kind ?? null,
    }),
  );
  notify(ctx, 'instruction_draft_offer', {
    agentId,
    sessionId: offer.sessionId,
    data: { hasDraft: Boolean(offer.draft), kind: offer.kind ?? null },
  });
}

export function dismissInstructionDraftOffer(ctx: AppContext, agentId: string): void {
  clearInstructionDraftOffer(ctx, agentId);
  notify(ctx, 'instruction_draft_offer', {
    agentId,
    data: { dismissed: true },
  });
}
