import type {
  EffortLevel,
  PermissionMode,
} from './types/entities.js';
import type { ChatSessionTemplateId } from './chat-session.js';
import type { TaskSuggestionKind } from './types/views.js';
import type { AskUserQuestionItem } from './types/requests.js';
import type { AssistantMessage } from './assistant.js';

export const BRAIN_DRAFT_KINDS = ['skill', 'agent', 'task', 'follow-up'] as const;
export type BrainDraftKind = (typeof BRAIN_DRAFT_KINDS)[number];

export interface BrainMarkdownDraft {
  kind: 'skill' | 'agent';
  /** Existing slug when improving. */
  slug?: string;
  name: string;
  description: string;
  content: string;
  rationale?: string;
}

export interface BrainTaskDraft {
  kind: 'task';
  id?: string;
  name: string;
  title: string;
  description: string;
  purpose: string;
  promptTemplate: string;
  systemPrompt: string;
  allowedTools: string;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  listed: boolean;
  rationale?: string;
}

export interface BrainFollowUpDraft {
  kind: 'follow-up';
  id?: string;
  name: string;
  title: string;
  description: string;
  prompt: string;
  kindValue: TaskSuggestionKind;
  template: ChatSessionTemplateId | '';
  enabled: boolean;
  rationale?: string;
}

export type BrainDraft = BrainMarkdownDraft | BrainTaskDraft | BrainFollowUpDraft;

export function isBrainDraftKind(value: unknown): value is BrainDraftKind {
  return value === 'skill' || value === 'agent' || value === 'task' || value === 'follow-up';
}

export function emptyBrainDraft(kind: BrainDraftKind): BrainDraft {
  if (kind === 'skill' || kind === 'agent') {
    return { kind, name: '', description: '', content: '' };
  }
  if (kind === 'task') {
    return {
      kind: 'task',
      name: '',
      title: '',
      description: '',
      purpose: '',
      promptTemplate: '',
      systemPrompt: '',
      allowedTools: '',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      listed: false,
    };
  }
  return {
    kind: 'follow-up',
    name: '',
    title: '',
    description: '',
    prompt: '',
    kindValue: 'prompt',
    template: '',
    enabled: true,
  };
}

export function stripMarkdownFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, '');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseMarkdownDraft(kind: 'skill' | 'agent', raw: Record<string, unknown>): BrainMarkdownDraft {
  return {
    kind,
    slug: asString(raw.slug) || undefined,
    name: asString(raw.name),
    description: asString(raw.description),
    content: stripMarkdownFrontmatter(typeof raw.content === 'string' ? raw.content : ''),
    rationale: asString(raw.rationale) || undefined,
  };
}

const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const PERMISSIONS: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
];

function parseTaskDraft(raw: Record<string, unknown>): BrainTaskDraft {
  const effort = EFFORTS.includes(raw.effort as EffortLevel) ? (raw.effort as EffortLevel) : 'high';
  const permissionMode = PERMISSIONS.includes(raw.permissionMode as PermissionMode)
    ? (raw.permissionMode as PermissionMode)
    : 'plan';
  return {
    kind: 'task',
    id: asString(raw.id) || undefined,
    name: asString(raw.name),
    title: asString(raw.title),
    description: asString(raw.description),
    purpose: asString(raw.purpose),
    promptTemplate: typeof raw.promptTemplate === 'string' ? raw.promptTemplate : '',
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
    allowedTools: asString(raw.allowedTools),
    model: asString(raw.model) || 'sonnet',
    effort,
    permissionMode,
    listed: raw.listed === true,
    rationale: asString(raw.rationale) || undefined,
  };
}

const FOLLOW_KINDS: TaskSuggestionKind[] = [
  'prompt',
  'commit-and-push',
  'start-template',
  'grade-session',
];

function parseFollowUpDraft(raw: Record<string, unknown>): BrainFollowUpDraft {
  const kindValue = FOLLOW_KINDS.includes(raw.kindValue as TaskSuggestionKind)
    ? (raw.kindValue as TaskSuggestionKind)
    : FOLLOW_KINDS.includes(raw.followUpKind as TaskSuggestionKind)
      ? (raw.followUpKind as TaskSuggestionKind)
      : 'prompt';
  const template = typeof raw.template === 'string' ? raw.template : '';
  return {
    kind: 'follow-up',
    id: asString(raw.id) || undefined,
    name: asString(raw.name),
    title: asString(raw.title),
    description: asString(raw.description),
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    kindValue,
    template: template as ChatSessionTemplateId | '',
    enabled: raw.enabled !== false,
    rationale: asString(raw.rationale) || undefined,
  };
}

