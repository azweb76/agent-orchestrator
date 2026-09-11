import type { AgentStatus, EffortLevel, PermissionMode } from './index.js';
import type { InstructionFileKind, InstructionFileScope } from './instruction-files.js';
import { builtinAgentTaskSeedByName } from './builtin-agent-tasks.js';
import { renderAgentTaskPromptTemplate } from './agent-task.js';

/** Built-in kickoff templates for a new chat session on an agent. */
export type ChatSessionTemplateId =
  | 'chat'
  | 'build'
  | 'create-draft-pr'
  | 'review'
  | 'address-review'
  | 'fix-ci'
  | 'resolve-conflicts';

export const SESSION_GRADE_SCORES = [1, 2, 3, 4, 5] as const;
export type SessionGradeScore = (typeof SESSION_GRADE_SCORES)[number];

export const SESSION_GRADE_LABELS: Record<SessionGradeScore, string> = {
  1: 'Poor',
  2: 'Weak',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

export const SESSION_GRADE_FINDING_CATEGORIES = [
  'excessive_turns',
  'wasted_tokens',
  'bloated_context',
  'instruction_files',
  'skills',
] as const;
export type SessionGradeFindingCategory = (typeof SESSION_GRADE_FINDING_CATEGORIES)[number];

export const SESSION_GRADE_FINDING_LABELS: Record<SessionGradeFindingCategory, string> = {
  excessive_turns: 'Excessive turns',
  wasted_tokens: 'Wasted tokens',
  bloated_context: 'Bloated context',
  instruction_files: 'Instruction files',
  skills: 'Skills',
};

export type SessionGradeFindingSeverity = 'ok' | 'warning' | 'issue';

export interface SessionGradeFinding {
  category: SessionGradeFindingCategory;
  severity: SessionGradeFindingSeverity;
  title: string;
  detail: string;
  /** Concrete remediation advice; present for warning/issue findings. */
  suggestion?: string;
  /** Suggested remediation target, present for warning/issue findings. */
  recommendedAction?: {
    kind: InstructionFileKind;
    /** Only meaningful when kind === 'skill'. Defaults to personal for new skills. */
    scope?: InstructionFileScope;
    /** Suggested skill slug when kind is skill. */
    name?: string;
    /** Create a new skill vs update an existing one. */
    operation?: 'create' | 'update';
  };
}

export interface SessionGradeStats {
  userTurns: number;
  assistantTurns: number;
  estimatedTokens: number;
  costUsd: number | null;
  toolCalls: number;
  instructionFileCount: number;
  skillCount: number;
}

/** AI analysis of session efficiency and instruction quality. */
export interface SessionGradeAnalysis {
  summary: string;
  findings: SessionGradeFinding[];
  stats: SessionGradeStats;
  /** Absolute path of the Claude session JSONL (or run log) that was graded. */
  sessionFilePath?: string | null;
}

/** Quality grade for a chat session, produced by AI analysis. */
export interface SessionGrade {
  score: SessionGradeScore;
  comment: string;
  gradedAt: string;
  analysis?: SessionGradeAnalysis | null;
}

export interface GradeChatSessionRequest {
  /** Optional notes the grader should consider. */
  notes?: string;
}

/** How a chat session title was last set. User titles are never overwritten by auto-naming. */
export type ChatSessionTitleSource = 'default' | 'auto' | 'user';

/** Maximum length for a chat session title (auto-generated or renamed). */
export const CHAT_TITLE_MAX_LENGTH = 80;

export interface ChatSession {
  id: string;
  agentId: string;
  title: string;
  template: ChatSessionTemplateId;
  status: AgentStatus;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  /** Agent task this session was created from, when applicable. */
  agentTaskId?: string | null;
  /** Appended Claude system prompt from the agent task (or session override). */
  systemPrompt?: string | null;
  /** `--allowedTools` override; null derives from permissionMode. */
  allowedTools?: string | null;
  claudeSessionId: string | null;
  pid: number | null;
  runLogPath: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present once the user has graded this session. */
  grade?: SessionGrade | null;
  /** Defaults to `default` for sessions created before this field existed. */
  titleSource?: ChatSessionTitleSource;
}

export interface ChatSessionTemplate {
  id: ChatSessionTemplateId;
  title: string;
  description: string;
  permissionMode: PermissionMode;
  /**
   * Unused on templates — kickoff text lives on the matching builtin AgentTask.
   * Kept so older clients reading template metadata still type-check.
   */
  prompt: string | null;
  /** Workflow templates that used to appear in the new-session picker. */
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
    prompt: null,
    listed: true,
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review the current diff for bugs, edge cases, and missing tests.',
    permissionMode: 'plan',
    prompt: null,
    listed: true,
  },
  {
    id: 'address-review',
    title: 'Address review',
    description: 'Address PR review feedback seeded from GitHub comments.',
    permissionMode: 'auto',
    prompt: null,
    listed: true,
  },
  {
    id: 'fix-ci',
    title: 'Fix CI',
    description: 'Fix failing CI checks with GitHub check-run context.',
    permissionMode: 'auto',
    prompt: null,
    listed: true,
  },
  {
    id: 'resolve-conflicts',
    title: 'Resolve conflicts',
    description: 'Merge the base branch and resolve conflicts on this PR.',
    permissionMode: 'auto',
    prompt: null,
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

/** Templates that commit, push, or otherwise mutate the shared worktree. */
export const GIT_MUTATING_SESSION_TEMPLATES: readonly ChatSessionTemplateId[] = [
  'build',
  'create-draft-pr',
  'address-review',
  'fix-ci',
  'resolve-conflicts',
];

const GIT_MUTATING_SESSION_TEMPLATE_SET = new Set<ChatSessionTemplateId>(
  GIT_MUTATING_SESSION_TEMPLATES,
);

export function isGitMutatingSessionTemplate(
  template: ChatSessionTemplateId | string | undefined,
): boolean {
  return Boolean(template && GIT_MUTATING_SESSION_TEMPLATE_SET.has(template as ChatSessionTemplateId));
}

/** Templates whose completed runs offer to fold graded lessons into instruction files. */
export const INSTRUCTION_OFFER_SESSION_TEMPLATES: readonly ChatSessionTemplateId[] = [
  'build',
  'fix-ci',
  'review',
  'address-review',
];

const INSTRUCTION_OFFER_SESSION_TEMPLATE_SET = new Set<ChatSessionTemplateId>(
  INSTRUCTION_OFFER_SESSION_TEMPLATES,
);

export function isInstructionOfferSessionTemplate(
  template: ChatSessionTemplateId | string | undefined,
): boolean {
  return Boolean(
    template && INSTRUCTION_OFFER_SESSION_TEMPLATE_SET.has(template as ChatSessionTemplateId),
  );
}

/** Grade finding categories that point at instruction files or skills. */
export const INSTRUCTION_GRADE_FINDING_CATEGORIES: readonly SessionGradeFindingCategory[] = [
  'instruction_files',
  'skills',
];

/** Non-ok grade findings about instruction files or skills. */
export function instructionGradeFindings(
  grade: SessionGrade | null | undefined,
): SessionGradeFinding[] {
  const findings = grade?.analysis?.findings ?? [];
  return findings.filter(
    (finding) =>
      finding.severity !== 'ok' &&
      INSTRUCTION_GRADE_FINDING_CATEGORIES.includes(finding.category),
  );
}

/**
 * True when a graded Build / Fix CI session should prompt the user to review
 * and apply an instruction-file draft. Applying always stays manual.
 */
export function shouldOfferInstructionDraft(
  session: Pick<ChatSession, 'template' | 'grade'>,
): boolean {
  if (!isInstructionOfferSessionTemplate(session.template)) return false;
  return instructionGradeFindings(session.grade).length > 0;
}

export function chatSessionTemplateById(
  id: string | undefined,
): ChatSessionTemplate | undefined {
  if (!id) return undefined;
  return CHAT_SESSION_TEMPLATES.find((item) => item.id === id);
}

export function isChatSessionTemplateId(id: string | undefined): id is ChatSessionTemplateId {
  return Boolean(id && chatSessionTemplateById(id));
}

/** Workflow template id for a task slug; non-template tasks start as `chat`. */
export function sessionTemplateIdForTaskName(
  name: string | undefined,
): ChatSessionTemplateId {
  return isChatSessionTemplateId(name) ? name : 'chat';
}

/** Pick a unique title among siblings, appending ` 2`, ` 3`, … as needed. */
export function uniqueSessionTitle(existingTitles: Iterable<string>, base: string): string {
  const trimmed = base.trim() || 'Chat';
  const titles = existingTitles instanceof Set ? existingTitles : new Set(existingTitles);
  if (!titles.has(trimmed)) return trimmed;
  let n = 2;
  while (titles.has(`${trimmed} ${n}`)) n += 1;
  return `${trimmed} ${n}`;
}

export interface CreateChatSessionRequest {
  template?: ChatSessionTemplateId;
  /** Create from an agent task by slug. */
  task?: string;
  title?: string;
}

export interface UpdateChatSessionRequest {
  title?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  systemPrompt?: string | null;
  allowedTools?: string | null;
}

import type { PlanBuildHandoffContext } from './plan-handoff.js';

function formatBulletSection(title: string, items: string[], trailing?: string): string {
  if (items.length === 0) return '';
  const lines = ['', `## ${title}`, '', ...items.map((item) => `- ${item}`)];
  if (trailing) lines.push('', trailing);
  return lines.join('\n');
}

export function buildImplementPlanPrompt(
  plan: string,
  handoff?: PlanBuildHandoffContext,
  promptTemplate?: string | null,
  planFilePath?: string,
): string {
  const seed = builtinAgentTaskSeedByName('build');
  const sections: string[] = [
    renderAgentTaskPromptTemplate(promptTemplate ?? seed?.promptTemplate, { plan, planFilePath }),
  ];

  const qaPairs = handoff?.qaPairs;
  if (qaPairs && qaPairs.length > 0) {
    sections.push('', '## Planning Q&A', '');
    for (const pair of qaPairs) {
      sections.push(`- **${pair.question}** → ${pair.answer}`);
    }
  }

  const filePaths = handoff?.filePaths;
  if (filePaths && filePaths.length > 0) {
    sections.push('', '## Files mentioned', '');
    for (const filePath of filePaths) {
      sections.push(`- ${filePath}`);
    }
  }

  return sections.join('\n');
}

/**
 * Kickoff prompt for compact-and-continue: the full transcript stays on the
 * stashed session; the fresh session starts from this summary and file list.
 */
export function buildCompactContinuePrompt(
  summary: string,
  filePaths: string[] = [],
  lessons: string[] = [],
  promptTemplate?: string | null,
): string {
  const seed = builtinAgentTaskSeedByName('compact-continue');
  const lead = renderAgentTaskPromptTemplate(promptTemplate ?? seed?.promptTemplate, { summary });
  const files = formatBulletSection('Files in play', filePaths);
  const lessonNote =
    'Apply these lessons in this continuation. Do not rewrite instruction files unless the user asks.';
  const lessonBlock = formatBulletSection('Durable lessons', lessons, lessonNote);
  return [lead, files, lessonBlock, '', 'Continue the work from this summary. Ask only if something essential is missing.']
    .filter((part) => part.length > 0)
    .join('\n');
}
