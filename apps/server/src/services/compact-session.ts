import {
  extractMentionedFilePathsFromText,
  extractToolFilePathsFromLog,
  mergeUniqueFilePaths,
} from '@agent-orchestrator/shared';

/** Transcript context handed to the continuation summarizer. */
export interface CompactSummaryInput {
  title: string;
  transcript: string;
}

const SUMMARY_SYSTEM_PROMPT = [
  'You write continuation summaries for a coding agent whose chat context is nearly full.',
  'The summary seeds a fresh session that must pick up the work without the original transcript.',
  'Respond with ONLY the markdown summary — no preamble, no code fence around the whole reply.',
  'Cover, briefly and concretely:',
  '- The goal and the user requirements that still apply.',
  '- Decisions, constraints, and conventions agreed so far.',
  '- Work already completed, naming the files changed and how.',
  '- Work still remaining and the next concrete step.',
  '- Commands, test results, or pitfalls worth carrying over.',
  'Be specific about file paths, identifiers, and branch names.',
].join('\n');

export function buildCompactSummaryPrompt(input: CompactSummaryInput): {
  system: string;
  user: string;
} {
  const user = [
    `Session title: ${input.title}`,
    '',
    'Transcript (role-prefixed, oldest first):',
    '',
    input.transcript,
  ].join('\n');
  return { system: SUMMARY_SYSTEM_PROMPT, user };
}

/** Trim the model reply and unwrap a whole-reply code fence. Throws when empty. */
export function parseCompactSummaryResponse(text: unknown): string {
  let summary = typeof text === 'string' ? text.trim() : '';
  const fenced = summary.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced?.[1]) summary = fenced[1].trim();
  if (!summary) throw new Error('Summarizer returned an empty summary');
  return summary;
}

/** Files in play: tool `file_path` uses from the run log plus paths mentioned in chat. */
export function collectCompactFilePaths(logText: string, messageTexts: string[]): string[] {
  return mergeUniqueFilePaths([
    extractToolFilePathsFromLog(logText),
    messageTexts.flatMap((text) => extractMentionedFilePathsFromText(text)),
  ]);
}
