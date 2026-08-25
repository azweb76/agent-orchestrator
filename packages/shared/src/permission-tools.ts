/** Pure parsers for AskUserQuestion / ExitPlanMode tool inputs. */

export function extractPlanFromInput(input: Record<string, unknown>): string {
  if (typeof input.plan === 'string' && input.plan.trim()) {
    return input.plan.trim();
  }
  return '';
}

type ParsedOption = { label: string; description: string; preview?: string };
type ParsedQuestion = {
  question: string;
  header: string;
  options: ParsedOption[];
  multiSelect: boolean;
};

export function parseAskUserQuestions(input: Record<string, unknown>): ParsedQuestion[] {
  const raw = input.questions;
  if (!Array.isArray(raw)) return [];

  const questions: ParsedQuestion[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue;

    const options: ParsedOption[] = [];
    if (Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (!opt || typeof opt !== 'object') continue;
        const o = opt as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label : '';
        if (!label) continue;
        const parsed: ParsedOption = {
          label,
          description: typeof o.description === 'string' ? o.description : '',
        };
        if (typeof o.preview === 'string') parsed.preview = o.preview;
        options.push(parsed);
      }
    }

    questions.push({
      question,
      header: typeof q.header === 'string' ? q.header : question.slice(0, 12),
      options,
      multiSelect: Boolean(q.multiSelect),
    });
  }

  return questions;
}
