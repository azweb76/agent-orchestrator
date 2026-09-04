import type { ChatSession } from '@agent-orchestrator/shared';
import { isInstructionOfferSessionTemplate } from '@agent-orchestrator/shared';
import { type AppContext } from './app-context.js';
import { getAppSettings } from './app-settings.js';
import { gradeAgentSession } from './session-grade-instructions.js';

/**
 * After a clean Build / Fix CI run, optionally auto-grade so instruction offers
 * can appear without a manual Analyze click. Gated by both analysis and
 * auto-grade settings.
 */
export async function maybeAutoGradeBuildSession(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (outcome.stopped || outcome.error) return;
  if (!isInstructionOfferSessionTemplate(session.template)) return;
  if (session.grade?.analysis) return;

  const settings = getAppSettings(ctx.repos);
  if (!settings.analyzeSessionEnabled || !settings.autoGradeBuildSessionsEnabled) return;

  await gradeAgentSession(ctx, session.agentId, session.id);
}