/** Parse a `propose_brain_draft` tool payload or JSON string. */
export function parseBrainDraft(input: unknown): BrainDraft | null {
  let raw: Record<string, unknown> | null = null;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        raw = obj.draft && typeof obj.draft === 'object' ? (obj.draft as Record<string, unknown>) : obj;
      }
    } catch {
      return null;
    }
  } else if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    raw = obj.draft && typeof obj.draft === 'object' ? (obj.draft as Record<string, unknown>) : obj;
  }
  if (!raw) return null;
  const kind = raw.kind;
  if (kind === 'skill' || kind === 'agent') return parseMarkdownDraft(kind, raw);
  if (kind === 'task') return parseTaskDraft(raw);
  if (kind === 'follow-up') return parseFollowUpDraft(raw);
  return null;
}

export function latestBrainDraftFromMessages(messages: AssistantMessage[]): BrainDraft | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== 'tool' || msg.toolResult?.toolName !== 'propose_brain_draft') continue;
    if (msg.toolResult.isError) continue;
    const draft = parseBrainDraft(msg.content);
    if (draft) return draft;
  }
  return null;
}

export function latestAskUserQuestionsFromMessages(messages: AssistantMessage[]): AskUserQuestionItem[] | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user') return null;
    if (msg?.role !== 'tool' || msg.toolResult?.toolName !== 'ask_user') continue;
    if (msg.toolResult.isError) continue;
    try {
      const parsed = JSON.parse(msg.content) as { questions?: unknown };
      const questions = parseAskUserToolQuestions(parsed.questions);
      return questions.length > 0 ? questions : [];
    } catch {
      return [];
    }
  }
  return null;
}

export function parseAskUserToolQuestions(value: unknown): AskUserQuestionItem[] {
  if (!Array.isArray(value)) return [];
  const questions: AskUserQuestionItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const question = asString(row.question);
    if (!question) continue;
    const options = Array.isArray(row.options)
      ? row.options
          .map((opt) => {
            if (!opt || typeof opt !== 'object') return null;
            const option = opt as Record<string, unknown>;
            const label = asString(option.label);
            if (!label) return null;
            return { label, description: asString(option.description) };
          })
          .filter((opt): opt is { label: string; description: string } => Boolean(opt))
      : [];
    questions.push({
      question,
      header: asString(row.header),
      options,
      multiSelect: row.multiSelect === true,
    });
  }
  return questions;
}

export function formatAskUserAnswers(
  answers: Record<string, string>,
  freeResponse?: string,
): string {
  if (freeResponse?.trim()) return freeResponse.trim();
  const lines = Object.entries(answers)
    .filter(([, value]) => value.trim())
    .map(([question, value]) => `${question}: ${value.trim()}`);
  return lines.length > 0 ? `Answers:\n${lines.join('\n')}` : '';
}

export function mergeBrainDraft(
  current: BrainDraft,
  proposed: BrainDraft,
  dirtyKeys: ReadonlySet<string>,
): BrainDraft {
  if (current.kind !== proposed.kind) {
    return dirtyKeys.size > 0 ? current : proposed;
  }
  const next = { ...proposed } as Record<string, unknown>;
  const prev = current as unknown as Record<string, unknown>;
  for (const key of Object.keys(prev)) {
    if (dirtyKeys.has(key)) next[key] = prev[key];
  }
  return next as unknown as BrainDraft;
}

export function brainCreatePrompt(kind: BrainDraftKind, extra?: string): string {
  const noun =
    kind === 'skill'
      ? 'a new personal skill (SKILL.md in ~/.claude/skills)'
      : kind === 'agent'
        ? 'a new personal Claude Code subagent (~/.claude/agents/<slug>.md)'
        : kind === 'task'
          ? 'a new agent kickoff task template'
          : 'a new post-session follow-up chip';
  const parts = [
    `Help me create ${noun}.`,
    'Ask clarifying questions with the ask_user tool before you guess required fields.',
    kind === 'skill' || kind === 'agent'
      ? 'Then call propose_brain_draft with a files array of one or more skill/agent drafts. I will edit and Accept them in the Brain pane — do not write files yourself.'
      : 'Then call propose_brain_draft with the filled draft. I will edit and save it in the Brain pane — do not write files yourself.',
  ];
  if (extra?.trim()) parts.push(extra.trim());
  return parts.join(' ');
}

export function brainImprovePrompt(kind: BrainDraftKind, identity: string, extra?: string): string {
  const parts = [
    `Help me improve this Brain ${kind}: ${identity}.`,
    'Load it with list/get tools, ask clarifying questions with ask_user if the goal is unclear, then propose_brain_draft.',
    kind === 'skill' || kind === 'agent'
      ? 'You may include related skills or personal subagents in the same files array. I will edit and Accept in the Brain pane — do not write files yourself.'
      : 'I will edit and save in the Brain pane — do not write files yourself.',
  ];
  if (extra?.trim()) parts.push(extra.trim());
  return parts.join(' ');
}

export const BRAIN_GARDEN_PROMPT =
  'Review recent session grades (list_recent_session_grades / get_session_grade). If you see a repeated skill or subagent gap, ask_user which lesson to capture, then propose_brain_draft with a files array of one or more personal skills and agents. Do not write files yourself.';
