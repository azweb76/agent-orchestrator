/** Pure parsers and builders for AskUserQuestion / ExitPlanMode tool inputs. */

export function extractPlanFromInput(input: Record<string, unknown>): string {
  if (typeof input.plan === 'string' && input.plan.trim()) {
    return input.plan.trim();
  }
  return '';
}

export function extractPlanFilePath(input: Record<string, unknown>): string | null {
  if (typeof input.planFilePath === 'string' && input.planFilePath.trim()) {
    return input.planFilePath.trim();
  }
  return null;
}

/** Claude Code V2 writes plans under `~/.claude/plans/<slug>.md`. */
export function isClaudePlansPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/.claude/plans/') && /\.md$/i.test(normalized);
}

/**
 * Pull `file_path` values that point at Claude plan files from a stream-json log.
 * ExitPlanMode V2 often sends `input: {}` on the permission prompt; the plan
 * lives on disk and is referenced by earlier Write tool calls.
 */
export function extractPlanFilePathsFromLog(logText: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const re = /"file_path"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(logText))) {
    const decoded = match[1]!
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    if (!isClaudePlansPath(decoded) || seen.has(decoded)) continue;
    seen.add(decoded);
    paths.push(decoded);
  }
  return paths;
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

interface BuildAskUserQuestionUpdatedInputOptions {
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
