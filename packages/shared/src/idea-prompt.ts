/**
 * Build the first user prompt when creating an agent from an idea.
 * Requires clarifying questions before ExitPlanMode.
 */
export function buildIdeaKickoffPrompt(idea: string): string {
  const trimmed = idea.trim();
  return [
    trimmed,
    '',
    'Before drafting a plan, use AskUserQuestion to clarify anything ambiguous about scope, constraints, edge cases, and success criteria. Do not present a plan (ExitPlanMode) until I have answered your questions.',
  ].join('\n');
}
