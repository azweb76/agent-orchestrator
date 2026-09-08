import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';

/** Post a short Assistant-thread note so poll automation shares the schedule audit surface. */
export function postAutomationAuditToAssistant(ctx: AppContext, content: string): void {
  const text = content.trim();
  if (!text) return;
  ctx.repos.assistantMessages.create({
    id: uuidv4(),
    role: 'assistant',
    content: text,
    createdAt: nowIso(),
  });
}

export function formatPollFixCiStarted(input: {
  owner: string;
  repo: string;
  number: number;
  agentId: string;
  sessionId: string;
  attempt: number;
}): string {
  return [
    '[GitHub poll · Fix CI]',
    `Started fix-ci on ${input.owner}/${input.repo}#${input.number}`,
    `(agent ${input.agentId}, session ${input.sessionId}, attempt ${input.attempt}).`,
    'Same action path as the ci_sweep Assistant playbook.',
  ].join(' ');
}

export function formatPollFixCiCapHit(input: {
  owner: string;
  repo: string;
  number: number;
  agentId: string;
  attempts: number;
  cap: number;
}): string {
  return [
    '[GitHub poll · Fix CI]',
    `Retry cap hit for ${input.owner}/${input.repo}#${input.number}`,
    `(agent ${input.agentId}, ${input.attempts}/${input.cap} attempts).`,
    'No new fix-ci session started.',
  ].join(' ');
}

export function formatPollAddressReviewStarted(input: {
  owner: string;
  repo: string;
  number: number;
  agentId: string;
  sessionId: string;
}): string {
  return [
    '[GitHub poll · Address review]',
    `Started address-review on ${input.owner}/${input.repo}#${input.number}`,
    `(agent ${input.agentId}, session ${input.sessionId}).`,
    'Same action path as the review_sweep Assistant playbook.',
  ].join(' ');
}

export function formatPollAddressReviewBlocked(input: {
  owner: string;
  repo: string;
  number: number;
  agentId: string;
  reason: string;
}): string {
  const why =
    input.reason === 'worktree_busy'
      ? 'worktree is busy'
      : input.reason.replace(/_/g, ' ');
  return [
    '[GitHub poll · Address review]',
    `Could not start address-review on ${input.owner}/${input.repo}#${input.number}`,
    `(agent ${input.agentId}; ${why}).`,
    'Same audit trail as the review_sweep Assistant playbook.',
  ].join(' ');
}
