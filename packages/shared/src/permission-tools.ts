/** Pure parsers and builders for AskUserQuestion / ExitPlanMode tool inputs. */

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

/**
 * Normalize AskUserQuestion tool input into displayable questions.
 * Tolerates missing headers/options so the chat UI can still collect a freeform reply.
 */
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

export interface BuildAskUserQuestionUpdatedInputOptions {
  /** Map of question text → selected label(s). Multi-select values may be comma-joined. */
  answers?: Record<string, string>;
  /** Optional freeform reply instead of (or in addition to) structured answers. */
  response?: string;
}

/**
 * Build the `updatedInput` payload Claude Code expects when allowing AskUserQuestion.
 * Must echo the original `questions` array from the tool input (do not re-normalize).
 * @see https://code.claude.com/docs/en/agent-sdk/user-input#handle-clarifying-questions
 */
export function buildAskUserQuestionUpdatedInput(
  pendingInput: Record<string, unknown>,
  options: BuildAskUserQuestionUpdatedInputOptions,
): Record<string, unknown> {
  const answers = options.answers ?? {};
  const updatedInput: Record<string, unknown> = {
    questions: pendingInput.questions,
    answers,
  };

  if (pendingInput.metadata != null) {
    updatedInput.metadata = pendingInput.metadata;
  }
  if (pendingInput.annotations != null) {
    updatedInput.annotations = pendingInput.annotations;
  }

  const response = options.response?.trim();
  if (response) {
    updatedInput.response = response;
  }

  return updatedInput;
}
