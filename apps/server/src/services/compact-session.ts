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
  'Respond with markdown only — no preamble, no code fence around the whole reply.',
  'Start with the continuation summary covering:',
  '- The goal and the user requirements that still apply.',
  '- Decisions, constraints, and conventions agreed so far.',
  '- Work already completed, naming the files changed and how.',
  '- Work still remaining and the next concrete step.',
  '- Commands, test results, or pitfalls worth carrying over.',
  'End with a "## Durable lessons" section: 0–5 bullet points of reusable habits the next session should keep',
  '(skills to follow, conventions, corrections the user already made). Omit the section if there are none.',
  'Do not draft instruction files. Lessons are notes only.',
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

export interface CompactLearnSummary {
  summary: string;
  lessons: string[];
}

/** Trim the model reply and unwrap a whole-reply code fence. Throws when empty. */
export function parseCompactSummaryResponse(text: unknown): string {
  let summary = typeof text === 'string' ? text.trim() : '';
  const fenced = summary.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced?.[1]) summary = fenced[1].trim();
  if (!summary) throw new Error('Summarizer returned an empty summary');
  return summary;
}

export function parseCompactLearnResponse(text: unknown): CompactLearnSummary {
  const summary = parseCompactSummaryResponse(text);
  const heading = /^##\s+durable lessons\s*$/im;
  const match = heading.exec(summary);
  if (!match || match.index == null) return { summary, lessons: [] };

  const before = summary.slice(0, match.index).trim();
  const after = summary.slice(match.index + match[0].length);
  const nextHeading = after.search(/^##\s+/m);
  const lessonBlock = (nextHeading === -1 ? after : after.slice(0, nextHeading)).trim();
  const remainder = nextHeading === -1 ? '' : after.slice(nextHeading).trim();
  const lessons = lessonBlock
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);

  const combined = [before, remainder].filter(Boolean).join('\n\n');
  if (!combined) throw new Error('Summarizer returned an empty summary');
  return { summary: combined, lessons };
}

/** Files in play: tool `file_path` uses from the run log plus paths mentioned in chat. */
export function collectCompactFilePaths(logText: string, messageTexts: string[]): string[] {
  return mergeUniqueFilePaths([
    extractToolFilePathsFromLog(logText),
    messageTexts.flatMap((text) => extractMentionedFilePathsFromText(text)),
  ]);
}
