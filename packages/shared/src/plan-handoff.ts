import { parseAskUserQuestions } from './permission-tools.js';

/** One answered AskUserQuestion pair from the plan session. */
export interface PlanQaPair {
  question: string;
  answer: string;
}

export interface PlanBuildHandoffContext {
  qaPairs?: PlanQaPair[];
  filePaths?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed) ?? null;
  } catch {
    return null;
  }
}

/** Build Q&A pairs from AskUserQuestion pending input plus answered payload. */
export function buildPlanQaPairsFromAskUserAnswer(
  pendingInput: Record<string, unknown>,
  answers: Record<string, string> = {},
  response?: string,
): PlanQaPair[] {
  const pairs: PlanQaPair[] = [];
  for (const [question, answer] of Object.entries(answers)) {
    const trimmed = answer.trim();
    if (question.trim() && trimmed) pairs.push({ question: question.trim(), answer: trimmed });
  }

  const free = response?.trim();
  if (!free) return pairs;

  if (pairs.length === 0) {
    const questions = parseAskUserQuestions(pendingInput);
    if (questions.length === 1) {
      pairs.push({ question: questions[0].question, answer: free });
    } else if (questions.length > 1) {
      pairs.push({ question: 'Reply', answer: free });
    } else {
      pairs.push({ question: 'User reply', answer: free });
    }
    return pairs;
  }

  pairs.push({ question: 'Additional note', answer: free });
  return pairs;
}

function parseControlResponse(event: Record<string, unknown>): {
  requestId: string;
  updatedInput: Record<string, unknown>;
} | null {
  if (event.type !== 'control_response') return null;
  const outer = asRecord(event.response);
  if (!outer || outer.subtype !== 'success') return null;
  const requestId =
    (typeof outer.request_id === 'string' && outer.request_id) ||
    (typeof outer.requestId === 'string' && outer.requestId) ||
    '';
  if (!requestId) return null;
  const inner = asRecord(outer.response);
  if (!inner || inner.behavior !== 'allow') return null;
  return {
    requestId,
    updatedInput: asRecord(inner.updatedInput) ?? {},
  };
}

function parsePermissionRequestFromLog(event: Record<string, unknown>): {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
} | null {
  const type = String(event.type ?? '');
  if (type !== 'control_request' && type !== 'sdk_control_request') return null;

  const request = asRecord(event.request) ?? asRecord(event.payload);
  if (!request) return null;

  const requestId =
    (typeof event.request_id === 'string' && event.request_id) ||
    (typeof request.request_id === 'string' && request.request_id) ||
    (typeof event.requestId === 'string' && event.requestId) ||
    '';
  if (!requestId) return null;

  const subtype = String(request.subtype ?? event.subtype ?? '');
  if (subtype !== 'can_use_tool' && subtype !== 'permission') return null;

  const toolName = String(request.tool_name ?? request.toolName ?? '');
  if (!toolName) return null;

  const input =
    asRecord(request.input) ?? asRecord(request.tool_input) ?? asRecord(request.toolInput) ?? {};

  return { requestId, toolName, input };
}

/** Extract answered AskUserQuestion pairs from a stream-json run log. */
export function extractAskUserQuestionPairsFromLog(logText: string): PlanQaPair[] {
  const pending = new Map<string, Record<string, unknown>>();
  const pairs: PlanQaPair[] = [];

  for (const line of logText.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const permission = parsePermissionRequestFromLog(event);
    if (permission?.toolName === 'AskUserQuestion') {
      pending.set(permission.requestId, permission.input);
      continue;
    }

    const response = parseControlResponse(event);
    if (!response) continue;

    const input = pending.get(response.requestId) ?? {};
    const rawAnswers = asRecord(response.updatedInput.answers) ?? {};
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
      if (typeof value === 'string') answers[key] = value;
    }
    const responseText =
      typeof response.updatedInput.response === 'string' ? response.updatedInput.response : undefined;
    pairs.push(...buildPlanQaPairsFromAskUserAnswer(input, answers, responseText));
    pending.delete(response.requestId);
  }

  return pairs;
}

const MENTIONED_PATH_RE = /\b(?:[\w@][\w.-]*\/)+[\w./-]+\b/g;

/** Pull repo-relative file paths mentioned in free text (plan, Q&A, chat). */
export function extractMentionedFilePathsFromText(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(MENTIONED_PATH_RE)) {
    const candidate = match[0];
    if (candidate.includes('://') || candidate.startsWith('//')) continue;
    paths.add(candidate);
  }
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1]?.trim() ?? '';
    if (!candidate.includes('/') || candidate.includes('://')) continue;
    paths.add(candidate);
  }
  return [...paths];
}

/** Decode `file_path` values from tool uses in a stream-json log. */
export function extractToolFilePathsFromLog(logText: string): string[] {
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
    if (!decoded || seen.has(decoded)) continue;
    seen.add(decoded);
    paths.push(decoded);
  }
  return paths;
}

/** Collect file paths mentioned across plan text, Q&A, logs, and message bodies. */
export function collectPlanHandoffFilePaths(
  plan: string,
  qaPairs: PlanQaPair[],
  logText: string,
  messageTexts: string[] = [],
): string[] {
  const qaText = qaPairs.map((pair) => `${pair.question} ${pair.answer}`).join('\n');
  const texts = [plan, qaText, ...messageTexts];
  return mergeUniqueFilePaths([
    texts.flatMap((text) => extractMentionedFilePathsFromText(text)),
    extractToolFilePathsFromLog(logText),
  ]);
}

export function mergeUniquePlanQaPairs(sources: PlanQaPair[][]): PlanQaPair[] {
  const merged: PlanQaPair[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const pair of source) {
      const key = `${pair.question}\0${pair.answer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(pair);
    }
  }
  return merged;
}

export function mergeUniqueFilePaths(sources: string[][]): string[] {
  const merged = new Set<string>();
  for (const source of sources) {
    for (const item of source) {
      const trimmed = item.trim();
      if (trimmed) merged.add(trimmed);
    }
  }
  return [...merged].sort();
}
