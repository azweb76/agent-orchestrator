import type { AgentStatus, EffortLevel, PermissionMode } from './index.js';

/** Built-in kickoff templates for a new chat session on an agent. */
export type ChatSessionTemplateId = 'chat' | 'build' | 'create-draft-pr' | 'review';

export interface ChatSession {
  id: string;
  agentId: string;
  title: string;
  template: ChatSessionTemplateId;
  status: AgentStatus;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  claudeSessionId: string | null;
  pid: number | null;
  runLogPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionTemplate {
  id: ChatSessionTemplateId;
  title: string;
  description: string;
  permissionMode: PermissionMode;
  /**
   * Initial user prompt sent when the session is created.
   * `null` leaves the composer empty (used for blank chat and Build, which
   * supplies the prompt at runtime).
   */
  prompt: string | null;
  /** Shown in the new-session picker. Hidden templates are created by the app. */
  listed: boolean;
}

export const CHAT_SESSION_TEMPLATES: ChatSessionTemplate[] = [
  {
    id: 'chat',
    title: 'New chat',
    description: 'Start a fresh plan-mode conversation.',
    permissionMode: 'plan',
    prompt: null,
    listed: true,
  },
  {
    id: 'create-draft-pr',
    title: 'Create draft PR',
    description: 'Summarize changes and open a draft pull request.',
    permissionMode: 'auto',
    prompt: [
      'Create a draft pull request for the current branch.',
      'Summarize the changes, write a good title and description, commit remaining work if needed, push, and open a draft PR.',
      'Do not merge. If a PR already exists for this branch, update it instead of opening a duplicate.',
    ].join(' '),
    listed: true,
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review the current diff for bugs, edge cases, and missing tests.',
    permissionMode: 'plan',
    prompt: [
      'Review the current uncommitted and branch changes for bugs, edge cases, missing tests, and regressions.',
      'Start by inspecting the diff. Ask clarifying questions if the intent is unclear.',
      'Do not make changes unless I ask you to.',
    ].join(' '),
    listed: true,
  },
  {
    id: 'build',
    title: 'Build',
    description: 'Implement an approved plan in auto mode.',
    permissionMode: 'auto',
    prompt: null,
    listed: false,
  },
];

export const LISTED_CHAT_SESSION_TEMPLATES = CHAT_SESSION_TEMPLATES.filter((item) => item.listed);

export function chatSessionTemplateById(
  id: string | undefined,
): ChatSessionTemplate | undefined {
  if (!id) return undefined;
  return CHAT_SESSION_TEMPLATES.find((item) => item.id === id);
}

export interface CreateChatSessionRequest {
  template?: ChatSessionTemplateId;
  title?: string;
}

export interface UpdateChatSessionRequest {
  title?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
}

export function buildImplementPlanPrompt(plan: string): string {
  return [
    'The user approved the following plan. Implement it now in auto mode.',
    'Do not ask clarifying questions unless blocked. Prefer making progress with sensible defaults.',
    '',
    '## Approved plan',
    '',
    plan,
  ].join('\n');
}
