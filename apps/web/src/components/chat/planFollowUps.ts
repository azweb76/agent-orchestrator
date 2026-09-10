import type { TaskFollowUp } from '@agent-orchestrator/shared';
import type { PlanFollowUp } from '../claude-chat/types';

/** Map the server's plan-time follow-up catalog into the chat kit's chip shape. */
export function toPlanFollowUps(catalog: TaskFollowUp[]): PlanFollowUp[] {
  return catalog.map((item) => ({
    id: item.id,
    label: item.title,
    description: item.description || undefined,
    prompt: item.prompt,
  }));
}

/**
 * Fold a selected plan follow-up's prompt into the plan text sent to Build.
 * Returns undefined when there is no client-side plan text to augment (Claude
 * Code V2 can send an empty ExitPlanMode input) so the caller falls back to
 * Build's normal server-side plan resolution instead of overriding it with
 * just the follow-up text and losing the real plan.
 */
export function buildFollowUpPlanOverride(plan: string, followUp: PlanFollowUp): string | undefined {
  const trimmed = plan.trim();
  if (!trimmed) return undefined;
  return `${trimmed}\n\n---\n\nAdditional instructions from the "${followUp.label}" follow-up:\n${followUp.prompt}`;
}
