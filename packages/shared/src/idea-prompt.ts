/**
 * First user prompt when creating an agent from an idea.
 * Sends the idea text as-is (no appended instructions).
 */
export function buildIdeaKickoffPrompt(idea: string): string {
  return idea.trim();
}
