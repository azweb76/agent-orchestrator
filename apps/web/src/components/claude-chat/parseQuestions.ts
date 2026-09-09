import type { AskUserQuestionItem } from './types';

export function parseQuestions(input: Record<string, unknown>): AskUserQuestionItem[] {
  const raw = input.questions;
  if (!Array.isArray(raw)) return [];
  const questions: AskUserQuestionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question : '';
    if (!question) continue;
    const options = [];
    if (Array.isArray(row.options)) {
      for (const opt of row.options) {
        if (!opt || typeof opt !== 'object') continue;
        const o = opt as Record<string, unknown>;
        if (typeof o.label !== 'string') continue;
        options.push({
          label: o.label,
          description: typeof o.description === 'string' ? o.description : undefined,
          preview: typeof o.preview === 'string' ? o.preview : undefined,
        });
      }
    }
    questions.push({
      question,
      header: typeof row.header === 'string' ? row.header : undefined,
      options,
      multiSelect: row.multiSelect === true,
    });
  }
  return questions;
}